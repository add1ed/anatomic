const { auth } = require("./auth");
const bole = require("./bole");
const express = require("./express");
const pg = require("./pg");
const pino = require("./pino");
const postgres = require("./postgres");
const restana = require("./restana");

module.exports = get;

module.exports.auth = auth;
module.exports.bole = bole;
module.exports.express = express;
module.exports.pg = pg;
module.exports.pino = pino;
module.exports.postgres = postgres;
module.exports.restana = restana;

function get(name, opts) {
  const packages = opts?.packages ?? {};

  switch (name) {
    case "auth":
      return auth();
    case "bole":
      return bole(packages);
    case "express.app":
      return express.app(packages);
    case "express.errorHandler":
      return express.errorHandler();
    case "express.middleware":
      return express.middleware();
    case "express.server":
      return express.server();
    case "pg":
      return pg(packages);
    case "pino":
      return pino(packages);
    case "pino.http":
      return pino.http();
    case "postgres":
      return postgres(packages);
    case "restana.app":
      return restana.app(packages);
    case "restana.logger":
      return restana.logger();
    case "restana.server":
      return restana.server();
    default:
      return null;
  }
}
