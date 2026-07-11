---
status: shipped
summary: `npm run lint:fix` (biome check --write) auto-fixes 13 files (17 edits) and skips 80 unsafe suggestions — and it is NOT the mechanical import-order sweep it was assumed to be (biome has no organizeImports assist configured). An adversarial trio verified the real hazard: applying the sweep BREAKS `npm test`, because a biome-"safe" `noPrototypeBuiltins` fix rewrites `lib/core/present-transport.mjs`, which is inlined VERBATIM into the HTML-player export — changing the exported bytes and failing a frozen-artifact golden test. That is an export-sign-off change, not cosmetics. The bulk `noRedundantUseStrict` removals are, by contrast, verified behavior-neutral for the current CommonJS files (full suite + construct audit) yet still force a `dist` rebuild because those files are inlined into generated bundles. Deliberately NOT swept into any feature PR (HARD RULE #8/#17/#18); logged here with what a real cleanup must decide first.
---

# Biome safe-fix backlog — why `lint:fix` is not a free "hygiene sweep"

**Date:** 2026-07-11

## Symptom

Running `npm run lint:fix` (`biome check --write`) reports it "Fixed 13 files"
and skips 80 suggested (unsafe) fixes. It is tempting to treat this as a cheap,
mechanical hygiene sweep — an import-order pass or similar — and fold it into a
feature branch. It is neither cheap nor mechanical: applying it blind **turns
`npm test` red** (see reason 1 below), and it does not belong in any feature PR
regardless (HARD RULE #8/#17/#18). This note records what the fixes actually are
so the next person doesn't re-make that assumption.

The claims below were checked by an adversarial trio (red team + inversion +
independent checker), each running the experiments; the two load-bearing findings
(the export-golden break, and that the `'use strict'` removals are behavior-neutral
here) were reproduced independently.

## What the fixes actually are

Rule breakdown from `biome check` (safe = applied by `--write`; suggested = skipped):

| Rule | Count | Safe? | Notes |
|---|---|---|---|
| `complexity/useOptionalChain` | 55 | suggested | `--write` does NOT apply these; needs `--unsafe`. |
| `suspicious/noRedundantUseStrict` | 10 | "safe" | Removes `'use strict'`. See caveat below. |
| `style/noNonNullAssertion` | 9 | suggested | Not applied. |
| `complexity/useLiteralKeys` | 9 | suggested | Not applied. |
| `complexity/useArrowFunction` | 4 | safe | Real code change (function-expression → arrow). |
| `suspicious/noPrototypeBuiltins` | 2 | safe | `hasOwnProperty` → `Object.hasOwn`. |
| `correctness/noUnusedVariables` | 2 | suggested | Not applied. |
| `style/useConst` | 1 | safe | `let` → `const`. |

So the *bulk* of the auto-applied change (10 of 17 edits, across 10 files — in 9
of them it is the only edit; `tier-filter.js` also gets an `Object.hasOwn`) is
`noRedundantUseStrict`.

## Why this isn't a safe mechanical sweep

1. **The real blocker: a biome-"safe" fix changes an EXPORTED artifact's bytes
   and fails a frozen golden.** Applying the full sweep makes `npm test` go
   **3350 pass / 1 fail** — `the assembled player is byte-for-byte stable
   (frozen-artifact golden)` (`test/unit/export/html-player.test.js`). Root cause:
   `noPrototypeBuiltins` rewrites `Object.prototype.hasOwnProperty.call` →
   `Object.hasOwn` in `lib/core/present-transport.mjs`, and that file is inlined
   **VERBATIM** into the exported HTML player (`lib/export/player-core.mjs` imports
   and inlines it). The rewrite (plus its double-space artifact) shifts the
   player's frozen SHA. This is a change to the **bytes of an exported artifact** —
   an export-sign-off concern (QUALITY BAR), not a cosmetic nit — and it is the
   single strongest reason `--write` cannot be folded anywhere blind. Reverting
   just `present-transport.mjs` turns the suite green again.

2. **The `'use strict'` removals are behavior-neutral here — but not free.**
   Contrary to the first read of this note, removing the directive from these 10
   files is **verified not a semantic change** for the current code: applied
   alone, the full suite is **3351/3351 green**, and a construct audit of all 10
   files finds none of the forms where strict and sloppy diverge (no `with`, no
   octal literals, no `eval`, no bare `delete`, no executable bare-call `this`,
   only reassignments to pre-declared locals). The logical reason: these files
   already ship *under* `'use strict'` and pass, so strict is catching nothing —
   removing it can therefore swallow nothing. (The residual risk is only a
   *future* edit that adds an undeclared-binding assignment; that is a
   forward-looking hazard, not a property of this change.) The catch is that
   `notes-core.js` and `tier-filter.js` are inlined into generated docs bundles,
   so even the strict-only subset makes `npm run build:check` report stale
   `lattice-emulator` / `authoring-core` / `exemplar-core` bundles — it forces a
   `npm run build` regen (HARD RULE #2). So it is safe, but not a zero-touch fold.

3. **The formatter is disabled, so every fix lands un-formatted.** `biome.json`
   sets `"formatter": { "enabled": false }`. `noRedundantUseStrict` deletes the
   directive line but leaves a **stray blank line**; `noPrototypeBuiltins` leaves
   a **double space** (`return  Object.hasOwn(...)`). One of those artifacts is
   exactly what shifts the exported player bytes in reason 1, so this is not
   purely cosmetic.

There is also **no `organizeImports`/import-order assist configured**, so there
is no import-order sweep to run at all — that framing was simply wrong.

## The 13 files (as of this date)

`lib/authoring/notes-core.js`, `lib/core/font-settle.js`,
`lib/core/present-transport.mjs`, `lib/exemplars/tier-filter.js`,
`test/unit/components/gallery-contract.test.js`,
`test/unit/core/accessibility-textures.test.js`,
`test/unit/core/image-aspect.test.js`,
`test/unit/playground/drawing-board-settings.test.js`,
`test/unit/transformers/svg-legend.test.js`,
`tools/check-chart-responsiveness.js`, `tools/check-shadcn-bridge-contrast.js`,
`tools/check-svg-scaling.js`, `tools/export-marp.js`.

## What a real cleanup should decide first (not a "sweep")

Pick a lane deliberately, each as its own reviewed change — none is a mechanical
fold:

- **`present-transport.mjs` `Object.hasOwn` rewrite:** this touches exported
  player bytes. Doing it means the change PLUS a golden re-bless in the same
  commit PLUS export sign-off (render the player in dark + light and inspect) —
  the QUALITY BAR export path. Not a lint chore. `Object.hasOwn` is a fine
  modernization; it just isn't free here.
- **Redundant `'use strict'`:** verified behavior-neutral for today's code (above),
  so removal is defensible — but hand-clean the blank-line artifact and run
  `npm run build` (it restales the emulator/authoring/exemplar bundles). Or
  suppress the rule for CJS files if the directives are kept intentionally.
  Either way, its own reviewed change, not a `--write`.
- **The one genuinely clean edit** is the single `useConst` (`let`→`const` in
  `drawing-board-settings.test.js`). Not worth a PR on its own; fold it into
  whichever lane above ships first.
- **Formatter:** enabling biome's formatter is the actual fix for the artifacts,
  but that is a large, separate, all-files reformat decision — its own PR.
- **The `--unsafe` suggestions** (`useOptionalChain` ×55, `useLiteralKeys`,
  `noNonNullAssertion`, `noUnusedVariables`): review individually; several are
  genuine small improvements, none are blind-apply.

These are non-blocking: `biome check` (`npm run lint`) reports them as **warnings
/ infos**, not errors, so CI and the hooks stay green *with the directives in
place*. Recorded here rather than actioned so it can be picked up intentionally,
not swept. No tracking issue is filed yet — if this lingers, cut one from this
note so it doesn't become a silent graveyard.
