---
group: Lint & audit
---
Rewrite `test/oracle/player-contrast.json` from a fresh `contrast:player` sweep. Read the drift before blessing: rows the sweep reports as FIXED are why the baseline is stale and are the intended reason to re-bless, while a row that vanished because a deck failed to export is not. An absent baseline makes `contrast:player` exit 2 with an instruction rather than reporting the whole corpus as new.
