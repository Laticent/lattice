# lib/tokens — the token-rename crosswalk

`crosswalk.js`: the permanent old→new token rename table (`PAIRS`) plus
pure `flip()` / `flipTheme()` string transforms.

The migration to universal role-based names is COMPLETE — live source
carries only new names (HARD RULE #11). This module remains as (a) the
historical record, (b) a forward shim for legacy-authored decks users
paste, and (c) the gate's source of retired names
(`tools/check-ownership.js`).

**Gotcha:** some tokens are deliberately never renamed (`--pass/warn/fail`,
the chart triad, `--bg`/`--bg-alt`/`--border`) — do not "complete" the map
with them.
