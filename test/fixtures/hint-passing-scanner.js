/**
 * A scanner that lets one class through, for the failing arm of the connection oracle in
 * tools/fuzz-web-refs.mjs (`--wide --scanner-file test/fixtures/hint-passing-scanner.js`). It is
 * lib/core/remote-ref.js, except that a document holding a `rel=preconnect` link is returned as
 * written. A preconnect opens a connection and sends no request, so only the idle-connection count
 * can catch it: where the oracle's control reads `sees`, this run must fail on idle connections.
 * Never used outside that arm.
 */
const real = require('../../lib/core/remote-ref.js');

const HINT = /rel\s*=\s*["']?preconnect/i;

function blockWebImages(html, allowed, opts) {
  if (HINT.test(String(html))) return { html: String(html), blocked: [] };
  return real.blockWebImages(html, allowed, opts);
}

module.exports = { ...real, blockWebImages };
