module.exports.noopLogger = noop;

function noop() {
  return { debug() { }, info() { }, warn() { }, error() { } };
}

