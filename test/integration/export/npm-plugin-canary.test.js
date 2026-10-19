/**
 * Integration: the npm-plugin CANARY. A deliberately hostile plugin renderer runs through the real
 * plugin door and the real locked page, and a local listener on HTTP, WebSocket and UDP must see
 * nothing (threat-model note engineering/decisions/2026-10-16-npm-plugin-threat-model.md §5.2,
 * owner decisions 2 and 5: the npm door does not open while this is red).
 *
 * WHAT MAKES IT A HARNESS AND NOT A CLAIM (HARD RULE #23): every zero below sits next to a
 * CONTROL that fires the same attempts without the walls and reaches the listener. A harness that
 * cannot fail proves nothing.
 *
 *   CONTROL     the canary's own code in an ordinary online page, with storage planted   → it reaches
 *               the listener and reads the planted values
 *   DOOR        the same code approved and run through `renderWithCodePackages`         → 0 requests,
 *               0 UDP packets, no storage read returns data, every attempt reported
 *   MARKUP      the canary's output half in an ordinary online page, raw                → fires
 *               the same output after the host's sanitizer                              → 0
 *   PAGE WALLS  the same worker in an ONLINE browser, with only the locked page         → 0
 *   STYLESHEET  each hostile package sheet in an online page, ungated                    → fires
 *               the same sheet as an installed component, rendered by the real CLI      → refused, 0
 *
 * KEEPING IT OPEN-ENDED: a reviewer who names an exit adds a pair to `attempts()` or a tag to
 * `markupVectors()` in test/fixtures/npm-plugin-canary.js and every arm here picks it up.
 *
 * NOT YET RUNNABLE (and marked `todo`, never accepted): the data-return case (decision 10) and the
 * export check. See the two `todo` tests at the end for what each needs.
 *
 * Needs Chromium. Slow tier: one real sandbox launch per case that runs code.
 */

