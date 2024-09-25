const defaults = {
  pino: {
    redact: {
      paths: [
        "req.headers.authorization",
        "req.headers.cookie",
      ],
      censor: "<HIDDEN>",
    },
    destination: { sync: false, minLength: 4096 },
    formatters: { // ensure the log line is { "level": "info", ... }, rather than { "level": 30, ... }
      level: function(label) {
        return { level: label };
      },
    },
  },
  pinoHttp: {
    customLogLevel: function(res, err) {
      if (res.statusCode >= 400 && res.statusCode < 500) {
        return "warn";
      } else if (res.statusCode >= 500 || err) {
        return "error";
      } else if (res.statusCode >= 300 && res.statusCode < 400) {
        return "silent";
      }
      return "info";
    },
  },
};

module.exports = component;
module.exports.create = create;
module.exports.http = http;

function component(options) {
  return {
    start(dependencies) {
      return create(options, dependencies);
    }
  }
}

function create(options, dependencies) {
  const pino = options.pino || require("pino");
  let pinoHttp = options.pinoHttp;
  try { pinoHttp = require("pino-http"); } catch (e) { }

  const name = options.name || dependencies?.pkg?.name || dependencies?.config?.name || 'pino';

  const opts = { name, ...defaults.pino, ...dependencies?.config };
  const logger = pino(opts, pino.destination({ ...opts.destination }));
  const optsHttp = { logger, ...defaults.pinoHttp, ...dependencies?.config?.http }
  logger.middleware = pinoHttp ? pinoHttp(optsHttp) : null;
  return logger;
}

function http() {
  function start({ app, logger }) {
    app.use(logger.middleware);
  }

  return { start };
}
