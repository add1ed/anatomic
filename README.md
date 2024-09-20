# anatomic

A (very) minimal dependency injection library.

This is a fork of [systemic](https://github.com/guidesmiths/systemic), with changes for enhanced minimalism.

## tl;dr

### Define the system

```js
// system.js
const System = require('anatomic');
const config = require('./components/config');
const logger = require('./components/logger');
const postgres = require('./components/postgres');

module.exports = () => System({
  config: { init: config() },
  logger: { init: logger(), dependsOn: 'config' },
  postgres: {
    primary:   { init: postgres(), dependsOn: ['config', 'logger'] },
    secondary: { init: postgres(), dependsOn: ['config', 'logger']}
  }
});
```

### Run the system

```js
const System = require('./system');

const events = { SIGTERM: 0, SIGINT: 0, unhandledRejection: 1, error: 1 };

async function main() {
  const system = System();
  const { config, postgres, logger } = await system.start();

  console.log('System has started. Press CTRL+C to stop');

  Object.keys(events).forEach((name) => {
    process.on(name, async () => {
      await system.stop();
      console.log('System has stopped');
      process.exit(events[name]);
    });
  });
}

main();
```
