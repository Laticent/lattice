/**
 * The CLI's locked page for CODE PACKAGES (portable-packages phase 6, step 1;
 * engineering/decisions/2026-09-24-code-package-contract.md §4). A transform someone else wrote
 * runs here and nowhere else: a Chromium page with no network and nothing of the deck but the
 * data it is handed. The owner chose a Chromium page over a Node child process because Node's
 * permission model does not block the network (§4, measured).
 *
 * TWO INDEPENDENT WALLS, each measured on its own against the same hostile transforms, so either
 * one failing still leaves the other (test/integration/export/code-sandbox-network.test.js):
 *
 *   1. THE BROWSER. The sandbox browser ALWAYS launches with its own frozen argument list: the
 *      offline arguments (lib/core/offline-chromium.js: a dead proxy for every http(s) and
 *      WebSocket request, WebRTC kept to proxied traffic so no UDP, a resolver rule that fails
 *      every host so no DNS). `--allow-remote` is the author's choice about THEIR images; it is
 *      never a stranger's code's network. Speculative prefetch and prerender off, and Chromium's
 *      popup blocker left on (Puppeteer turns it off by default), are defense in depth: no
 *      measured vector needs them.
 *   2. THE PAGE. A fresh browser context per sandbox; a `data:` outer document with no script at
 *      all; the transform in `<iframe sandbox="allow-scripts">`, so Chromium refuses its popups,
 *      form posts and top-level navigation; a content-security policy of `default-src 'none'`
 *      with script allowed only by the SHA-256 HASH of the transform, inherited by the frame's
 *      `srcdoc`; request interception that aborts everything but the page's own `data:`,
 *      `blob:` and `about:` documents; and an init script, run in every new document before any
 *      transform code, that removes `window.open` and WebRTC.
 *
 * Why each piece, measured with a local HTTP + WebSocket + UDP listener on Chromium 131:
 *   - `'unsafe-inline'` let a transform inject speculation rules, which the browser's prefetch
 *     service fetched past interception (1 request, online). A per-page NONCE did no better: the
 *     transform runs inside the nonced script, reads `document.currentScript.nonce` and stamps it
 *     on what it injects (1 request; the red team's hypothesis, measured by the inversion lens).
 *     A hash cannot be reused that way: a script with other content has another hash.
 *   - `setContent` instead of a `data:` navigation wrote into the existing `about:blank`, where the
 *     init script never runs, so `window.open` got out (2 requests) and WebRTC sent 3 UDP packets.
 *   - A `target=_blank` link opened a popup whose first request left before it could be closed. A
 *     JavaScript click guard stopped the plain case, and the checker walked round it three ways (a
 *     link in a closed shadow root, a patched `Element.prototype.closest`, an SVG link), so the
 *     transform runs in a sandboxed frame instead, where no script can grant itself a popup.
 *   - `--block-new-web-contents` did not stop a headless popup, so it is not relied on.
 *
 * NOT CLAIMED HERE: an OS-level sandbox under the renderer. The CLI launches Chromium with
 * `--no-sandbox` (it runs as root in containers, where Chromium's own sandbox cannot start), so
 * both walls are browser policy over a renderer a Chromium exploit could escape. Whether code
 * packages must refuse to run without the OS sandbox is the owner's call, recorded in
 * followups.d/2314-p4-code-packages.md.
 */
const crypto = require('node:crypto');
const { OFFLINE_CHROMIUM_ARGS } = require('./offline-chromium.js');

/**
 * The sandbox browser's own arguments, frozen here rather than borrowed, so a later change to the
 * deck render's offline arguments cannot quietly weaken this wall. The test pins it literally.
 */
const SANDBOX_LAUNCH_ARGS = Object.freeze([...OFFLINE_CHROMIUM_ARGS, '--disable-features=Prerender2,SpeculationRulesPrefetchFuture,NoStatePrefetchHoldback', '--dns-prefetch-disable']);

/** Chromium's `data:` URL ceiling is 2 MB; the largest bundled package measured is ~210 KB. */
const MAX_DOC_BYTES = 1_500_000;

/** The page's policy: the one script whose hash it names, inline styles, and data: images. */
function sandboxCsp(scriptHash) {
  return [
    "default-src 'none'",
    `script-src 'sha256-${scriptHash}'`,
    "style-src 'unsafe-inline'",
    'img-src data: blob:',
    'font-src data:',
    "connect-src 'none'",
    "media-src 'none'",
    "frame-src 'none'",
    "child-src 'none'",
    "worker-src 'none'",
    "object-src 'none'",
    "manifest-src 'none'",
    "form-action 'none'",
    "base-uri 'none'",
  ].join('; ');
}

/** Runs in every new document of the page, before any of its scripts. */
function sandboxInit() {
  const lock = (name, value) => {
    try {
      Object.defineProperty(window, name, { value, configurable: false, writable: false });
    } catch {
      /* already locked */
    }
  };
  lock('open', () => null);
  for (const name of ['RTCPeerConnection', 'webkitRTCPeerConnection', 'RTCDataChannel', 'RTCIceTransport']) lock(name, undefined);
}

