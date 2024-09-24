module.exports = component;

function component() {
  return {
    start({ app, config }) {
      const users = extractUsers(config.basic.allowed);
      const isExpress = isExpressApp(app);
      const auth = createAuth(users, isExpress);
      app.use(auth.initialize());
      return auth;
    }
  };
}

function createAuth(users, isExpress) {
  const allowed = new Map(users.map(u => [userToBasicHeader(u), u]));

  return {
    initialize() {
      return function initializeActor(req, __, next) {
        req.actor = allowed.get(req.headers.authorization);
        return next();
      }
    },
    authenticate() {
      return isExpress ? authenticateExpress : authenticateRestana;
    }
  };
}

function authenticateExpress(req, res, next) {
  if (req.actor) {
    if (req.log) {
      const { actorId, teamId, roles, username } = req.actor;
      res.log = req.log = req.log.child({ auth: { actorId, teamId, roles, username } });
    }
    return next();
  } else {
    res
      .set('WWW-Authenticate', 'Basic realm="401"')
      .status(401)
      .send('Authentication required.');
  }
}

function authenticateRestana(req, res, next) {
  if (req.actor) {
    const { actorId, teamId, roles, username } = req.actor;
    req.auth = { actorId, teamId, roles, username };
    return next();
  } else {
    const headers = { 'WWW-Authenticate': 'Basic realm="401"' };
    res.send('Authentication required.', 401, headers);
  }
}

function extractUsers(s) {
  if (!s) return [];
  try {
    return JSON.parse(Buffer.from(s, "base64").toString());
  } catch {
    return s
      .split(";")
      .map((w) => w.split(":"))
      .map(([username, password, roles]) =>
        ({ username, password, roles: Number.parseInt(roles) })
      );
  }
}

function isExpressApp(router) {
  return isExpressRouter(router) &&
    isFunction(router.get) &&
    isFunction(router.set) &&
    isFunction(router.enabled) &&
    isFunction(router.disabled);
};

function isExpressRouter(router) {
  return isFunction(router) && isFunction(router.param);
};

function isFunction(value) {
  return typeof value === 'function';
}

function userToBasicHeader(user) {
  const b64 = Buffer
    .from(`${user.username}:${user.password}`)
    .toString('base64');
  return `Basic ${b64}`;
}

