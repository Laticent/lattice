/**
 * Drive test/fixtures/web-ref-fuzz.js through lib/core/remote-ref.js in a real browser, against a
 * loopback server, and report what reached the server (HARD RULE #22: a remote reference is a
 * beacon; HARD RULE #23: a network log, not a claim about a string).
 *
 * Works with a Puppeteer or a Playwright page: it uses only `evaluate`, `setContent` and
 * `addScriptTag`. The caller launches the browser, so the same code serves the Chromium slice in
 * the integration tier and `tools/fuzz-web-refs.mjs` in Chromium, WebKit and Firefox.
 *
 * For each batch of generated inputs:
 *   control     each input as written, in its own `<iframe srcdoc>`: which ones fetch. This is the
 *               coverage figure. An input that never fetches unrewritten proves nothing when it
 *               also fetches nothing rewritten, so the report counts them.
 *   rewritten   the same inputs after the scanners, loaded two ways: as a document (an iframe's
 *               srcdoc) and as a fragment (`innerHTML`, the way the Reading view injects it).
 *               A CSS input is rewritten twice, by `blockWebCss` and, inside a `<style>`, by
 *               `blockWebImages`. Any request at all is a failure.
 */
const http = require('node:http');
const path = require('node:path');
const { asHtml } = require('../fixtures/web-ref-beacons.js');
const { fuzzInputs } = require('../fixtures/web-ref-fuzz.js');

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * Two loopback servers on two ports, so two origins. `base` is the attacker's: every request to it is
 * logged in `hits` and counts. `home` stands for the site's own origin: the harness page is served from it, so
 * `//host/x` and relative addresses resolve the way they do on a real page. A request to `home` is the
 * page's own file and is not a leak (a shipped caller passes `withOwnOrigin`), so it is counted apart.
 */
async function startServer() {
  const hits = [];
  const homeHits = [];
  const listen = async (handler) => {
    const server = http.createServer(handler);
    await new Promise((r) => server.listen(0, '127.0.0.1', r));
    return server;
  };
  const beacon = await listen((req, res) => {
    hits.push(req.url);
    res.writeHead(200, { 'Access-Control-Allow-Origin': '*', 'Content-Type': 'text/plain' });
    res.end('');
  });
  const home = await listen((req, res) => {
    homeHits.push(req.url);
    res.writeHead(200, { 'Content-Type': 'text/html' });
    res.end(req.url === '/' ? '<!doctype html><meta charset="utf-8"><div id="root"></div>' : '');
  });
  const base = `http://127.0.0.1:${beacon.address().port}`;
  const homeUrl = `http://127.0.0.1:${home.address().port}/`;
  return { hits, homeHits, base, home: homeUrl, close: () => Promise.all([beacon, home].map((srv) => new Promise((r) => srv.close(r)))) };
}

/**
 * The scanners and the pieces that sit beside them on a shipped surface, bundled for a browser page:
 * `RemoteRef` (lib/core/remote-ref.js, or the file at `remoteRefPath`), and `Compose` with the slide
 * sanitizer (DOMPurify, the docs-site binding), the stylesheet sanitizer and the preview frames'
 * content-security policy.
 */
async function bundleRemoteRef(remoteRefPath = path.join(__dirname, '../../lib/core/remote-ref.js')) {
  const root = path.join(__dirname, '../..');
  const built = await require('esbuild').build({
    stdin: {
      contents: `
        import * as RemoteRefMod from ${JSON.stringify(remoteRefPath)};
        import DOMPurify from ${JSON.stringify(path.join(root, 'docs/node_modules/dompurify'))};
        import { createSlideSanitizer } from ${JSON.stringify(path.join(root, 'lib/core/sanitize-slide-html.mjs'))};
        import { sanitizeStyleText } from ${JSON.stringify(path.join(root, 'lib/core/sanitize-style-text.mjs'))};
        import { subresourceCspMeta } from ${JSON.stringify(path.join(root, 'lib/core/subresource-csp.mjs'))};
        globalThis.RemoteRef = RemoteRefMod.default ?? RemoteRefMod;
        globalThis.Compose = { sanitizeSlideHtml: createSlideSanitizer(DOMPurify, window), sanitizeStyleText, subresourceCspMeta };
      `,
      resolveDir: root,
      loader: 'js',
    },
    bundle: true, write: false, format: 'iife', platform: 'browser', logLevel: 'silent',
  });
  return built.outputFiles[0].text;
}

