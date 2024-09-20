const bole = require("./bole");
const pg = require("./pg");
const pino = require("./pino");
const postgres = require("./postgres");
const restana = require("./restana");

module.exports = get;

module.exports.bole = bole;
module.exports.pg = pg;
module.exports.pino = pino;
module.exports.postgres = postgres;
module.exports.restana = restana;

function get(name, { packages } = {}) {
  switch (name) {
    case "bole":
      return bole(packages);
    case "pg":
      return pg(packages);
    case "pino":
      return pino(packages);
    case "pino.middleware":
      return pino.middleware();
    case "postgres":
      return postgres(packages);
    case "restana.app":
      return restana.app(packages);
    case "restana.server":
      return restana.server();
    default:
      return null;
  }
}
