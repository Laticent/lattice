/**
 * structural-split.js — the structural auto-split as ONE preprocessor, for every surface.
 *
 * Auto-split fires on STRUCTURE (engineering/decisions/2026-09-01-autosplit-splits-on-structure.md):
 * a slide whose collection holds more than one member becomes COVER → BODY(one element each) →
 * CLOSING, decided from the markup alone. Nothing is measured, so the split is a pure function of
 * the rendered document string, and any surface that has that string can run it. The CLI export
 * always has. The Playground and the Studio render the same document in the browser and never
 * did, so a `size: portrait` deck paginated one way in its PDF and another in its live preview:
 * one tall page carrying every row, where the export had one row per page.
 *
 * This module is the preprocessor both call (HARD RULE #1): the CLI (lattice-emulator.js) and
 * the browser bundle (lib/playground/index.js → `splitForPreview`). It adds no splitting logic
 * of its own. The kernels are auto-split.js and fit-berth.js; this file owns only what the CLI
 * used to do inline around them, so the browser does it the same way:
 *
 *   · `splitTopLevelSections` / `stampSlideNumbers` — the engine emits no `data-lattice-slide`,
 *     and `splitDoc`, `stripDeckChrome` and `fitBerth.applyToDocHtml` all find the slides BY that
 *     attribute. Unstamped, the whole chain returns its input unchanged, silently.
 *   · `splitCapacityFrom` — the per-component capacity/recipe map `splitDoc` reads, projected from
 *     the component manifests. The CLI builds it from disk; the browser bundle bakes it in at
 *     build time (tools/build-playground.js), because the browser has no manifests to read.
 *   · `splitApplies` — the size gate. Splitting runs at `square`, `tall` and `strip`, never at
 *     `wide` (the 2026-09-01 note, "Scope: the size gate is unchanged").
 *   · `railRun` — the run-level adornments (deck chrome stripped from emitted pages, the carousel
 *     signal, the k-of-N rail, the re-berth), which the CLI applies after the split.
 *
 * Pure and fs-free: the browser bundle includes it.
 */
const { familyFor } = require('../adaptive/families');
const { splitDoc, applyRails, applyRelationshipSignals, stripDeckChrome, deckChromeFrom } = require('./auto-split');
const fitBerth = require('./fit-berth');
const { splitSections } = require('./split-sections');

// One `<section>` string per top-level slide, walked by the shared quote-aware kernel
// (lib/core/split-sections.js, HARD RULE #1) — the same walk lattice-emulator.js's
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
      const open = /\sdata-lattice-slide=/i.test(p.openTag)
        ? p.openTag
        : p.openTag.replace(/^<section\b/i, `<section data-lattice-slide="${first + n - 1}"`);
      return `${open}${p.inner}${p.close}`;
    })
    .join('');
}

// The capacity/recipe map `splitDoc` reads, one entry per component that declares a capacity axis
// or a split recipe. Moved here from lattice-emulator.js unchanged, so the CLI and the browser
// bundle project the manifests identically.
//   · A layout joins the registry if it can paginate (has a capacity axis) OR declares a carousel
//     `split` recipe (read-across re-authored as a sequence).
//   · `perPage` is the AUTHORED split pacing: how many members ride one page of a run (1 for a
//     heavy member that atomizes). Distinct from `sweet`, which is authoring comfort;
//     auto-split.js `splitTargetOf` prefers it and falls back to sweet → soft → hard.
//   · `relationship` is the CONNECTED-MEMBER kind; the kernel needs it to derive each page's
//     "→ next / ↻ back to / governs ↓ / Option N of M" adornment.
// This projection is a hand-listed WHITELIST: a capacity field absent here reaches the kernel as
// `undefined` and the feature is a SILENT no-op (the manifests declared it, every unit test passed,
// and the real render emitted nothing, caught only by looking at the render).
function splitCapacityFrom(manifests) {
  const map = {};
  for (const m of manifests || []) {
    const axis = m.capacity?.axis ?? m.adapt?.capacity?.axis;
    if (axis || m.split) {
      map[m.name] = {
        axis: axis ?? null,
        hard: m.capacity?.hard ?? null,
        sweet: m.capacity?.sweet ?? null,
        soft: m.capacity?.soft ?? null,
        perPage: m.capacity?.perPage ?? null,
        relationship: m.capacity?.relationship ?? null,
        split: m.split ?? null,
      };
    }
  }
  return map;
}

// The size gate: split everywhere but the `wide` family. A box with no usable dimensions is read
// as 16:9, which is wide, so it never splits. The `Number.isFinite` guard is load-bearing:
// `familyFor(NaN)` falls through every band and returns 'strip', which WOULD split.
function splitApplies(width, height) {
  const w = Number(width);
  const h = Number(height);
  return familyFor(Number.isFinite(w) && Number.isFinite(h) && h > 0 ? w / h : 16 / 9) !== 'wide';
}

// The run-level adornments, in the CLI's order.
function railRun(docHtml, deckSource, capacity) {
  return fitBerth.applyToDocHtml(
    applyRails(applyRelationshipSignals(stripDeckChrome(docHtml, deckChromeFrom(deckSource)), capacity)),
  );
}

/**
 * The whole preprocessor: stamp, gate, split, adorn.
 *
 * @param {string} docHtml   the engine's rendered document (`<article class="lattice">…`)
 * @param {object} o
 * @param {string} o.deckSource  the deck markdown, front matter included (for the deck chrome)
 * @param {number} o.width       the rendered slide box, px
 * @param {number} o.height
 * @param {object} o.capacity    `splitCapacityFrom(manifests)`
 * @param {number} [o.firstSlide=1] the deck number of the first section (see stampSlideNumbers)
 * @returns {{ html: string, changed: number, applies: boolean }} `changed` is the count of authored
 *   slides split; `applies` says whether this box can split at all (the size gate), which a live
 *   host needs to know about a slide that happens not to split.
 */
function structuralSplit(docHtml, { deckSource = '', width, height, capacity, firstSlide = 1 } = {}) {
  const stamped = stampSlideNumbers(docHtml, firstSlide);
  if (!capacity || !Object.keys(capacity).length || !splitApplies(width, height)) {
    return { html: stamped, changed: 0, applies: false };
  }
  const r = splitDoc(stamped, capacity);
  const split = r.changed ? r.html : stamped;
  return { html: railRun(split, deckSource, capacity), changed: r.changed || 0, applies: true };
}

module.exports = { splitTopLevelSections, stampSlideNumbers, splitCapacityFrom, splitApplies, railRun, structuralSplit };
