/*

ISC License

Copyright (c) 2016, GuideSmiths Ltd.

Permission to use, copy, modify, and/or distribute this software for any
purpose with or without fee is hereby granted, provided that the above
copyright notice and this permission notice appear in all copies.

THE SOFTWARE IS PROVIDED "AS IS" AND THE AUTHOR DISCLAIMS ALL WARRANTIES WITH
REGARD TO THIS SOFTWARE INCLUDING ALL IMPLIED WARRANTIES OF MERCHANTABILITY
AND FITNESS. IN NO EVENT SHALL THE AUTHOR BE LIABLE FOR ANY SPECIAL, DIRECT,
INDIRECT, OR CONSEQUENTIAL DAMAGES OR ANY DAMAGES WHATSOEVER RESULTING FROM
LOSS OF USE, DATA OR PROFITS, WHETHER IN AN ACTION OF CONTRACT, NEGLIGENCE
OR OTHER TORTIOUS ACTION, ARISING OUT OF OR IN CONNECTION WITH THE USE OR
PERFORMANCE OF THIS SOFTWARE.

*/

var domain = require('domain').create()

module.exports = function(system, options) {

    if (!system) throw new Error('system is required')

    var logger = options && options.logger || console
    var underlyingRunner

    function start(cb) {

        domain.on('error', function(err){
            logger.error('Unhandled domain exception. Invoking shutdown.')
            if (err) logger.error(err.stack)
            underlyingRunner.stop(function() {
                process.exit(1)
            })
        })

        domain.run(function() {
            underlyingRunner = (options && options.runner || require('./service-runner'))(system, options)
            underlyingRunner.start(cb)
        })
    }

    function stop(cb) {
        if (!underlyingRunner) return cb()
        underlyingRunner.stop(cb)
    }

    return {
        start: start,
        stop: stop
    }
}
