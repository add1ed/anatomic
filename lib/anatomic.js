const U = require("./utils");
const toposort = require("./toposort");

module.exports = anatomic;
module.exports.create = create;
module.exports.merge = merge;
module.exports.start = start;
module.exports.stop = stop;

const STATE = {
  NEVER_STARTED: 0,
  STARTING: 1,
  STARTED: 2,
  STOPPING: 3,
  STOPPED: 4,
};

function anatomic(definition = {}) {
  const system = create(definition);
  return _toObject(system);
}

function _toObject(definitions) {
  let state = STATE.NEVER_STARTED;
  let started;

  return {
    definitions,
    state,
    include(...others) {
      const otherDefinitions = others.map(o => o.definitions);
      const result = merge(definitions, ...otherDefinitions);
      return _toObject(result);
    },
    async start() {
      if (state === STATE.NEVER_STARTED || state.STOPPED) {
        state = STATE.STARTING;
        started = await start(definitions);
        state = STATE.STARTED;
      }
      return started;
    },
    async stop() {
      state = STATE.STOPPING;
      await stop(definitions);
      state = STATE.STOPPED;
    }
  }
}

// create produces a structured definitions object from the input
//
// a definition looks like:
// {
//    name: string,
//    component: { start: function, stop: function? }
//    scoped: boolean
//    dependencies: [
//      {
//        destination: string,
//        source: string?,
//        component: string
//      }
//    ]
// }
//
// and a definitions object is an object mapping names to definitions
//
function create(data = {}) {
  const definitions =
    Object.entries(data)
      .map(_toDefinition)
      .map(_validateDefinition);

  return Object.fromEntries(definitions.map(d => [d.name, d]));
}

function merge(...definitionsObjs) {
  const target = {};
  for (let o of definitionsObjs) {
    if (o.definitions && o.start && o.stop) o = o.definitions;
    for (const [k, v] of Object.entries(o)) {
      target[k] = v;
    }
  }
  return target;
}

async function start(definitions) {
  _validateDefinitions(definitions);
  const sorted = _sortComponents(definitions);

  const system = {};
  for (const componentName of sorted.reverse()) {
    const dependencies = _getDependencies(definitions, system, componentName);
    const component = await definitions[componentName].component.start(dependencies);
    U.setProp(system, componentName, component);
  }

  return system;
}

async function stop(definitions) {
  for (const componentName of _sortComponents(definitions)) {
    await definitions[componentName]?.component?.stop?.();
  }
}

function _conformComponent(c) {
  if (!c || (U.hasProp(c, 'init') && !c.init)) return;

  if (U.isFunction(c)) { return { start: c }; }
  if (U.isFunction(c.init)) { return { start: c.init }; }

  const { init, dependsOn, comesAfter } = c;

  if (init?.start) { return init; }
  if (init) return { start() { return init; } };
  if (dependsOn) return { start(ds) { return ds; } }
  if (comesAfter) return { start() { return {}; } }

  return { start() { return c; } }
}

function _conformDependency(dependency) {
  return typeof dependency === 'string'
    ? { destination: dependency, component: dependency }
    : { destination: dependency.component, ...dependency };
}

function _getDependencies(definitions, system, name) {
  return definitions[name].dependencies
    .reduce((acc, dep) => {
      const componentName = dep.component;

      const source =
        (!U.hasProp(dep, 'source') && definitions[componentName].scoped)
          ? name
          : dep.source;

      const rawDependency = U.getProp(system, componentName);
      const dependency = source ? U.getProp(rawDependency, source) : rawDependency;
      U.setProp(acc, dep.destination, dependency);

      return acc;
    }, {});
};

function _sortComponents(definitions) {
  return toposort(definitions, (v) => v.dependencies.map(d => d.component));
}

function _toDefinition([k, v]) {
  const { dependsOn = [], comesAfter = [] } = v;
  const dependencies = dependsOn.concat(comesAfter).map(_conformDependency);

  return {
    name: k,
    component: _conformComponent(v),
    scoped: (k === "config"),
    dependencies
  };
}

function _validateDefinition(definition) {
  if (!definition.component) {
    throw new Error(`Component ${definition.name} is null or undefined`);
  }

  const deps = definition.dependencies.map(d => d.destination);
  deps.forEach((d, idx) => {
    if (deps.indexOf(d) !== idx) {
      throw new Error(`Component ${definition.name} has a duplicate dependency ${d}`);
    }
  })

  for (const d of definition.dependencies) {
    if (!d.component) {
      throw new Error(`Component ${definition.name} has an invalid dependency ${JSON.stringify(d)}`);
    }
  }

  return definition;
}

function _validateDefinitions(definitions) {
  for (const [name, { dependencies }] of Object.entries(definitions)) {
    for (const { component } of dependencies) {
      if (!U.hasProp(definitions, component)) {
        throw new Error(`Component ${name} has an unsatisfied dependency on ${component}`);
      }
    }
  }
}