/** Wait until the server has been quiet for `quiet` ms, at least `min` ms, at most `max` ms. */
async function settle(hits, { quiet = 250, min = 150, max = 15000 } = {}) {
  const start = Date.now();
  let seen = hits.length;
  let since = Date.now();
  await sleep(min);
  while (Date.now() - start < max) {
    await sleep(40);
    if (hits.length !== seen) {
      seen = hits.length;
      since = Date.now();
    } else if (Date.now() - since >= quiet) return;
  }
}

/** The input a request path belongs to: the first path segment, minus the decoy suffix. */
const nameOf = (url) => url.slice(1).split(/[?#/]/)[0].replace(/-d$/, '');

/**
 * @param {object} o
 * @param {any} o.page            a page with RemoteRef loaded (see `loadPage`)
 * @param {() => Promise<any>} o.openPage  opens a fresh page; used when an input hangs the renderer
 * @param {'plain'|'reading'|'preview'} [o.compose]  how the scanners are composed before the load: `plain` is the scanner alone
 *   (`fonts: true`, nothing allowed); `reading` is the Studio's Reading view (scanner, slide sanitizer, scanner again; the
 *   stylesheet through the scanner and the style sanitizer); `preview` is a preview frame (`fonts: false`, the site's own
 *   origin allowed, the slide sanitizer, and the content-security policy built from what the scanner refused)
 * @param {string} [o.home]       the home origin's URL; the page is served from it (see `startServer`)
 * @param {string} o.bundle       the scanners' bundle; reloaded into the page if an input navigated it away
 * @param {string[]} o.hits       the server's shared request log
 * @param {string} o.base         the server's origin
 * @param {number} o.seed
 * @param {number} o.count        inputs to run
 * @param {number} [o.from]       first input index
 * @param {number} [o.batch]      inputs per page load
 * @param {boolean} [o.control]   also load each input unrewritten (default true)
 * @param {(msg: string) => void} [o.log]
 */
async function runFuzz({ page: firstPage, openPage, bundle, home, compose = 'plain', hits, base, seed, count, from = 0, batch = 300, control = true, log = () => {} }) {
  let page = firstPage;
  const report = { compose, seed, from, count, controlFetched: 0, controlRan: 0, controlByKind: { css: [0, 0], html: [0, 0] }, kinds: { css: 0, html: 0 }, leaks: [], bent: [], hung: [], unattributed: [], errors: [], slowest: { ms: 0, name: '' }, requests: 0, rewrittenRequests: 0 };
  const loadDocs = (docs, mode) => page.evaluate(async ({ docs: d, mode: m }) => {
    const root = document.getElementById('root');
    root.textContent = '';
    if (m === 'doc') {
      await Promise.all(d.map((html) => new Promise((resolve) => {
        const f = document.createElement('iframe');
        const done = () => resolve();
        f.onload = done;
        f.onerror = done;
        setTimeout(done, 4000);
        f.srcdoc = html;
        root.appendChild(f);
      })));
    } else {
      for (const html of d) {
        const div = document.createElement('div');
        div.innerHTML = `${html}<p>x</p><div><span>x</span></div>`;
        root.appendChild(div);
      }
    }
  }, { docs, mode });
  /** A page that never answers (a renderer stuck in a layout loop) is replaced, not waited for. */
  const reset = async () => {
    await Promise.race([Promise.resolve(page.close()).catch(() => {}), sleep(5000)]);
    page = await openPage();
    await loadPage(page, bundle, home);
  };
  const withDeadline = (promise, ms) => {
    let timer;
    const late = new Promise((_, reject) => {
      timer = setTimeout(() => reject(new Error('deadline')), ms);
    });
    return Promise.race([promise, late]).finally(() => clearTimeout(timer));
  };
  const fetchedBy = async (docs, mode) => {
    // a pristine page for every load: a surviving `<base>` or refresh would otherwise bend what the
    // next load fetches, and a request would be pinned on an input that did nothing
    // a navigation from the previous load can still be in flight (WebKit finishes a refresh late)
    // a new page, not a new document: the memory cache belongs to the document and would answer a repeated address
    await reset().catch(() => {});
    hits.length = 0;
    try {
      await withDeadline(loadDocs(docs, mode), 15000);
    } catch (e) {
      await reset();
      // bisect to the input that hangs; a lone hanging input is recorded, not counted as a pass
      if (docs.length === 1) {
        report.hung.push({ mode, doc: docs[0].slice(0, 400) });
        return { names: new Set(), urls: [] };
      }
      const mid = docs.length >> 1;
      const a = await fetchedBy(docs.slice(0, mid), mode);
      const b = await fetchedBy(docs.slice(mid), mode);
      return { names: new Set([...a.names, ...b.names]), urls: [...a.urls, ...b.urls] };
    }
    await settle(hits);
    const names = new Set();
    for (const h of hits) names.add(nameOf(h));
    report.requests += hits.length;
    return { names, urls: [...hits] };
  };

  for (let at = from; at < from + count; at += batch) {
    const inputs = fuzzInputs(seed, Math.min(batch, from + count - at), base, { from: at });
    for (const p of inputs) report.kinds[p.kind]++;
    const known = new Set(inputs.map((p) => p.name));
    const leaksBefore = report.leaks.length;

    if (control) {
      const c = await fetchedBy(inputs.map(asHtml), 'doc');
      report.controlRan += inputs.length;
      report.controlFetched += inputs.filter((p) => c.names.has(p.name)).length;
      for (const p of inputs) {
        report.controlByKind[p.kind][1]++;
        if (c.names.has(p.name)) report.controlByKind[p.kind][0]++;
      }
    }

    const payload = inputs.map((p) => ({ name: p.name, kind: p.kind, html: asHtml(p), css: p.kind === 'css' ? p.text : '', compose }));
    const rewriteInPage = (items) => items.map(({ name, kind, html, css, compose: how }) => {
      const out = { name };
      try {
        let doc;
        let sheet;
        const t0 = performance.now();
        if (how === 'reading') {
          // the Studio's Reading view: the scanner, the slide sanitizer, the scanner again; the stylesheet through the
          // scanner and the style sanitizer. Nothing is allowed, and the page has no policy of its own.
          const first = RemoteRef.blockWebImages(html, [], { fonts: true }).html;
          doc = RemoteRef.blockWebImages(Compose.sanitizeSlideHtml(first), [], { fonts: true }).html;
          if (kind === 'css') sheet = Compose.sanitizeStyleText(RemoteRef.blockWebCss(css, []).css);
        } else if (how === 'preview') {
          // a preview frame: the site's own origin allowed, no fonts refusal (the policy does that), the sanitizer, and the
          // content-security policy built from what the scanner refused, first in the head
          const allowed = RemoteRef.withOwnOrigin([], location.origin);
          const r = RemoteRef.blockWebImages(html, allowed, { fonts: false });
          let blocked = r.blocked;
          let body = Compose.sanitizeSlideHtml(r.html);
          let style = '';
          if (kind === 'css') {
            const c = RemoteRef.blockWebCss(css, allowed);
            blocked = blocked.concat(c.blocked);
            style = `<style>${Compose.sanitizeStyleText(c.css)}</style>`;
            body = '<p>x</p>';
          }
          doc = `<!doctype html><html><head>${Compose.subresourceCspMeta({ webOrigins: [], blocked })}${style}</head><body>${body}</body></html>`;
        } else {
          doc = RemoteRef.blockWebImages(html, [], { fonts: true }).html;
          if (kind === 'css') sheet = RemoteRef.blockWebCss(css).css;
        }
        out.viaImages = doc;
        if (kind === 'css' && sheet !== undefined) out.viaCss = `<style>${sheet}</style><p>x</p>`;
        out.ms = performance.now() - t0;
      } catch (e) {
        out.err = String(e && e.message ? e.message : e);
      }
      return out;
    });
    let rewritten;
    for (let attempt = 0; ; attempt++) {
      try {
        rewritten = await withDeadline(page.evaluate(rewriteInPage, payload), 60000);
        break;
      } catch (e) {
        // the page is stuck or was navigated away; take a fresh one rather than lose the run
        if (attempt >= 2) throw e;
        await reset();
      }
    }

    for (const r of rewritten) {
      if (r.err) report.errors.push({ name: r.name, err: r.err });
      if ((r.ms || 0) > report.slowest.ms) report.slowest = { ms: Math.round(r.ms), name: r.name };
    }

    const byName = new Map(inputs.map((p) => [p.name, p]));
    const paths = [['blockWebImages', 'viaImages'], ['blockWebCss', 'viaCss']];
    for (const [via, key] of paths) {
      const docs = rewritten.filter((r) => typeof r[key] === 'string');
      // a content-security policy lives in a document's own head, so a preview frame is only ever loaded as a document
      for (const mode of compose === 'preview' ? ['doc'] : ['doc', 'frag']) {
        const got = await fetchedBy(docs.map((r) => r[key]), mode);
        report.rewrittenRequests += got.urls.length;
        for (const u of got.urls) {
          const n = nameOf(u);
          if (known.has(n)) {
            const p = byName.get(n);
            if (!report.leaks.some((l) => l.name === n && l.via === `${via}/${mode}`)) report.leaks.push({ name: n, via: `${via}/${mode}`, kind: p.kind, text: p.text, url: u });
          } else report.unattributed.push(u);
        }
      }
    }
    // A surviving `<base>` or refresh bends every input loaded after it in the same batch, so a request
    // is only pinned on an input once it reproduces with that input alone.
    const candidates = report.leaks.splice(leaksBefore);
    for (const l of candidates) {
      const p = byName.get(l.name);
      const r = rewritten.find((x) => x.name === l.name);
      const key = l.via.startsWith('blockWebCss') ? 'viaCss' : 'viaImages';
      const mode = l.via.endsWith('/doc') ? 'doc' : 'frag';
      const alone = await fetchedBy([r[key]], mode);
      if (alone.names.has(l.name) && !report.leaks.some((x) => x.name === l.name && x.via === l.via)) {
        report.leaks.push({ ...l, kind: p.kind });
        log(`LEAK ${l.name} via ${l.via}: ${JSON.stringify(p.text).slice(0, 300)}`);
      }
      else report.bent.push(l.name);
    }
    log(`${Math.min(at + batch, from + count) - from}/${count} inputs, ${report.leaks.length} leaks, control ${report.controlFetched}/${report.controlRan}`);
  }
  return report;
}

/** A page on the home origin (or a blank one) with the scanners loaded and a `#root` to load documents into. */
async function loadPage(page, bundle, home) {
  if (home) await page.goto(home, { waitUntil: 'load' });
  else await page.setContent('<!doctype html><meta charset="utf-8"><div id="root"></div>');
  await page.addScriptTag({ content: bundle });
}

module.exports = { startServer, bundleRemoteRef, loadPage, runFuzz, settle, nameOf };
