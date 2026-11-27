---
status: in-progress
summary: Covers (title, closing) follow the deck's and the slide's color mode like every other slide. `cover:` loses its surface axis (`light`, `inverse`) and becomes `cover-layout:`, a composition-only key. A dark cover paints the theme's brand panel. Old spellings are lint errors with a --fix.
---

# Covers follow the color mode; `cover:` becomes `cover-layout:` (2026-11-23)

**Decided by the owner** in the presets-desk session on 2026-11-23: D4a A, D4b A, D10 A, D12 D-dim. This note
records the model and the build plan so the PR can point here.

## 1. The problem

The `title` and `closing` components (the deck's front and back cover) are hard-wired to a dark
panel. `section:is(.title, .closing):not(.print, .cover-light)` forces `color-scheme: dark`
(`lib/base/base.modifiers.css`), and the components paint `--surface-inverse` (indaco's brand navy).
That holds in a light deck and over a slide pinned light (`lib/base/base.docs.md`: "a bookend is a
dark panel even when the slide is pinned light"). The HTML player mirrors it
(`lib/export/player-core.mjs` `BOOKEND_FORCES_DARK`, `PINNED_TO_LIGHT`).

So the ordinary color-mode controls could not make a light cover, and `cover: light` was added as
a workaround. That is a second way to set a slide's color mode, and the two collide: with `cover:
light` plus `<!-- _class: title dark -->`, the slide's own mode loses and the cover stays light
(rendered 2026-11-23). Presets made it visible: Wave 1's Signature presets recommend `cover: light`,
so a deck the author switches to dark opens and closes on a cream slide. Both blind judges docked
all five presets for it (#3470, round 1).

The owner: "we support light and dark mode at the deck and slide level … introducing alternate way
of defining slide color mode is very bad."

## 2. Decisions

| # | Decided | Not chosen |
|---|---|---|
| D4a | **Covers obey the deck's `color-mode:` and the slide's `light` / `dark`, like every slide.** The surface axis (`light`, `inverse`) is removed from the key | Keep both mechanisms; add a `canvas` surface word for presets only |
| D4b | **A dark cover paints the theme's brand panel (`--surface-inverse`)**, so `<!-- _class: title dark -->` in a light deck gives today's navy cover, and a dark deck's covers stay as they are | A dark cover is the plain dark canvas; keep the panel as Classic's default |
| D10 | **The key becomes `cover-layout:`** (plain-English rule 1, the thing then the attribute: `2026-11-21-plain-english-key-renames.md`). Its Studio label is `cover-layout` (rule 2) | Keep `cover:` and rename later |

## 3. The model

- **`cover-layout:`** takes one word, the composition: `plain` (default), `masthead`, `ledger`,
  `column`, `label`, `stage`, `frame`, `poster`. Per slide: `<!-- _class: closing cover-poster -->`.
  The per-slide class names stay `cover-<composition>`; they are component variants of `title` and
  `closing`, and value words wait for the later sweep (renames Q8).
- **Color comes only from `color-mode:` and the slide's `light` / `dark`.** A light deck has light
  covers; one dark cover in it is `<!-- _class: title dark -->`; a dark deck has dark covers.
- **A dark cover paints `--surface-inverse`**, not `--bg`. On most themes the two are both near-black;
  on indaco the panel is brand navy (#003D66), which keeps the house cover reachable.
- **A preset sets only the composition.** Its cover then follows whatever mode the author picks.

## 4. What changes for existing decks

**Every light deck's covers change from the dark panel to the light canvas**, unless the deck writes
`title dark` / `closing dark`. That is the point of D4a, and it moves the goldens of every light deck
with a cover. A dark deck's covers do not move (D4b).

Migration (renames rule 5: old names are removed, not aliased):

- `cover:` → `cover-layout:`, keeping the composition word; `lint:deck --fix` rewrites it.
- `cover: light <x>` → `cover-layout: <x>` (a light cover is now the default in a light deck).
- `cover: inverse <x>` → `cover-layout: <x>` plus `dark` on the title and closing slides, which keeps
  the deck looking as before. The fix writes both.
- Per-slide `cover-light` / `cover-inverse` → `light` / `dark`.
- Repo decks today: 3 front-matter `cover:` lines, 28 files naming a per-slide cover or bookend
  light token (`grep`, 2026-11-23). `examples/cover-light.md` is retired or rewritten.

## 5. Dividers follow the mode too, on an accent background (D12, decided 2026-11-23)

`section.divider:not(.light)` was forced dark by the same rule as the covers, and `divider light`
was a second way to set a slide's mode. The owner chose **D-dim** after seeing A, D-plain and D-dim
rendered on indaco, cuoio and onyx in both modes:

- **Dividers follow `color-mode:` and the slide's `light` / `dark`.** `divider light` stays valid and
  means what `light` means on any slide: the light color mode. The force-dark rule goes for dividers
  as it does for covers.
- **The smaller layout `divider light` used to imply is `divider subsection`** (the owner, 2026-11-24,
  D16/D17, after seeing `divider`, `divider light`, `divider subsection` and `divider subsection light`
  rendered: "that look is correct"). It is a layout variant, centered, a tier smaller, no rail, and
  works in either mode. `divider light` is NOT flagged by lint; the repo's own 17 decks that relied on
  the old small look were moved to `divider subsection light` by hand.
- **Light mode: the background is `--accent`, the ink `--on-accent`.** No new tokens; the pair is
  already gated by `tools/contrast-audit.js` (`on-accent on accent`). Measured on all 33 themes:
  ink 5.5 to 21:1, the jump from the content background 5.2 to 21:1.
- **Dark mode: a dimmed accent with white ink.** `--accent` as-is is bright in dark mode (luminance
  0.38 to 1.0; onyx and the a11y themes go pure white), which is a flash in a dimmed room. The
  theme's `--on-accent` cannot ride a dimmed background (dark mode pairs a bright accent with dark
  ink: 2.0 to 3.5:1 on every theme when dimmed). So the engine derives one token, the accent mixed
  toward `--bg` (45% in the prototype), inked white. No per-theme work. The mix is tuned so white
  clears AA on every theme (concrete is the tightest).
- **Number and rail:** the `numbered` variant and `progress-rail:` already ship; D recombines them.
- **Two new contrast-audit rows:** white on the dimmed divider background (AA, both themes' dark
  values), and the divider background against the content background (a minimum jump per theme).

Not chosen: **D-plain** (the bright dark-mode flash); **A** (follows the mode with no accent
background: the weakest chapter cue, a light divider is nearly the content slide); **B**, today's
always-dark brand panel (a second mode mechanism, and in a dark deck it barely differs from content).
Prototype renders: the presets-desk session, 2026-11-23.

## 5b. How the engine does it (the approach, 2026-11-23)

Covers and dividers look dark today only because they FORCE `color-scheme: dark`
(`base.modifiers.css` `section:is(.title, .closing):not(.print, .cover-light), section.divider:not(.light)`);
the theme tokens are already `light-dark()` pairs (39 in `base.tokens.css`, 122 in indaco). So the change is
narrow, not a rewrite of every cover rule:

1. **Drop the force.** The slide's own scheme (deck `color-mode:`, slide `light` / `dark`, the player's
   toggle) reaches covers and dividers like every slide. The player's `BOOKEND_FORCES_DARK` /
   `PINNED_TO_LIGHT` go with it.
2. **Remap the on-dark inks on these slides only.** The cover and divider CSS was written for a panel that
   was always dark, so it names `--on-dark-primary` / `-secondary` / `-ghost` and `--on-inverse-muted`
   (17 uses). On `title`, `closing` and `divider` those tokens are redefined as
   `light-dark(<the light ink>, <today's value>)`, so every existing rule keeps working in both modes and
   the dark arm is byte-identical to today.
3. **Paint the field per mode.** Covers: `light-dark(var(--bg), var(--surface-inverse))` (D4b). Dividers:
   `light-dark(var(--accent), <the dimmed accent>)`, inked `light-dark(var(--on-accent), white)` (D12).
4. **Retire the second mechanism.** `cover-light` / `cover-inverse` / `divider light` leave the engine;
   `lint:deck --fix` rewrites old decks (§4).

## 6. Build and verification

**The owner's bar for D-dim (2026-11-23): validate it everywhere, settle for nothing.** "We curate and hold
ourselves to the highest standard": no jank, no tech debt, no broken windows. Before the PR is review-ready:

- **Every theme**, including the print theme(s) and every `a11y-*` palette, in light and dark, and the
  `--print` band. A theme where the dimmed accent reads as plain gray (onyx, the a11y palettes, concrete)
  is judged on its own terms, not waved through.
- **Contrast, measured, on every theme and mode:** white on the dimmed divider (AA), the light-mode
  `--on-accent` on `--accent` (already gated), and the divider's jump from the content background (a
  floor). Both land as `tools/contrast-audit.js` rows, so the gate holds them after merge.
- **Every finish** layered on a divider and a cover, light and dark: the backdrop must not break the field,
  the ink or the jump.
- **Artistic review, looked at, not only measured:** each theme's divider and covers beside its content
  slides, judged for whether the break reads as a chapter and the field looks curated, not just compliant.
  A visual fan-out per the Quality Bar if the sweep is large.
- **Jank:** `check:jank` on the divider and both covers as the heading grows; the section number and the
  rail hold still.

- **Engine:** the force-dark rule and `cover-light` CSS (`base.modifiers.css`, `base.finish.css`,
  `base.variants.css`, `title.styles.css`), the register (`resolve-cover.js` → composition only,
  key `cover-layout`), the player's `BOOKEND_FORCES_DARK` / `PINNED_TO_LIGHT`, lint
  (`lint-core.js` rule with --fix), `deck-settings.js`, the Studio row, `spec/LFM-1.1.md` §2.3 and its
  conformance JSON, `base.registers.docs.md`, the title and closing docs.
- **Tier:** critical and high blast radius (every light deck's covers, the exported player), so the
  adversarial trio (red team, inversion, checker) on the shipped diff (HARD RULE #25).
- **Evidence:** the cover gallery and a demo deck in light and dark, the HTML player toggled both
  ways (`tools/check-player-contrast.js`), the goldens' diff named as intended, and the overflow guard.
- **Export bytes change** (the player), so the owner signs off the dark and light renders.

## 7. Found while building (2026-11-27)

Five places still assumed a bookend is always dark, or that `divider light` is the small layout.
Each was fixed in this change, because each broke a surface that worked before it (HARD RULE #18):

- **The player's system-mode logo.** `SYSTEM_LOGO_SEL` (`lib/export/player-core.mjs`) skipped
  `title`, `closing` and `divider`, which was right while they were forced dark. With the force gone,
  a `color-mode: system` deck in the player's dark scheme kept the light-canvas mark on a dark cover.
  The covers are back in that selector; `test/unit/export/html-player.test.js` asserts it.
- **The logo on a divider.** The divider's field is a dark ground in both modes (the light accent
  carries a light `--on-accent` on all 19 base themes), but in light mode the mark took the
  light-canvas treatment and all but vanished on indaco's accent. A divider now takes the inverse mark
  in both modes, and the player's system-mode reset leaves it alone. A theme with a pale accent and a
  dark `--on-accent` would want the light mark there; none ships.
- **The Studio's section rail.** `isSectionBoundary` (`docs/src/components/studio/present-sections.ts`)
  read `divider light` as a within-section waypoint. `light` is the color mode now, so a light-mode
  divider is a section start and the waypoint is `divider subsection`.
- **The lint rule read slides with its own `---` split.** The first `retired-cover-key` scan counted
  `---` lines, which miscounts a `***` break and a `---` inside a fence, and hand-rolled a directive
  reader the census forbids. It reads the shared `scanMetaSource` now, and a test pins the count.
- **Two reports on one token.** `cover-light` / `cover-inverse` drew `retired-cover-key` and a generic
  `unknown-class` "check the spelling". They join `RETIRED_WITH_OWN_RULE`, as `no-form` did.

**Why a rule of its own and not a `KEY_RENAMES` row** (`lint-core.js`, #3506): that table renames a
front-matter key and maps whole values. `cover:` → `cover-layout:` drops one of two words, and keeping a
deck's look means writing `dark` (or `light`) onto its title and closing slides. A table row cannot edit
slides, so the rename keeps its own rule.
