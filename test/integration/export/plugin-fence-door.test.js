/**
 * Integration: the fence door, driven through the REAL sandbox (plugin-system §9 decisions 3 and 10;
 * HARD RULE #23), with a network log.
 *
 * A zip plugin's `render.js`, written the way a stranger would bring one (a self-contained ES
 * module, nothing of Lattice's imported), owns the ```` ```gantt ```` fence. The door runs it in the
 * same locked Chromium page and Worker a component package gets, and puts its sanitized output
 * where the code block was.
 *
 *   REFUSED    the plugin not approved                                  → the render stops, the plugin
 *              named with its digest and the `trust` command, 0 requests, nothing ran
 *   DRAWN      approved at its SHA-256                                  → the output is in the plugin's
 *              root; its own classes and ids stay; a foreign class, a <script>, a remote image,
 *              and an inline event handler do not; and it tried the network four ways: 0 requests
 *   CHANGED    one byte of the code changed after approval              → refused again
 *   BREAKOUT   a renderer that closes the wrapper and opens markup of its own → refused, the code
 *              block kept with a note, the deck unharmed
 *   THREW      a renderer that throws                                   → the same: block kept, note, warning
 *   CLAIMED    a fence on a slide a code package claims whole           → not run
 *
 * Needs Chromium. Slow tier: one real sandbox launch per case that runs code.
 */

