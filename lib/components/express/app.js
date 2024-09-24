const U = require("../utils");

module.exports = function(options = {}) {
  const name = options.name || 'app'
  const express = options.express || require('express');

  return { start }

  async function start(deps) {
    const config = {
      ...{ settings: { 'trust proxy': true } },
      ...(deps.config || {})
    }
    const logger = (deps.logger?.child?.({ component: name })) || U.noopLogger;

    const app = express()
    app.disable('x-powered-by')
    app.disable('etag')
    for (const key in config.settings) {
      app.set(key, config.settings[key])
    }

    app.locals.logger = logger
    app.use(express.json())
    app.newRouter = newRouter;

    return app
  }

  function newRouter() {
    return express.Router();
  }
}
