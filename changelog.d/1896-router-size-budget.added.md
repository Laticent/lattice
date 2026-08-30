- **Added: `CLAUDE.md` has a size budget, and `build:check` enforces it.** It is the one
  surface every session pays unconditionally — resident before any tool call — and it was
  the only file in the context-tiering system with no budget, because that system's rule
  was written for indexes. The ceiling is 64,500 bytes, about 16,510 `o200k_base` tokens
  against today's 58,760 / 15,041.
- **The gate caps growth rather than demanding a trim.** #1897 measured the expensive thing
  as the read boundary, and `CLAUDE.md` is on the cheap side of it with zero reads, so both
  trimming options priced on #1896 convert resident text into an extra read. The failure
  message says so and names that as the wrong fix.
- **It measures bytes, and the substitution is guarded.** No tokenizer is a repo dependency
  and the tiering note keeps it that way; `ROW_CAP` already gates a token-motivated budget
  with characters, twice. The calibration is 3.907 bytes/token measured on this one file
  across five revisions, spread 0.08%, and `test/unit/tools/router-budget.test.js` fails if
  the file's composition drifts far enough for the byte number to stop meaning the token
  number.
