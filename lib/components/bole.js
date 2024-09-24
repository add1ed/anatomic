module.exports = component;
module.exports.create = create;

const defaults = {
  level: "warn",
  name: "anatomic-bole",
  stream: process.stdout,
};

let globalsSet = false;

function component(opts) {
  return {
    start(deps) {
      return create(opts, deps);
    }
  }
}

function create(opts, deps) {
  const bole = opts.bole || require("bole");
  const config = { ...defaults, ...deps?.config };

  if (!globalsSet) {
    bole.setFastTime();
    bole.output(config);
    globalsSet = true;
  }
  const name = deps?.config?.name || deps?.pkg?.name || opts?.name || defaults.name;
  return wrap(bole(name), config.level);
}

function wrap(log, level) {
  return {
    child: function(opts) {
      return wrap(log(opts.component), level);
    },
    debug: log.debug,
    info: log.info,
    warn: log.warn,
    error: log.error,
    level
  };
}
