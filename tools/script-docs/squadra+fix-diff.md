---
group: Lint & audit
---
The whole-deck fix diff (2026-10-26-squadra-lint-library design §15.3): "Fix all" through the Squadra driver against the old one-fix-per-pass loop, over the lint tests' own inputs, those inputs spliced into tracked decks, the tracked decks, and a fenced copy above each fixable line. Classifies every difference; exits 1 if no fix ran, a fixable finding is left on a live line, or a difference is unclassified. On demand, about 15 minutes (`--corpus` reuses a recording of the lint tests' inputs).
