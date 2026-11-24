---
owner: session_01DPMMjEgrcv6brmaXooaAX9 (🎨 presets desk)
branch: claude/cover-layout
pr: none yet
status: in-progress
updated: 2026-11-24 (D16/D17 decided)
checkpoint: ~85% (shared pool; 78% read at 20:40 UTC 2026-11-23)
budget: agents 9 of 13 spent session-wide; this PR's 4 (red team, inversion, checker, grader) not yet spent
---

# Cover layout: covers and dividers follow the color mode; `cover:` → `cover-layout:`

Tier A for 1.0 (freeze Sat 2026-11-28 23:59 UTC). The owner confirmed in the presets-desk session:
D14 "keep working", D15 "do now". The design and every decision are in
`engineering/decisions/2026-11-23-cover-layout.md` (read §3, §5, §5b, §6 first).

## Where it stands

Committed on the branch: the decision note only (rebased on main 2026-11-23). The ENGINE WORK IS NOT
COMMITTED: it lives in `artifacts/recipes/wip-engine.patch` (`git apply` it on this branch). It is
not committed because the commit hooks run the affected tests, and ~40 test files still pin the old
always-dark bookend (list below). Apply the patch, update the tests, then commit in slices.

What the patch does (21 files):

- `lib/base/base.modifiers.css`: the force-dark block, the chrome block and the `cover-light` block
  became "THE BOOKENDS FOLLOW THE COLOR MODE": the section captures `--text-display` / `--on-dark-*`
  as `--_bk-*`; its children redefine them as `light-dark(<light ink>, <captured>)`; covers paint
  `light-dark(--bg, --surface-inverse)`; dividers `light-dark(--accent, color-mix(--accent 40%, --bg))`
  inked `light-dark(--on-accent, captured primary)` on EVERY tier (secondary measured sub-AA otherwise).
  `divider.light` composition rules renamed `.subsection`; its color rules deleted.
- `lib/base/base.finish.css`: `--fin-canvas` follows the same fields. `base.variants.css`: the pseudo
  scheme forcing removed; rail rules `:not(.subsection)`. `lib/forms/tile/progress/progress.css`: the
  divider rail ink follows the field.
- `title.styles.css`, `closing.styles.css`, `divider.styles.css`: `color-scheme: dark` removed;
  `divider light` → `divider subsection` (composition only). Divider manifest variant renamed.
- `lib/export/player-core.mjs`: `BOOKEND_FORCES_DARK` and `ALWAYS_DARK` empty (no bookend forces
  dark), `.cover-light` out of the pin lists, empty-selector rule guarded.
- `lib/core/resolve-cover.js`: key `cover-layout`, composition axis only, classes stay `cover-<word>`.
- `lib/core/deck-settings.js` (+ `.prose.js`), `tools/lib/record-registers.js`, `lib/plugins/resolve.js`:
  `cover-layout` live, `cover` retired.
- `lib/authoring/lint-core.js` `findRetiredCover`: `cover:` → `cover-layout:` (surface word moves onto
  title/closing as `dark`/`light`), `cover-light` → `light`, `cover-inverse` → `dark` (errors);
  (no `divider light` rule: it is valid). One `--fix` pass migrates a deck
  (tested on a fixture: lints clean after). `tools/regex-census.json` updated (no polynomial regex).

Measured (artifacts/measurements/bookend-contrast.txt): all 33 themes x light and dark, the bookend
test deck, `tools/check-slide-contrast.js`: light 0 below AA; dark 20 below AA → fixed (primary ink on
dark dividers, field 45% → 40%) → 924 runs, 0 below AA. `tools/check-player-contrast.js` on indaco
light and cuoio dark players: 112 runs, 0 below AA, as exported and after the toggle.

## Open questions

None open. D16/D17 were decided 2026-11-24 (decision note §5): `divider light` is the light mode and is
not flagged; the small layout is `divider subsection`, combinable with `light`/`dark`; the repo's 17
decks that used the old small look now say `divider subsection light` (in the patch).

## Next steps, in order

1. `git apply artifacts/recipes/wip-engine.patch`; `npm run build`.
2. Update the tests that pin the old model (the list: grep `cover-light|cover-inverse|divider light|
   divider\.light|BOOKEND_FORCES_DARK|ALWAYS_DARK|cover: (light|inverse)` under `test/` and `docs/src`;
   ~40 files, some are false hits on the word "cover"). `cover-light-ink.test.js` becomes the
   "covers follow the mode" test; `bookend-ink`, `finish-canvas-matrix`, `html-player` change shape.
3. Migrate the repo's decks with `npm run lint:deck -- --fix` on every file the grep above lists
   under `examples/`, `exemplars/`, `lib/components/**/*.gallery.md`; retire or rewrite
   `examples/cover-light.md`.
4. Docs: `base.registers.docs.md`, `base.docs.md`, the title/closing/divider manifests and docs,
   `spec/LFM-1.1.md` §2.3 and its conformance JSON, the Studio deck-settings row,
   `changelog.d/cover-layout.changed.md` led with **Breaking:**, a demo deck.
5. The owner's validation bar (note §6): every theme incl. print and a11y, contrast rows in
   `tools/contrast-audit.js` (white on the dimmed divider; divider-vs-content jump floor), every
   finish, a real look at each theme, `check:jank` on divider and covers.
6. Export sign-off renders (light and dark) to the owner; then red team + inversion + checker on the
   diff, fold findings; the card grader; open the PR; ask to merge.

## Gotchas met

- A custom property cannot name itself, and themes declare the inks at :root: hence the capture on
  the section and the redefinition on its children.
- `light-dark()` takes colors only, so the logo filter cannot ride it; the `.dark` register already
  flips the logo, so covers inherit that.
- The component sheets declared `color-scheme: dark` at (0,1,1), equal to the mode registers; they
  had to go, or a light deck's scheme never reached the cover.
- The lint fixer converts `_class:` comments to `@meta` in the same pass; findings must carry the
  right slide number (slides count from 1) or the fix misses.

## Do not

- Do not add `cover-light` back as an alias (renames rule 5: removed, not aliased).
- Do not ship before the owner's export sign-off (the player bytes change).
