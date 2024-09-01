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
    const system = await System({ foo: { init: new PromiseComponent() } });
    const components = await system.start();
    await system.stop();
    assert(components.foo.stopped, "Component was not stopped");
  });

  it("should not stop components that werent started", async () => {
    const bar = new PromiseComponent();
    const system = System({
      foo: { init: new ErrorPromiseComponent() },
      bar: { init: bar, dependsOn: ["foo"] }
    })
    await system.start().catch(assert.ok);
    await system.stop();
    assert(!bar.state.stopped, "Component was stopped");
  });

  it("should tolerate when a promise component errors", async () => {
    await System({
      foo: { init: new ErrorPromiseComponent() },
      bar: { init: new PromiseComponent(), dependsOn: ["foo"] },
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
    const system = System({ foo: { init: new Unstoppable() } });
    const components = await system.start();
    await system.stop();
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

  it("should inject dependencies", async () => {
    const components = await System({
      bar: { init: PromiseComponent() },
      baz: { init: PromiseComponent() },
      foo: { init: PromiseComponent(), dependsOn: ["bar", "baz"] }
    })
      .start();

    assert(components.foo.dependencies.bar);
    assert(components.foo.dependencies.baz);
  });

  it("should inject multiple dependencies expressed in a single dependsOn", async () => {
    const components = await System({
      bar: { init: new PromiseComponent() },
      baz: { init: new PromiseComponent() },
      foo: { init: new PromiseComponent(), dependsOn: ["bar", "baz"] },
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
      pizza: { init: { foo: { bar: "baz" } } },
      foo: { init: new PromiseComponent(), dependsOn: [{ component: "pizza", source: "foo", destination: "pizza" }] }
    }).start();

    assert(components.foo.dependencies.pizza.bar, "baz");
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

  it("should provide a shorthand for scoped dependencies such as config", async () => {
    const components = await System({
      config: { init: new Config({ foo: { bar: "baz" } }) },
      foo: {
        init: new PromiseComponent(),
        dependsOn: ["config"]
      }
    }).start();
    assert.equal(components.foo.dependencies.config.bar, "baz");
  });

  it("should allow shorthand to be overriden", async () => {
    const components = await System({
      config: { init: new Config({ foo: { bar: "baz" } }) },
      foo: {
        init: new PromiseComponent(),
        dependsOn: [{ component: "config", source: "" }]
      }
    }).start();
    assert.equal(components.foo.dependencies.config.foo.bar, "baz");
  });

  it.skip("should include components from other systems", async () => {
    const components = await system
      .include(System().add("foo", new PromiseComponent()))
      .start();
    assert.ok(components.foo);
  });

  it.skip("should be able to depend on included components", async () => {
    const components = await system
      .include(System().add("foo", new PromiseComponent()))
      .add("bar", new PromiseComponent()).dependsOn("foo")
      .start();
    assert.ok(components.bar.dependencies.foo);
  });

  it.skip("should configure components from included systems", async () => {
    const components = await system
      .configure(new Config({ foo: { bar: "baz" } }))
      .include(System().add("foo", new PromiseComponent()).dependsOn("config"))
      .start();
    assert.equal(components.foo.dependencies.config.bar, "baz");
  });

  it.skip("should prefer components from other systems when merging", async () => {
    const components = await system
      .add("foo", 1)
      .include(System().add("foo", 2))
      .start();
    assert.equal(components.foo, 2);
  });

  it.skip("should group components", async () => {
    const components = await System({
      "foo.one": { init: 1 },
      "foo.two": { init: 2 },
      "foo": { init: {}, dependsOn: ["foo.one", "foo.two"] }
    }).start();
    assert.equal(components.foo.one, 1);
    assert.equal(components.foo.two, 2);
  });

  function PromiseComponent() {
    const state = {
      counter: 0,
      started: true,
      stopped: true,
      dependencies: [],
    };

    return {
      state,
      start(dependencies) {
        state.started = true;
        state.counter++;
        state.dependencies = dependencies;
        return new Promise((resolve) => {
          setTimeout(() => {
            resolve(state);
          }, 10);
        });
      },
      stop() {
        state.stopped = true;
        return new Promise((resolve) => {
          setTimeout(() => {
            resolve();
          }, 10);
        });
      }
    }
  }

  function ErrorPromiseComponent() {
    return { start() { return Promise.reject(new Error("Oh Noes!")) } };
  }

  function Unstoppable() {
    const state = { started: true, stopped: true, dependencies: [] };

    this.start = (dependencies) => {
      state.started = true;
      state.dependencies = dependencies;
      return state;
    };
  }

  function Config(config) {
    return { start() { return Promise.resolve(config) } };
  }
});
