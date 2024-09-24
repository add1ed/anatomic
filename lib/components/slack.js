const { performance } = require('perf_hooks')
const url = require('url')
const U = require("../utils");

module.exports = component;
module.exports.create = create;

function component(options = {}) {
  const name = options.name || 'slack'

  async function start({ logger, config }) {
    const log = logger?.child?.({ component: name }) || U.noopLogger;
    const opts = { baseURL: 'https://slack.com/api', token: config?.token };
    return create(opts, log);
  }

  return { start }
}

function create(config, log) {
  const { baseURL, token } = config;

  return { sendDataMessage, snippet }

  async function send(content) {
    const { method, url, body } = content;
    const start = performance.now()
    try {
      const response = await fetch(`${baseURL}${url}`, {
        method,
        body,
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-type": "application/x-www-form-urlencoded"
        }
      });
      const result = await response.json();
      const elapsed = performance.now() - start
      const context = { content, result }
      log.debug(context, `sending took ${Math.ceil(elapsed)}ms`)
      return result
    } catch (err) {
      const elapsed = performance.now() - start
      const context = { content, err }
      log.error(context, `sending took ${Math.ceil(elapsed)}ms`)
      throw err
    }
  }

  async function snippet(data, opts = {}) {
    const body = {
      channels: opts.channel,
      title: opts.title,
      initial_comment: opts.comment,
      content: JSON.stringify(data, null, 2)
    }

    const params = new url.URLSearchParams(body)

    return send({
      method: 'post',
      url: '/files.upload',
      body: params.toString()
    })
  }

  async function sendDataMessage(data, opts = {}) {
    const text = JSON.stringify(data, null, 2)
    const body = {
      channel: opts.channel,
      text,
      blocks: JSON.stringify([
        {
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: '```' + text + '```'
          }
        }
      ], null, 2)
    }

    const params = new url.URLSearchParams(body)

    return send({
      method: 'post',
      url: '/chat.postMessage',
      body: params.toString()
    })
  }
}
