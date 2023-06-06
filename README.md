anatomic
========

A (very) minimal dependency injection library.

This is a fork of [systemic](https://github.com/guidesmiths/systemic), with changes for enhanced minimalism.

## tl;dr

### Define the system

```js
const System = require('anatomic');
const config = require('./components/config');
const logger = require('./components/logger');
const postgres = require('./components/postgres');

module.exports = () => System()
  .add('config', config(), { scoped: true })
  .add('logger', logger()).dependsOn('config')
  .add('postgres.primary', postgres()).dependsOn('config', 'logger')
  .add('postgres.secondary', postgres()).dependsOn('config', 'logger');
```

### Run the system

```js
const System = require('./system');

const events = { SIGTERM: 0, SIGINT: 0, unhandledRejection: 1, error: 1 };

async function start() {
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

start();
```

### Concepts

anatomic has 3 main concepts

1. Systems
1. Components
1. Dependencies

#### Systems

You add components and their dependencies to a system. When you start the system, anatomic iterates through all the components, starting them in the order derived from the dependency graph. When you stop the system, anatomic iterates through all the components stopping them in the reverse order.

```js
const System = require('anatomic');
const config = require('./components/config');
const logger = require('./components/logger');
const postgres = require('./components/postgres');

async function init() {
  const system = System()
    .add('config', config(), { scoped: true })
    .add('logger', logger()).dependsOn('config')
    .add('postgres.primary', postgres()).dependsOn('config', 'logger')
    .add('postgres.secondary', postgres()).dependsOn('config', 'logger');

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

init();
```

System life cycle functions (start, stop, restart) return a promise.

#### Components

A component is an object with optional asynchronous start and stop functions. The start function should yield the underlying resource after it has been started. e.g.

```js
module.exports = () => {
  let db;

  async function start(dependencies) {
    db = await PostgresClient.connect('postgres://localhost:5432/example');
    return db;
  }

  async function stop() {
    return db.close();
  }

  return { start, stop };
};
```

The components stop function is useful for when you want to disconnect from an external service or release some other kind of resource.

#### Dependencies

A component's dependencies must be registered with the system

```js
const System = require('anatomic');
const config = require('./components/config');
const logger = require('./components/logger');
const postgres = require('./components/postgres');

module.exports = () => System()
  .add('config', config(), { scoped: true })
  .add('logger', logger()).dependsOn('config')
  .add('postgres.primary', postgres()).dependsOn('config', 'logger')
  .add('postgres.secondary', postgres()).dependsOn('config', 'logger');
```

The components dependencies are injected via it's start function

```js
async function start({ config }) {
  db = await PostgresClient.connect(config.url);
  return db;
}
```

#### Mapping dependencies

You can rename dependencies passed to a components start function by specifying a mapping object instead of a simple string

```js
module.exports = () => System()
  .add('config', config())
  .add('postgres', postgres())
  .dependsOn({ component: 'config', destination: 'options' });
```

If you want to inject a property or subdocument of the dependency thing you can also express this with a dependency mapping

```js
module.exports = () => System()
  .add('config', config())
  .add('postgres', postgres())
  .dependsOn({ component: 'config', source: 'config.postgres' });
```

Now `config.postgres` will be injected as `config` instead of the entire configuration object

#### Scoped Dependencies

Injecting a sub document from a json configuration file is such a common use case, you can enable this behaviour automatically by 'scoping' the component. The following code is equivalent to that above

```js
module.exports = () => System()
  .add('config', config(), { scoped: true })
  .add('postgres', postgres()).dependsOn('config');
```

#### Optional Dependencies

By default an error is thrown if a dependency is not available on system start. Sometimes a component might have an optional dependency on a component they may or may not be available in the system, typically when using subsystems. In this situation a dependency can be marked as optional.

```js
module.exports = () => System()
  .add('app', app())
  .add('server', server())
  .dependsOn('app', { component: 'routes', optional: true });
```

#### Overriding Components

Attempting to add the same component twice will result in an error, but sometimes you need to replace existing components with test doubles. Under such circumstances use `set` instead of `add`

```js
const System = require('../lib/system');
const stub = require('./stubs/store');

let testSystem;

before(async () => {
  testSystem = System().set('store', stub);
  await testSystem.start();
});

after(async () => {
  await testSystem.stop();
});
```

#### Removing Components

Removing components during tests can decrease startup time

```js
const System = require('../lib/system');

let testSystem;

before(async () => {
  testSystem = System().remove('server');
  await testSystem.start();
});

after(async () => {
  await testSystem.stop();
});
```

#### Including components from another system

You can simplify large systems by breaking them up into smaller ones, then including their component definitions into the main system.

```js
// db-system.js
const System = require('anatomic');
const postgres = require('./components/postgres');

module.exports = () => System()
  .add('postgres', postgres()).dependsOn('config', 'logger');
```

```js
// system.js
const System = require('anatomic');
const utilSystem = require('./lib/util/system');
const webSystem = require('./lib/web/system');
const dbSystem = require('./lib/db/system');

module.exports = () => System()
  .include(utilSystem())
  .include(webSystem())
  .include(dbSystem());
```

#### Grouping components

Sometimes it's convenient to depend on a group of components. e.g.

```js
module.exports = () => System()
  .add('app', app())
  .add('routes.admin', adminRoutes()).dependsOn('app')
  .add('routes.api', apiRoutes()).dependsOn('app')
  .add('routes').dependsOn('routes.admin', 'routes.api')
  .add('server').dependsOn('app', 'routes');
```

The above example will create a component 'routes', which will depend on routes.admin and routes.api and be injected as

```js
 {
  routes: {
    admin: { ... },
    adpi: { ... }
  }
 }
```

#### Bootstrapping components

The dependency graph for a medium size project can grow quickly leading to a large system definition. To simplify this you can bootstrap components from a specified directory, where each folder in the directory includes an index.js which defines a sub system. e.g.

```
lib/
  |- system.js
  |- components/
      |- config/
         |- index.js
      |- logging/
         |- index.js
      |- express/
         |- index.js
      |- routes/
         |- admin-routes.js
         |- api-routes.js
         |- index.js
```


```js
// system.js
const System = require('anatomic');
const path = require('path');

module.exports = () => System()
  .bootstrap(path.join(__dirname, 'components'));
```

```js
// components/routes/index.js
const System = require('anatomic');
const adminRoutes = require('./admin-routes');
const apiRoutes = require('./api-routes');

module.exports = () => System()
  .add('routes.admin', adminRoutes()).dependsOn('app')
  .add('routes.api', apiRoutes()).dependsOn('app', 'postgres')
  .add('routes').dependsOn('routes.admin', 'routes.api');
```