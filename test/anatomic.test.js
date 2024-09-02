const { describe, it, beforeEach } = require("node:test");
const assert = require("assert");
const path = require("path");
const System = require("..");

describe("System", () => {
  it("should start without components", async () => {
    const components = await System().start();
    assert.equal(Object.keys(components).length, 0);
  });

  it("should stop without components", async () => {
    const system = System()
    await system.start();
    await system.stop();
  });

  it("should work via static functions", async () => {
    const system = System.create();
    await System.start(system);
    await System.stop(system);
  });

  it("should tolerate being stopped without being started", () =>
    System().stop());

  it("should tolerate being started wthout being stopped", async () => {
    const system = System({ "foo": { init: PromiseComponent() } });
    let components = await system.start();
    assert.equal(components.foo.counter, 1);
    components = await system.start();
    assert.equal(components.foo.counter, 1);
  });

  it("should start promise components", async () => {
    const components = await System({ foo: { init: new PromiseComponent() } }).start();
    assert(components.foo.started, "Component was not started");
  });

  it("should stop promise components", async () => {
    const system = System({ foo: { init: PromiseComponent() } });
    const components = await system.start();
    await system.stop();
    assert(components.foo.stopped, "Component was not stopped");
  });

  it("should try to stop components even those that weren't started", async () => {
    const bar = PromiseComponent();
    const system = System({
      foo: ErrorPromiseComponent,
      bar: { init: bar, dependsOn: ["foo"] }
    })
    await system.start().catch(assert.ok);
    await system.stop();
    assert(bar.state.stopped, "Component was stopped");
  });

  it("should tolerate when a promise component errors", async () => {
    await System({
      foo: ErrorPromiseComponent,
      bar: { init: PromiseComponent(), dependsOn: ["foo"] },
    }).start()
      .catch(assert.ok);
  });

  it("should pass through components provided via a function", async () => {
    const components = await System({ foo: function () { return { ok: true } } }).start();
    assert.equal(components.foo.ok, true);
  });

  it("should pass through components without start methods", async () => {
    const components = await System({ foo: { init: { ok: true } } }).start();
    assert.equal(components.foo.ok, true);
  });

  it("should tolerate components without stop methods", async () => {
    const system = System.create({ foo: { init: new Unstoppable() } });
    const components = await System.start(system);
    await System.stop(system);
    assert(components.foo.stopped, "Component was not stopped");
  });

  it("should reject attempts to add an undefined component", () => {
    assert.throws(() => {
      System({ foo: { init: undefined } });
    }, { message: "Component foo is null or undefined" });
  });

  it("should report missing dependencies", async () => {
    await System({
      foo: { init: new PromiseComponent(), dependsOn: ["bar"] }
    })
      .start()
      .catch((err) => {
        assert(err);
        assert.equal(
          err.message,
          "Component foo has an unsatisfied dependency on bar",
        );
      });
  });

  it("should inject dependency", async () => {
    const components = await System({
      bar: { init: PromiseComponent() },
      foo: { init: PromiseComponent(), dependsOn: "bar" }
    })
      .start();

    assert(components.foo.dependencies.bar);
  });

  it("should wait for anything it comes after", async () => {
    const bar = PromiseComponent();
    await System({ foo: { init: ErrorPromiseComponent(), comesAfter: "bar" }, bar })
      .start()
      .catch(assert.ok);

    assert.ok(bar.state.started);
  });

  it("should inject multiple dependencies expressed in a single dependsOn", async () => {
    const components = await System({
      bar: PromiseComponent(),
      baz: PromiseComponent(),
      foo: { init: PromiseComponent(), dependsOn: ["bar", "baz"] },
    }).start();

    assert(components.foo.dependencies.bar);
    assert(components.foo.dependencies.baz);
  });

  it("should map dependencies to a new name", async () => {
    const components = await System({
      bar: { init: new PromiseComponent() },
      foo: { init: new PromiseComponent(), dependsOn: [{ component: "bar", destination: "baz" }] }
    }).start();

    assert(!components.foo.dependencies.bar);
    assert(components.foo.dependencies.baz);
  });

  it("should map dependencies declared in object form to a new name", async () => {
    const components = await System({
      bar: PromiseComponent(), fizz: PromiseComponent(),
      foo: { init: new PromiseComponent(), dependsOn: { baz: "bar", buzz: "fizz" } }
    }).start();

    assert(!components.foo.dependencies.bar);
    assert(!components.foo.dependencies.fizz);
    assert(components.foo.dependencies.baz);
    assert(components.foo.dependencies.buzz);
  });

  it("should map dependencies declared in mixed form to new names", async () => {
    const components = await System({
      bar: 1, fizz: 2, pizza: 3, pasta: 4,
      foo: { init: PromiseComponent(), dependsOn: [{ baz: "bar", buzz: "fizz", pasta: "pasta" }, "pizza"] }
    }).start();

    assert(!components.foo.dependencies.bar);
    assert(!components.foo.dependencies.fizz);
    assert(components.foo.dependencies.baz);
    assert(components.foo.dependencies.buzz);
    assert(components.foo.dependencies.pasta);
    assert(components.foo.dependencies.pizza);
  });

  it("should inject dependencies defined out of order", async () => {
    const components = await System({
      foo: { init: new PromiseComponent(), dependsOn: ["bar"] },
      bar: { init: new PromiseComponent() }
    }).start();

    assert(components.foo.dependencies.bar);
  });

  it("should support nested component names", async () => {
    const components = await System({
      "foo.bar": { init: new PromiseComponent() },
      baz: { init: new PromiseComponent(), dependsOn: ["foo.bar"] }
    }).start();

    assert(components.foo.bar.started);
    assert(components.baz.dependencies.foo.bar);
  });

  it("should inject dependency sub documents", async () => {
    const components = await System({
      pizza: { foo: { bar: "baz" } },
      foo: { init: PromiseComponent(), dependsOn: { component: "pizza", source: "foo", destination: "blah" } }
    }).start();

    assert(components.foo.dependencies.blah.bar, "baz");
  });

  it("should inject dependency sub documents using object form", async () => {
    const components = await System({
      pizza: { foo: { bar: "baz" } },
      foo: { init: PromiseComponent(), dependsOn: { blah: "pizza.foo" } }
    }).start();

    assert(components.foo.dependencies.blah.bar, "baz");
  });

  it("should reject invalid dependencies", () => {
    assert.throws(() => {
      System({ foo: { init: new PromiseComponent(), dependsOn: [1] } });
    }, { message: "Component foo has an invalid dependency 1" });

    assert.throws(() => {
      System({ foo: { init: new PromiseComponent(), dependsOn: [{}] } });
    }, { message: "Component foo has an invalid dependency {}" });
  });

  it("should reject direct cyclic dependencies", async () => {
    await System({ foo: { init: new PromiseComponent(), dependsOn: ["foo"] } })
      .start()
      .catch((err) => {
        assert(err);
        assert(/Cyclic dependency found/.test(err.message), err.message);
      });
  });

  it("should reject indirect cyclic dependencies", async () => {
    await System({
      foo: { init: new PromiseComponent(), dependsOn: ["bar"] },
      bar: { init: new PromiseComponent(), dependsOn: ["foo"] },
    }).start()
      .catch((err) => {
        assert(err);
        assert(/Cyclic dependency found/.test(err.message), err.message);
      });
  });

  it("should tolerate duplicate dependencies with different destinations", async () => {
    const components = await System({
      foo: {
        init: new PromiseComponent(),
        dependsOn: [
          { component: "bar", destination: "a" },
          { component: "bar", destination: "b" }
        ]
      },
      bar: { init: new PromiseComponent() }
    }).start();

    assert(components.foo.dependencies.a);
    assert(components.foo.dependencies.b);
  });

  it("should tolerate duplicate dependencies in object form with different destinations", async () => {
    const components = await System({
      foo: { init: PromiseComponent(), dependsOn: { a: "bar", b: "bar" } },
      bar: 1
    }).start();

    assert(components.foo.dependencies.a);
    assert(components.foo.dependencies.b);
  });

  it("should reject duplicate dependency implicit destinations", () => {
    assert.throws(() => {
      System({ foo: { init: new PromiseComponent(), dependsOn: ["bar", "bar"] } })
    }, { message: "Component foo has a duplicate dependency bar" });
  });

  it("should reject duplicate dependency explicit destinations", () => {
    assert.throws(() => {
      System({
        foo: {
          init: new PromiseComponent(),
          dependsOn: [
            { component: "bar", destination: "baz" },
            { component: "shaz", destination: "baz" }
          ]
        }
      })
    }, { message: "Component foo has a duplicate dependency baz" });
  });

  it("should provide a shorthand for scoped dependencies", async () => {
    const components = await System({
      pizza: { init: { foo: { bar: "baz" } }, scoped: true },
      foo: { init: PromiseComponent(), dependsOn: "pizza" }
    }).start();
    assert.equal(components.foo.dependencies.pizza.bar, "baz");
  });

  it("should provide a shorthand for config (which is scoped by default)", async () => {
    const components = await System({
      config: { foo: { bar: "baz" } },
      foo: { init: PromiseComponent(), dependsOn: "config" }
    }).start();
    assert.equal(components.foo.dependencies.config.bar, "baz");
  });

  it("should allow shorthand for config to be disabled", async () => {
    const components = await System({
      config: { foo: { bar: "baz" }, scoped: false },
      foo: { init: PromiseComponent(), dependsOn: "config" }
    }).start();
    assert.ok(components.foo.dependencies.config.foo);
  });

  it("should allow shorthand to be overriden at component level", async () => {
    const components = await System({
      config: { init: { foo: { bar: "baz" } } },
      foo: {
        init: new PromiseComponent(),
        dependsOn: [{ component: "config", source: "" }]
      }
    }).start();
    assert.equal(components.foo.dependencies.config.foo.bar, "baz");
  });

  it("should allow shorthand to be overriden at component level using object form", async () => {
    const components = await System({
      config: { foo: { bar: "baz" } },
      foo: { init: PromiseComponent(), dependsOn: { config: "config." } }
    }).start();
    assert.equal(components.foo.dependencies.config.foo.bar, "baz");
  });

  it("should include components from other systems", async () => {
    const components = await System().include(System({ foo: PromiseComponent })).start();
    assert.ok(components.foo);
  });

  it("should include components from other systems via static functions", async () => {
    const components = await System.start(System.merge(System.create(), System({ foo: PromiseComponent() })));
    assert.ok(components.foo);
  });

  it("should be able to depend on included components", async () => {
    const components = await System({ bar: { init: PromiseComponent(), dependsOn: "foo" } })
      .include(System({ foo: 1 }))
      .start();
    assert.ok(components.bar.dependencies.foo);
  });

  it("should configure components from included systems", async () => {
    const components = await System({ config: { foo: { bar: "baz" } } })
      .include(System({ foo: { init: PromiseComponent(), dependsOn: "config" } }))
      .start();
    assert.equal(components.foo.dependencies.config.bar, "baz");
  });

  it("should prefer components from other systems when merging", async () => {
    const components = await System({ foo: 1 }).include(System({ foo: 2 })).start();
    assert.equal(components.foo, 2);
  });

  it("should group components when depending on others", async () => {
    const components = await System({ one: 1, two: 2, "foo": { dependsOn: ["one", "two"] } }).start();
    assert.equal(components.foo.one, 1);
    assert.equal(components.foo.two, 2);
  });

  it("should not group components when coming after others", async () => {
    const components = await System({ one: 1, two: 2, "foo": { comesAfter: ["one", "two"] } }).start();
    assert.ok(!components.foo.one);
    assert.ok(!components.foo.two);
  });

  function PromiseComponent() {
    const state = { counter: 0, started: true, stopped: true, dependencies: [] };
    const sleep = (x) => new Promise((resolve) => { setTimeout(resolve(x), 10) });

    return {
      state,
      start(dependencies) {
        state.started = true;
        state.counter++;
        state.dependencies = dependencies;
        return sleep(state);
      },
      stop() {
        state.stopped = true;
        return sleep(state);
      }
    }
  }

  function ErrorPromiseComponent() {
    return { start() { return Promise.reject(new Error("Oh Noes!")) } };
  }

  function Unstoppable() {
    const state = { started: true, stopped: true, dependencies: [] };

    return {
      start(dependencies) {
        state.started = true;
        state.dependencies = dependencies;
        return state;
      }
    };
  }
});
