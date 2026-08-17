# Probes for `2026-08-17-theme-css-is-a-preview-sink.md`

The verification behind that note's §2, §4 and §4b, committed so the claims are
**falsifiable**. A post-commit checker marked the pre/post numbers PLAUSIBLE rather than
reproduced, because the probes lived in `.scratch/` and `docs/dist` is gitignored — which
is a fair reading of HARD RULE #23: a claim that names a surface should carry something a
reader can re-run.

Every probe drives a **real Chromium** (`$CHROME_PATH`, 131.0.6778.204 when these were
taken). None of them is a unit test and none runs in CI — the equivalent invariants are
pinned in `test/unit/core/sanitize-style-text.test.js` and
`test/unit/tools/preview-style-sink-gate.test.js`, which do.

| file | question it answers |
|---|---|
| `probe-mechanism.mjs` | Which channel actually carries a theme description out of the frame's `<style>` — the CSS comment (`*/`) or the element terminator (`</style>`)? Needs no build; reproduces §2. |
| `probe-chain.mjs` | The full chain on the SHIPPED bundle: `serializeTheme` → `addThemes` → `ThemeStore.cssFor` → a preview `srcdoc`. Reproduces §4's PRE-FIX/POST-FIX table. |
| `probe-sink-guard.mjs` | The sink guard ALONE, on CSS that already carries the terminator — so the serializer's win cannot stand in for it. Reproduces §4's second table. |
| `chain-PRE-FIX.json`, `chain-POST-FIX.json`, `sink-guard.json` | The outputs as taken, for diffing against a re-run. |

## Re-running

`probe-mechanism.mjs` is self-contained:

```
node engineering/decisions/2026-08-17-theme-css-is-a-preview-sink/probe-mechanism.mjs
```

The other two need the built docs site served, because the point is to drive the shipped
bundle rather than the source:

```
cd docs && npm run build && cd ..
(cd docs/dist && npx http-server -p 4399 -s &)
node engineering/decisions/2026-08-17-theme-css-is-a-preview-sink/probe-chain.mjs POST-FIX
node engineering/decisions/2026-08-17-theme-css-is-a-preview-sink/probe-sink-guard.mjs
```

For the PRE-FIX leg, check out the parent commit, rebuild (`npm run theme-core:build` then
the docs build), and run `probe-chain.mjs PRE-FIX`. The paths in the probes are written
relative to the repo root, so run them from there.

**Read the numbers as orders, not digits.** The composed-sheet byte counts move with
`main` — what discriminates is the ratio between a truncated `<style>` (~2 KB) and an
intact one (~700 KB), plus the sentinel on `window.top`, which is boolean and is the only
thing either probe treats as proof.
