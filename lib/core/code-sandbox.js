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
 *      all; a frame, `<iframe sandbox="allow-scripts">`, so Chromium refuses its popups, form
 *      posts and top-level navigation; a content-security policy of `default-src 'none'` with
 *      script allowed only by the SHA-256 HASH of the frame's one script, inherited by its
 *      `srcdoc`; request interception that aborts everything but the page's own `data:`,
 *      `blob:` and `about:` documents; and an init script, run in every new document, that
 *      removes `window.open` and WebRTC.
 *   A code package runs one level further in: in a WORKER the frame's script makes
 *   (`openPackageSandbox`; lib/packages/code-door-core.mjs FRAME_BOOTSTRAP). A worker cannot
 *   navigate, has no document, and inherits the frame's policy, and it keeps the package out of
 *   the realm the runner's checks live in. The Studio runs the same frame script and worker
 *   (docs/src/lib/code-packages/runner.ts), so both doors run a package the same way.
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
// The pieces the Studio's sandboxed iframe runs too (HARD RULE #1): the policy, the script
// escaping and the package runner live in the door's shared kernel.
const { sandboxCsp, inlineScript, workerScript, FRAME_BOOTSTRAP, MAX_OUTPUT_CHARS } = require('../packages/code-door-core.mjs');

/**
 * The sandbox browser's own arguments, frozen here rather than borrowed, so a later change to the
 * deck render's offline arguments cannot quietly weaken this wall. The test pins it literally.
 */
const SANDBOX_LAUNCH_ARGS = Object.freeze([...OFFLINE_CHROMIUM_ARGS, '--disable-features=Prerender2,SpeculationRulesPrefetchFuture,NoStatePrefetchHoldback', '--dns-prefetch-disable']);

/**
 * Chromium's ceiling on a URL is 2 MB, and it applies to the ENCODED `data:` URL, which runs about
 * 1.9 times the script it carries (attribute escaping, then `encodeURIComponent`). Checked against
 * the encoded URL, so a page past it gets this error, not an unexplained `net::ERR_ABORTED`. The
 * largest bundled package measured is `map`, 234 KB, about 443 KB encoded.
 */
const MAX_DOC_BYTES = 2_000_000;

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
 * @param {{ script?: string, body?: string, onConsole?: (text: string) => void, onRequest?: (url: string) => void, loadTimeoutMs?: number }} [doc]
 *   the transform's script, the body markup it starts with, a listener for its console, and one told
 *   each request the page refuses; both are attached before it loads. `loadTimeoutMs` (5 s) bounds
 *   the load, which runs the script's top level. The text is the stranger's:
 *   a caller that prints it must strip terminal escapes.
 * @returns {Promise<{ page: object, frame: object, close: () => Promise<void> }>}  `frame` is where
 *   the transform runs; evaluate there. `close` may be called more than once.
 */
async function openSandboxPage(browser, { script = '', body = '', onConsole, onRequest, loadTimeoutMs = 5000 } = {}) {
  const code = inlineScript(script);
  const scriptHash = crypto.createHash('sha256').update(code).digest('base64');
  const csp = sandboxCsp(scriptHash);
  const inner = `<!doctype html><html><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="${csp}"></head><body>${body}<script>${code}</script></body></html>`;
  const doc =
    '<!doctype html><html><head><meta charset="utf-8">' +
    `<meta http-equiv="Content-Security-Policy" content="${csp}">` +
    '<style>html,body{margin:0}iframe{border:0;width:100%;height:100vh}</style>' +
    `</head><body><iframe sandbox="allow-scripts" srcdoc="${escapeAttr(inner)}"></iframe></body></html>`;
  const url = `data:text/html;charset=utf-8,${encodeURIComponent(doc)}`;
  if (url.length > MAX_DOC_BYTES) {
    throw new Error(`code sandbox: the page's data: URL is ${url.length} characters, past the ${MAX_DOC_BYTES}-character limit Chromium takes`);
  }
  const context = await browser.createBrowserContext();
  try {
    const page = await context.newPage();
    await page.setRequestInterception(true);
    page.on('request', (req) => {
      if (PAGE_OWN.test(req.url())) return req.continue();
      if (onRequest) onRequest(req.url());
      return req.abort('blockedbyclient');
    });
    if (onConsole) page.on('console', (m) => onConsole(m.text()));
    await page.evaluateOnNewDocument(sandboxInit);
    // Bounded: a bundle that loops at its top level would otherwise hold the load for Puppeteer's
    // 30 s default navigation timeout.
    await page.goto(url, { waitUntil: 'load', timeout: loadTimeoutMs });
    const frame = page.frames().find((f) => f !== page.mainFrame());
    if (!frame) throw new Error('code sandbox: the sandboxed frame did not load');
    let closing = null;
    return { page, frame, close: () => (closing ??= context.close()) };
  } catch (e) {
    await context.close().catch(() => {});
    throw e;
  }
}

