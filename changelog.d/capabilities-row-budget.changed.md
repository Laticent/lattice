- **`engineering/capabilities.md` is now budgeted per ROW and routed for `grep`, not for a
  top-to-bottom read.** HARD RULE #15 sends every "am I about to reinvent this?" question to
  that catalog, and it had grown past the size where reading it whole pays — so its own
  preamble now says to grep it and open the tool the row names, and `ROW_CAP` (600 characters,
  in `tools/build-capabilities.js`) fails both `capabilities:build` and `capabilities:check`
  on a row that has grown into an essay. A row owes what it does, when to reach for it, and
  the one gotcha that stops you misusing it; the mechanism and the history belong in the
  tool's own header, which is the file a reader opens next and has no cap.
- Eleven rows were over the budget and are trimmed, every one verified against its tool's
  header first so the detail moved rather than died. **The tail is what a grep pays for:** the
  widest row drops 341 → 156 tokens, `grep -i intent` 1,109 → 696, `grep -i contrast` 990 →
  757, and the file 13,847 → 13,001.
- **Two rows lost a search term in the first cut** — `contrast:palette-native` stopped
  matching `theme` and `export`, `equiv:check` stopped matching `render` — and both were
  rewritten to carry them again. Ten representative queries now return the same row counts
  they did before the trim: a cheaper index that cannot be found is not cheaper.
