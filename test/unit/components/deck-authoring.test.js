/**
 * Unit: deck-authoring contract — card-style layouts forbid the
 * inline `- **Title.** body` format in slide source.
 *
 * The bug: card-style layouts (cards-grid, cards-stack,
 * compare-prose, matrix-2x2,
 * verdict-grid, decision, citation-card) auto-bold the
 * top-level li via CSS. When an author writes
 *
 *   - **Title.** body text continues here
 *
 * the body text *after* the `<strong>Title.</strong>` element inherits
 * the parent li's font-weight:700 because no rule resets weight on
 * `li > *` (only on `li > ul > li` and similar nested-list selectors).
 * Result: every word reads as bold, the slide looks ransom-note,
 * cards lose their visual hierarchy.
 *
 * The contract (see lib/components/inventory/cards-grid/cards-grid.docs.md
 * and friends): use the nested-list shape:
 *
 *   - Title
 *     - body text continues here
 *
 * The top-level li carries ONLY the title; the nested li carries the
 * body. The CSS `li > ul > li` rule resets the body weight to 400.
 *
 * The validator helper `findInlineTitleBodyLine` in
 * lib/components/index.js already enforces this on `manifest.sample`
 * and `manifest.variantDocs[*].sample`. This test extends the same
 * check to:
 *   - every committed `examples/*.md` deck
 *   - every committed `lib/components/<bucket>/<bucket>.gallery.md`
 *     bucket-survey deck
 *   - every committed `lib/integrations/<i>/<i>.gallery.md` integration
 *     showcase deck
 *
 * The check is per-slide-class-aware: it only flags lines that appear
 * INSIDE a slide whose `<!-- _class: … -->` directive names a card-
 * style layout. The same line in a non-card-style slide is allowed.
 *
 * Adding a new card-style component? Add it to CARD_STYLE_LAYOUTS in
 * lib/components/index.js and this test picks it up automatically.
 */

const { describe, test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { componentCorpusRoots } = require('../../../lib/packages/fs.js');
const {
  CARD_STYLE_LAYOUTS,
  findInlineTitleBodyLine,
  findOrderedInlineTitleBodyLine,
} = require('../../../lib/components');

const ROOT = path.join(__dirname, '..', '..', '..');
const CARD_STYLE = new Set(CARD_STYLE_LAYOUTS);
const CLASS_DIRECTIVE = /<!--\s*_class:\s*([^>]+?)\s*-->/;

function walkMarkdown(dir, suffix, out = []) {
  if (!fs.existsSync(dir)) return out;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name.startsWith('.') || entry.name === 'node_modules') continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walkMarkdown(full, suffix, out);
    } else if (entry.name.endsWith(suffix)) {
      out.push(full);
    }
  }
  return out;
}

// Per-slide-class scan: walk the deck's slides, identify card-style
// slides, return an array of `{slideIdx, classToken, line}` offenses.
function scanDeck(absPath) {
  const text = fs.readFileSync(absPath, 'utf8');
  const slides = text.split(/^---$/m);
  const offenses = [];
  slides.forEach((slide, slideIdx) => {
    const m = slide.match(CLASS_DIRECTIVE);
    if (!m) return;
    const classes = m[1].split(/\s+/);
    const cardClasses = classes.filter((c) => CARD_STYLE.has(c));
    if (cardClasses.length === 0) return;
    const offending = findInlineTitleBodyLine(slide) || findOrderedInlineTitleBodyLine(slide);
    if (offending) {
      offenses.push({ slideIdx, classToken: cardClasses[0], line: offending });
    }
  });
  return offenses;
}

describe('deck-authoring contract', () => {
  const examples = walkMarkdown(path.join(ROOT, 'examples'), '.md');
  const bucketGalleries = [];
  const integrationGalleries = walkMarkdown(path.join(ROOT, 'lib', 'integrations'), '.gallery.md');
  // Per-bucket survey galleries live at lib/components/<bucket>/<bucket>.gallery.md
  const componentsRoot = path.join(ROOT, 'lib', 'components');
  if (fs.existsSync(componentsRoot)) {
    for (const entry of fs.readdirSync(componentsRoot, { withFileTypes: true })) {
      if (!entry.isDirectory() || entry.name.startsWith('_')) continue;
      const bucketGallery = path.join(componentsRoot, entry.name, `${entry.name}.gallery.md`);
      if (fs.existsSync(bucketGallery)) bucketGalleries.push(bucketGallery);
    }
  }
  // Per-component galleries — every <name>.gallery.md beneath a bucket, and every plugin kind's
  // (the chart kinds live in lib/plugins/chart-family/kinds/).
  const componentGalleries = componentCorpusRoots(componentsRoot).flatMap((r) => walkMarkdown(r, '.gallery.md'))
    .filter((p) => !bucketGalleries.includes(p));

  const allDecks = [...examples, ...bucketGalleries, ...integrationGalleries, ...componentGalleries];

  test('CARD_STYLE_LAYOUTS is non-empty (sanity)', () => {
    assert.ok(CARD_STYLE_LAYOUTS.length > 0, 'CARD_STYLE_LAYOUTS export is empty');
  });

  test(`found ${allDecks.length} markdown decks to scan (sanity)`, () => {
    assert.ok(allDecks.length > 0, 'no decks discovered — directory walk broken');
    assert.ok(componentGalleries.some((p) => p.endsWith(path.join('kinds', 'gantt', 'gantt.gallery.md'))), 'the gallery walk misses the plugin kinds (gantt)');
  });

  for (const deckPath of allDecks) {
    const rel = path.relative(ROOT, deckPath);
    test(`${rel}: no inline '- **Title.** body' on card-style slides`, () => {
      const offenses = scanDeck(deckPath);
      assert.equal(
        offenses.length,
        0,
        offenses.length === 0
          ? ''
          : `${rel} has ${offenses.length} card-style slide(s) using the inline format ` +
            `(body text inherits parent li's bold). Convert to nested-list shape:\n` +
            `  - Title\n    - body text\n\n` +
            `First offense: slide #${offenses[0].slideIdx} class=${offenses[0].classToken}\n` +
            `    ${offenses[0].line}\n\n` +
            `See lib/components/inventory/cards-grid/cards-grid.docs.md for the contract.`,
      );
    });
  }
});
