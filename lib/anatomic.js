const U = require("./utils");
const toposort = require("./toposort");
const components = require("./components");

module.exports = anatomic;
module.exports.components = components;
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

function anatomic(definition = {}, opts) {
  const system = create(definition, opts);
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
function create(data = {}, opts) {
  const definitions =
    Object.entries(data)
      .flatMap(x => _toDefinition(x, opts))
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

function _conformComponent(c, opts) {
  if (!c || (U.hasProp(c, 'init') && !c.init)) return;

  if (U.isFunction(c)) { return { start: c }; }
  if (U.isFunction(c.init)) { return { start: c.init }; }
  if (U.isFunction(c.init?.start)) { return c.init; }

  if (U.isString(c.init)) { return components(c.init, opts); }

  if (c.init) return { start() { return c.init; } }
  if (c.dependsOn) return { start(ds) { return ds; } };
  if (c.comesAfter) return { start() { return {}; } };

  return { start() { return c; } };
}

function _conformDependency(dependency) {
  if (typeof dependency === 'string') {
    return { destination: dependency, component: dependency };
  }

  if (dependency?.component && dependency?.destination) {
    return dependency;
  }

  if (dependency?.component && U.hasProp(dependency, 'source')) {
    return { destination: dependency.component, component: dependency.component, source: dependency.source };
  }

  if (typeof dependency === 'object' && Object.keys(dependency).length > 0) {
    return Object.entries(dependency).map(([k, v]) => {
      if (v.includes(".")) {
        const [component, ...others] = v.split(".");
        const source = others.join(".");
        return { destination: k, component, source };
      } else {
        return { destination: k, component: v };
      }
    });
  }

  return dependency;
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

function _hasSubComponents(component) {
  if (Array.isArray(component)) return false;
  return Object.entries(component).filter(_isSubComponent).length > 0;
}

function _isSubComponent([k, v]) {
  if (["init", "start"].includes(k)) return false;
  return U.isFunction(v)
    || U.isFunction(v?.init)
    || U.isFunction(v?.init?.start)
    || ((typeof v?.init === 'string') && v?.dependsOn);
}

function _sortComponents(definitions) {
  return toposort(definitions, (v) => v.dependencies.map(d => d.component));
}

function _splitOffSubComponents(component) {
  const subComponents = Object.entries(component).filter(_isSubComponent);
  const others = { ...component };
  for (const [k,] of subComponents) {
    delete others[k];
  }
  return [subComponents, others];
}

function _toDefinition([k, v], opts) {
  if (!_hasSubComponents(v)) {
    if (Array.isArray(v)) {
      const [init, dependsOn, comesAfter] = v;
      v = { init, dependsOn, comesAfter };
    }
    const dependencies = U.arrayify(v.dependsOn).concat(U.arrayify(v.comesAfter));
    return {
      name: k,
      component: _conformComponent(v, opts),
      scoped: (k === "config" && v.scoped !== false) || !!v.scoped,
      dependencies: dependencies.flatMap(_conformDependency)
    };
  }

  const [subComponents, others] = _splitOffSubComponents(v);
  const mainDefinition = _toDefinition([k, others], opts);
  const subComponentDefinitions = subComponents.map(([vk, vv]) => _toDefinition([`${k}.${vk}`, vv], opts))
  return [mainDefinition, ...subComponentDefinitions];
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
