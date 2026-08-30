- **`engineering/capabilities.md` is now routed for `grep`, not for a top-to-bottom read.**
  HARD RULE #15 sends every "am I about to reinvent this?" question to that catalog, and it had
  grown past the size where reading it whole pays — so its preamble, `CLAUDE.md`'s routing row
  and `AGENTS.md` all now say to grep it and open the tool the row names. No row cap gets the
  file under the 10k read-whole budget (a 30-token cap does, by truncating 121 of 320 rows
  against a median of 27 — a list of names, not an index), so the access mode is the fix.
- **`ROW_CAP` (`tools/build-capabilities.js`) is a ratchet pinned at the widest live row**,
  failing both `capabilities:build` and `capabilities:check`. It stops a row growing past the
  worst that exists; it does not ask anyone to delete anything.
- **This shipped first as a TRIM and was reverted, which is the useful part.** Eleven rows were
  cut into a 600-character cap, validated by ten probe queries that all came back identical.
  A word-set diff then found **~130 distinct words had stopped matching anywhere in the file** —
  among them `permission`, `wink-nlp`, `cascade`, `retired` and `classifier`. `grep -i permission`
  had returned the measured finding that `--allowed-tools Read` overrides a sandbox's
  working-directory refusal: a reinvention hazard, which is exactly what #15 exists to prevent.
  The eleven rows are restored verbatim and the word-set diff against `main` is now zero. Lowering
  the ratchet needs a per-row recall check, not a probe list.
- **Fixed: a tool whose header begins with an `import` rendered that import as its description.**
  `tools/diagram-oracle.mjs`'s row read `import { execFileSync } from 'node:child_process';`
  instead of naming the byte oracle it is. A row that describes nothing is invisible to every grep
  but one carrying its own filename — harmless under a read-whole index, a hole under grep-first.
