/**
 * The `numbered` bookend stamp paints, on BOTH render paths, WITH `silent`.
 *
 * `divider numbered` / `closing numbered` used to write the numeral onto
 * `section::after` — the pseudo the engine reserves for the page number — and two
 * separate owners took it back:
 *
 *  1. `packTheme` (lib/engine/css.js) mirrors Marpit's pagination plugin and comments
 *     out every `content` on a `section…::after` rule that isn't
 *     `attr(data-lattice-pagination)`. That mask runs over the whole inlined base
 *     bundle, so the counter was stripped from the stylesheet the docs Playground, the
 *     Studio and lib/runtime load — while the unpacked emulator/CLI path kept it. One
 *     modifier, two render paths, two different pictures.
 *  2. `silent` / `no-paginate` null the same pseudo with
 *     `section.silent.silent::after { content: none }` at an equal (0,2,2) specificity
 *     from a later file, so `divider silent numbered` — the sample shipped in
 *     `divider.docs.md`, in the manifest and in `divider.gallery.md` — stamped nothing
 *     anywhere.
 *
 * The numeral now rides the slide HEADING's pseudo, which neither owner can reach.
 *
 * WHY THIS IS NOT A CSS TEXT MATCH. `test/unit/engine/engine.test.js` already pins the
 * packed RULE, and a rule-level assertion is exactly what certified the bug for as long
 * as it existed: the previous arm asserted the counter must NOT survive the pack. What
 * a text match cannot see is whether the declaration reaches a pixel — a pseudo can be
 * live and still collapse to nothing (see the finish-`::after` entry in
 * engineering/gotchas/css.md). So this drives the two REAL surfaces in Chromium and
 * ends on a PIXEL comparison against an un-numbered control slide (HARD RULE #23).
 *
 * Slow tier (Chromium; the second surface also spawns the emulator).
 */

