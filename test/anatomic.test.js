const assert = require("assert");
const path = require("path");
const System = require("..");

describe("System", () => {
  let system;

  beforeEach(() => {
    system = System();
  });

  it("should start without components", async () => {
    const components = await system.start();
    assert.equal(Object.keys(components).length, 0);
  });

  it("should stop without components", async () => {
    await system.start();
    await system.stop();
  });

  it("should tolerate being stopped without being started", () =>
    system.stop());

  it("should tolerate being started wthout being stopped", async () => {
    system.add("foo", new PromiseComponent());
    let components = await system.start();
    assert.equal(components.foo.counter, 1);
    components = await system.start();
    assert.equal(components.foo.counter, 1);
  });

  it("should restart", async () => {
    system.add("foo", new PromiseComponent());
    let components = await system.start();
    assert.equal(components.foo.counter, 1);
    components = await system.restart();
    assert.equal(components.foo.counter, 2);
  });

  it("should start promise components", async () => {
    const components = await system.add("foo", new PromiseComponent()).start();
    assert(components.foo.started, "Component was not started");
  });

  it("should stop promise components", async () => {
    const components = await system.add("foo", new PromiseComponent()).start();
    await system.stop();
    assert(components.foo.stopped, "Component was not stopped");
  });

  it("should not stop components that werent started", async () => {
    const bar = new PromiseComponent();
    await system
      .add("foo", new ErrorPromiseComponent())
      .add("bar", bar)
      .dependsOn("foo")
      .start()
      .catch(assert.ok);
    await system.stop();
    assert(!bar.stopped, "Component was stopped");
  });

  it("should tolerate when a promise component errors", async () => {
    const bar = new PromiseComponent();
    await system
      .add("foo", new ErrorPromiseComponent())
      .add("bar", bar)
      .dependsOn("foo")
      .start()
      .catch(assert.ok);
  });

  it("should pass through components without start methods", async () => {
    const components = await system.add("foo", { ok: true }).start();
    assert.equal(components.foo.ok, true);
  });

  it("should tolerate components without stop methods", async () => {
    const components = await system.add("foo", new Unstoppable()).start();
    await system.stop();
    assert(components.foo.stopped, "Component was not stopped");
  });

  it("should reject duplicate components", () => {
    assert.throws(() => {
      system.add("foo", new PromiseComponent())
        .add("foo", new PromiseComponent());
    }, { message: "Duplicate component: foo" });
  });

  it("should reject attempts to add an undefined component", () => {
    assert.throws(() => {
      system.add("foo", undefined);
    }, { message: "Component foo is null or undefined" });
  });

  it("should reject dependsOn called before adding components", () => {
    assert.throws(() => {
      system.dependsOn("foo");
    }, { message: "You must add a component before calling dependsOn" });
  });

  it("should report missing dependencies", async () => {
    await system
      .add("foo", new PromiseComponent())
      .dependsOn("bar")
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
    const components = await system
      .add("bar", new PromiseComponent())
      .add("baz", new PromiseComponent())
      .add("foo", new PromiseComponent())
      .dependsOn("bar")
      .dependsOn("baz")
      .start();

    assert(components.foo.dependencies.bar);
    assert(components.foo.dependencies.baz);
  });

  it("should inject multiple dependencies expressed in a single dependsOn", async () => {
    const components = await system
      .add("bar", new PromiseComponent())
      .add("baz", new PromiseComponent())
      .add("foo", new PromiseComponent())
      .dependsOn("bar", "baz")
      .start();

    assert(components.foo.dependencies.bar);
    assert(components.foo.dependencies.baz);
  });

  it("should map dependencies to a new name", async () => {
    const components = await system
      .add("bar", new PromiseComponent())
      .add("foo", new PromiseComponent())
      .dependsOn({ component: "bar", destination: "baz" })
      .start();

    assert(!components.foo.dependencies.bar);
    assert(components.foo.dependencies.baz);
  });

  it("should inject dependencies defined out of order", async () => {
    const components = await system
      .add("foo", new PromiseComponent())
      .dependsOn("bar")
      .add("bar", new PromiseComponent())
      .start();

    assert(components.foo.dependencies.bar);
  });

  it("should support nested component names", async () => {
    const components = await system
      .add("foo.bar", new PromiseComponent())
      .add("baz", new PromiseComponent())
      .dependsOn("foo.bar")
      .start();

    assert(components.foo.bar.started);
    assert(components.baz.dependencies.foo.bar);
  });

  it("should inject dependency sub documents", async () => {
    const components = await system
      .add("config", new Config({ foo: { bar: "baz" } }))
      .add("foo", new PromiseComponent())
      .dependsOn({ component: "config", source: "foo", destination: "config" })
      .start();

    assert(components.foo.dependencies.config.bar, "baz");
  });

  it("should reject invalid dependencies", () => {
    assert.throws(() => {
      System().add("foo", new PromiseComponent()).dependsOn(1);
    }, { message: "Component foo has an invalid dependency 1" });

    assert.throws(() => {
      System().add("foo", new PromiseComponent()).dependsOn({});
    }, { message: "Component foo has an invalid dependency {}" });
  });

  it("should reject direct cyclic dependencies", async () => {
    await system
      .add("foo", new PromiseComponent()).dependsOn("foo")
      .start()
      .catch((err) => {
        assert(err);
        assert(/Cyclic dependency found/.test(err.message), err.message);
      });
  });

  it("should reject indirect cyclic dependencies", async () => {
    await system
      .add("foo", new PromiseComponent()).dependsOn("bar")
      .add("bar", new PromiseComponent()).dependsOn("foo")
      .start()
      .catch((err) => {
        assert(err);
        assert(/Cyclic dependency found/.test(err.message), err.message);
      });
  });

  it("should tolerate duplicate dependencies with different destinations", async () => {
    const components = await system
      .add("foo", new PromiseComponent())
      .dependsOn({ component: "bar", destination: "a" })
      .dependsOn({ component: "bar", destination: "b" })
      .add("bar", new PromiseComponent())
      .start();

    assert(components.foo.dependencies.a);
    assert(components.foo.dependencies.b);
  });

  it("should reject duplicate dependency implicit destinations", () => {
    assert.throws(() => {
      system.add("foo", new PromiseComponent())
        .dependsOn("bar")
        .dependsOn("bar");
    }, { message: "Component foo has a duplicate dependency bar" });
  });

  it("should reject duplicate dependency explicit destinations", () => {
    assert.throws(() => {
      system
        .add("foo", new PromiseComponent())
        .dependsOn({ component: "bar", destination: "baz" })
        .dependsOn({ component: "shaz", destination: "baz" });
    }, { message: "Component foo has a duplicate dependency baz" });
  });

  it("should provide a shorthand for scoped dependencies such as config", async () => {
    const components = await system
      .configure(new Config({ foo: { bar: "baz" } }))
      .add("foo", new PromiseComponent())
      .dependsOn("config")
      .start();

    assert.equal(components.foo.dependencies.config.bar, "baz");
  });

  it("should allow shorthand to be overriden", async () => {
    const components = await system
      .configure(new Config({ foo: { bar: "baz" } }))
      .add("foo", new PromiseComponent())
      .dependsOn({ component: "config", source: "" })
      .start();

    assert.equal(components.foo.dependencies.config.foo.bar, "baz");
  });

  it("should include components from other systems", async () => {
    const components = await system
      .include(System().add("foo", new PromiseComponent()))
      .start();

    assert.ok(components.foo);
  });

  it("should be able to depend on included components", async () => {
    const components = await system
      .include(System().add("foo", new PromiseComponent()))
      .add("bar", new PromiseComponent()).dependsOn("foo")
      .start();

    assert.ok(components.bar.dependencies.foo);
  });

  it("should configure components from included systems", async () => {
    const components = await system
      .configure(new Config({ foo: { bar: "baz" } }))
      .include(System().add("foo", new PromiseComponent()).dependsOn("config"))
      .start();

    assert.equal(components.foo.dependencies.config.bar, "baz");
  });

  it("should prefer components from other systems when merging", async () => {
    const components = await system
      .add("foo", 1)
      .include(System().add("foo", 2))
      .start();

    assert.equal(components.foo, 2);
  });

  it("should set components for the first time", async () => {
    const components = await system.set("foo", 1).start();

    assert.equal(components.foo, 1);
  });

  it("should replace existing components with set", async () => {
    const components = await system
      .set("foo", 1)
      .set("foo", 2)
      .start();

    assert.equal(components.foo, 2);
  });

  it("should remove existing components", async () => {
    const components = await system
      .set("foo", 1)
      .remove("foo")
      .start();

    assert.equal(components.foo, undefined);
  });

  it("should group components", async () => {
    const components = await system
      .add("foo.one", 1)
      .add("foo.two", 2)
      .add("foo").dependsOn("foo.one", "foo.two")
      .start();

    assert.equal(components.foo.one, 1);
    assert.equal(components.foo.two, 2);
  });

  it("should bootstrap components from the file system", async () => {
    const components = await system
      .bootstrap(path.join(__dirname, "components"))
      .start();

    assert(Object.keys(components).includes("foo"));
    assert(Object.keys(components).includes("bar"));
  });

  function PromiseComponent() {
    const state = {
      counter: 0,
      started: true,
      stopped: true,
      dependencies: [],
    };

    this.start = (dependencies) => {
      state.started = true;
      state.counter++;
      state.dependencies = dependencies;
      return new Promise((resolve) => {
        setTimeout(() => {
          resolve(state);
        }, 10);
      });
    };
    this.stop = () => {
      state.stopped = true;
      return new Promise((resolve) => {
        setTimeout(() => {
          resolve();
        }, 10);
      });
    };
  }

  function ErrorPromiseComponent() {
    this.start = () => Promise.reject(new Error("Oh Noes!"));
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
    this.start = () => Promise.resolve(config);
  }
});
