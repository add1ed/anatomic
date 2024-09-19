const pg = require("./pg");
const pino = require("./pino");
const restana = require("./restana");

module.exports = get;

module.exports.pg = pg;
module.exports.pino = pino;
module.exports.restana = restana;

function get(name, { packages } = {}) {
  switch (name) {
    case "pg":
      return pg(packages);
    case "pino":
      return pino(packages);
    case "pino.middleware":
      return pino.middleware();
    case "restana.app":
      return restana.app(packages);
    case "restana.server":
      return restana.server();
    default:
      return null;
  }
}