/** What the page may load: its own document and in-memory resources. */
const PAGE_OWN = /^(?:data:|blob:|about:(?:blank|srcdoc)$)/;

/**
 * Launch the sandbox browser. `launchOptions.args` is extended, never replaced; the sandbox's own
 * arguments always ride along, and Puppeteer's `--disable-popup-blocking` default is dropped.
 * @param {{ launch: Function }} puppeteer
 * @param {object} [launchOptions]
 */
function launchSandboxBrowser(puppeteer, launchOptions = {}) {
  const ignore = launchOptions.ignoreDefaultArgs === true ? true : [...(Array.isArray(launchOptions.ignoreDefaultArgs) ? launchOptions.ignoreDefaultArgs : []), '--disable-popup-blocking'];
  return puppeteer.launch({ ...launchOptions, ignoreDefaultArgs: ignore, args: [...(launchOptions.args || []), ...SANDBOX_LAUNCH_ARGS] });
}

// Script text inlined into an HTML document is parsed as HTML first. `</script` ends the element,
// and `<!--` followed by `<script` puts the parser in its escaped state and swallows the real
// closing tag, so the script text no longer matches its hash and the transform silently never runs
// (found by the checker). A `<` before any of the three is written `\x3C`, which every JavaScript
// string, template and regular expression reads as `<`; esbuild's minified output never has one
// outside those.
const inlineScript = (code) => String(code).replace(/<(?=\/script|script|!--)/gi, '\\x3C');
const escapeAttr = (v) => String(v).replace(/&/g, '&amp;').replace(/"/g, '&quot;');

/**
 * Open one locked page in `browser` (a fresh context) with `script` as the only script, run inside
 * a sandboxed iframe. One page per package per render: pages share nothing, and a package that
 * patches a global cannot see or rewrite another package's data (contract note §4).
 *
 * THE IFRAME IS THE POPUP AND NAVIGATION WALL. The script runs in `<iframe sandbox="allow-scripts">`
 * with no `allow-popups`, `allow-forms`, `allow-top-navigation` or `allow-same-origin`, so Chromium
 * itself refuses a popup, a form post and a top-level navigation however the code asks for one. A
 * click guard written in JavaScript was tried first and the checker defeated it three ways: a link
 * in a shadow root, a patched `Element.prototype.closest`, and an SVG link. The frame's document is
 * a `srcdoc`, which inherits the outer document's policy (script only by the transform's hash), and
 * the outer document has no script at all.
 *
 * @param {object} browser  a puppeteer Browser (the sandbox browser; see launchSandboxBrowser)
 * @param {{ script?: string, body?: string, onConsole?: (text: string) => void }} [doc]  the
 *   transform's script, the body markup it starts with, and a listener for its console, attached
 *   before it loads. The text is the stranger's: a caller that prints it must strip terminal escapes.
 * @returns {Promise<{ page: object, frame: object, close: () => Promise<void> }>}  `frame` is where
 *   the transform runs; evaluate there.
 */
async function openSandboxPage(browser, { script = '', body = '', onConsole } = {}) {
  const code = inlineScript(script);
  const scriptHash = crypto.createHash('sha256').update(code).digest('base64');
  const csp = sandboxCsp(scriptHash);
  const inner = `<!doctype html><html><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="${csp}"></head><body>${body}<script>${code}</script></body></html>`;
  const doc =
    '<!doctype html><html><head><meta charset="utf-8">' +
    `<meta http-equiv="Content-Security-Policy" content="${csp}">` +
    '<style>html,body{margin:0}iframe{border:0;width:100%;height:100vh}</style>' +
    `</head><body><iframe sandbox="allow-scripts" srcdoc="${escapeAttr(inner)}"></iframe></body></html>`;
  if (Buffer.byteLength(doc) > MAX_DOC_BYTES) {
    throw new Error(`code sandbox: the page is ${Buffer.byteLength(doc)} bytes, past the ${MAX_DOC_BYTES}-byte limit a data: document can carry`);
  }
  const context = await browser.createBrowserContext();
  try {
    const page = await context.newPage();
    await page.setRequestInterception(true);
    page.on('request', (req) => (PAGE_OWN.test(req.url()) ? req.continue() : req.abort('blockedbyclient')));
    if (onConsole) page.on('console', (m) => onConsole(m.text()));
    await page.evaluateOnNewDocument(sandboxInit);
    await page.goto(`data:text/html;charset=utf-8,${encodeURIComponent(doc)}`, { waitUntil: 'load' });
    const frame = page.frames().find((f) => f !== page.mainFrame());
    if (!frame) throw new Error('code sandbox: the sandboxed frame did not load');
    return { page, frame, close: () => context.close() };
  } catch (e) {
    await context.close().catch(() => {});
    throw e;
  }
}

module.exports = { SANDBOX_LAUNCH_ARGS, MAX_DOC_BYTES, sandboxCsp, sandboxInit, launchSandboxBrowser, openSandboxPage };
