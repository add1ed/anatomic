const defaults = require("./config")
const rateLimit = require("./rate-limit");

module.exports = function() {
	function start({ app, config = {} }) {
		const cfg = buildConfig(defaults, config);
  		const include = shouldInclude(defaults, config);

		if (include('rateLimit')) {
			app.use(rateLimit(cfg('rateLimit')))
		}

		return {};
	}

	return { start }
}

function buildConfig (defaults, opts) {
  const include = shouldInclude(defaults, opts)

  return function middlewareConfig (name) {
    return include(name) ? { ...defaults[name], ...opts[name] } : false
  }
}

function shouldInclude (defaults, opts) {
  return function includeMiddleware (name) {
    if (opts[name] === false) return false
    if (opts[name] === undefined && defaults[name] === false) return false
    return true
  }
}