/**
 * The label-set key's DOM path, in REAL Chromium, booting the shipped bundle.
 *
 * WHY THIS IS NOT A UNIT TEST, and the reason is a bug this file exists to keep
 * fixed. `lib/transformers/label-set-key.js` has two arms (HARD RULE #1): the
 * HTML-string one the exporter runs, and `applyToDom`, which runs inside
 * `dist/lattice-runtime.js` on the live preview surfaces. The jsdom arms in
 * `test/unit/transformers/label-set-key.test.js` cover the second by handing it
 * `document.body` — and every one of them passed while the transformer threw on
 * the real surface, because THE RUNTIME PASSES THE DOCUMENT ITSELF as root and
 * `document.ownerDocument` is null. A proxy that supplies a friendlier argument
 * than the caller does is not verification of the caller (HARD RULE #23).
 *
 * So this boots the ACTUAL bundle in ACTUAL Chromium, against the raw
 * post-markdown-it shape a preview holds, and asserts what only a real layout
 * engine can answer as well: that the swatch paints a box rather than collapsing
 * to nothing.
 *
 * WHAT IT DOES NOT CLAIM. It does not assert how the key LOOKS — pixels are
 * verified by rendering `examples/obligation-matrix-label-sets.md` and looking at
 * it. A green run here says the DOM arm builds the right key on the real surface,
 * and nothing more.
 */

const { test, before, after, describe } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');

const ROOT = path.join(__dirname, '..', '..', '..');
const RUNTIME = fs.readFileSync(path.join(ROOT, 'dist', 'lattice-runtime.js'), 'utf8');
const CSS = fs.readFileSync(path.join(ROOT, 'dist', 'lattice.css'), 'utf8');

// The shape a preview actually holds: cells already carry `state {sem} {shape}`,
// stamped by the parse-time markdown-it rule, before any transformer runs.
const cell = (sem, shape) => `<td><span class="state ${sem} ${shape}"></span></td>`;
const FULL = cell('pass', 'state-full');     // [x]
const HALF = cell('warn', 'state-half');     // [-]
const TODO = cell('todo', 'state-todo');     // [ ]

const section = (cells, extra = '') => '<section id="1" class="obligation-matrix">'
  + '<h2>Duties</h2>' + extra
  + `<table><tbody><tr><td>GDPR</td>${cells}</tr></tbody></table>`
  + '</section>';

let browser;
let puppeteer;

before(async () => {
  puppeteer = require('puppeteer');
  browser = await puppeteer.launch({
    headless: 'new',
    args: ['--no-sandbox', '--disable-dev-shm-usage'],
  });
});

after(async () => { if (browser) await browser.close(); });

/** Boot the real bundle over `body` and hand the page to `fn`. */
async function onRuntime(body, fn) {
  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 720 });
  await page.setContent(
    `<!DOCTYPE html><html><head><style>${CSS}</style></head><body>${body}</body></html>`,
    { waitUntil: 'load' },
  );
  // The bundle applies the registry on load, exactly as a preview does.
  await page.evaluate(RUNTIME);
  await page.evaluate(() => new Promise((r) => setTimeout(r, 300)));
  try { return await fn(page); } finally { await page.close(); }
}

const readKey = () => ({
  count: document.querySelectorAll('.label-set-key').length,
  labels: [...document.querySelectorAll('.label-set-key-label')].map((n) => n.textContent),
  marks: [...document.querySelectorAll('.label-set-key-mark')].map((n) => n.className),
  boxes: [...document.querySelectorAll('.label-set-key-mark')].map((n) => {
    const r = n.getBoundingClientRect();
    return { w: Math.round(r.width), h: Math.round(r.height) };
  }),
  bodyText: document.body.textContent,
});

describe('label-set key — applyToDom on the real runtime', () => {
  test('the runtime passes the DOCUMENT as root, and the key is still built', async () => {
    // The regression arm. Before the fix this threw
    // "Cannot read properties of null (reading 'createElement')" and no key was
    // built at all — on every live preview, with the whole jsdom suite green.
    const out = await onRuntime(section(FULL + HALF + TODO), (p) => p.evaluate(readKey));
    assert.equal(out.count, 1, 'exactly one key on the real surface');
    assert.deepEqual(out.labels, ['Applies', 'Partial', 'Exempt']);
  });

  test('the swatch paints a real box rather than collapsing', async () => {
    // Only a layout engine can answer this. The key reuses the CELL's disc
    // recipe, which sets `text-indent:200%` and `overflow:hidden` to hide a
    // cell's trailing label — applied to an empty swatch with no width of its
    // own that is a 0×0 element and an invisible key.
    const out = await onRuntime(section(FULL), (p) => p.evaluate(readKey));
    for (const b of out.boxes) {
      assert.ok(b.w > 4 && b.h > 4, `swatch collapsed: ${JSON.stringify(b)}`);
    }
  });

  test('an authored label set is read and its paragraph consumed', async () => {
    const body = section(FULL + HALF + TODO, '<p><code>[{[x], In force}]</code></p>');
    const out = await onRuntime(body, (p) => p.evaluate(readKey));
    assert.deepEqual(out.labels, ['In force', 'Partial', 'Exempt'],
      'the authored key renames one member and leaves the rest');
    assert.ok(!out.bodyText.includes('In force}'),
      'the set paragraph must be removed, not left to print above the grid');
  });

  test('the swatch carries the cell classes, so one rule paints both', async () => {
    const out = await onRuntime(section(FULL + HALF), (p) => p.evaluate(readKey));
    assert.ok(out.marks.some((c) => /\bstate\b.*\bpass\b.*\bstate-full\b/.test(c)));
    assert.ok(out.marks.some((c) => /\bstate\b.*\bwarn\b.*\bstate-half\b/.test(c)));
  });

  test('a grid with no marker cells gets no key', async () => {
    const out = await onRuntime(section('<td>plain</td>'), (p) => p.evaluate(readKey));
    assert.equal(out.count, 0);
  });
});
