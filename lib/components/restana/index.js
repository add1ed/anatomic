const A = require("./app");
const { logger } = require("./logger");
const { server } = require("./server");

module.exports.app = A.app;
module.exports.createApp = A.createApp;
module.exports.loggingErrorHandler = A.loggingErrorHandler;
module.exports.logger = logger;
module.exports.server = server;

