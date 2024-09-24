module.exports.server = server;

function noop() {
  return { debug() { }, info() { }, warn() { }, error() { } };
}

function server(options = {}) {
  const name = options.name || 'server'

  let config
  let logger
  let server
  let destroy

  async function start(dependencies) {
    config = {
      ...{ host: '0.0.0.0', keepAliveTimeout: 5000, shutdown: { delay: 5000 } },
      ...dependencies.config
    }
    const app = dependencies.app

    if (!app) throw new Error('app is required')
    if (!config.port) throw new Error('config.port is required')

    logger = (dependencies.logger?.child?.({ component: name })) || noop();

    logger.info(`Starting server on ${config.host}:${config.port} with keepAliveTimeout of ${config.keepAliveTimeout}ms`)

    server = await app
      .start(config.port)
      // try to handle case when we are given back an external uWebsocket server instance 
      .catch((e) => { if (Object.getPrototypeOf(e) === null) { return e; } else { throw e; } })

    server.keepAliveTimeout = config.keepAliveTimeout

    return server
  }

  async function stop() {
    if (!server) return
    return Promise.race([scheduleDestroy(), close()])
  }

  async function scheduleDestroy() {
    destroy = setTimeout(async function() {
      logger.info(`Server did not shutdown gracefully within ${config.shutdown.delay}`)
      logger.warn(`Forcefully stopping server on ${config.host}:${config.port}`)
      await server.destroy()
    }, config.shutdown.delay)
    destroy.unref()
  }

  async function close() {
    logger.info(`Stopping server on ${config.host}:${config.port}`)
    await server.close()
    clearTimeout(destroy)
  }

  return { start, stop }
}
