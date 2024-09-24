module.exports.logger = component;

function component() {
  return { start: create };
}

function create({ app, logger, config }) {
  app.use(middleware(logger, config));
}

function middleware(logger, opts = {}) {
  const genReqId = reqIdGenFactory();
  const log = logger.child({ component: 'http' });
  const levelPicker = opts.customLogLevel || levelFromResponse;

  return async function logging(req, res, next) {
    const startTime = Date.now();

    let err, result;
    try { result = await next(); }
    catch (e) { result = await next(err = e); }

    const reqId = genReqId(req);
    const responseTime = Date.now() - startTime;
    const level = levelPicker(res, err);

    if (shouldLog(log, level)) {
      log[level]({
        req: reqSerializer(req),
        res: resSerializer(res),
        reqId, responseTime
      });
    }

    return result;
  }
}

function levelFromResponse(res, err) {
  if (res.statusCode >= 400 && res.statusCode < 500) {
    return "warn";
  } else if (res.statusCode >= 500 || err) {
    return "error";
  } else if (res.statusCode >= 300 && res.statusCode < 400) {
    return "silent";
  }
  return "info";
}

function reqIdGenFactory() {
  const maxInt = 2147483647
  let nextReqId = 0
  return function genReqId(req) {
    return req.id || (nextReqId = (nextReqId + 1) & maxInt)
  }
}

function reqSerializer(req) {
  const _req = {
    id: req.id,
    method: req.method,
    headers: { ...req.headers }
  };

  if (_req.headers.authorization) { _req.headers.authorization = '<HIDDEN>'; }
  if (_req.headers.cookie) { _req.headers.cookie = '<HIDDEN>'; }
  if (req.query) { _req.query = req.query; }
  if (req.params) { _req.params = req.params; }
  if (req.originalUrl) {
    _req.url = req.originalUrl;
  } else {
    const path = req.path;
    _req.url = typeof path === 'string' ? path : (req.url ? req.url.path || req.url : undefined);
  }

  return _req;
}

function resSerializer(res) {
  return {
    statusCode: res.headersSent ? res.statusCode : null,
    headers: res.getHeaders ? res.getHeaders() : res._headers
  };
}

function shouldLog(__, level) {
  return (!global.$$bole || global.$$bole[level].length > 0);
}
