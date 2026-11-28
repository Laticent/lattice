/**
 * Integration: on a square or portrait slide an image stacks its photo above its text, and the photo gives way
 * to the text (lib/components/imagery/image/image.styles.css; fit-everywhere-model.md §25).
 *
 * Each composition held its photo at a fixed share of the slide: a `split` band at 44%, a `clean` card at up to
 * 50%, a `gallery` frame at 52%. At the x1.4 phone step the text beneath ran past a square slide (25 to 105px on
 * the galleries), and at laptop several portrait slides already ran past. Now each photo keeps its share where
 * the text fits and gives way when it does not: the split band and the clean card down to 28% of the slide, the
 * gallery frame (which keeps its aspect) down to 36%. Cases, three slides on the real CLI export:
 *   PHONE   at the phone default, each slide's text ends inside the slide, and each photo keeps its floor
 *   LAPTOP  at `venue: laptop`, where the text fits, each photo keeps its old share exactly
 *
 * FALSIFIABLE: with the split's fixed 44% band, the clean card's `auto` row, or the gallery frame's fixed width,
 * PHONE's text for that slide runs past the slide; with no cap on the split band, LAPTOP's band is not 44%.
 * Needs Chromium (CHROME_PATH).
 */

const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const puppeteer = require('puppeteer');
const { resolveChrome } = require('../../../tools/lib/resolve-chrome');

const ROOT = path.join(__dirname, '..', '..', '..');
// The three slides are the ones the export diff found (examples/sample-images.md 3, gallery.md 37 and 56).
const deck = (venue) => `---
marp: true
theme: indaco
size: square
${venue ? `venue: ${venue}\n` : ''}---

<!-- _class: image split -->

\`Raster sample\`

## The JPEG twin takes the same path.

\`sample:photo-tall.jpg\` is a real raster photo, so a deck can test the JPEG route without bringing its own file.

![A figure before violet hills and a pale sun](sample:photo-tall.jpg)

---

<!-- _class: image gallery -->

\`Offsite · The Artifact\`

## The whiteboard was photographed before anyone could erase it.

Shown whole, on a matte, with a placard — evidence handling for a whiteboard that held the four framework parts and one org chart nobody claims to have drawn.

![A figure on a green shore under a pale sun](sample:photo-square.jpg)

---

<!-- _class: image mirror -->

\`Offsite · Day Two\`

## Day two opened from the other shore.

Same lake, opposite bank, one session earlier than scheduled. The image card crosses to the left and the text pads to match — the same picture, placed on the left by \`mirror\`. The lake is unchanged.

![A figure by a lake under a low sun](sample:photo-wide.jpg)
`;

let dir;
let browser;
const measured = {};
before(async () => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'image-gives-way-'));
  browser = await puppeteer.launch({ executablePath: resolveChrome?.() || process.env.CHROME_PATH || undefined, args: ['--no-sandbox'] });
  for (const [name, venue] of [['phone', ''], ['laptop', 'laptop']]) {
    const md = path.join(dir, `${name}.md`);
    fs.writeFileSync(md, deck(venue));
    const out = path.join(dir, `${name}.html`);
    const r = spawnSync(process.execPath, [path.join(ROOT, 'lattice.js'), md, out], { cwd: ROOT, encoding: 'utf8', timeout: 240000 });
    if (r.status !== 0) throw new Error(`export failed: ${r.stderr}`);
    const page = await browser.newPage();
    await page.setViewport({ width: 1080, height: 1080 });
    await page.goto(`file://${out}`, { waitUntil: 'load' });
    await page.evaluate(() => document.fonts.ready);
    measured[name] = await page.evaluate(() => Object.fromEntries(['split', 'gallery', 'clean'].map((c) => {
      const s = document.querySelector(`section.image[data-img-composition="${c}"]`);
      const t = s.getBoundingClientRect();
      const text = s.querySelector('.image-text').getBoundingClientRect();
      const photo = s.querySelector('.lattice-bg').getBoundingClientRect();
      return [c, {
        orientation: s.getAttribute('data-orientation'),
        textBottom: text.bottom - t.top,
        height: t.height,
        photoShare: photo.height / t.height,
        photoWidthShare: photo.width / t.width,
        // The photo's height under the old rule (no giving way), to tell a photo that gave way from one that
        // did not: the gallery frame cannot shrink, the clean card sizes itself in an `auto` row.
        unshrunkShare: (() => {
          const bg = s.querySelector('.lattice-bg');
          const set = c === 'gallery' ? [[bg, 'flex-shrink', '0']] : [[bg, 'height', 'auto'], [s, 'grid-template-rows', 'auto auto']];
          for (const [el, k, v] of set) el.style.setProperty(k, v, 'important');
          const h = bg.getBoundingClientRect().height;
          for (const [el, k] of set) el.style.removeProperty(k);
          return h / t.height;
        })(),
      }];
    })));
    await page.close();
  }
});
after(async () => {
  await browser?.close();
  if (dir) fs.rmSync(dir, { recursive: true, force: true });
});

const FLOOR = { split: 0.28, gallery: 0.36, clean: 0.28 };
for (const c of ['split', 'gallery', 'clean']) {
  test(`PHONE ${c}: the text ends inside the slide, and the photo keeps at least ${Math.round(FLOOR[c] * 100)}%`, () => {
    const m = measured.phone[c];
    assert.equal(m.orientation, 'square', 'the case must be the stacked square layout, or it proves nothing');
    assert.ok(m.textBottom <= m.height + 0.5, `the text runs ${Math.round(m.textBottom - m.height)}px past the slide`);
    assert.ok(m.photoShare >= FLOOR[c] - 0.005, `the photo fell to ${m.photoShare.toFixed(3)}`);
  });
}

test('LAPTOP: where the text fits, each photo keeps its old share', () => {
  const { split, gallery, clean } = measured.laptop;
  assert.ok(Math.abs(split.photoShare - 0.44) < 0.005, `the split band is ${split.photoShare.toFixed(3)}`);
  // The gallery frame and the clean card must be the height the old rule gives them.
  assert.ok(Math.abs(gallery.photoShare - gallery.unshrunkShare) < 0.002, `the gallery frame gave way at laptop: ${gallery.photoShare.toFixed(3)} of ${gallery.unshrunkShare.toFixed(3)}`);
  assert.ok(Math.abs(clean.photoShare - clean.unshrunkShare) < 0.002, `the clean card gave way at laptop: ${clean.photoShare.toFixed(3)} of ${clean.unshrunkShare.toFixed(3)}`);
});