const { test, describe, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const puppeteer = require('puppeteer');

const { resolveChrome, skipWithoutChrome } = require('../../helpers/chrome.js');

const ROOT = path.join(__dirname, '..', '..', '..');
const EMULATOR = path.join(ROOT, 'lattice-emulator.js');
const OUT = path.join(ROOT, '.scratch', 'numbered-bookend-stamp');
const TIMEOUT = 300000;

// Slide 1 is the CONTROL: an identical dark divider with no `numbered`. Every other
// slide adds exactly one thing, so a failure names its own cause. The heading text is
// deliberately short and the deck is unpaginated, which keeps the top-right corner —
// where the numeral lands — empty canvas on the control.
const DECK = `---
marp: true
theme: indaco
---

<!-- _class: divider -->

## Control.

---

<!-- _class: divider numbered -->

## Stamped.

---

<!-- _class: divider silent numbered -->

## Stamped under silent.

---

<!-- _class: divider light numbered -->

## Stamped on the light canvas.

---

<!-- _class: closing numbered -->

## Stamped on the closing.
`;

/** What each slide's heading `::after` must resolve to. `null` = no stamp at all. */
const EXPECTED = [
  { cls: 'divider', counter: null },
  { cls: 'divider numbered', counter: 'lat-divider' },
  { cls: 'divider silent numbered', counter: 'lat-divider' },
  { cls: 'divider light numbered', counter: 'lat-divider-light' },
  { cls: 'closing numbered', counter: 'lat-closing' },
];

/**
 * Read every slide's heading-pseudo `content` off a laid-out page.
 *
 * Chromium returns the UNRESOLVED `counter(name, style)` string here rather than the
 * digits it paints, which is why the pixel arm below exists as well: this half proves
 * the declaration survived the cascade, that half proves it reaches the canvas.
 */
function readStamps(page, sectionSelector) {
  return page.evaluate((sel) => {
    return [...document.querySelectorAll(sel)].map((s) => {
      const heading = s.querySelector('h1, h2');
      return {
        cls: [...s.classList].filter((c) => c !== 'form').join(' '),
        content: heading ? getComputedStyle(heading, '::after').content : '<no heading>',
      };
    });
  }, sectionSelector);
}

function assertStamps(rows, surface) {
  assert.equal(rows.length, EXPECTED.length, `${surface}: slide count`);
  rows.forEach((row, i) => {
    const want = EXPECTED[i];
    assert.equal(row.cls, want.cls, `${surface}: slide ${i + 1} classes`);
    if (want.counter === null) {
      // Chromium reports `none` — not the `normal` initial value — for a pseudo that
      // generates no box, which is what "nothing declared a stamp here" looks like. A
      // stray stamp on a plain divider would be the modifier leaking, a different
      // defect, and worth failing on.
      assert.equal(row.content, 'none', `${surface}: the un-numbered control grew a stamp`);
      return;
    }
    assert.match(
      row.content,
      new RegExp(`^counter\\(${want.counter},`),
      `${surface}: "${want.cls}" lost its stamp (computed content: ${row.content})`
    );
  });
}

describe('numbered bookend stamp — both render paths', { skip: skipWithoutChrome(resolveChrome()), timeout: TIMEOUT }, () => {
  let browser;
  before(async () => {
    browser = await puppeteer.launch({ executablePath: resolveChrome(), args: ['--no-sandbox'] });
  });
  after(async () => {
    if (browser) await browser.close();
  });

  test('the packed browser path (Playground / Studio / lib/runtime) stamps every numbered bookend', async () => {
    const engine = require(path.join(ROOT, 'lib', 'engine'));
    const { composeCss } = require(path.join(ROOT, 'lib', 'engine', 'css.js'));
    const out = engine.render(DECK, 'indaco', { preview: true });
    // THE PRODUCTION SURFACE for every browser host: the scoped stylesheet, not the
    // unscoped bundle the emulator inlines. The mask that broke this lives in here.
    const css = composeCss({
      themeCss: fs.readFileSync(path.join(ROOT, 'themes', 'indaco.css'), 'utf8'),
      baseLatticeCss: fs.readFileSync(path.join(ROOT, 'dist', 'lattice.css'), 'utf8'),
      sizeName: out.sizeName,
    });
    const page = await browser.newPage();
    try {
      await page.setViewport({ width: 1280, height: 720 });
      await page.setContent(
        `<!doctype html><html><head><style>${css}\n` +
          'html,body{margin:0}.lattice>section{width:1280px;height:720px}</style></head>' +
          `<body><article class="lattice">${out.html}</article></body></html>`,
        { waitUntil: 'networkidle0' }
      );
      assertStamps(await readStamps(page, 'article.lattice > section'), 'packed');

      // THE PIXEL ARM. Same 340×180 top-right corner on the control and on
      // `divider numbered`: identical canvas, identical rail (it runs down the LEFT
      // edge), no chrome — so the ONLY thing that can differ is the numeral. Compared
      // as encoded PNG bytes, which needs no image library: two identical crops encode
      // to identical buffers.
      const sections = await page.$$('article.lattice > section');
      const corner = async (el) => {
        const box = await el.boundingBox();
        return page.screenshot({
          clip: { x: box.x + box.width - 360, y: box.y, width: 340, height: 180 },
          captureBeyondViewport: true,
        });
      };
      const control = await corner(sections[0]);
      const stamped = await corner(sections[1]);
      assert.notEqual(
        Buffer.compare(control, stamped),
        0,
        'the numbered divider painted the same top-right corner as the un-numbered control — the stamp is declared but invisible'
      );
    } finally {
      await page.close();
    }
  });

  test('the emulator / CLI export path stamps every numbered bookend', async () => {
    fs.mkdirSync(OUT, { recursive: true });
    const md = path.join(OUT, 'deck.md');
    const html = path.join(OUT, 'deck.html');
    fs.writeFileSync(md, DECK);
    // `.html` output is a real browser render (auto-split and the overflow passes run);
    // it only skips the PDF encode, so it is the export DOM at a fraction of the cost.
    execFileSync(process.execPath, [EMULATOR, md, '-o', html, '-p', 'indaco', '-q'], {
      cwd: ROOT,
      stdio: 'pipe',
    });
    const page = await browser.newPage();
    try {
      await page.setViewport({ width: 1280, height: 720 });
      await page.goto(`file://${html}`, { waitUntil: 'networkidle0' });
      assertStamps(await readStamps(page, 'section[data-lattice-slide]'), 'emulator');
    } finally {
      await page.close();
    }
  });
});
