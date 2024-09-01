const anatomic = require("./lib/anatomic");

module.exports = anatomic;

module.exports.runner = function (system, options) {

  if (!system) throw new Error('system is required')

  const logger = options && options.logger || console;

  return { start, stop };

  async function start() {
    const components = await system.start();

    process.on('error', (err) => die('Unhandled error. Invoking shutdown.', err));
    process.on('unhandledRejection', (err) => die('Unhandled rejection. Invoking shutdown.', err));
    process.on('SIGINT', () => exitOk('SIGINT'));
    process.on('SIGTERM', () => exitOk('SIGTERM'));

    return components;
  }

  async function stop() {
    await system.stop();
  }

  async function die(msg, err) {
    logger.error(msg);
    if (err) logger.error(err.stack);
    await system.stop();
    process.exit(1);
  }

  async function exitOk(signal) {
    logger.info(`Received ${signal}. Attempting to shutdown gracefully.`);
    await system.stop();
    process.exit(0);
  }
}

