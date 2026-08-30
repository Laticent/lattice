/**
 * Integration: the LIVE PREVIEW renders diagram labels in the deck's face too.
 *
 * The export has `tools/check-diagram-labels.js`. The preview had nothing, and that gap
 * hid a regression through an entire adversarial review: this branch deleted the
 * runtime's `finishTheme` port, which fetched `--font-body` with the reader's `raw()`,
 * and routed the token through `MERMAID_VAR_MAP` instead — where the preview's port used
 * `read()`.
 *
 * `read()` is a COLOR resolver. It probes by assigning `color: var(--token)` and reading
 * the computed value back, which is how `light-dark(...)` reaches Mermaid as a flat rgb.
 * Handed a font stack that assignment is invalid, so the probe keeps its INHERITED COLOR
 * and the reader returns `rgb(31, 74, 110)` — measured. Mermaid then had a color as its
 * font family on every preview render.
 *
 * It was invisible because `mermaid.css` sets `font-family` on most label elements
 * regardless. Exactly five labels in a ten-slide deck exposed it: the gantt axis ticks,
 * the one text our CSS does not cover. No unit test could see it either — the palette
 * parity test drives both paths with a FAKE reader, which returns the same string for
 * `read` and `raw` by construction.
 *
 * WHAT THIS IS AND IS NOT. It drives `engine.render(preview)` + `composeCss` + the
 * shipped `dist/lattice-runtime.js` + real mermaid in a real Chromium. That is the
 * PREVIEW CASCADE — the same CSS the Studio frame gets (`docs/src/lib/playground-engine.ts`
 * hands `out.css` straight through) — and the cascade is the whole question here, because
 * the preview's scoping is what differs from the export's. It is NOT the Studio frame
 * itself: no `srcdoc` iframe, no `sanitizeSlideHtml` / `sanitizeStyleText`, mermaid from
 * `node_modules` rather than the CDN. Per HARD RULE #23 this names a surface (the preview
 * cascade) and carries an artifact from it; a claim about the Studio frame's SANITIZERS
 * needs the Studio.
 *
 * THREE CASES, because two of them were regressions found by a checker after the first
 * cut of this gate passed green:
 *
 *   1. `mode: sketch`       — every label in the hand face (the #1674 fix).
 *   2. `mode: sketch-clean` — every label in the CLEAN face. This is not symmetry for its
 *      own sake: `--font-body` resolved to the EMPTY STRING here, because the export
 *      restored the clean face from a `--font-body-clean` alias snapshotted at `:root`
 *      while the preview rescopes `:lattice-root` onto the section — putting the alias
 *      and the override on ONE element, a custom-property cycle. Every sketch-clean slide
 *      previewed its prose AND its diagrams in Times New Roman.
 *   3. per-diagram font blocks — c4 / journey / sequence / timeline take their type from
 *      their OWN config block, not the global theme variable, so `perDiagramFonts` writes
 *      28 extra keys. None of those four families is in the example deck.
 *
 * And it counts: an EXACT diagram count against the deck's own fences, plus zero error
 * blocks. The first cut asserted `diagrams >= 6` on a 7-diagram deck and read only the
 * SVGs that rendered — so breaking a renderer registration outright (one family gone,
 * three error blocks in the DOM) left it green. That is the same blindness
 * `check-diagram-labels.js` closes as its question #4.
 */

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { resolveChrome, skipWithoutChrome } = require('../../helpers/chrome.js');

const ROOT = path.join(__dirname, '..', '..', '..');
const CHROME = resolveChrome();
const TIMEOUT = 180000;

/** Mermaid's own defaults, plus the generic families a dropped stack falls back to. */
const NOT_A_DECK_FACE = /^(?:Open Sans|trebuchet ms|verdana|arial|Times New Roman|sans-serif|serif|monospace)$/i;

