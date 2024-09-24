module.exports = function () {
  function start({ app, logger }) {
    app.use(bodyParser(logger))
    app.use(requests(logger))
    app.use(swagger(logger))
    app.use(catchAll(logger))
  }

  return { start }
}

function isUndefined (value) {
  return value === undefined
}

function bodyParser () {
  return function bodyParserErrorHandler (err, req, res, next) {
    if (err != null) {
      if ([413, 415].includes(err.status)) {
        return res.sendStatus(err.status)
      } else if (err instanceof SyntaxError || err.message === 'invalid json') {
        return res.status(400).json({
          name: 'BadRequestError',
          message: 'invalid json'
        })
      }
    }
    return next(err)
  }
}

function requests (log) {
  return function requestErrorHandler (err, req, res, next) {
    const shouldHandle = ({ status = 500 }) => status > 399 && status < 500

    if (!shouldHandle(err)) return next(err)

    if (log) {
      log.warn({ 
        error: {
          code: err.code,
          dataPath: err.dataPath,
          description: err.description,
          message: err.message,
          name: err.name,
          originalStatus: err.original_status,
          params: err.params,
          schemaPath: err.schemaPath,
          status: err.status
        }
      }, "Request threw a 4xx error")
    }

    const { name, message, status } = err
    return res.status(status).json({ name, message, status })
  }
}

function swagger (log) {
  return function swaggerErrorHandler (err, req, res, next) {
    if (err.failedValidation) {
      if (
        log &&
        err.message.startsWith('Response') &&
        !isUndefined(err.results)
      ) {
        err.results.errors.forEach(log.error)
      }
      if (err.message.startsWith('Request')) {
        const payload = {
          name: 'BadRequestError',
          message: err.message
        }
        if (err.code === 'SCHEMA_VALIDATION_FAILED') {
          if (!isUndefined(err.results)) {
            const errs = err.results.errors
            if (!isUndefined(errs) && !(errs.length === 0)) {
              payload.errors = errs
            }
          }
        }
        if (log) log.error(payload)
        return res.status(400).json(payload)
      }
    }
    return next(err)
  }
}

function catchAll (log) {
  return function errorHandler500 (err, req, res, next) {
    if (log) {
      const {
        code,
        description,
        message,
        name,
        stack,
        status,
        original_status: originalStatus
      } = err
      log.error({
        code,
        description,
        message,
        name,
        originalStatus,
        stack,
        status
      })
    }

    const errObj = {
      name: 'ServerError',
      status: 500,
      message: 'Internal Server Error'
    }

    return res.status(500).json(errObj)
  }
}
