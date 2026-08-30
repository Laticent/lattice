/**
 * SLIDE PLANE invariant — a direct child of a section is on a NAMED plane or in the flow.
 *
 * A Lattice slide is a small stack of planes — `--z-canvas` (-2) and `--z-atmosphere` (-1)
 * sink below the words, the content flow rests at `auto`, and `--z-chrome` (30),
 * `--z-alarm` (90) and `--z-mark` (100) rise above it (base.tokens.css § depth axis). This
 * is the half of that model no static gate can decide.
 *
 * WHY IT CANNOT BE STATIC. The rule is "an element that can be a DIRECT CHILD of a
 * section is ordered against the slide's planes, so it must name one" — and deciding
 * which elements those are from CSS text means reimplementing selector matching,
 * specificity AND bundle source order against a DOM the CSS never describes. It has
 * been tried twice in this repo. `checkFinishChromeExclusions` abandoned a fully
 * derived version at "38 candidates, nearly all false positives" and fell back to a
 * hand-written set; a second attempt while building this model fired on
 * `.state-chart-edges`, `.scene-control` and `.panel-eyebrow`, none of which is a
 * section child. So the question is asked of the DOM instead, where it is not a
 * heuristic but a fact — `el.parentElement === section` — and no enumeration is
 * needed or kept.
 *
 * WHAT IT CATCHES — and, just as importantly, WHAT IT DOES NOT. It reads COMPUTED
 * z-index, so it sees values, never the source that produced them. `--z-atmosphere` IS
 * `-1`, which means reverting the watermark Tile to a literal `z-index: -1` — the exact
 * defect this model was written from — passes every assertion here. That case is caught by
 * the STATIC gates instead: `checkZPlanes` rejects any bare integer outside 0–9, and §4.3
 * in `tools/build-forms.js` rejects a bare integer on a Form noun and demands the token for
 * its declared plane. Both were verified firing on that revert. An earlier version of this
 * docstring claimed the render test caught it; it does not, and the distinction is the
 * whole division of labor between the two halves of the gate.
 *
 * What this test uniquely catches is the half no static check can decide: an element that
 * is a direct section child in the DOM carrying a value that is not a plane at all, and the
 * canvas/atmosphere ordering being inverted on a real render.
 *
 * THE ASSERTIONS are two, and neither is a coordinate:
 *
 *   1. No direct child carries a RAW NUMBER that is not a plane value. `auto` is legal and
 *      expected — content is the natural resting plane, and the decorative planes are
 *      NEGATIVE so they sink below it without anything being declared. What is illegal is
 *      an unnamed number, which is a layering decision made in private. That is exactly
 *      the watermark's `-1`.
 *   2. The two elements the model exists to order are on the planes it names: the finish
 *      `.backdrop` on `--z-canvas` and the watermark ghost on `--z-atmosphere`. Their
 *      inversion is what this whole model was written from, so it is asserted by name
 *      rather than left to the membership check, which `-1` would once have satisfied.
 *
 * Neither pins WHICH plane every other element is on — that is a design decision the
 * tokens already record at the declaration site, and pinning it here would turn every
 * intentional re-plane into a test edit.
 *
 * Needs Chromium (CHROME_PATH / puppeteer cache) + the emulator (HARD RULE #23 — this
 * is a cascade + layout fact, so it is asserted on a real render and nowhere else).
 */

