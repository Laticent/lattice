- **Added: `lint:deck` says which tokens will read as glyphs.** A slash means a ratio, a
  rate, a date or an alternative, and nothing in `A/B`, `24/7`, `P/E`, `16:9` or `ID-4471`
  says which — so the normalizer deliberately has no rule, and guessing would make the voice
  state a fact the slide does not show. The deck lint now names each such token and shows the
  `lexicon:` line that fixes it, beside the acronym hint that already worked this way.
  Advisory, never blocking, and it goes quiet as soon as the author answers it. 56 distinct
  tokens across 35 of the 186 shipped decks.
- **Added: `tools/measure-token-narration.mjs`.** The boardroom token corpus the
  2026-09-20 narration audit's "19 raw of 52 → 9 of 59" came from was a scratch script, so
  neither number could be re-derived. It is committed now, grouped by the class that audit's
  own table names, and it separates deliberate passthroughs from gaps: 11 of 66 raw, 8
  deliberate, 3 unhandled.