/**
 * Open a locked page for ONE code package and load it: the page's one script is the shared
 * FRAME_BOOTSTRAP (lib/packages/code-door-core.mjs), and the package runs in a Worker that script
 * makes, never in the page. The worker inherits the page's policy (no network), and a worker cannot
 * navigate, so the walls hold for code that never touches the page (contract note §9). The load,
 * which runs the bundle's top level, is bounded by `loadTimeoutMs`.
 * @param {object} browser  the sandbox browser
 * @param {string} code     the package's `transform.js`
 * @param {{ onConsole?: (text: string) => void, onRequest?: (url: string) => void, loadTimeoutMs?: number }} [opts]
 * @returns {Promise<{ page: object, frame: object, close: () => Promise<void> }>}
 */
async function openPackageSandbox(browser, code, { onConsole, onRequest, loadTimeoutMs = 5000 } = {}) {
  const text = workerScript(code);
  const sandbox = await openSandboxPage(browser, { script: FRAME_BOOTSTRAP, onConsole, onRequest, loadTimeoutMs });
  try {
    // A worker's console is its own target; forward it, so the package's lines are heard.
    if (onConsole) sandbox.page.on('workercreated', (w) => w.on?.('console', (m) => onConsole(m.text())));
    await sandbox.frame.evaluate((t, ms) => window.__latticeLoad(t, ms), text, loadTimeoutMs);
    return sandbox;
  } catch (e) {
    await sandbox.close();
    throw new Error(`code sandbox: ${String(e.message).replace(/^Error: /, '')}`);
  }
}

/**
 * Run the package loaded in `sandbox` (from `openPackageSandbox`) on one slide: its rendered
 * `<section>`, its 0-based position in the deck (required: a wrong position gives a chart the wrong
 * ids, silently, so a missing one is refused), the deck render's id prefix (`renderIdPrefix()`, empty
 * for every ordinary deck), and the render's `baseUrl`, which a transform resolves relative asset
 * paths against (empty for the CLI).
 *
 * The frame's runner ends the worker at `timeoutMs` and refuses a reply that is not a string of at
 * most MAX_OUTPUT_CHARS. The host reads the result's type and length through a handle before it
 * takes it, as well, and closes the sandbox if the page itself stops answering.
 * @param {{ frame: object, close: () => Promise<void> }} sandbox
 * @param {{ html: string, index: number, idPrefix?: string, baseUrl?: string }} slide
 * @param {{ timeoutMs?: number }} [opts]  the contract's 2 s per slide by default
 * @returns {Promise<string>}
 */
async function runPackage(sandbox, slide, { timeoutMs = 2000 } = {}) {
  const data = { html: String(slide.html), index: slide.index, idPrefix: slide.idPrefix ?? '', baseUrl: slide.baseUrl ?? '' };
  let timer;
  // The page's own deadline is the worker's; this one, a little later, is for a page that hangs.
  const overrun = new Promise((_, reject) => {
    timer = setTimeout(() => {
      reject(new Error(`code sandbox: the transform did not finish within ${timeoutMs} ms`));
      sandbox.close().catch(() => {});
    }, timeoutMs + 1000);
  });
  const run = async () => {
    let handle;
    try {
      handle = await sandbox.frame.evaluateHandle((s, ms) => window.__latticeRun(s, ms), data, timeoutMs);
    } catch (e) {
      throw new Error(`code sandbox: ${String(e.message).replace(/^Error: /, '')}`);
    }
    try {
      const [type, length] = await handle.evaluate((v) => [typeof v, typeof v === 'string' ? v.length : -1]);
      if (type !== 'string') throw new TypeError(`code sandbox: the transform returned ${type}, not a string`);
      if (length > MAX_OUTPUT_CHARS) throw new RangeError(`code sandbox: the transform returned ${length} characters, past the ${MAX_OUTPUT_CHARS}-character limit`);
      return await handle.jsonValue();
    } finally {
      await handle.dispose().catch(() => {});
    }
  };
  try {
    return await Promise.race([run(), overrun]);
  } finally {
    clearTimeout(timer);
  }
}

module.exports = { SANDBOX_LAUNCH_ARGS, MAX_DOC_BYTES, MAX_OUTPUT_CHARS, sandboxCsp, sandboxInit, launchSandboxBrowser, openSandboxPage, openPackageSandbox, workerScript, runPackage };
