/**
 * Integration: the EXPORT CHECK of the npm-plugin harness (threat-model note
 * engineering/decisions/2026-10-16-npm-plugin-threat-model.md §5.2 part 3).
 *
 * A plugin's `hydrate` runs in the browser of whoever opens an HTML export, not in the locked page
 * (§3.1). So this check opens each REAL HTML export (`--player` and the plain `.html`) with NORMAL
 * browser arguments, runs every exit a script could try, and counts what reaches a local listener
 * on HTTP and UDP. It deliberately does not use lib/core/offline-chromium.js's arguments:
 * `--webrtc-ip-handling-policy=disable_non_proxied_udp` is what hid the WebRTC leak in §3.1.
 *
 * Each attempt runs through the page's own scripting, which stands in for plugin code (no npm
 * plugin exists to run); the harness therefore measures the export's policy, which is the wall.
 *
 * EVERY CELL HAS A CONTROL. The control is the same export with its policy removed. A vector the
 * control does not reach the listener with, in that engine, is reported as UNVERIFIED for that cell
 * and fails the cell: a zero from a vector that cannot fire proves nothing (HARD RULE #23).
 *
 * THE CHECK IS `todo` TODAY, AND MUST NOT PASS BY ACCEPTING AN EXIT. Navigation, `window.open` and
 * WebRTC reach the listener in both exports, and the plain export's policy leaves script, frame,
 * stylesheet and meta-refresh loads open (followups.d/2749-p2-export-csp-gaps.md). Closing them
 * changes the bytes of an exported artifact, which needs the owner's inspection of a dark and a
 * light demo deck first. A `todo` test that fails is reported and does not fail the run; remove the
 * `todo` option in the commit that closes the last gap, and the check becomes an exit criterion.
 * Accepting an exit is a separate owner decision and is recorded in the note, not here.
 *
 * ENGINES: Chromium always (puppeteer). WebKit and Firefox when LATTICE_PLAYWRIGHT points at a
 * Playwright install (docs/node_modules/playwright), as player-no-js.test.js does; an engine that
 * cannot start is reported as UNVERIFIED, never as a pass.
 */

