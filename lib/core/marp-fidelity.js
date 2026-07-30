/**
 * THE FIDELITY LEDGER — what a Marp render of an exported deck does and does not
 * reproduce, one entry per engine-only transform.
 *
 * WHY A LEDGER AND NOT PROSE. Every defect in #1256 was the same defect: a
 * structural transform that exists ONLY as a markdown-it plugin, on a route where
 * marp-core never runs our plugins. Three of them (premise, matrix-grid cells, the
 * glossary slide) had silently had no counterpart for months, and the export's own
 * README promised fidelity it did not have. Fixing the three instances does not
 * stop the fourth: nothing forces a new plugin to declare whether the export
 * covers it.
 *
 * So the classification is DATA, and two things read it:
 *   - `test/unit/core/marp-fidelity.test.js` — the gate. Every markdown-it plugin in
 *     lib/integrations/markdown-it/plugins.js must appear here, every entry must
 *     still exist there, every registry transformer must keep its DOM adapter, and
 *     every claim of coverage must point at code that really exists.
 *   - the generated bundle README (lib/core/marp-bundle.js) — it prints the
 *     `unmirrored` rows, so what a recipient is told matches what the repo knows.
 *     A gap can't be quietly dropped from the docs while staying in the code.
 *
 * WHAT THE GATE DOES NOT COVER, stated plainly, because an overclaimed gate is
 * worse than a narrow one: it reads ONE file. A rule-registering plugin defined in
 * `lib/engine/**`, and the engine's HTML-stage post-processors
 * (`applyFormToggleToHtml`, `applyBackdropToHtml`, `applyDeckLogoToHtml`,
 * `metaTile.applyToHtml`, `svgA11yNames.applyToHtml`) are engine-only too and carry
 * no row. Nor does the vocabulary have a word for a divergence the OTHER way — the
 * runtime doing something the engine does not. `form: off` was exactly that until
 * the front matter reached the DOM, and it was found by inversion, not by this
 * gate. Widen the enumeration when the next one turns up; don't read the current
 * green as coverage of everything.
 *
 * COVERAGE VOCABULARY — four values, and the difference between them is WHERE the
 * work happens:
 *   `baked`      the export rewrites the SOURCE, so plain Marp needs no plugin.
 *   `mirrored`   the browser runtime redoes it on the live DOM (`via` names the
 *                symbol in lib/runtime/index.js).
 *   `unmirrored` it does not happen on a Marp render. `note` says what the
 *                recipient actually sees — that sentence ships in the README.
 *   `moot`       nothing to reproduce on this route.
 *
 * Every `unmirrored` note here was observed on a real marp-cli render of an
 * exported bundle, not inferred from the code (HARD RULE #23).
 */

const LEDGER = Object.freeze([
  {
    plugin: 'headingSplit',
    what: 'slide boundaries computed from headings (`split: headings`)',
    coverage: 'baked',
    via: 'bakeSplits',
  },
  {
    plugin: 'focusSteps',
    what: 'a `_focusSteps` slide — one cloned slide per step',
    coverage: 'unmirrored',
    note: 'stays one slide; the directive rides along as an inert comment',
  },
  {
    plugin: 'deckClassPropagate',
    what: 'deck-wide `class:` / `color-mode:` / finish / mode / claim / spectrum registers',
    coverage: 'mirrored',
    via: 'applyDeckClassFromFrontMatter',
  },
  {
    plugin: 'verdictGridBadges',
    what: 'verdict-grid pass/warn/fail badges',
    coverage: 'mirrored',
    via: 'transformVerdictGridBadges',
  },
  {
    plugin: 'obligationMatrixBadges',
    what: 'obligation-matrix state badges',
    coverage: 'mirrored',
    via: 'transformObligationMatrixBadges',
  },
  {
    plugin: 'matrixGridCells',
    what: 'matrix-grid `[x]` / `[-]` / `[ ]` swatch cells',
    coverage: 'mirrored',
    via: 'matrixGridCells.applyToDom',
  },
  {
    plugin: 'checklistItemStates',
    what: 'checklist item state marks',
    coverage: 'mirrored',
    via: 'transformChecklistItemStates',
  },
  {
    plugin: 'slotLabelLift',
    what: 'the corner slot label on card-style layouts',
    coverage: 'mirrored',
    via: 'transformSlotLabels',
  },
  {
    plugin: 'glossaryListToTable',
    what: "the glossary slide's list → two-column table",
    coverage: 'mirrored',
    via: 'glossarySlide.applyToDom',
  },
  {
    plugin: 'glossaryRange',
    what: "the glossary slide's `A – N` range pill",
    coverage: 'mirrored',
    via: 'glossarySlide.applyToDom',
  },
  {
    plugin: 'stripHeadingPeriods',
    what: 'a `no-period` heading — the trailing period removed',
    coverage: 'unmirrored',
    note: 'the period the author typed stays visible',
  },
  {
    plugin: 'addHeadingPeriods',
    what: 'a `with-period` heading — a trailing period added',
    coverage: 'unmirrored',
    note: 'no period is added',
  },
  {
    plugin: 'functionPlotFences',
    what: 'a `functionplot` fence — the plotted SVG',
    coverage: 'unmirrored',
    note: 'renders as a code block showing its JSON config',
  },
  {
    plugin: 'animaSceneFences',
    what: 'an `anima` fence — the composed scene',
    coverage: 'unmirrored',
    note: 'renders as a code block showing its JSON scene',
  },
  {
    plugin: 'registerMermaidHljs',
    what: 'syntax highlighting for an unrendered `mermaid` fence',
    coverage: 'moot',
    note: 'The bundled runtime renders the diagram itself, so there is no '
      + 'unrendered fence left to highlight.',
  },
  // Not plugins — the two gaps that are a difference in HOW something renders
  // rather than WHETHER it does. Neither has a markdown-it plugin to key on, which
  // is itself the honest reason the gate above cannot be read as a class-wide net.
  {
    topic: 'imagery-bucket background images',
    what: 'an `image` slide\'s `![bg]` — the image as a panel, the prose in a text column',
    coverage: 'unmirrored',
    note: 'Marp uses its OWN advanced-background machinery instead, so the image goes '
      + 'full-bleed and the prose sits on top of it UNSCRIMMED — a heading over a bright '
      + 'area can be unreadable. This one does not degrade gracefully; prefer a plain '
      + 'layout for slides you expect to be rendered by Marp',
  },
  {
    topic: 'math typesetting',
    what: 'display + inline math',
    coverage: 'unmirrored',
    note: 'typesets with MathJax, not the KaTeX Lattice uses — correct, but with '
      + 'different metrics and fonts',
  },
]);

/** The gaps a recipient will actually notice, in ledger order. */
function unmirroredEntries() {
  return LEDGER.filter((e) => e.coverage === 'unmirrored');
}

/**
 * The `unmirrored` rows as a markdown TABLE — the single source for what the
 * bundle tells a recipient is missing. Two columns, because the pair "what you
 * authored" / "what you get" is the only thing a recipient needs to read.
 */
function fidelityNotes() {
  return [
    '| What you authored | What a Marp render gives you |',
    '|---|---|',
    ...unmirroredEntries().map((e) => `| ${e.what} | ${e.note} |`),
  ];
}

module.exports = { LEDGER, unmirroredEntries, fidelityNotes };
