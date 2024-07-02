const U = require('./lib/utils');
const toposort = require("./lib/toposort");
const requireAll = require('./lib/require-all');

module.exports = function anatomic(_params) {
  const api = {};
  const apiName = _params?.name ?? U.randomName();
  let _namespace;
  let definitions = {};
  let currentDefinition;
  let running = false;
  let started = new Set();

  function bootstrap(path) {
    requireAll({
      dirname: path,
      filter: /^(index.js)$/,
      resolve(exported) {
        const component = exported.default || exported
        api.include(U.isFunction(component) ? component() : component)
      }
    });

    return api;
  }

  function configure(component) {
    return add('config', component, { scoped: true })
  }

  function namespace(name) {
    _namespace = name;
    return api
  }

  function _addNamespace(name) {
    if (!_namespace || name === _namespace || name.startsWith(`${_namespace}.`)) {
      return name;
    }
    return `${_namespace}.${name}`;
  }

  function _removeNamespace(name) {
    if (!_namespace) return name;
    if (_namespace === name) return '';
    const prefix = `${_namespace}.`;
    return name.startsWith(prefix) ? name.replace(prefix, '') : name;
  }

  function _isNamespace(name) {
    return !!_namespace && _namespace === name;
  }

  function add(_name, component, options) {
    const name = _addNamespace(_name);
    if (!!definitions[name]) throw new Error(`Duplicate component: ${name}`);
    if (arguments.length === 1) { component = defaultComponent(_isNamespace(name) ? null : _name); }
    return _set(name, component, options);
  }

  function set(name, component, options) {
    return _set(_addNamespace(name), component, options);
  }

  function remove(name) {
    delete definitions[_addNamespace(name)];
    return api;
  }

  function _set(name, component, options) {
    if (!component) throw new Error(`Component ${name} is null or undefined`);
    definitions[name] = { ...options, ...baseDefinition(name, component) };
    currentDefinition = definitions[name];
    return api;
  }

  function include(subSystem) {
    definitions = { ...definitions, ...subSystem._definitions };
    return api;
  }

  function dependsOn(...args) {
    if (!currentDefinition) throw new Error('You must add a component before calling dependsOn')

    currentDefinition.dependencies = args.reduce((accumulator, arg) => {
      const record = typeof arg === 'string' ? { destination: _removeNamespace(arg), component: arg } : { destination: arg.component, ...arg };
      const { name, dependencies } = currentDefinition;
      if (!record.component) {
        throw new Error(`Component ${name} has an invalid dependency ${JSON.stringify(arg)}`);
      }
      if (dependencies.find((dep) => dep.destination === record.destination)) {
        throw new Error(`Component ${name} has a duplicate dependency ${record.destination}`);
      }
      return accumulator.concat(record);
    }, currentDefinition.dependencies);

    return api;
  }

  async function start() {
    if (running) return running;

    const getDependencies = (name, system) => {
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

    started = new Set();
    const system = {};
    const sorted = U.arraysIntersection(sortComponents(definitions), Object.keys(definitions));
    for (const componentName of sorted.reverse()) {
      const dependencies = getDependencies(componentName, system);
      started.add(componentName);
      const component = await definitions[componentName].component.start(dependencies);
      U.setProp(system, componentName, component);
    }
    running = system;

    return system;
  }

  async function stop() {
    for (const componentName of sortComponents(definitions)) {
      if (started.has(componentName)) {
        await definitions[componentName]?.component?.stop?.();
      }
    }
    running = false
  }

  Object.assign(api, {
    name: apiName,
    bootstrap,
    configure,
    namespace,
    add,
    set,
    remove,
    include,
    dependsOn,
    comesAfter: dependsOn,
    start,
    stop,
    _definitions: definitions
  })

  return api;
}

function baseDefinition(name, comp) {
  const component = comp.start ? comp : { start() { return comp; } };
  return { name, component, dependencies: [] };
}

function defaultComponent(name) {
  return {
    start(dependencies) {
      return !!name ? dependencies[name] : dependencies;
    }
  };
}

function sortComponents(definitions) {
  return toposort(definitions, (v) => v.dependencies.map(d => d.component));
}

module.exports.requireAll = function (path) {
  return requireAll({
    dirname: path,
    filter: /^(index.js)$/,
    resolve(exported) {
      const component = exported.default || exported;
      return U.isFunction(component) ? component() : component;
    }
  });
}

module.exports.optional = U.optional;

module.exports.runner = function (system, options) {

  if (!system) throw new Error('system is required')

  const logger = options && options.logger || console;

  return { start, stop };

  async function start() {
    const components = await system.start();

    process.on('error', (err) => die('Unhandled error. Invoking shutdown.', err));
    process.on('unhandledRejection', (err) => die('Unhandled rejection. Invoking shutdown.', err));
    process.on('SIGINT', () => exitOk('SIGINT'));
    process.on('SIGTERM', () => exitOk('SIGTERM'));

    return components;
  }

  async function stop() {
    await system.stop();
  }

  async function die(msg, err) {
    logger.error(msg);
    if (err) logger.error(err.stack);
    await system.stop();
    process.exit(1);
  }

  async function exitOk(signal) {
    logger.info(`Received ${signal}. Attempting to shutdown gracefully.`);
    await system.stop();
    process.exit(0);
  }
}

