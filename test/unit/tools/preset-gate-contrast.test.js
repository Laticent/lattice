'use strict';
/**
 * preset-gate's two contrast rules that need a real browser (tools/preset-gate.js):
 *
 *   text   a run check-slide-contrast's PROBE fails is re-scored against the rendered pixels, and fails
 *          only if they fail too. The regression it guards: wave 1 round 1 failed Museum's split-panel
 *          chrome at 1.44:1 on a dark panel the pixels measure at 7.89:1.
 *   marks  under `marks: tone` a mark passes on its fill OR its ink edge (the owner's D1, 2026-11-23);
 *          every other finish is held to its fill.
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { resolveChrome, skipWithoutChrome, skipUnlessCI } = require('../../helpers/chrome');

const ROOT = path.join(__dirname, '..', '..', '..');
const CLI = path.join(ROOT, 'dist', 'lattice.js');
const chrome = resolveChrome();
const skip = skipWithoutChrome(chrome) || skipUnlessCI(!fs.existsSync(CLI), 'dist/ is not built (npm run build)');
const { textContrast, markContrast } = require(path.join(ROOT, 'tools', 'preset-gate.js'));

let browser;
let dir;
test.before(async () => {
  if (skip) return;
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'preset-gate-contrast-'));
  browser = await require('puppeteer').launch({ executablePath: chrome, args: ['--no-sandbox', '--font-render-hinting=none'] });
});
test.after(async () => {
  await browser?.close();
  if (dir) fs.rmSync(dir, { recursive: true, force: true });
});

const SPLIT = `<!-- _class: split-panel -->

\`Why it moved\`

## Pricing discipline did more than volume.

Three changes account for most of the 4.4-point gain.

- Lane-level pricing
  - Every quote carries the lane's true cost.
- Fewer empty miles
  - Backhaul matching cut empty miles.
`;

function renderHtml(name, frontMatter, body) {
  const md = path.join(dir, `${name}.md`);
  const html = path.join(dir, `${name}.html`);
  fs.writeFileSync(md, `---\nmarp: true\nheader: "Northwind Freight · FY2026 board review"\nfooter: "Confidential · prepared for the board"\n${frontMatter}---\n\n${body}`);
  const r = spawnSync(process.execPath, [CLI, md, html, '-q'], { cwd: ROOT, encoding: 'utf8' });
  assert.equal(r.status, 0, r.stderr);
  return html;
}

test('text: chrome on a dark panel under a finish is scored from the pixels, not the finish canvas', { skip }, async () => {
  const html = renderHtml('museum-split', 'preset: museum\n', SPLIT);
  const res = await textContrast(browser, html);
  const chromeFails = res.fails.filter((f) => /Northwind|Confidential/.test(f.text));
  assert.deepEqual(chromeFails, [], JSON.stringify(res.fails));
  // The PROBE alone fails these runs; the pixels overrule it. If the PROBE ever stops failing them,
  // this test no longer exercises the re-score and must find a new case.
  const over = res.overruled.filter((f) => /Northwind|Confidential/.test(f.text));
  assert.ok(over.length >= 2, `the probe's modeled failure is recorded as overruled: ${JSON.stringify(res.overruled)}`);
  for (const o of over) assert.ok(o.modeled < 4.5 && o.sampled >= 4.5, JSON.stringify(o));
});

test('text: a run that really is faint still fails after the pixel re-score', { skip }, async () => {
  // Control: a genuinely faint paragraph fails both the model and the pixels.
  const html = renderHtml('faint', 'style: |\n  section.content p { color: rgb(200, 200, 200); }\n', '<!-- _class: content -->\n\n## A heading\n\nThis paragraph is far too faint to read.\n');
  const res = await textContrast(browser, html);
  assert.ok(res.fails.some((f) => /too faint/.test(f.text) && f.sampled), JSON.stringify(res.fails));
});

function chartHtml(name, cls, stroke) {
  const html = path.join(dir, `${name}.html`);
  fs.writeFileSync(html, `<!doctype html><html><body style="margin:0;background:rgb(249,246,241)">
<section class="${cls}" style="width:1280px;height:720px;position:relative;background:rgb(249,246,241)">
<svg width="1280" height="720" viewBox="0 0 1280 720">
<rect class="bar-mark" x="400" y="200" width="200" height="300" fill="rgb(232,226,214)" stroke="rgb(110,82,30)" stroke-width="${stroke}"/>
</svg></section></body></html>`);
  return html;
}

test('marks: under tone a pale fill passes on its ink edge; elsewhere, or with a hairline edge, it fails', { skip }, async () => {
  const pass = await markContrast(browser, chartHtml('tone-edge', 'bar marks-tone', 2));
  assert.deepEqual(pass.fails, [], JSON.stringify(pass.fails));
  assert.ok(pass.measured >= 1, 'the bar was measured');
  const pigment = await markContrast(browser, chartHtml('pigment-edge', 'bar marks-pigment', 2));
  assert.ok(pigment.fails.some((f) => f.cls === 'bar-mark' && f.fill < 3), `a pale pigment fill fails whatever its edge: ${JSON.stringify(pigment.fails)}`);
  const hairline = await markContrast(browser, chartHtml('tone-hairline', 'bar marks-tone', 0.5));
  assert.ok(hairline.fails.some((f) => f.cls === 'bar-mark'), `an edge under 1px does not count: ${JSON.stringify(hairline.fails)}`);
});
