---
origin: 2622
priority: P2
recorded: 2026-10-09
area: infra
severity: low
swimlane: engineering/decisions/2026-10-09-generated-indexes-uncommitted.md §6
source: engineering/decisions/2026-10-09-generated-indexes-uncommitted.md
---

# Stop writing generated ink values into the hand-written themes/*.css

```text
  P2 · [no ticket] derive-cat-ink.js and derive-chart-cat-ink.js rewrite a generated block
       inside each hand-written palette file. Give the generated values their own file.
       why now   — a file with two writers (a person and a generator) is the shape #2622
                   removed for the indexes; any palette edit can collide with a re-derive.
       where     — tools/derive-cat-ink.js, tools/derive-chart-cat-ink.js, themes/*/*.css
                   (import a sibling generated file), tools/build.js STEPS tags.
       done when — no generator writes into a hand-edited theme file.
       evidence  — the palette files carry no generated block; a theme PR and a re-derive
                   touch different files.
       verify    — tier 1: build:check green; the contrast gates still pass on every palette.
```

## Scouted 2026-10-11 — not built; this is a theme-contract decision (owner's call)

A read-only scout mapped every consumer (file:line evidence kept in the session transcript;
re-derive with `grep -rn "themes.*\.css\|themePath\|themeEntries" lib tools docs/src docs/scripts lattice.js`).

- **Scope:** 33 theme folders; generated blocks sit in **19** files (15 base palettes carry all three
  blocks; the 4 `a11y-*` colour-vision palettes carry only the heatmap ramp). All blocks sit inside the
  theme's last `:root {}`.
- **`@import` does not work as the link.** Imports resolve by registered theme NAME, never by path
  (`lib/engine/themes.js:165`). A path import becomes a live relative fetch in previews and exports (the
  HARD RULE #22 hazard), `checkThemeRoles` (`check-ownership.js:804`) allows exactly one import, and
  `tools/build-default-bundle.js:94-105` throws on a non-theme target.
- **The smallest workable shape uses no `@import`:** (1) an optional `ink.css` role in
  `lib/packages/kinds.js`; (2) one shared `readThemeSource(dir, name)` in `lib/theme/files.js` that returns
  `<n>.css` + `<n>.ink.css`; (3) `tools/build-css.js` inlines the sibling into `dist/themes/<n>-min.css`, which
  fixes the Playground, Studio, `export-marp`, `marp-bundle` and `deck-export` in one place; (4) replace the
  ~25 hand-built `themes/<n>/<n>.css` reads (CLI render `lattice.js:1257`, both derive tools, 4 gates in
  `check-ownership.js`, ~12 audit/parity tools, `build-default-bundle`, `build-marp-kit`, `new-theme`).
  `ROLE_RE`/`stemOf` in `lib/theme/files.js` would otherwise read `indaco.ink.css` as a theme named `indaco.ink`.
- **Biggest risk is silent omission, not a crash.** A reader left on the one-file path keeps rendering and
  passing with the ink absent; every use falls back to `var(--cat-N-ink, var(--cat-N-mark))`, the 3:1
  graphical floor, so text contrast degrades with nothing visibly breaking.
- **The published raw `themes/<n>.css`** (package export `./themes/*.css`, the release zip) is consumed by Marp
  users as one self-contained file. After a split it would lose the ink unless the publish step inlines it.
  That changes what a theme file IS, which is why it is not decided here.
- **Studio and user themes** are one self-contained file by design (`lib/theme/serialize.js:162-172`,
  `lib/theme/gate.js`) and are unaffected if only the 19 shipped files split.
- **Benefit check before spending this:** the collision it removes is two PRs editing the SAME palette's marks.
  Measure it first: `git log --no-merges -100 --name-only | grep -c '^themes/.*\.css$'` against how often a
  generator-only rewrite lands in a palette PR. If that is rare, a lighter fix is to leave the files as they are.
- **Options for the owner:** (A) the sibling file above, committed (about 25 call sites, one new package role);
  (B) the same, uncommitted and built like the indexes (also needs the desktop-app question settled — the same
  one that parks `followups.d/2554-p3-uncommit-generated-js-after-desktop-app.md`); (C) leave as is. Recommended:
  measure first; take A only if the collision count justifies the ~25-site change.

## Collision rate measured 2026-10-12 (full history, last 300 non-merge commits)

- 2 of 300 commits touch `themes/*/*.css`: `f091f2d1` (a command name in a one-line comment, 6 files) and
  `c5c2a02de` (moved themes into folders). Neither edits a palette's marks.
- 7 of 300 commits touch `tools/derive-cat-ink.js` or `tools/derive-chart-cat-ink.js`; 1 of those also touches
  a theme CSS file (`c5c2a02de`, the move).
- So a palette edit colliding with a re-derive has not happened in 300 commits. Two caveats: 136 of the 300
  commits touch `themes/` at all (tokens, docs, tests), so the surface is busy, just not these files; and an
  earlier read of the shallow checkout (50 commits) counted a whole-tree "add" at the shallow boundary as a
  theme edit, which is why this section replaced it.
- Reproduce: `git log --no-merges -300 --format=%h -- 'themes/*/*.css' | wc -l`.
- Recommendation: option C (leave as is). The ~25-site change buys nothing the history shows.