const { test, describe, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const puppeteer = require('puppeteer');
const { renderHtml } = require('../../helpers/semantic-render');
const { definedPlaneTokens } = require('../../../tools/check-ownership.js');

/** Best-effort Chromium path — mirrors frame-chrome-out-of-flow.test.js. */
function resolveChrome() {
  if (process.env.CHROME_PATH && fs.existsSync(process.env.CHROME_PATH)) return process.env.CHROME_PATH;
  for (const root of [path.join(os.homedir(), '.cache', 'puppeteer', 'chrome'), '/root/.cache/puppeteer/chrome']) {
    if (!fs.existsSync(root)) continue;
    for (const build of fs.readdirSync(root).filter((d) => d.startsWith('linux-')).sort().reverse()) {
      const bin = path.join(root, build, 'chrome-linux64', 'chrome');
      if (fs.existsSync(bin)) return bin;
    }
  }
  return undefined;
}

// A deck chosen to REACH the section-level children, not to look like a real deck. Each
// slide exists because it docks something at section level that the others do not:
//   · running header / footer / deck logo — the frame chrome, direct children on a
//     sovereign frame and nested inside a Cell on a Form frame;
//   · `.backdrop` — the finish field, injected as the first child of every finish section;
//   · `.tile-watermark` — the section-number ghost (needs a `divider` above it to have a
//     section number at all), the element whose wrong plane this test was written from;
//   · `.lattice-bg` / `.image-scrim` / `.image-text` — the image layout's three-plane
//     stack (canvas · atmosphere · content), all three direct children of one section;
//   · a sovereign `title` frame, whose h1/p ARE the direct children — the shape that had
//     no stacking context at all before the plane model.
const DECK = `---
marp: true
theme: indaco
paginate: true
header: "Running Header"
footer: "Footer Text"
logo: ../../lib/base/_logo/acme-logo.svg
logo-on: all
finish: atrium
---

<!-- _class: title -->

# A sovereign frame

Its heading and lede are direct children of the section.

---

<!-- _class: divider -->

# Section one

---

<!-- _class: form watermark content -->

## The section-number ghost

Body copy that gives the stage real height to distribute.

---

<!-- _class: content finish-none -->

## A Form frame with no finish

Body copy that gives the stage real height to distribute.
`;

// The image layout needs its own deck: `finish:` and the photo compositions both want
// the canvas plane, and the point here is the three-child stack, not their interaction.
const IMAGE_DECK = `---
marp: true
theme: indaco
paginate: true
footer: "Footer Text"
---

<!-- _class: image -->

![bg](../../lib/base/_logo/acme-logo.svg)

## A photo panel, a scrim and a prose panel

Copy that sits on the content plane above both.
`;

/** Every direct child of every section, with its computed z-index. */
function directChildren(page) {
  return page.evaluate(() => {
    const rows = [];
    document.querySelectorAll('section').forEach((sec, i) => {
      for (const el of sec.children) {
        const cs = getComputedStyle(el);
        // `<style>`/`<script>` are payload, not paint — they have no box at all.
        if (cs.display === 'none') continue;
        rows.push({
          slide: i + 1,
          what: el.tagName.toLowerCase() + (el.className ? `.${[...el.classList].join('.')}` : ''),
          zIndex: cs.zIndex,
          sectionClass: sec.className,
        });
      }
    });
    return rows;
  });
}

describe('every direct section child is on a named plane or in the flow (real render)', () => {
  let browser;
  let rows = [];
  const chrome = resolveChrome();
  const planes = definedPlaneTokens();
  // `--z-viewer` is deliberately excluded: it is a DOCUMENT-level value for chrome that
  // floats above the whole deck (the fluid-view toggle), never a slide plane. An element
  // inside a section carrying it would be the bug, not the baseline.
  const slidePlanes = planes.filter((p) => p.name !== '--z-viewer');
  const allowed = new Set(slidePlanes.map((p) => String(p.value)));

  if (!chrome) {
    test('SKIPPED — no Chromium (CHROME_PATH / puppeteer cache) available', { skip: true }, () => {});
    return;
  }

  before(async () => {
    browser = await puppeteer.launch({
      executablePath: chrome,
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
    });
    for (const [key, deck] of [['slide-planes', DECK], ['slide-planes-image', IMAGE_DECK]]) {
      const html = renderHtml(deck, { key });
      const page = await browser.newPage();
      await page.goto(`file://${html}`, { waitUntil: 'load', timeout: 60000 });
      rows = rows.concat(await directChildren(page));
      await page.close();
    }
  }, { timeout: 630000 });

  after(async () => { if (browser) await browser.close(); });

  test('the probe decks actually reach the section-level children', () => {
    // Guards against the suite passing vacuously if a render path stops docking one of
    // these at section level — the failure mode that hid `.lat-split-rail` from the
    // exclusion list's original sweep.
    const seen = new Set(rows.map((r) => r.what.split('.')[0] + (r.what.includes('.') ? `.${r.what.split('.')[1]}` : '')));
    for (const hook of ['div.backdrop', 'header', 'footer', 'div.tile-watermark', 'div.lattice-bg', 'img.deck-logo']) {
      assert.ok(
        [...seen].some((s) => s === hook || s.startsWith(`${hook}.`)),
        `probe decks never produced \`${hook}\` as a direct section child — the deck no longer ` +
        'exercises what this test claims to cover; fix the deck, not the assertion',
      );
    }
  });

  test('every section is a stacking context, so the planes mean the same thing everywhere', async () => {
    // Re-opened rather than kept alive from `before`: that hook closes its pages once it
    // has the child rows, and this assertion is about the section itself, not a child.
    const page = await browser.newPage();
    await page.goto(`file://${renderHtml(DECK, { key: 'slide-planes' })}`, { waitUntil: 'load', timeout: 60000 });
    const notIsolated = await page.evaluate(() => [...document.querySelectorAll('section')]
      .filter((s) => getComputedStyle(s).isolation !== 'isolate')
      .map((s) => s.className));
    await page.close();
    assert.deepEqual(
      notIsolated, [],
      'a section without a stacking context leaks its z-index values to the page root, where ' +
      'they are ordered against OTHER SLIDES. `section { isolation: isolate }` ' +
      '(base.elements.css) must stay unconditional — it used to be gated on `.form`, so every ' +
      'sovereign frame (title / math / divider) had none',
    );
  });

  test('no direct section child carries an unnamed z-index', () => {
    // `auto` is legal: content is the natural resting plane and declares nothing. A NUMBER
    // that is not a plane is not — it is a slide-scale layering decision in a private
    // language, which is precisely what the watermark's `-1` was.
    const offenders = rows.filter((r) => r.zIndex !== 'auto' && !allowed.has(r.zIndex));
    assert.deepEqual(
      offenders, [],
      `a direct child of a section may carry \`auto\` (the content flow) or a plane value ` +
      `(${slidePlanes.map((p) => `${p.name}=${p.value}`).join(', ')}) — nothing else. ` +
      'Give it a `--z-*` token at its declaration site (lib/base/base.tokens.css § depth axis).',
    );
  });

  test('the deck logo paints the plane its manifest declares', () => {
    // THE ONE FORM NOUN §4.3 CANNOT SEE. `collectZPlaneZIndex` (tools/build-forms.js) reads a
    // noun's CO-LOCATED CSS — `lib/forms/tile/<id>/<id>.css` — and the logo Tile ships none;
    // its rule lives in base.modifiers.css. So the manifest↔CSS equality this branch is proud
    // of does not reach the logo, and a mutation test confirms it: setting the manifest to a
    // plane the CSS does not paint passes build-forms, check-ownership and every unit suite.
    //
    // That matters more here than anywhere else, because this Tile's plane has moved four
    // times on one branch (3 → 2 → 3 → 1 → 2) while chasing a rendering defect that turned
    // out to be a rasterizer bug. Asking the DOM is the only place the pair can actually be
    // held, so it is held here.
    //
    // WHY CONTENT AND NOT CHROME, since the logo is plainly frame furniture: a plane says
    // what may COVER what, not what a thing IS. On `--z-chrome` an off-corner
    // `logo-style: brand` plate erased four words of a pull-quote; on `--z-atmosphere` the
    // mark vanished under a split panel. `--z-content` is the only value that renders 0 px
    // against the merge-base on both, because a positioned element at `z-index: 0` paints at
    // step 8 — above plain in-flow content, below anything claiming the local 0–9 band —
    // which is exactly where `z-index: auto` had it before the model existed.
    const declared = JSON.parse(
      fs.readFileSync(path.join(__dirname, '../../../lib/forms/tile/logo/logo.manifest.json'), 'utf8'),
    ).z;
    const PLANE_FOR_MANIFEST_Z = { 0: '--z-canvas', 1: '--z-atmosphere', 2: '--z-content', 3: '--z-chrome', 4: '--z-mark' };
    const expected = String(slidePlanes.find((p) => p.name === PLANE_FOR_MANIFEST_Z[declared]).value);
    const logos = rows.filter((r) => r.what.startsWith('img.deck-logo'));
    assert.ok(logos.length, 'the probe deck must render a deck logo to hold this pair');
    for (const r of logos) {
      assert.equal(
        r.zIndex, expected,
        `logo.manifest.json declares z ${declared} (${PLANE_FOR_MANIFEST_Z[declared]} = ${expected}) ` +
        `but the element paints at ${r.zIndex}. The manifest and the paint are the same decision ` +
        'written twice; when they disagree the catalog lies to every agent that reads it — the ' +
        'defect this whole model was written from. Change both, or neither.',
      );
    }
  });

  test('the canvas sinks below the words and atmosphere sits between them', () => {
    // The inversion this model was written from, asserted by name. A membership check alone
    // would not have caught it: the watermark's `-1` is a perfectly ordinary number.
    const plane = (n) => String(slidePlanes.find((p) => p.name === n).value);
    const backdrops = rows.filter((r) => r.what.startsWith('div.backdrop'));
    const ghosts = rows.filter((r) => r.what.startsWith('div.tile-watermark'));
    assert.ok(backdrops.length && ghosts.length, 'the probe deck must produce both to compare them');
    for (const r of backdrops) {
      assert.equal(r.zIndex, plane('--z-canvas'),
        'the finish backdrop IS the sheet — it belongs on the canvas plane, below everything');
    }
    for (const r of ghosts) {
      assert.equal(r.zIndex, plane('--z-atmosphere'),
        'the section-number ghost is decoration behind the words, not part of the sheet. Its ' +
        'manifest declares plane 1; when its CSS said `z-index: -1` it painted UNDER the ' +
        'finish field and a patterned finish ruled its texture straight across the numeral');
    }
    assert.ok(
      Number(plane('--z-canvas')) < Number(plane('--z-atmosphere')) && Number(plane('--z-atmosphere')) < 0,
      'canvas below atmosphere, and both below the content flow at `auto`',
    );
  });
});