const { test, describe, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const dgram = require('node:dgram');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const ROOT = path.join(__dirname, '..', '..', '..');
const EMULATOR = path.join(ROOT, 'lattice.js');
const TIMEOUT = 600000;
const SETTLE_MS = 2000;
const TODO = 'the exports leave exits open: followups.d/2749-p2-export-csp-gaps.md (needs the owner’s sign-off to change export bytes)';

const DECK = '---\ntheme: indaco\n---\n\n# Canary export\n\nOne\n\n---\n\n## Two\n\n- A\n- B\n';

let dir;
let server;
let udp;
let hits;
let H;
let P;
let built;

const vectorsHit = () => [...new Set(hits.map((h) => h.replace(/^\//, '').split(/[/?]/)[0]))].filter((v) => v && v !== 'favicon.ico').sort();

/** Every exit a script could try, as the body of a function run in the opened export. Unique path per vector. */
const vectors = () => ({
  navigate: `setTimeout(function(){ location.href = '${H}/navigate'; }, 50)`,
  windowopen: `window.open('${H}/windowopen')`,
  webrtc: `var pc = new RTCPeerConnection({ iceServers: [{ urls: 'turn:127.0.0.1:${udp.port}', username: 'page-text', credential: 'x' }] }); pc.createDataChannel('x'); pc.createOffer().then(function(o){ return pc.setLocalDescription(o); })`,
  scriptsrc: `var s = document.createElement('script'); s.src = '${H}/scriptsrc'; document.head.appendChild(s)`,
  iframe: `document.body.insertAdjacentHTML('beforeend', '<iframe src="${H}/iframe"></iframe>')`,
  cssimport: `var st = document.createElement('style'); st.textContent = '@import url(${H}/cssimport);'; document.head.appendChild(st)`,
  linkstyle: `var l = document.createElement('link'); l.rel = 'stylesheet'; l.href = '${H}/linkstyle'; document.head.appendChild(l)`,
  prefetch: `var l = document.createElement('link'); l.rel = 'prefetch'; l.href = '${H}/prefetch'; document.head.appendChild(l)`,
  metarefresh: `document.head.insertAdjacentHTML('beforeend', '<meta http-equiv="refresh" content="0;url=${H}/metarefresh">')`,
  fetch: `fetch('${H}/fetch').catch(function(){})`,
  xhr: `var x = new XMLHttpRequest(); x.open('GET', '${H}/xhr'); x.send()`,
  websocket: `new WebSocket('ws://127.0.0.1:${P}/websocket')`,
  eventsource: `new EventSource('${H}/eventsource')`,
  beacon: `navigator.sendBeacon('${H}/beacon', 'page-text')`,
  img: `new Image().src = '${H}/img'`,
  // A background page may not lay out until asked, and a font loads only when text uses it: both are forced.
  cssurl: `document.body.insertAdjacentHTML('beforeend', '<div id="cu" style="background:url(${H}/cssurl);width:9px;height:9px"></div>'); getComputedStyle(document.getElementById('cu')).backgroundImage; document.getElementById('cu').offsetWidth`,
  font: `var st = document.createElement('style'); st.textContent = '@font-face{font-family:c;src:url(${H}/font)} body{font-family:c}'; document.head.appendChild(st); document.fonts.load('16px c')`,
  form: `document.body.insertAdjacentHTML('beforeend', '<form id="cf" action="${H}/form" method="post"></form>'); document.getElementById('cf').submit()`,
  ping: `document.body.insertAdjacentHTML('beforeend', '<a id="cp" href="#x" ping="${H}/ping">p</a>'); document.getElementById('cp').click()`,
  blanklink: `document.body.insertAdjacentHTML('beforeend', '<a id="cb" href="${H}/blanklink" target="_blank">b</a>'); document.getElementById('cb').click()`,
});

before(async () => {
  hits = [];
  server = http.createServer((req, res) => {
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
  // A UDP socket where a TURN server would be: any datagram is a hit, so WebRTC cannot reach it unseen.
  udp = dgram.createSocket('udp4');
  udp.on('message', () => hits.push('/webrtc'));
  await new Promise((r) => udp.bind(0, '127.0.0.1', r));
  udp.port = udp.address().port;

  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lattice-export-check-'));
  const deck = path.join(dir, 'deck.md');
  fs.writeFileSync(deck, DECK);
  built = {};
  for (const [kind, args] of [['player', ['--player']], ['plain', []]]) {
    const out = path.join(dir, `${kind}.html`);
    const r = spawnSync(process.execPath, [EMULATOR, deck, out, '--quiet', ...args], { cwd: ROOT, encoding: 'utf8', timeout: 240000 });
    assert.equal(r.status, 0, `export ${kind} failed: ${r.stderr}`);
    const html = fs.readFileSync(out, 'utf8');
    const stripped = html.replace(/<meta http-equiv="Content-Security-Policy"[^>]*>/gi, '');
    assert.notEqual(stripped, html, `guard: the ${kind} export carries a policy to remove`);
    const control = path.join(dir, `${kind}-control.html`);
    fs.writeFileSync(control, stripped);
    built[kind] = { file: out, control };
  }
});
after(async () => {
  await new Promise((r) => server.close(r));
  udp.close();
  fs.rmSync(dir, { recursive: true, force: true });
});

/**
 * Vectors an engine's CONTROL may fail to fire, because the engine lacks the feature or its headless
 * mode blocks the gesture: WebKit has no link prefetch and blocks an unprompted `target=_blank`
 * popup; Firefox ships `<a ping>` off and does not prefetch. A listed vector that the control
 * misses is reported UNVERIFIED for that cell, not counted as passed; one the control misses and
 * that is NOT listed fails the cell. (Measured 2026-10-18: WebKit 26.0, Firefox 142.0.1, Chromium 131.)
 */
const MAY_MISS = { chromium: [], webkit: ['prefetch', 'blanklink'], firefox: ['prefetch', 'ping'] };

/** The engines this run can reach: name → launch. */
function engines() {
  const list = [
    {
      name: 'chromium',
      launch: async () => {
        const puppeteer = require('puppeteer');
        // NORMAL arguments. Not offline-chromium.js's: its WebRTC policy hid the §3.1 leak.
        return puppeteer.launch({ headless: 'new', executablePath: process.env.CHROME_PATH || undefined, args: ['--no-sandbox', '--disable-dev-shm-usage'] });
      },
    },
  ];
  let pw = process.env.LATTICE_PLAYWRIGHT;
  if (!pw && fs.existsSync(path.join(ROOT, 'docs', 'node_modules', 'playwright'))) pw = path.join(ROOT, 'docs', 'node_modules', 'playwright');
  for (const name of ['webkit', 'firefox']) {
    list.push({
      name,
      needs: pw ? null : 'set LATTICE_PLAYWRIGHT=$PWD/docs/node_modules/playwright',
      launch: async () => require(pw)[name].launch(),
    });
  }
  return list;
}

/** Open `file`, run every vector in its own page at once, and return the vectors that reached the listener. */
async function reached(browser, file) {
  hits = [];
  const code = vectors();
  const pages = await Promise.all(
    Object.entries(code).map(async ([name, body]) => {
      const page = await browser.newPage();
      await page.goto(`file://${file}`, { waitUntil: 'load' }).catch(() => {});
      // Each vector first records that it RAN, so a zero is never a script that did not execute.
      const ran = await page.evaluate(`(function(){ try { ${body}; return true; } catch (e) { return 'threw:' + e.name; } })()`).catch(() => 'navigated');
      return { page, name, ran };
    }),
  );
  const deadline = Date.now() + 8 * SETTLE_MS;
  await new Promise((r) => setTimeout(r, SETTLE_MS));
  for (let seen = -1; seen !== hits.length && Date.now() < deadline; ) {
    seen = hits.length;
    await new Promise((r) => setTimeout(r, SETTLE_MS));
  }
  const got = vectorsHit();
  await Promise.all(pages.map((p) => p.page.close().catch(() => {})));
  return { got, ran: Object.fromEntries(pages.map((p) => [p.name, p.ran])) };
}

describe('export check: no exit in a real HTML export reaches a listener', () => {
  for (const eng of engines()) {
    for (const kind of ['player', 'plain']) {
      test(`${eng.name} · ${kind} export`, { todo: TODO, timeout: TIMEOUT }, async (t) => {
        if (eng.needs) assert.fail(`UNVERIFIED: ${eng.name} is not reachable (${eng.needs})`);
        const browser = await eng.launch();
        try {
          const names = Object.keys(vectors());
          const control = await reached(browser, built[kind].control);
          const unverified = names.filter((v) => !control.got.includes(v));
          const real = await reached(browser, built[kind].file);
          t.diagnostic(`${eng.name} ${kind}: open exits ${JSON.stringify(real.got)}; control missed ${JSON.stringify(unverified)}`);
          const surprising = unverified.filter((v) => !MAY_MISS[eng.name].includes(v));
          assert.deepEqual(surprising, [], `UNVERIFIED in ${eng.name}: the control did not reach the listener with these, so their zero would mean nothing`);
          assert.deepEqual(real.got, [], `exits that reach the listener from the ${kind} export in ${eng.name}`);
        } finally {
          await browser.close();
        }
      });
    }
  }
});
