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
 * TWO TESTS PER CELL. The HARNESS test is a hard failure: the engine started, every vector ran, and the
 * control reached the listener. The EXITS test is `todo`. Marking the whole cell `todo` would let a
 * broken Playwright install pass the nightly in silence (the checker, 2026-10-18).
 *
 * THE EXITS TEST NAMES THE FIVE ACCEPTED EXITS (owner, 2026-10-18, threat-model note §5.4). A policy cannot
 * close navigation, `window.open`, WebRTC, meta refresh or a `target=_blank` link, so both exports keep them
 * and the check pins them: it fails when a SIXTH exit opens, and fails when an accepted one closes (the list
 * would otherwise rot). The plain export's script, frame and stylesheet loads are closed by the load lock
 * (lib/core/export-load-lock.js), so they are not in the list. Accepting another exit is a separate owner
 * decision recorded in the note, not here.
 *
 * NIGHTLY ONLY (owner, 2026-10-18): it lives in test/integration/export-nightly/, which only
 * `test:integration:nightly` runs, because three engines and 20 vectors cost minutes a run.
 * integration-nightly.yml installs Playwright's WebKit and Firefox and sets LATTICE_PLAYWRIGHT.
 *
 * ENGINES: Chromium always (puppeteer). WebKit and Firefox when LATTICE_PLAYWRIGHT points at a
 * Playwright install (docs/node_modules/playwright), as player-no-js.test.js does; an engine that
 * cannot start FAILS the harness test, never passes. Locally:
 *   LATTICE_PLAYWRIGHT=$PWD/docs/node_modules/playwright node --test test/integration/export-nightly/npm-plugin-export-check.test.js
 */

