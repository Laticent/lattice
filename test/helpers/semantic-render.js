/**
 * semantic-render — render a component example through the REAL emulator and
 * hand the resulting slide HTML to a headless browser for assertion.
 *
 * This is the foundation of the per-component SEMANTIC-INVARIANT suite — the
 * deterministic, machine-independent successor to pixel-golden comparison (P4
 * pivot; see engineering/decisions/2026-06-12-p4-regression-gate-retire-marp.md
 * §0). Instead of "do these pixels match a blessed PNG" (flaky across CI runners,
 * measures change not correctness), each component asserts on the MEANING of its
 * rendered DOM: required slots resolve, contrast passes, nothing overflows.
 *
 * WHY render through the emulator (not lib/engine directly): lib/engine's `css`
 * field is a stub — it emits the HTML contract but not the production cascade
 * (palette `@import`s, the marp scaffold, embedded fonts). Re-assembling that in a
 * test would duplicate a render kernel and invite drift (HARD RULE 1). The
 * emulator already writes a complete, production-faithful HTML document as a
 * sidecar next to its PDF, and test/helpers/render.js caches it by a content hash
 * of every render input — so we reuse that exact artifact. Same DOM + same CSS the
 * shipped `lattice` CLI produces.
 *
 * Determinism: computed styles, selector matches, and the overflow flag are
 * logical facts of the laid-out DOM (given the same Chromium + the emulator's
 * embedded fonts) — they do NOT carry the sub-pixel anti-aliasing that made the
 * pixel gate flake across machine classes.
 */

const fs = require('fs');
const path = require('path');
const { runEmulator } = require('./render');

const ROOT = path.join(__dirname, '..', '..');
// Stable per-(component,palette) deck paths so runEmulator's content-hash cache
// keys deterministically (a random tmp name would miss the cache every run).
const DECK_DIR = path.join(ROOT, '.scratch', 'invariant-decks');

/**
 * Wrap a component manifest's `sample` (a complete `<!-- _class: X -->` slide) in
 * the minimal marp front-matter the emulator expects → a one-slide deck.
 *
 * `form` is ON, matching the deck-wide default (2026-06-26) — and it is NOT a free
 * choice. It used to be pinned OFF here, on the reasoning that form composes a
 * masthead band / bay / rail AROUND the component, so whether that chrome overflows
 * is a deck-authoring concern rather than a component invariant. That reasoning was
 * right about the chrome and wrong about the consequence: `mastheadLift` is also what
 * wraps a slide's body into the frame's `.cell-stage` cell, and every STAGE_MIGRATED
 * component keys its ENTIRE layout off `section.X > .cell-stage > …`. With form off
 * those selectors match nothing, so the component has no layout — its list falls back
 * to `display: block` and stacks. The suite was asserting "this component fits" against
 * an unstyled stack: logo-wall's eight marks measured 547px tall as a vertical list
 * where the real component tiles them into a 400px flex wall with 90px to spare.
 *
 * That made the overflow assertion meaningless for exactly the components most likely
 * to overflow, and it hid the failure until an engine change moved every box by 11%
 * (2026-07-30-slide-geometry-emitted-not-measured.md §4). Rendering the way every real
 * deck renders is the only configuration in which the assertion measures the component.
 */
function deckFromSample(sample, { palette = 'indaco' } = {}) {
  return `---\nmarp: true\ntheme: ${palette}\nform: on\n---\n\n${String(sample).trim()}\n`;
}

/**
 * Render a deck through the cached emulator and return the path to the emulator's
 * production HTML sidecar (the `.html` it writes next to its `.pdf`).
 *   markdown — a full deck (front-matter + slides), e.g. from deckFromSample()
 *   key      — stable slug (the component name) → stable cache key
 */
function renderHtml(markdown, { palette = 'indaco', key = 'deck', timeout = 600000 } = {}) {
  fs.mkdirSync(DECK_DIR, { recursive: true });
  const slug = String(key).replace(/[^a-z0-9]+/gi, '_');
  const mdPath = path.join(DECK_DIR, `${slug}.${palette}.md`);
  fs.writeFileSync(mdPath, markdown);
  const pdf = runEmulator(mdPath, { palette, timeout });
  const html = pdf.replace(/\.pdf$/, '.html');
  if (!fs.existsSync(html)) {
    throw new Error(`semantic-render: emulator HTML sidecar missing for ${slug}: ${html}`);
  }
  return html;
}

module.exports = { deckFromSample, renderHtml, ROOT, DECK_DIR };
