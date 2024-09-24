module.exports = {
  app: require('./app'),
  errorHandler: require('./middleware/error-handler'),
  middleware: require('./middleware'),
  server: require('./server')
}
