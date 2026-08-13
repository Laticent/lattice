/**
 * SLIDE PLANE invariant — every direct child of every section sits on a NAMED plane.
 *
 * A Lattice slide is a small stack of planes (`--z-canvas` · `--z-atmosphere` ·
 * `--z-content` · `--z-chrome` · `--z-mark` · `--z-alarm`, base.tokens.css § depth
 * axis), and this is the half of that model no static gate can decide.
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
 * WHAT IT CATCHES, stated as the bug it was written from. The watermark Tile declared
 * plane 1 (atmosphere) in its manifest and `z-index: -1` in its CSS. Both are legal;
 * `-1` is even inside the local band a component's internals are allowed. But the
 * watermark is a direct section child, so that `-1` was a *plane assignment written in
 * a private language* — and the wrong plane: it put the ghost numeral BELOW the finish
 * backdrop at 0, and under `finish: savile` the pinstripes ruled straight across it.
 * `citation-card.styles.css` carries a comment recording the identical bug, found and
 * patched independently years of authors apart. This test is what makes the third one
 * fail instead of ship.
 *
 * THE ASSERTION is membership, not a coordinate: a direct child's computed z-index must
 * be one of the plane VALUES. It deliberately does not assert WHICH plane each element
 * is on — that is a design decision the plane tokens already record at the declaration
 * site, and pinning it here would turn every intentional re-plane into a test edit.
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
//     stack, all three direct children of the same section;
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

describe('every direct section child sits on a named plane (real render)', () => {
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
    const offenders = rows.filter((r) => !allowed.has(r.zIndex));
    assert.deepEqual(
      offenders, [],
      `every direct child of a section must land on a plane (${slidePlanes.map((p) => `${p.name}=${p.value}`).join(', ')}). ` +
      'A value outside that set is a layering decision made in private — either a local-band ' +
      'value on an element that is not local (the watermark defect: a legal `-1` that was ' +
      'really the wrong plane), or `auto`, which paints by DOM position and puts the element ' +
      'under the finish backdrop. Give it a `--z-*` token at its declaration site.',
    );
  });
});
