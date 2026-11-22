/**
 * split-gate.js — the light half of the structural split: the section walk, the slide stamp and the size gate.
 *
 * Every live render needs these (a preview stamps each slide with its number whether or not it splits, and asks
 * whether its box can split at all). The splitter itself (auto-split.js, carousel.js and the capacity table) is only
 * needed at a size that paginates, so the browser engine loads it with `import()` and keeps these here, in its boot
 * closure (route budget, 2026-11-22). structural-split.js re-exports all three, so the CLI and the tests read them
 * where they always did. Pure and fs-free.
 */
const { familyFor } = require('../adaptive/families');
const { paginates } = require('@laticent/fluido');
const { splitSections } = require('@laticent/markup');

// One `<section>` string per top-level slide, walked by the shared quote-aware kernel
// (docs/src/lib/markup/sections.ts, HARD RULE #1) — the same walk lattice.js's
// `topLevelSectionStrings` uses, which reads a comment, a <style>/<script> body and a quoted
// attribute as TEXT. A private regex walk here would miscount a `<section` quoted in any of them,
// the defect #2329 removed from the emulator.
function splitTopLevelSections(latticeHtml) {
  return splitSections(String(latticeHtml ?? ''))
    .filter((p) => p.type === 'section')
    .map((p) => `${p.openTag}${p.inner}</section>`);
}

// Stamp each TOP-LEVEL section with its 1-based `data-lattice-slide`, exactly the attribute the
// CLI adds in `engineSlides`. A section that already carries one is left alone, so re-running
// this is a no-op. Everything between the top-level sections (the `<article>` wrapper) and each
// section's own close tag is kept byte for byte. `first` is the number the first section takes:
// 1 for a whole deck, and the slide's real deck position when a surface renders ONE slide of a
// deck (the Studio preview), so its split run is numbered 2 · 2.2 · 2.3 rather than 1 · 1.2 · 1.3.
function stampSlideNumbers(latticeHtml, first = 1) {
  let n = 0;
  return splitSections(String(latticeHtml ?? ''))
    .map((p) => {
      if (p.type !== 'section') return p.text;
      n++;
      // A REAL attribute only: blank the quoted values first. A front-matter `header:`, `footer:` or
      // `class:` value lands in this tag as escaped attribute text, and one that merely MENTIONS
      // `data-lattice-slide=` used to read as already stamped, so no slide got its number and the
      // split numbering (2 · 2.2 · 2.3) the Studio's page pick relies on was gone.
      const open = /\sdata-lattice-slide=/i.test(p.openTag.replace(/"[^"]*"|'[^']*'/g, '""'))
        ? p.openTag
        : p.openTag.replace(/^<section\b/i, `<section data-lattice-slide="${first + n - 1}"`);
      return `${open}${p.inner}${p.close}`;
    })
    .join('');
}

// The size gate: split everywhere but the `wide` family. A box with no usable dimensions is read
// as 16:9, which is wide, so it never splits. The `Number.isFinite` guard is load-bearing:
// `familyFor(NaN)` falls through every band and returns 'strip', which WOULD split.
function splitApplies(width, height) {
  const w = Number(width);
  const h = Number(height);
  return paginates(familyFor(Number.isFinite(w) && Number.isFinite(h) && h > 0 ? w / h : 16 / 9));
}

// Can a slide in this render give its coda a page of its own? A chart or diagram slide on a square, tall or strip page
// moves its key insight to the run's closing page under the measured split (fit-measure.js `insightCrowds`), but the
// structural split never cuts such a slide, so a host that measured only after a structural cut never measured it and
// its preview kept the insight while the PDF moved it (checker, 2026-11-22). True when the render holds a coda cell and a
// figure (a drawn `<svg>` or a fitted diagram); the measure decides the rest. A cheap string test: no parse.
function codaMayMove(html) {
  const s = String(html ?? '');
  return s.includes('class="cell-coda"') && (s.includes('<svg') || s.includes(' data-fit-k'));
}

module.exports = { splitTopLevelSections, stampSlideNumbers, splitApplies, codaMayMove };
