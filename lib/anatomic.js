const U = require("./utils");
const toposort = require("./toposort");

module.exports = anatomic;
module.exports.create = create;
module.exports.start = start;
module.exports.stop = stop;

function anatomic(definition = {}) {
  const STATE = {
    NEVER_STARTED: 0,
    STARTING: 1,
    STARTED: 2,
    STOPPING: 3,
    STOPPED: 4,
  };

  let state = STATE.NEVER_STARTED;
  const system = create(definition);

  let started;

  return {
    async start() {
      if (state === STATE.NEVER_STARTED || state.STOPPED) {
        state = STATE.STARTING;
        started = await start(system);
        state = STATE.STARTED;
      }
      return started;
    },
    async stop() {
      state = STATE.STOPPING;
      await stop(system);
      state = STATE.STOPPED;
    }
  }
}

function create(definition) {
  const system = {};

  Object.entries(definition).forEach(([k, v]) => {
    const opts = (k === 'config') ? { scoped: true } : undefined;
    const { dependsOn = [], comesAfter = [] } = v;
    _add(system, k, _getInitialisedState(v), dependsOn.concat(comesAfter), opts);
  });

  return system;
}

async function start(definitions) {
  const system = {};

  const sorted = U.arraysIntersection(_sortComponents(definitions), Object.keys(definitions));
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

function _add(system, name, component, deps, options) {
  system[name] = _baseDefinition(name, component, options);

  const dependencies = deps.map((arg) => {
    const record = typeof arg === 'string' ? { destination: arg, component: arg } : { destination: arg.component, ...arg };
    if (!record.component) {
      throw new Error(`Component ${name} has an invalid dependency ${JSON.stringify(arg)}`);
    }
    return record;
  });

  const found = _findFirstDuplicate(dependencies.map(d => d.destination));
  if (found) {
    throw new Error(`Component ${name} has a duplicate dependency ${found}`);
  }

  system[name].dependencies = dependencies;
}

function _baseDefinition(name, comp, options) {
  const component = comp.start ? comp : { start() { return comp; } };
  return { name, component, dependencies: [], ...options };
}

function _findFirstDuplicate(arr) {
  return arr.filter((item, index) => arr.indexOf(item) !== index)[0];
}

function _getDependencies(definitions, system, name) {
  const accumulator = {}
  for (const dep of definitions[name].dependencies) {
    const componentName = dep.component;
    if (!U.hasProp(definitions, componentName)) {
      throw new Error(`Component ${name} has an unsatisfied dependency on ${componentName}`);
    }
    if (!Object.prototype.hasOwnProperty.call(dep, 'source') && definitions[componentName].scoped) {
      dep.source = name;
    }
    const definition = U.getProp(system, componentName);
    U.setProp(accumulator, dep.destination, dep.source ? U.getProp(definition, dep.source) : definition);
  }
  return accumulator;
};

function _getInitialisedState(c) {
  if (typeof c === "function") { return { start: c }; }
  const { init } = c;
  if (typeof init === "function") { return { start: init }; }
  if (init?.start) { return init; }
  return { start() { return init; } };
}

function _sortComponents(definitions) {
  return toposort(definitions, (v) => v.dependencies.map(d => d.component));
}