/** The deck's own ```mermaid fences — the count the preview owes back. */
function fenceCount(markdown) {
  return (markdown.match(/^```mermaid\b/gm) || []).length;
}

async function previewFaces(deckSource, theme) {
  const puppeteer = require('puppeteer');
  const engine = require('../../../lib/engine');
  const { composeCss } = require('../../../lib/engine/css.js');
  const { fontFaceCss } = require('../../../lib/fonts/face-css.js');

  const out = engine.render(deckSource, theme, { preview: true });
  const css = composeCss({
    themeCss: fs.readFileSync(path.join(ROOT, 'themes', `${theme}.css`), 'utf8'),
    baseLatticeCss: fs.readFileSync(path.join(ROOT, 'dist', 'lattice.css'), 'utf8'),
    sizeName: out.sizeName,
  });
  const doc = '<!doctype html><html><head><style>'
    + fontFaceCss(ROOT) + css + '\n.lattice>section{width:1280px;height:720px}'
    + '</style></head><body>'
    + `<article class="lattice">${out.html}</article>`
    + '</body></html>';

  const browser = await puppeteer.launch({
    executablePath: CHROME || undefined, args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });
  try {
    const page = await browser.newPage();
    await page.setContent(doc, { waitUntil: 'networkidle0' });
    // The bundles go in as SCRIPT TAGS, the way the real preview frame loads them —
    // inlining mermaid's ~3 MB IIFE into `setContent` made a document large enough to
    // kill the tab ("Target closed") before the first evaluate.
    await page.addScriptTag({ path: path.join(ROOT, 'node_modules', 'mermaid', 'dist', 'mermaid.js') });
    await page.addScriptTag({ path: path.join(ROOT, 'dist', 'lattice-runtime.js') });
    await page.evaluate(() => document.fonts.ready);
    // The runtime renders diagrams asynchronously, off its own queue.
    await page.waitForFunction(
      () => [...document.querySelectorAll('section svg')].some((s) => s.querySelector('text, foreignObject')),
      { timeout: 60000 },
    ).catch(() => {});
    await new Promise((r) => { setTimeout(r, 3000); });
    // `return await`, not `return` — the `finally` below closes the browser, and an
    // un-awaited promise settles after it ("Target closed").
    return await page.evaluate(() => {
      const faces = {};
      // Bucketed by what the SLIDE asked for, because a deck may opt one slide out:
      // `hand` = a .sketch section, `clean` = anything else (including a
      // .sketch-clean-body one). A face is only foreign relative to its own bucket.
      const byBucket = { hand: {}, clean: {} };
      let diagrams = 0;
      document.querySelectorAll('section svg').forEach((svg) => {
        if (!svg.querySelector('text, foreignObject')) return;
        diagrams++;
        const section = svg.closest('section');
        const bucket = section?.classList.contains('sketch')
          && !section.classList.contains('sketch-clean-body') ? 'hand' : 'clean';
        svg.querySelectorAll('text, tspan, .nodeLabel, .edgeLabel, foreignObject span, foreignObject p')
          .forEach((el) => {
            if (!(el.textContent || '').trim()) return;
            const f = getComputedStyle(el).fontFamily.split(',')[0].replace(/["']/g, '').trim();
            faces[f] = (faces[f] || 0) + 1;
            byBucket[bucket][f] = (byBucket[bucket][f] || 0) + 1;
          });
      });
      return {
        diagrams,
        faces,
        byBucket,
        // A fence the runtime could not render leaves its <pre> in the error state and
        // grows a themed sibling. Either alone is a degraded diagram.
        errors: document.querySelectorAll('[data-mermaid-state="error"], .mermaid-error').length,
        // Fences the runtime never got to at all — still queued, or never claimed.
        unrendered: document.querySelectorAll('pre[data-mermaid-state="pending"], marp-pre[data-mermaid-state="pending"]').length,
      };
    });
  } finally {
    await browser.close();
  }
}

/** Assert the census is complete before reading anything out of it. */
function assertAllRendered(census, expected, label) {
  assert.equal(census.errors, 0,
    `${label}: ${census.errors} diagram(s) degraded to an error block in the preview. `
    + 'A dropped renderer registration looks exactly like this. Faces seen: '
    + JSON.stringify(census.faces));
  assert.equal(census.unrendered, 0, `${label}: ${census.unrendered} fence(s) never rendered`);
  assert.equal(census.diagrams, expected,
    `${label}: the deck has ${expected} mermaid fences but the preview produced `
    + `${census.diagrams} labeled diagrams. Counting only what rendered is how a missing `
    + 'family hides — assert the deck\'s own fence count.');
}

/** No label may wear a face the deck never asked for. */
function assertNoForeignFace(census, label) {
  const foreign = Object.entries(census.faces).filter(([f]) => NOT_A_DECK_FACE.test(f));
  assert.deepEqual(foreign, [],
    `${label}: the live preview rendered diagram text in a face the deck never asked for. `
    + 'The likely cause is a non-color token fetched through the reader\'s color-resolving '
    + '`read()` — see TEXT_VALUE_TOKENS in lib/runtime/index.js. Faces seen: '
    + JSON.stringify(census.faces));
  assert.ok(Object.values(census.faces).reduce((a, b) => a + b, 0) > 0,
    `${label}: zero labels censused — an empty census cannot fail the face check`);
}

/**
 * The four families whose type comes from their OWN config block. `mode: sketch` so the
 * expected face is the hand one; each fence is minimal on purpose — the question is the
 * FACE, not the diagram.
 */
const PER_BLOCK_DECK = `---
marp: true
theme: indaco
mode: sketch
---

<!-- _class: diagram -->

## Sequence

\`\`\`mermaid
sequenceDiagram
  participant Broker
  participant Router
  Broker->>Router: tender load
  Router-->>Broker: capacity quote
\`\`\`

---

<!-- _class: diagram -->

## Journey

\`\`\`mermaid
journey
  title Tender to delivery
  section Tender
    Quote requested: 4: Broker
    Capacity matched: 5: Router
  section Haul
    In transit: 3: Carrier
\`\`\`

---

<!-- _class: diagram -->

## Timeline

\`\`\`mermaid
timeline
  title Platform milestones
  2024 : Tender API
  2025 : Capacity router
  2026 : Settlement ledger
\`\`\`

---

<!-- _class: diagram -->

## C4 context

\`\`\`mermaid
C4Context
  title Freight platform context
  Person(broker, "Broker", "Tenders loads")
  System(platform, "Meridian", "Matches capacity")
  System_Ext(tms, "Carrier TMS", "Third-party")
  Rel(broker, platform, "Tenders")
  Rel(platform, tms, "Dispatches")
\`\`\`
`;

describe('preview diagram face', { skip: skipWithoutChrome(CHROME) }, () => {
  test('a sketch deck previews every diagram label in the hand face', { timeout: TIMEOUT }, async () => {
    const src = fs.readFileSync(path.join(ROOT, 'examples', 'mermaid-sketch-labels.md'), 'utf8');
    const census = await previewFaces(src, 'indaco');
    assertAllRendered(census, fenceCount(src), 'mode: sketch');
    assertNoForeignFace(census, 'mode: sketch');
    // Bucketed, because slide 8 of this deck is `_class: diagram boardroom` — the
    // per-slide opt-out. A flat "no Outfit anywhere" assertion would call that a defect.
    assert.deepEqual(Object.keys(census.byBucket.hand).sort(), ['Shantell Sans'],
      'every label on a sketch SLIDE previews in the hand face: '
      + JSON.stringify(census.byBucket));
    assert.deepEqual(Object.keys(census.byBucket.clean).sort(), ['Outfit'],
      'and the deck\'s `_class: diagram boardroom` opt-out slide previews clean — that '
      + 'per-slide escape hatch is half of what #1674 shipped: '
      + JSON.stringify(census.byBucket));
  });

  test('the four per-block font families preview in the hand face too', { timeout: TIMEOUT }, async () => {
    const census = await previewFaces(PER_BLOCK_DECK, 'indaco');
    assertAllRendered(census, fenceCount(PER_BLOCK_DECK), 'per-block families');
    assertNoForeignFace(census, 'per-block families');
    assert.deepEqual(Object.keys(census.byBucket.hand).sort(), ['Shantell Sans'],
      'c4 / journey / sequence / timeline take their type from their own config block, not '
      + 'the global themeVariable. A clean face here means perDiagramFonts stopped reaching '
      + 'one of them: ' + JSON.stringify(census.byBucket));
    assert.deepEqual(census.byBucket.clean, {}, 'every slide in this fixture is a sketch slide');
  });

  test('a sketch-clean deck previews every diagram label in the CLEAN face', { timeout: TIMEOUT }, async () => {
    const src = fs.readFileSync(path.join(ROOT, 'examples', 'mermaid-sketch-labels.md'), 'utf8')
      .replace(/^mode: sketch$/m, 'mode: sketch-clean');
    assert.ok(src.includes('mode: sketch-clean'), 'the fixture rewrite must take');
    const census = await previewFaces(src, 'indaco');
    assertAllRendered(census, fenceCount(src), 'mode: sketch-clean');
    assertNoForeignFace(census, 'mode: sketch-clean');
    assert.deepEqual(census.byBucket.hand, {},
      'a sketch-clean deck has no hand-TYPE slide — only the opted-out one is not clean-body');
    assert.deepEqual(Object.keys(census.byBucket.clean).sort(), ['Outfit'],
      'sketch-clean keeps the hand SHAPES and the CLEAN body face, so every label is Outfit. '
      + 'An empty --font-body (the :root-alias cycle, see the header) shows up here as '
      + 'Times New Roman: ' + JSON.stringify(census.byBucket));
  });

  test('the check is not vacuous — it can see a foreign face', () => {
    // The pattern is the whole test; assert it matches what it is meant to catch, so a
    // regex edit that quietly stops matching cannot make this suite green by accident.
    for (const face of ['Open Sans', 'trebuchet ms', 'sans-serif', 'Times New Roman']) {
      assert.ok(NOT_A_DECK_FACE.test(face), `${face} must count as a foreign face`);
    }
    for (const face of ['Shantell Sans', 'Outfit', 'JetBrains Mono', 'Caveat']) {
      assert.equal(NOT_A_DECK_FACE.test(face), false, `${face} is a deck face`);
    }
    // And the completeness half: an empty census must not read as clean.
    assert.throws(() => assertNoForeignFace({ faces: {} }, 'empty'), /zero labels censused/);
    assert.throws(() => assertAllRendered({ errors: 1, unrendered: 0, diagrams: 6, faces: {} }, 7, 'x'),
      /degraded to an error block/);
    assert.throws(() => assertAllRendered({ errors: 0, unrendered: 0, diagrams: 6, faces: {} }, 7, 'x'),
      /7 mermaid fences but the preview produced 6/);
  });
});
