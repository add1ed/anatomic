module.exports.app = app;
module.exports.createApp = createApp;
module.exports.loggingErrorHandler = loggingErrorHandler;
module.exports.server = server;

function app(options = {}) {
  return {
    start(dependencies) {
      return createApp(options, dependencies);
    }
  }
}

function createApp(options, dependencies) {
  const name = options.name || "app";
  const server = options.server;
  const restana = options.restana;
  const json = options.json;

  const log = dependencies.logger?.child?.({ component: name }) || noop()
  const errorHandler = loggingErrorHandler(log);

  const opts = {
    prioRequestsProcessing: false,
    server,
    ...{ errorHandler },
    ...dependencies.config
  }

  const app = restana(opts)

  app.use(json())

  return app
}

function loggingErrorHandler(log) {
  return function errorHandler(err, req, res) {
    if (err == null) {
      log.error("Something strange! Global error handler called with null error");
      res.send({
        name: 'ServerError',
        status: 500,
        message: 'Internal Server Error'
      }, 500)
    }

    if (413 === res.status) {
      return res.send(413)
    } else if (415 === res.status) {
      return res.send(415)
    } else if (err instanceof SyntaxError || err.message === 'invalid json') {
      return res.send({
        name: 'BadRequestError',
        message: 'invalid json',
        status: 400
      }, 400)
    }

    const shouldHandle = ({ status = 500 }) => status > 399 && status < 500

    if (shouldHandle(err)) {
      log.warn({
        err: {
          code: err.code,
          description: err.description,
          message: err.message,
          name: err.name,
          originalStatus: err.original_status,
          status: err.status
        }
      })

      return res.send({
        name: err.name,
        message: err.message,
        status: err.status
      }, err.status)
    }

    log.error({
      code: err.code,
      description: err.description,
      message: err.message,
      name: err.name,
      originalStatus: err.original_status,
      stack: err.stack,
      status: err.status
    })

    return res.send({
      name: 'ServerError',
      status: 500,
      message: 'Internal Server Error'
    }, 500)
  }
}

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
    destroy = setTimeout(async function () {
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
