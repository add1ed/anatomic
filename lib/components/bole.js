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

  if (!globalsSet) {
    bole.setFastTime();
    bole.output({ ...defaults, ...deps?.config });
    globalsSet = true;
  }
  const name = deps?.config?.name || deps?.pkg?.name || opts?.name || defaults.name;
  const log = wrap(bole(name));

  return log;
}

function wrap(log) {
  return {
    child: function (opts) {
      return wrap(log(opts.component));
    },
    debug: log.debug,
    info: log.info,
    warn: log.warn,
    error: log.error,
  };
}
