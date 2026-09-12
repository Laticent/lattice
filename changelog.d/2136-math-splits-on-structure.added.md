- **Added: `math` slides split on their STRUCTURE at square, portrait, story and mobile.** Eight
  variants render four structures, so there are four preprocessors, not eight: equation+legend
  (bare, `feature`, `matrix`, `decompose`) and the `derivation` step table paginate through the
  shared cover kernel with the equation and the table header repeating on every page, while
  `theorem`'s Definition/Theorem/Proof cards and `compare`'s labeled columns get one member per
  page. `stats` and `canvas` are fixed scaffolds with no repeating collection and keep the whole
  slide. 16:9 renders are unchanged — the split has never applied there.
- **Added: a display equation too long for the slide is now BROKEN ACROSS LINES before it is
  typeset.** `$$…$$` past a length budget is re-emitted as an `aligned` block, split at its
  top-level relation and, where the operators live inside a bracket, inside that bracket. The
  logistic log-likelihood on `math feature` measured 2587px of ink against a 972px portrait
  stage; broken and set at the new multi-line display scale it measures 925px. An author's own
  `\\` or any `\begin{…}` environment is left exactly as written, and a rewrite KaTeX cannot
  parse falls back to the source.
- **Fixed: the forward pointer on a split page never prints TeX source, an equation, or a glyph
  the deck cannot set.** KaTeX writes its content three times and the pointer read the wrong copy,
  putting a literal `\sigma →` and `X^\top X →` on a slide. It reads KaTeX's MathML mirror now.
  Three rules then decide what a NAME is, and every path — including the one the splitter stamps
  itself — goes through the same one: a member that LEADS with an equation is labeled by the prose
  beside it (a `derivation` row is `| equation | what you did |`, so its step pages point at
  `take the limit →`); a leading SYMBOL the deck's text face cannot set hands the name over the
  same way (`- $\sigma$ — the logistic link` points at `the logistic link →`, not at a `σ` that
  falls back to a different font — or, on a machine with no fallback, to a hollow box); and a
  member whose math cannot be spared degrades to the un-labeled `continues →` rather than printing
  a shape glyph beside the engine-drawn one.
- **Fixed: a `cycle` or `hierarchy` run whose member has no readable name now still carries its
  wayfinding chip.** Both kinds returned nothing at all when they could not name the member, and
  nothing renders as no element — so a cycle could lose its closing `back to …` mark entirely,
  which is the one thing that tells a reader the run loops. They now name the direction instead of
  the member: `back to the start`, `governs the tier below`, `under the tier above`. `sequence` has
  always said `continues` in the same situation.
