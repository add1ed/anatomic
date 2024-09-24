const duration = require('./parse-duration')
const enableDestroy = require('./server-destroy')

module.exports = function(options = {}) {
  const name = options.name || 'server'

  let config
  let logger
  let server
  let destroy

  async function start(dependencies) {
    config = {
      ...{ host: '0.0.0.0', keepAliveTimeout: 65000, shutdown: { delay: '5s' } },
      ...dependencies.config
    }
    const app = dependencies.app

    if (!app) throw new Error('app is required')
    if (!config.port) throw new Error('config.port is required')

    logger = (dependencies.logger && dependencies.logger.child({ component: name })) || app.locals.logger || U.noopLogger;

    logger.info(`Starting server on ${config.host}:${config.port} with keepAliveTimeout of ${config.keepAliveTimeout}ms`)
    server = await app.listen(config.port, config.host)
    server.keepAliveTimeout = config.keepAliveTimeout

    enableDestroy(server)

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
    }, duration(config.shutdown.delay))
    destroy.unref()
  }

  async function close() {
    logger.info(`Stopping server on ${config.host}:${config.port}`)
    await server.close()
    clearTimeout(destroy)
  }

  return { start, stop }
}
