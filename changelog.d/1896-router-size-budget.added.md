- **Added: `CLAUDE.md` has a size budget, and `build:check` enforces it.** It is the one
  surface every session pays unconditionally — resident before any tool call — and it was
  the only file in the context-tiering system with no budget, because that system's rule was
  written for indexes. The ceiling is **16,500 `o200k_base` tokens** against 15,117 today.
- **The gate caps growth rather than demanding a trim.** #1897 measured the expensive thing
  as the read boundary, and `CLAUDE.md` is on the cheap side of it with zero reads, so both
  trimming options priced on #1896 convert resident text into an extra read. The failure
  message names that as the wrong fix so nobody re-derives it.
- **It measures tokens rather than a byte proxy, and the proxy is why.** The first version
  counted bytes against a ratio calibrated to 0.079% across four revisions of this one file —
  accurate, and unguardable: the composition check written to catch drift was broken in one
  attempt, understating the file by ~7% while staying green. `gpt-tokenizer` is now a root
  devDependency, costing 30 MB installed and ~200 ms on a ~6.2 s `check:ownership` run, both
  measured. The require sits inside the check so the test files that load
  `tools/check-ownership.js` at module scope do not pay for it.
