const { performance } = require('perf_hooks')

module.exports = function (options = {}) {
  const pg = options.postgres || require('postgres')
  const name = options.name || 'postgres'
  let config, log, sql, url

  return { start, stop }

  async function start(deps) {
    if (!deps.config) throw new Error('config is required')
    if (!deps.config.connectionString) throw new Error('config.connectionString is required')

    config = { ...deps.config };
    log = (deps.logger && deps.logger.child({ component: name })) || { info() { }, error() { } }
    url = new URL(config.connectionString)

    const opts = { ...config };
    if (url.searchParams.get('sslmode') === 'no-verify')
      opts.ssl = { rejectUnauthorized: false }

    sql = new pg(config.connectionString, opts)

    log.info(`Connected to ${redacted(url)}`)

    return { json, query, queryRaw }
  }

  async function stop() {
    if (!sql) return
    await sql.end({ timeout: 1 })
    log.info(`Disconnected from ${redacted(url)}`)
  }

  async function query(text, ...values) {
    return _query(text, values);
  }

  async function queryRaw(text, values = []) {
    const xs = text.split(/\$\d/)
    Object.defineProperty(xs, 'raw', { enumerable: false, writable: true });
    xs.raw = [text]
    return _query(xs, values);
  }

  async function _query(text, values) {
    const start = performance.now()
    try {
      const results = await sql(text, ...values)
      const elapsed = performance.now() - start
      const context = { query: { text: text.raw } };
      if (config.logValues) context.query.values = values;
      log.info(context, `query took ${Math.ceil(elapsed)}ms`)
      return results
    } catch (err) {
      const elapsed = performance.now() - start
      const context = { query: { text, err } };
      if (config.logValues) context.query.values = values;
      log.error(context, `query took ${Math.ceil(elapsed)}ms`)
      throw err
    }
  }

  function json(obj) {
    return sql.json(obj)
  }

  function redacted(url) {
    return `postgres://${url.host || 'localhost:5432'}${url.pathname || '/postgres'}`
  }
}