const { test, describe, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const os = require('node:os');
const path = require('node:path');

const TIMEOUT = 300000;
const SETTLE_MS = 1500;

const home = fs.mkdtempSync(path.join(os.tmpdir(), 'lattice-fence-home-'));
process.env.LATTICE_HOME = home;
const engine = require('../../../lib/engine');
const { renderWithCodePackages } = require('../../../lib/packages/code-door.js');
const { codeDigest, grantTrust } = require('../../../lib/packages/trust.js');

/** The stranger's renderer: tries the network, then returns markup carrying every thing a fence output must lose. */
const hostile = (H, P) => `
try { fetch("${H}/atload").catch(function(){}); } catch (e) {}
function render(fence, kit) {
  try { fetch("${H}/fetch").catch(function(){}); } catch (e) {}
  try { new Image().src = "${H}/image"; } catch (e) {}
  try { new WebSocket("ws://127.0.0.1:${P}/websocket"); } catch (e) {}
  try { navigator.sendBeacon("${H}/beacon", fence.body); } catch (e) {}
  var rows = fence.body.trim().split("\\n").map(function (l) { return "<li>" + l.replace(/&/g, "&amp;").replace(/</g, "&lt;") + "</li>"; }).join("");
  return '<ul class="gantt-plugin-rows foreign-class" id="' + fence.id + '" onclick="alert(1)">' + rows + '</ul>' +
    '<img src="${H}/img" alt=""><script>alert(2)</script><a href="${H}/link">link</a>' +
    '<svg id="not-mine"><use href="#elsewhere"></use></svg>';
}
export { render as default };
`;

const BREAKOUT = 'function render(){ return "</section><section class=\\"gantt-plugin\\"><script>alert(3)</script>"; }\nexport { render as default };';
const THROWS = 'function render(){ throw new Error("boom <b>"); }\nexport { render as default };';
const DECK = '---\ntheme: indaco\n---\n\n## Plan\n\n```gantt\nDesign 1 < 2\nBuild 3\n```\n\n---\n\n## Code\n\n```js\nconst x = 1;\n```\n';

let server;
let hits = [];
let H;
let P;
before(async () => {
  server = http.createServer((req, res) => {
    hits.push(req.url);
    res.writeHead(200, { 'content-type': 'text/plain' }).end('x');
  });
  server.on('upgrade', (req, socket) => {
    hits.push(req.url);
    socket.destroy();
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  P = server.address().port;
  H = `http://127.0.0.1:${P}`;
});
after(() => {
  server?.close();
  fs.rmSync(home, { recursive: true, force: true });
});

const plugin = (code, over = {}) => ({ name: 'gantt-plugin', fence: 'gantt', code, sha256: codeDigest({ roles: { 'render.js': 'r' }, files: { r: code } }), ...over });
const approve = (p) => grantTrust('plugin', p.name, p.sha256, { layer: null });
const run = (p, md = DECK, extra = {}) => {
  const e = engine.createEngine();
  const lines = { warn: [], info: [] };
  const r = renderWithCodePackages((hook) => e.render(md, 'indaco', { codePackages: hook }), {
    packages: [],
    plugins: [p],
    executablePath: process.env.CHROME_PATH || undefined,
    warn: (l) => lines.warn.push(l),
    info: (l) => lines.info.push(l),
    ...extra,
  });
  return { ...r, lines };
};
const settle = () => new Promise((r) => setTimeout(r, SETTLE_MS));

describe('the fence door through the real sandbox', () => {
  test('REFUSED: an unapproved plugin stops the render, names its digest and the trust command, and runs nothing', { timeout: TIMEOUT }, async () => {
    hits = [];
    const p = plugin(hostile(H, P));
    const r = run(p);
    assert.equal(r.rendered, undefined);
    assert.equal(r.refusal.length, 1);
    assert.match(r.refusal[0], new RegExp(`the plugin gantt-plugin, and you have not approved its code \\(sha256 ${p.sha256}\\)`));
    assert.match(r.refusal[0], /lattice packages trust plugin\/gantt-plugin/);
    await settle();
    assert.deepEqual(hits, [], 'nothing ran, so nothing reached the server');
  });

  test('DRAWN: approved code draws in its root; its own names stay; everything else is stripped; the network is shut', { timeout: TIMEOUT }, async () => {
    hits = [];
    const p = plugin(hostile(H, P));
    approve(p);
    const r = run(p);
    assert.equal(r.refusal, undefined, JSON.stringify(r.refusal));
    const html = r.rendered.html;
    const root = /<div data-lattice-plugin="gantt-plugin">([\s\S]*?)<\/div>\s*<\/div>/.exec(html)?.[0] ?? '';
    assert.match(root, /<ul class="gantt-plugin-rows" id="gantt-plugin-s0f0">/, 'its own class and id stay, the foreign class goes');
    assert.match(root, /<li>Design 1 &lt; 2<\/li><li>Build 3<\/li>/, 'it was handed the fence’s text as written');
    assert.doesNotMatch(html, /foreign-class|onclick|alert\(|<script|127\.0\.0\.1|not-mine/, 'a stranger’s class, handler, script, address and id are gone');
    assert.match(html, /language-js/, 'a fence of another language is still code');
    assert.doesNotMatch(html, /language-gantt/, 'the gantt block was replaced');
    await settle();
    assert.deepEqual(hits, [], `the renderer tried the network four ways and reached the server ${hits.length} times: ${hits.join(' ')}`);
  });

  test('CHANGED: one byte of code after approval is refused again', { timeout: TIMEOUT }, () => {
    const code = hostile(H, P);
    approve(plugin(code));
    const r = run(plugin(`${code}\n/* changed */`));
    assert.equal(r.rendered, undefined);
    assert.match(r.refusal[0], /you have not approved its code/);
  });

  test('BREAKOUT: a renderer that closes the wrapper is refused, and the author’s block stays with a note', { timeout: TIMEOUT }, () => {
    const p = plugin(BREAKOUT);
    approve(p);
    const r = run(p);
    const html = r.rendered.html;
    assert.match(html, /language-gantt/, 'the code block is kept');
    assert.match(html, /data-package-error="gantt-plugin"[^>]*>The plugin “gantt-plugin” did not draw this block: the renderer returned markup that closes its own container/);
    assert.doesNotMatch(html, /alert\(3\)|<script/);
    assert.ok(r.lines.warn.some((l) => /did not draw 1 block \(on slide 1\)/.test(l)), r.lines.warn.join('\n'));
  });

  test('THREW: a renderer that throws leaves the block, a note and a warning, and the rest of the deck draws', { timeout: TIMEOUT }, () => {
    const p = plugin(THROWS);
    approve(p);
    const r = run(p);
    assert.match(r.rendered.html, /language-gantt/);
    assert.match(r.rendered.html, /did not draw this block: boom &lt;b&gt;/);
    assert.match(r.rendered.html, /language-js/, 'the other slide is untouched');
    assert.ok(r.lines.warn.some((l) => /plugin gantt-plugin did not draw 1 block/.test(l)));
  });

  test('CLAIMED: a fence on a slide a code package claims whole is not run', { timeout: TIMEOUT }, async () => {
    hits = [];
    const md = '---\ntheme: indaco\n---\n\n<!-- _class: tally -->\n\n## Claimed\n\n```gantt\nnot run\n```\n';
    const p = plugin(hostile(H, P));
    approve(p);
    const tally = { name: 'tally', code: 'function t(s){return s.html}\nexport { t as default };', facts: 1 };
    const e = engine.createEngine();
    const r = renderWithCodePackages((hook) => e.render(md, 'indaco', { codePackages: hook }), { packages: [tally], plugins: [p], executablePath: process.env.CHROME_PATH || undefined, warn: () => {}, info: () => {} });
    // The package is not approved either, so the render stops before anything runs: that is the
    // point: only the slide package was claimed, the plugin's fence never was.
    assert.deepEqual(r.claimed, ['tally']);
    await settle();
    assert.deepEqual(hits, []);
  });
});
