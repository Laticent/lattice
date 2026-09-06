- **Breaking:** the page can no longer buy itself a place in the export's promise. Round 11 required
  a section to be "numbered by the render" before it counted — but that flag was read from the DOM,
  so one `setAttribute('data-authored-slide', '0')` on a cloned empty section satisfied it, and every
  other check with it. Measured: `brief — 3 of 5 slides ship`, a five-page PDF blank at exactly the
  withheld positions, exit 0 — and the same through PNG, PPTX and the image set. The promise is now
  counted off `cleanDocHtml`, the engine's render after the auto-split and rails passes, assembled in
  Node where no script in the page can reach it. Three rounds added conditions to a DOM count; the
  correction was to stop counting the DOM.
- **Breaking:** `lexicon:` is pruned. It is the third block `parseNarrationFrontMatter` returns and
  the only one the projection never touched — and a lexicon key is a word taken off a slide, so it is
  withheld-slide content by construction. A codename written on exactly one slide, that slide
  withheld, came back verbatim out of a `--lens brief --embed-source` PDF, out of the player envelope,
  and out of the manifest's `config` echo, at exit 0, with `--strip-notes --strip-captions` both on.
- **Breaking:** a narration block written in a form the prune cannot read is refused rather than
  shipped whole. Four legal YAML spellings reached neither branch — a multi-line flow map, a map with
  a trailing comment, a quoted `"captions":` key, and a header with a comment after the colon. The
  fix is not a third parser for the same grammar: it fails closed and names the two forms that work.
  Zero of the 13 example decks carrying one of these keys are affected.
- A dropped acronym entry takes its children with it. The registry's block-object form — a bare
  `TERM:` header with indented `expansion:` / `definition:` lines — had only its header removed, so
  the withheld definition re-parented under the previous surviving term and shipped attributed to IT:
  `EBITDA  SECRETDEF we expect to lose the suit.` on the glossary page, beside a run reporting that it
  had dropped ACME. That is the same re-parenting defect fixed in `pruneCaptions` one commit earlier,
  written straight back into its sibling.
- The prune's oracle is everything the recipient gets, not only the slide bodies. A term named in a
  caption that SURVIVES is a term they will hear, and pruning its say-as left the narration
  mispronouncing a word the author had taught it.
- Two dynamic `RegExp`s built from input are gone — the acronym match (author front matter) and the
  PNG-sequence count (the output path). Both are string scans now: no pattern is ever compiled from
  data, which is the argument `docs/src/lib/lente/tags.ts` already makes for its own scanning.
