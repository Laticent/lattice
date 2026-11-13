---
group: Lint & audit
---
The reference diff of the lint-core rewrite (2026-11-13-squadra-replaces-lint-core §6): the frozen lint-core (tools/squadra/reference/) and the new `deck` ruleset (`lintDeck`) over the lint tests' own inputs, those inputs spliced into tracked decks, and the tracked decks, compared on rule, severity, slide, message and line. Held on the rules the ruleset defines; every difference must be fixed or listed in tools/squadra/reference/explained.json. `--fix` adds the Fix-all diff. Exits 1 on an unexplained or stale difference, or when the reference found nothing. On demand, several minutes (`--corpus` reuses a recording of the lint tests' inputs).