const { test, describe, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { openListener } = require('../../helpers/request-log');

const ROOT = path.join(__dirname, '..', '..', '..');
const EMULATOR = path.join(ROOT, 'lattice.js');
const TIMEOUT = 600000;

const DECK = '---\ntheme: indaco\n---\n\n# Canary export\n\nOne\n\n---\n\n## Two\n\n- A\n- B\n';

let dir;
let main;
let built;

/**
 * A listener for one run: HTTP, WebSocket and a UDP socket where a TURN server would be (any datagram is a hit, so
 * WebRTC cannot reach it unseen). `Connection: close` ends each socket once answered, so `drained()` can see every
 * connection end while the browser is still open (test/helpers/request-log.js).
 */
const listener = () =>
  openListener({
    udp: { turn: '/webrtc' },
    handle: (req, res, record) => {
      record(req.url);
      res.writeHead(200, { 'content-type': 'text/plain', 'access-control-allow-origin': '*', connection: 'close' }).end('x');
    },
  });

const vectorsHit = (hits) => [...new Set(hits.map((h) => h.replace(/^\//, '').split(/[/?]/)[0]))].filter((v) => v && v !== 'favicon.ico').sort();

/** The vectors that replace the page, so the call that started them may not answer. */
const NAVIGATES = ['navigate', 'metarefresh', 'form'];

/** Every exit a script could try against `log`, as the body of a function run in the opened export. Unique path per vector. */
const vectors = (log = main) => {
  const H = log.H;
  const P = log.P;
  const udp = { port: log.udpPort('turn') };
  return {
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
  };
};

before(async () => {
  main = await listener();

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
  await main?.close();
  fs.rmSync(dir, { recursive: true, force: true });
});

/**
 * Vectors an engine's CONTROL may fail to fire, because the engine lacks the feature or its headless
 * mode blocks the gesture: WebKit has no link prefetch and blocks an unprompted `target=_blank`
 * popup; Firefox ships `<a ping>` off and does not prefetch. A listed vector that the control
 * misses is reported UNVERIFIED for that cell, not counted as passed; one the control misses and
 * that is NOT listed fails the cell. (Measured 2026-10-18: WebKit 26.0, Firefox 142.0.1, Chromium 131.)
 */
/** The five exits a policy cannot close (threat-model note §5.4). */
const ACCEPTED_EXITS = ['navigate', 'windowopen', 'webrtc', 'metarefresh', 'blanklink'];
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

/** Open `file` once per vector in `browser`, run each vector against `log`, and return whether each vector RAN. */
async function attempt(browser, file, log) {
  return Promise.all(
    Object.entries(vectors(log)).map(async ([name, body]) => {
      const page = await browser.newPage();
      await page.goto(`file://${file}`, { waitUntil: 'load' }).catch(() => {});
      // Each vector first records that it RAN, so a zero is never a script that did not execute.
      const ran = await page.evaluate(`(function(){ try { ${body}; return true; } catch (e) { return 'threw:' + e.name; } })()`).catch(() => 'navigated');
      return { page, name, ran };
    }),
  );
}

/**
 * Run every vector in `file`, each in its own page, and return the vectors that reached the listener. Waits on
 * signals, never on a quiet period (HARD RULE #32; test/helpers/request-log.js):
 *   - the CONTROL (`witness` unset) waits until the listener has heard every vector this engine can fire;
 *   - a walled run opens the export's pages first and only then runs a WITNESS, the control file against a second
 *     listener. Once the witness has heard every fireable vector, any attempt the walled pages made has had at least
 *     that long to land. A quiet period of 2 s, repeated until the count stopped moving, was the old wait.
 * Then every page closes and the listener is drained, so an attempt already on the wire is counted.
 */
async function reached(eng, file, { witness = null } = {}) {
  main.reset();
  const fireable = Object.keys(vectors()).filter((v) => !MAY_MISS[eng.name].includes(v));
  const heardAll = (log) => log.until((h) => fireable.every((v) => vectorsHit(h).includes(v)));
  // A browser of its own per run, closed before the drain: the drain needs the client gone, and Chromium keeps an
  // idle socket in its pool after the page that opened it has closed.
  const browser = await eng.launch();
  let pages = [];
  let w = null;
  try {
    pages = await attempt(browser, file, main);
    if (witness) {
      w = await listener();
      await attempt(browser, witness, w);
      assert.ok(await heardAll(w), `the witness never heard ${fireable.filter((v) => !vectorsHit(w.hits).includes(v)).join(' ')}, so the walled run's zero proves nothing`);
    } else {
      // A vector the control cannot fire leaves the wait at its deadline; the harness test names it.
      await heardAll(main);
    }
  } finally {
    await browser.close();
    await w?.close();
  }
  await main.drained();
  const got = vectorsHit(main.hits);
  // A vector that threw never tried: its zero would be a closed exit by accident (a stub that
  // throws is not a wall, plugin code can fetch the original from a fresh frame). Only a vector that
  // navigates the page away may lose its answer.
  // A SecurityError is the engine enforcing a policy synchronously (WebKit's SecurityError, Firefox's NS_ERROR_CONTENT_BLOCKED, and Firefox's blank error for a form post that `form-action 'none'` refuses), which is a wall.
  const unrun = pages.filter((p) => p.ran !== true && !/^threw:(SecurityError|NS_ERROR_CONTENT_BLOCKED)$/.test(p.ran) && !(p.name === 'form' && p.ran === 'threw:') && !(p.ran === 'navigated' && NAVIGATES.includes(p.name))).map((p) => `${p.name}:${p.ran}`);
  return { got, unrun };
}

/**
 * One cell measured once, for both tests that read it. A launch failure rejects, so the HARNESS test
 * below fails (not `todo`): a broken Playwright install must turn the nightly red.
 */
const cells = new Map();
function cell(eng, kind) {
  const key = `${eng.name}/${kind}`;
  if (!cells.has(key)) {
    cells.set(
      key,
      (async () => {
        if (eng.needs) throw new Error(`UNVERIFIED: ${eng.name} is not reachable (${eng.needs})`);
        const control = await reached(eng, built[kind].control);
        const real = await reached(eng, built[kind].file, { witness: built[kind].control });
        return { control, real };
      })(),
    );
  }
  return cells.get(key);
}

describe('export check: no exit in a real HTML export reaches a listener', () => {
  for (const eng of engines()) {
    for (const kind of ['player', 'plain']) {
      // HARD: the engine started, every vector RAN, and the control reached the listener with every
      // vector the engine can fire. If this fails, the zeros in the next test mean nothing.
      test(`${eng.name} · ${kind} export · the harness works`, { timeout: TIMEOUT }, async (t) => {
        const { control, real } = await cell(eng, kind);
        const names = Object.keys(vectors());
        const unverified = names.filter((v) => !control.got.includes(v));
        t.diagnostic(`${eng.name} ${kind}: UNVERIFIED in this engine (its control cannot fire them) ${JSON.stringify(unverified)}`);
        assert.deepEqual([...control.unrun, ...real.unrun], [], 'a vector did not run, so its zero would mean nothing');
        const surprising = unverified.filter((v) => !MAY_MISS[eng.name].includes(v));
        assert.deepEqual(surprising, [], `UNVERIFIED in ${eng.name}: the control did not reach the listener with these, so their zero would mean nothing`);
      });

      // Exactly the accepted exits, no more and no fewer. An exit the control cannot fire in this engine
      // (MAY_MISS) cannot be told apart from a closed one, so it is left out of the comparison.
      test(`${eng.name} · ${kind} export · only the accepted exits are open`, { timeout: TIMEOUT }, async (t) => {
        const { real } = await cell(eng, kind);
        t.diagnostic(`${eng.name} ${kind}: open exits ${JSON.stringify(real.got)}`);
        const expected = ACCEPTED_EXITS.filter((v) => !MAY_MISS[eng.name].includes(v));
        const open = real.got.filter((v) => !MAY_MISS[eng.name].includes(v)).sort();
        assert.deepEqual(open, [...expected].sort(), `open exits in the ${kind} export in ${eng.name} differ from the accepted five`);
      });
    }
  }
});
