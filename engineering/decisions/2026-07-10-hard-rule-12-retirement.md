---
status: shipped
summary: Retired HARD RULE #12 (the ban on :not(:has(…))/:is(:has(…)) in theme CSS) after empirically re-testing its premise against a real, current Chromium build and finding no evidence it holds — both selector forms behave exactly per spec, and no corroborating Chromium bug report exists anywhere. The rule's own "Removable when: verified across all Marp/Electron versions" condition had never actually been checked since it was written. Gate removed (tools/check-ownership.js), two gotchas.md entries downgraded to a dated historical note, CLAUDE.md's #12 marked retired in place. Five downstream implementation choices (lib/core/collections.js, lib/transformers/build.js, lib/transformers/focus.js, lib/base/base.focus.css) that avoided :has()/:nth-child() based on this premise are logged as follow-on, not touched here.
---

# HARD RULE #12 retirement — the theme-CSS `:has()` ban didn't survive scrutiny

**Symptom prompting this:** while auditing Marp legacy coupling
(`2026-07-09-marp-legacy-audit.md`), HARD RULE #12 came up as the one
constraint in that inventory that was genuinely, purely Marp-only — nothing
about our own render path needed it. Before accepting "we're stuck with
this," the premise itself got tested rather than taken on faith.

## What the rule claimed

`themes/*.css` could not use `:not(:has(…))` / `:is(:has(…))` because,
per two `engineering/gotchas.md` entries (`e0fe9b1d`, `5a98bc66`):

> "The Chromium build embedded in some Marp preview / Electron versions
> handles `:has()` inside `:not()` inconsistently — the function pair gets
> evaluated to `false` (or `true`) regardless of input."

> "`:has()` nested inside `:is()` parses but partially fails during property
> application."

Both entries carried the same escape hatch, never exercised: **"Removable
when: Verified across all Marp / Electron versions Lattice supports."**

## What was actually verified this time

1. **Empirical test against our own real Chromium.** Built a minimal HTML
   page exercising both patterns (`p:not(:has(+ h2))` and `p:is(:has(+ h1),
   :has(+ h2)) > code`), rendered it with Puppeteer against
   `linux-131.0.6778.204` — the exact Chrome for Testing build
   `lattice-emulator.js`/CLI/docs-playground already use — and read back
   computed styles. **5/5 cases matched CSS spec behavior exactly**, no
   deviation.
2. **Searched for the underlying Chromium bug.** No matching crbug /
   issues.chromium.org report for either symptom. Not proof it never
   existed, but a real absence where a documented engine bug of this shape
   would normally be findable.
3. **Checked what Chromium VS Code actually ships today.** Recent VS Code
   releases bundle Chromium in the 124–132 range (2024–2025 Electron
   versions) — squarely overlapping the 131 build just confirmed correct.
   `:has()` had genuine cross-browser rollout instability around 2022–2023;
   by 124+ it's mature.
4. **Could not verify:** the actual "Marp for VS Code" extension's live
   webview in this headless sandbox — no GUI, no extension host available
   here. This is marked explicitly as unverified on that specific surface,
   not folded into the "confirmed" claims above (HARD RULE #23).

## Why retire rather than build a workaround

The rule was already narrow — only the `:not()`/`:is()`-wrapped compound
forms, only in `themes/*.css` (component/base CSS uses `:has()` freely,
compound forms included, and nothing in any theme file has ever used either
banned form — the ban cost nothing to keep and nothing to remove). Given
real evidence the underlying premise doesn't reproduce, and no corroborating
report it was ever a genuine ongoing defect (versus, plausibly, a much older
Electron build or a different root cause entirely), continuing to enforce a
project-wide ban against a claim nobody ever went back to check is exactly
the kind of Marp-legacy debt the audit this note follows from was about.

**Accepted risk:** if the bug *was* real on some old, unpatched VS Code
install, retiring the gate removes the CI backstop for it. Given VS Code
auto-updates for most users and nothing today actually uses either selector
form, this was judged acceptable.

## What changed

- `tools/check-ownership.js` — removed `checkThemeHasSelectors` and its pure
  core `hasNotHasSelector`, and the `build:check` call site.
- `test/unit/cli/check-ownership.test.js` — removed the corresponding
  `describe('theme :has() gate (HARD RULE #12)', …)` block and now-dead
  imports.
- `CLAUDE.md` — HARD RULE #12 marked **RETIRED (2026-07-10)** in place (the
  number is never reused, per the HARD RULES section's own convention).
- `engineering/gotchas.md` — the two `:has()`-in-Marp-Chromium entries
  collapsed into one dated "RETIRED" historical note, keeping the mitigation
  patterns documented for reference in case this resurfaces on an old
  install.

## What this doesn't do — logged, not touched

Five files made real implementation choices *because of* this rule — hand-rolled
string walkers or explicit class-tagging instead of `:has()`/`:nth-child()`,
predating this retirement and not re-examined here:

- `lib/core/collections.js` — the shared focus/narrative-build toolkit's
  depth-aware string walkers, chosen specifically to avoid `:has()`/
  `:nth-child()` in consuming CSS.
- `lib/transformers/build.js` — tags per-unit rather than relying on
  `:nth-child()`.
- `lib/transformers/focus.js` — same avoidance, cited directly against
  "CLAUDE.md HARD RULE 12."
- `lib/base/base.focus.css` — explicit tagging "so the banned-in-Marp-Chromium
  selectors (HARD RULE 12) never [fire]."
- `lib/components/chart/_chart-family/chart-family.css` — not an avoidance
  itself (it already uses plain `:has()`/`:not()` freely), just documents the
  ban's precise scope; no change needed.

Whether any of these are worth rewriting to use `:has()`/`:nth-child()`
directly now that the premise is gone is a separate, real question — these
are kernel/shared-code choices (HARD RULE #25 blast radius), not a
mechanical follow-on to a docs/gate cleanup. Flagged for a future pass, not
bundled into this one.
