const debug = function () {};
const format = require('util').format
const Toposort = require('./lib/toposort')
const requireAll = require('./lib/require-all')
const {
  randomName,
  isFunction,
  arraysIntersection,
  hasProp,
  getProp,
  setProp
} = require('./lib/utils')

module.exports = function (_params) {
  const api = {}
  const params = Object.assign({}, { name: randomName() }, _params)
  let definitions = {}
  let currentDefinition
  let running = false
  let started
  const defaultComponent = (name) => ({
    start (dependencies) {
      return dependencies[name]
    }
  });

  function bootstrap (path) {
    requireAll({
      dirname: path,
      filter: /^(index.js)$/,
      resolve (exported) {
        const component = exported.default || exported
        api.include(isFunction(component) ? component() : component)
      }
    })
    return api
  }

  function configure (component) {
    return add('config', component, { scoped: true })
  }

  function add (...args) {
    const [name, component, options] = args
    debug('Adding component %s to system %s', name, params.name)
    if (Object.prototype.hasOwnProperty.call(definitions, name)) throw new Error(format('Duplicate component: %s', name))
    if (args.length === 1) return add(name, defaultComponent(name))
    return _set(name, component, options)
  }

  function set (name, component, options) {
    debug('Setting component %s on system %s', name, params.name)
    return _set(name, component, options)
  }

  function remove (name) {
    debug('Removing component %s from system %s', name, params.name)
    delete definitions[name]
    return api
  }

  function _set (name, component, options) {
    if (!component) throw new Error(format('Component %s is null or undefined', name))
    definitions[name] = Object.assign({}, options, {
      name,
      component: component.start ? component : wrap(component),
      dependencies: []
    })
    currentDefinition = definitions[name]
    return api
  }

  function include (subSystem) {
    debug('Including definitions from sub system %s into system %s', subSystem.name, params.name)
    definitions = Object.assign({}, definitions, subSystem._definitions)
    return api
  }

  function dependsOn (...args) {
    if (!currentDefinition) throw new Error('You must add a component before calling dependsOn')
    currentDefinition.dependencies = args.reduce(toDependencyDefinitions, currentDefinition.dependencies)
    return api
  }

  function toDependencyDefinitions (accumulator, arg) {
    const record = typeof arg === 'string'
      ? {
          component: arg,
          destination: arg
        }
      : Object.assign({}, { destination: arg.component }, arg)
    if (!record.component) throw new Error(format('Component %s has an invalid dependency %s', currentDefinition.name, JSON.stringify(arg)))
    if (currentDefinition.dependencies.find((dep) => dep.destination === record.destination)) {
      throw new Error(format('Component %s has a duplicate dependency %s', currentDefinition.name, record.destination))
    }
    return accumulator.concat(record)
  }

  function start (cb) {
    started = []
    const p = startAsync()
    return cb ? p.then(immediateCallback(cb)).catch(immediateError(cb, {})) : p
  }

  async function startAsync () {
    debug('Starting system %s', params.name)
    started = []
    const sorted = await sortComponents()
    const system = await ensureComponents(sorted)
    debug('System %s started', params.name)
    running = system
    return system
  }

  async function ensureComponents (components) {
    if (running) return running
    const system = {}
    for (const component of components.reverse()) {
      await toSystem(system, component)
    }
    return system
  }

  async function toSystem (system, name) {
    debug('Inspecting compontent %s', name)
    const dependencies = await getDependencies(name, system)
    await startComponent(dependencies, name, system)
  }

  async function startComponent (dependencies, name, system) {
    debug('Starting component %s', name)
    started.push(name)
    const component = definitions[name].component
    const startedComponent = await component.start(dependencies)
    setProp(system, name, startedComponent)
    debug('Component %s started', name)
    return system
  }

  function stop (cb) {
    const p = stopAsync()
    return cb ? p.then(immediateCallback(cb)).catch(immediateError(cb)) : p
  }

  async function stopAsync () {
    debug('Stopping system %s', params.name)
    const sorted = await sortComponents()
    const filtered = await removeUnstarted(sorted)
    await stopComponents(filtered)
    debug('System %s stopped', params.name)
    running = false
  }

  async function stopComponents (components) {
    for (const component of components) {
      await stopComponent(component)
    }
  }

  async function stopComponent (name) {
    debug('Stopping component %s', name)
    const stop = definitions[name].component.stop || noop
    await stop()
    debug('Component %s stopped', name)
  }

  async function sortComponents () {
    const graph = new Toposort()
    Object.keys(definitions).forEach((name) => {
      graph.add(name, definitions[name].dependencies.map((dep) => dep.component))
    })
    return arraysIntersection(graph.sort(), Object.keys(definitions))
  }

  async function removeUnstarted (components) {
    return arraysIntersection(components, started)
  }

  async function getDependencies (name, system) {
    const accumulator = {}
    for (const dependency of definitions[name].dependencies) {
      if (!hasProp(definitions, dependency.component)) throw new Error(format('Component %s has an unsatisfied dependency on %s', name, dependency.component))
      if (!Object.prototype.hasOwnProperty.call(dependency, 'source') && definitions[dependency.component].scoped) dependency.source = name
      dependency.source
        ? debug('Injecting dependency %s.%s as %s into %s', dependency.component, dependency.source, dependency.destination, name)
        : debug('Injecting dependency %s as %s into %s', dependency.component, dependency.destination, name)
      const component = getProp(system, dependency.component)
      setProp(accumulator, dependency.destination, dependency.source ? getProp(component, dependency.source) : component)
    }
    return accumulator
  }

  function noop (...args) {
    return
  }

  function wrap (component) {
    return {
      start (dependencies) {
        return component
      }
    }
  }

  function restart (cb) {
    const p = api.stop().then(() => api.start())

    return cb ? p.then(immediateCallback(cb)).catch(immediateError(cb)) : p
  }

  function immediateCallback (cb) {
    return function (resolved) {
      setImmediate(() => {
        cb(null, resolved)
      })
    }
  }

  function immediateError (cb, resolved) {
    return function (err) {
      setImmediate(() => {
        resolved ? cb(err, resolved) : cb(err)
      })
    }
  }

  Object.assign(api, {
    name: params.name,
    bootstrap,
    configure,
    add,
    set,
    remove,
    merge: include,
    include,
    dependsOn,
    comesAfter: dependsOn,
    start,
    stop,
    restart,
    _definitions: definitions
  })

  return api
}

module.exports.optional = require('./lib/optional')
module.exports.runner = require('./lib/domain-runner')
