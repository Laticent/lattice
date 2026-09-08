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
- **Fixed: the forward pointer on a split page reads a math member as SYMBOLS, not as TeX source
  or as an equation.** KaTeX writes its content three times, and reading the wrong copy put a
  literal `\sigma →` and `X^\top X →` on a slide. The pointer now reads KaTeX's MathML mirror, so
  those are `σ →` and `X⊤X →`. A member that LEADS with an equation — a `derivation` row is
  `| equation | what you did |` — is labeled by its prose instead, so the step pages point at
  `take the limit →` rather than at 24 characters of run-together operators.
- **Fixed: a `cycle` or `hierarchy` run whose member has no readable name now still carries its
  wayfinding chip.** Both kinds returned nothing at all when they could not name the member, and
  nothing renders as no element — so a cycle could lose its closing `back to …` mark entirely,
  which is the one thing that tells a reader the run loops. They now name the direction instead of
  the member: `back to the start`, `governs the tier below`, `under the tier above`. `sequence` has
  always said `continues` in the same situation.