const { test, describe, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const dgram = require('node:dgram');
const os = require('node:os');
const path = require('node:path');

const TIMEOUT = 300000;
const SETTLE_MS = 1500;

const home = fs.mkdtempSync(path.join(os.tmpdir(), 'lattice-canary-home-'));
process.env.LATTICE_HOME = home;
const engine = require('../../../lib/engine');
const puppeteer = require('puppeteer');
const { renderWithCodePackages } = require('../../../lib/packages/code-door.js');
const { pluginDigest, grantTrust } = require('../../../lib/packages/trust.js');
const { launchSandboxBrowser, openPackageSandbox, runPackage } = require('../../../lib/core/code-sandbox.js');
const { spawnSync } = require('node:child_process');
const { PLANTED, attempts, markupVectors, stylesheetVectors, canarySource } = require('../../fixtures/npm-plugin-canary.js');

const DECK = '---\ntheme: indaco\n---\n\n## Canary\n\n```canary\nrender me\n```\n';
const CHROME = process.env.CHROME_PATH || undefined;

let server;
let udp;
let hits;
let H;
let P;
let list;
let source;
let controlSource;

/** The vector a request belongs to: its first path segment. `favicon.ico` is the browser's own follow-up. */
const vectorsHit = () => [...new Set(hits.map((h) => h.replace(/^\//, '').split(/[/?]/)[0]))].filter((v) => v && v !== 'favicon.ico' && v !== 'control' && v !== 'blank').sort();

before(async () => {
  hits = [];
  server = http.createServer((req, res) => {
    if (req.url === '/control') {
      // The control page: storage planted where the canary can see it, then the canary itself on the page.
      const body = controlSource.replace(/export \{ render as default \};\s*$/, '').replace(/<\/script/gi, '<\\/script');
      res.writeHead(200, { 'content-type': 'text/html' });
      return res.end(
        `<!doctype html><html><body><script>document.cookie='planted=${PLANTED}; Path=/';localStorage.setItem('planted','${PLANTED}');sessionStorage.setItem('planted','${PLANTED}');</script>` +
          `<script>${body};window.__report = render({ body: 'x', id: 'control' });</script></body></html>`,
      );
    }
    if (req.url === '/blank') return res.writeHead(200, { 'content-type': 'text/html' }).end('<!doctype html><html><body></body></html>');
    hits.push(req.url);
    res.writeHead(200, { 'content-type': 'text/plain', 'access-control-allow-origin': '*' }).end('x');
  });
  server.on('upgrade', (req, socket) => {
    hits.push(req.url);
    socket.destroy();
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  P = server.address().port;
  H = `http://127.0.0.1:${P}`;
  udp = {};
  for (const name of ['stun', 'quic']) {
    const s = dgram.createSocket('udp4');
    s.on('message', () => hits.push(`/${name === 'stun' ? 'webrtc' : 'webtransport'}-udp`));
    await new Promise((r) => s.bind(0, '127.0.0.1', r));
    udp[name] = s.address().port;
    udp[`${name}Socket`] = s;
  }
  const o = { H, P, udp: { stun: udp.stun, quic: udp.quic } };
  list = attempts(o);
  source = canarySource(o);
  // The control page inlines the renderer into a <script>, which the markup half's `</style>` and
  // `<script>` strings would end early; the control reads the report half only.
  controlSource = canarySource({ ...o, withMarkup: false });
});
after(async () => {
  await new Promise((r) => server.close(r));
  udp.stunSocket.close();
  udp.quicSocket.close();
  fs.rmSync(home, { recursive: true, force: true });
});

const settle = async () => {
  await new Promise((r) => setTimeout(r, SETTLE_MS));
  const deadline = Date.now() + 8 * SETTLE_MS;
  for (let seen = -1; seen !== hits.length && Date.now() < deadline; ) {
    seen = hits.length;
    await new Promise((r) => setTimeout(r, SETTLE_MS));
  }
};

/** `<li>name=outcome</li>` pairs out of a rendered report. */
const reportOf = (html) => Object.fromEntries([...html.matchAll(/<li>([a-z-]+)=([^<]*)<\/li>/g)].map((m) => [m[1], m[2]]));

const plugin = { name: 'canary-plugin', fence: 'canary' };
const approve = (code) => grantTrust('plugin', plugin.name, pluginDigest(code, plugin.fence), { layer: null });
const runDoor = (code) => {
  const e = engine.createEngine();
  const lines = { warn: [], info: [] };
  const r = renderWithCodePackages((hook, more) => e.render(DECK, 'indaco', { codePackages: hook, ...more }), {
    packages: [],
    plugins: [{ ...plugin, code }],
    executablePath: CHROME,
    warn: (l) => lines.warn.push(l),
    info: (l) => lines.info.push(l),
  });
  return { ...r, lines };
};

describe('npm-plugin canary: a hostile plugin reaches nothing', () => {
  test('the canary names every attempt once, and the fixture covers the exits the note lists', () => {
    const names = list.map(([n]) => n);
    assert.equal(new Set(names).size, names.length, 'an attempt name is used twice');
    // Pinned to the note's §5.2 list: fetch, XMLHttpRequest, WebSocket, sendBeacon, WebRTC, storage,
    // IndexedDB, cookies, a service worker, eval. A name dropped here is an exit no longer tried.
    for (const n of ['fetch', 'xhr', 'websocket', 'beacon', 'webrtc', 'localstorage', 'sessionstorage', 'cookie', 'indexeddb', 'serviceworker', 'eval', 'function', 'postmessage']) {
      assert.ok(names.includes(n), `the canary no longer tries ${n}`);
    }
    for (const n of ['img', 'css-background', 'iframe', 'form', 'link', 'script', 'meta']) assert.ok(n in markupVectors(H), `the canary markup no longer carries ${n}`);
  });

  test('CONTROL: with no walls the same attempts reach the listener and read the planted storage', { timeout: TIMEOUT }, async () => {
    hits = [];
    const browser = await puppeteer.launch({ headless: 'new', executablePath: CHROME, args: ['--no-sandbox', '--disable-dev-shm-usage'] });
    try {
      const page = await browser.newPage();
      const errors = [];
      page.on('pageerror', (e) => errors.push(e.message));
      await page.goto(`${H}/control`, { waitUntil: 'load' });
      const html = await page.evaluate(() => window.__report);
      assert.equal(typeof html, 'string', `the control page did not run the canary: ${errors.join('; ')}`);
      const report = reportOf(html);
      await settle();
      const got = vectorsHit();
      // What an ordinary page can fire. A vector the control cannot fire proves nothing in the door arm.
      for (const v of ['fetch', 'xhr', 'websocket', 'eventsource', 'beacon', 'worker-url', 'fontface']) {
        assert.ok(got.includes(v), `the control did not reach the listener with ${v}: ${got.join(' ')}`);
      }
      assert.ok(got.includes('webrtc-udp'), `the control sent no WebRTC packet: ${got.join(' ')}`);
      for (const n of ['localstorage', 'sessionstorage', 'cookie']) {
        assert.ok(report[n]?.includes(PLANTED), `the control did not read planted ${n}: ${report[n]}`);
      }
    } finally {
      await browser.close();
    }
  });

  test('DOOR: approved and run through the real door, every attempt is reported, none reaches the listener, no storage read returns data', { timeout: TIMEOUT }, async () => {
    hits = [];
    approve(source);
    const r = runDoor(source);
    assert.equal(r.refusal, undefined, JSON.stringify(r.refusal));
    const html = r.rendered.html;
    const report = reportOf(html);
    await settle();
    // One list of everything that went wrong, so a hole shows every way it leaks in one run.
    const problems = [];
    const missing = list.map(([n]) => n).filter((n) => !(n in report));
    // A zero from an attempt that never ran proves nothing, so a missing line is a failure too.
    if (missing.length) problems.push(`the report lacks ${missing.join(', ')}`);
    for (const [n, v] of Object.entries(report)) if (v.startsWith('read:')) problems.push(`a storage read returned data: ${n}=${v}`);
    // Stronger than "read nothing": in the locked worker no storage or runner API is even reachable. A
    // call that returned (`tried`) could have written something a later render reads.
    for (const n of ['localstorage', 'sessionstorage', 'cookie', 'cookiestore', 'indexeddb', 'caches', 'storage-bucket', 'serviceworker', 'filesystem', 'eval', 'function', 'settimeout-string']) {
      if (n in report && !report[n].startsWith('blocked:')) problems.push(`${n} did not throw: ${report[n]}`);
    }
    if (html.includes(PLANTED)) problems.push('planted data reached the output');
    for (const v of vectorsHit()) problems.push(`the listener saw ${v}`);
    // Markup half: what the page would load is gone from the output (HARD RULE #22, markup channel).
    const kept = html.match(/127\.0\.0\.1|<script|<iframe|<form|<link|<meta|<base|<object|<embed|<style|<video|<audio|ping=|onerror|javascript:/gi);
    if (kept) problems.push(`hostile markup survived the host sanitizer: ${[...new Set(kept)].join(' ')}`);
    assert.deepEqual(problems, []);
  });

  test('MARKUP: the canary’s output half fires in an online page raw, and not once the host has sanitized it', { timeout: TIMEOUT }, async () => {
    // The two vectors that navigate the page (a meta refresh, a submitted form) each get a page of their own.
    const { meta, form, ...rest } = markupVectors(H);
    const raw = Object.values(rest).join('');
    const sanitized = (() => {
      approve(source);
      const html = runDoor(source).rendered.html;
      return /<div data-lattice-plugin="canary-plugin">[\s\S]*?<\/div>\s*<\/div>/.exec(html)?.[0] ?? '';
    })();
    assert.ok(sanitized.length > 0, 'no plugin output to open');
    const browser = await puppeteer.launch({ headless: 'new', executablePath: CHROME, args: ['--no-sandbox', '--disable-dev-shm-usage'] });
    try {
      const open = async (markup) => {
        hits = [];
        const page = await browser.newPage();
        await page.goto(`${H}/blank`, { waitUntil: 'load' });
        await page.setContent(`<!doctype html><html><head></head><body>${markup}</body></html>`, { waitUntil: 'load' });
        // A form and a link need a click to fire; a user would give one, a beacon does not wait for it.
        await page
          .evaluate(() => {
            document.getElementById('m-form-submit')?.click();
            document.getElementById('m-ping')?.click();
            document.getElementById('m-js')?.click();
          })
          .catch(() => {}); // the page navigated away: the request is what we count
        await settle();
        const got = vectorsHit();
        await page.close();
        return got;
      };
      const rawGot = [...(await open(raw)), ...(await open(meta)), ...(await open(form).catch(() => ['m-form']))];
      // Every address the markup names, not a sample: a tag that stops firing must be removed from
      // the list on purpose. `m-base` only rewrites later relative URLs and fetches nothing itself.
      const named = [...new Set([...raw, meta, form].join('').match(/\/(m-[a-z0-9-]+)/g).map((m) => m.slice(1)))].filter((v) => v !== 'm-base');
      const missed = named.filter((v) => !rawGot.includes(v));
      assert.deepEqual(missed, [], `the control markup did not fire: ${missed.join(' ')} (it fired ${rawGot.join(' ')})`);
      assert.deepEqual(await open(sanitized), [], 'sanitized output still reached the listener');
    } finally {
      await browser.close();
    }
  });

  test('WEAKENED: the same renderer in a worker with NO wall at all reaches the listener (the arm that proves the door arm can fail)', { timeout: TIMEOUT }, async () => {
    hits = [];
    const browser = await puppeteer.launch({ headless: 'new', executablePath: CHROME, args: ['--no-sandbox', '--disable-dev-shm-usage'] });
    try {
      const page = await browser.newPage();
      await page.goto(`${H}/blank`, { waitUntil: 'load' });
      // The door's own context: a Worker. No policy, no names taken off it, an online browser.
      const body = controlSource.replace(/export \{ render as default \};\s*$/, '');
      const report = await page.evaluate(
        (code) =>
          new Promise((resolve) => {
            const url = URL.createObjectURL(new Blob([`${code};\npostMessage(render({ body: 'x', id: 'w' }));`], { type: 'text/javascript' }));
            const w = new Worker(url);
            w.onmessage = (e) => typeof e.data === 'string' && resolve(e.data); // the canary's own postMessage attempt comes first
            w.onerror = (e) => resolve(`error: ${e.message}`);
          }),
        body,
      );
      assert.match(report, /^<ul/, `the unwalled worker did not run the canary: ${report}`);
      await settle();
      const got = vectorsHit();
      // What a worker can fire. A canary attempt not listed here (sharedworker: a blob worker may not start one; the storage and runner attempts: nothing to fire) has no weakened-arm proof, so the door arm's zero for it rests on the API throwing.
      for (const v of ['fetch', 'xhr', 'websocket', 'websocketstream', 'eventsource', 'importscripts', 'proto-fetch', 'worker-url', 'worker-blob', 'fontface', 'webtransport-udp']) {
        assert.ok(got.includes(v), `the unwalled worker did not reach the listener with ${v}: ${got.join(' ')}`);
      }
    } finally {
      await browser.close();
    }
  });

  test('PAGE WALLS ALONE: the worker in an ONLINE browser, with only the locked page and the worker wall, reaches nothing', { timeout: TIMEOUT }, async () => {
    hits = [];
    const browser = await puppeteer.launch({ headless: 'new', executablePath: CHROME, args: ['--no-sandbox', '--disable-dev-shm-usage'] });
    try {
      const sandbox = await openPackageSandbox(browser, source, { fence: true, loadTimeoutMs: 30000 });
      try {
        const out = await runPackage(sandbox, { body: 'x', id: 'c' }, { fence: true, timeoutMs: 20000 });
        const report = reportOf(out);
        assert.equal(Object.keys(report).length, list.length);
        assert.deepEqual(Object.entries(report).filter(([, v]) => v.startsWith('read:')), []);
      } finally {
        await sandbox.close();
      }
      await settle();
      assert.deepEqual(vectorsHit(), [], hits.join(' '));
    } finally {
      await browser.close();
    }
  });

  test('BROWSER WALL ALONE: the sandbox browser with the walls of the page removed still reaches nothing from an ordinary page', { timeout: TIMEOUT }, async () => {
    hits = [];
    const browser = await launchSandboxBrowser(puppeteer, { headless: 'new', executablePath: CHROME, args: ['--no-sandbox', '--disable-dev-shm-usage'] });
    try {
      const page = await browser.newPage();
      await page.goto(`${H}/control`, { waitUntil: 'load' }).catch(() => {});
      await settle();
      assert.deepEqual(vectorsHit(), [], `an ordinary page in the sandbox browser reached the listener: ${hits.join(' ')}`);
    } finally {
      await browser.close();
    }
  });

  test('STYLESHEET: each hostile package sheet fires in an online page ungated, and the real CLI refuses it as an installed component', { timeout: TIMEOUT }, async () => {
    const sheets = stylesheetVectors(H);
    const name = 'canary-css';
    const browser = await puppeteer.launch({ headless: 'new', executablePath: CHROME, args: ['--no-sandbox', '--disable-dev-shm-usage'] });
    const open = async (doc) => {
      hits = [];
      const page = await browser.newPage();
      await page.goto(`${H}/blank`, { waitUntil: 'load' });
      await page.setContent(doc, { waitUntil: 'load' });
      await settle();
      await page.close();
      return vectorsHit();
    };
    const problems = [];
    try {
      for (const [v, sheet] of Object.entries(sheets)) {
        // CONTROL: the sheet itself, on a slide that carries the class, with no gate in the way.
        const fired = await open(`<!doctype html><html><head><style>${sheet(name)}</style></head><body><section class="${name}" style="width:99px;height:99px"><h2>x</h2></section></body></html>`);
        if (!fired.includes(v)) problems.push(`the control sheet ${v} did not fire (it fired ${fired.join(' ') || 'nothing'})`);
        // DOOR: the same sheet placed in the package store by hand (no \`add\`), rendered by the real CLI.
        const store = fs.mkdtempSync(path.join(os.tmpdir(), 'lattice-canary-css-'));
        const dir = path.join(store, 'packages', 'component', name);
        fs.mkdirSync(dir, { recursive: true });
        fs.writeFileSync(path.join(dir, `${name}.manifest.json`), JSON.stringify({ name, type: 'component', format: 1 }));
        fs.writeFileSync(path.join(dir, `${name}.styles.css`), sheet(name));
        fs.writeFileSync(path.join(dir, `${name}.gallery.md`), `<!-- _class: ${name} -->\n\n## ${name}\n`);
        fs.writeFileSync(path.join(store, 'deck.md'), `---\ntheme: indaco\n---\n\n<!-- _class: ${name} -->\n\n## Sheet\n`);
        const out = path.join(store, 'deck.html');
        const r = spawnSync(process.execPath, [path.join(__dirname, '../../../lattice.js'), path.join(store, 'deck.md'), out], { encoding: 'utf8', timeout: TIMEOUT, env: { ...process.env, LATTICE_HOME: store } });
        const html = fs.existsSync(out) ? fs.readFileSync(out, 'utf8') : '';
        fs.rmSync(store, { recursive: true, force: true });
        if (r.status !== 0) problems.push(`${v}: the render failed: ${r.stderr}`);
        if (!/the installed component canary-css is refused/.test(r.stderr)) problems.push(`${v}: the CLI did not refuse the sheet`);
        if (html.includes(`/${v}`)) problems.push(`${v}: the address reached the export`);
        const leaked = await open(html);
        if (leaked.length) problems.push(`${v}: the export reached the listener with ${leaked.join(' ')}`);
      }
    } finally {
      await browser.close();
    }
    assert.deepEqual(problems, []);
  });

  // The two parts of §5.2 that cannot run yet. They are `todo`, not skipped and not passing: a
  // `todo` test that fails is reported and does not fail the run, and one that passes tells the
  // next session the door can open. Neither may be turned green by accepting an exit.
  test('DATA RETURN (decision 10): a plugin that hands the host a script, a handler, a javascript: link, a </style> break-out and oversized values has them dropped, and is disabled with an alert', { todo: 'the host has no data-return surface yet: followups.d/2749-p4-plugin-data-return-surface.md' }, () => {
    assert.fail('no data-return surface exists to test');
  });
});
