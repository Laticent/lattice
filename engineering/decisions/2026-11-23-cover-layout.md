---
status: in-progress
summary: Covers (title, closing) follow the deck's and the slide's color mode like every other slide. `cover:` loses its surface axis (`light`, `inverse`) and becomes `cover-layout:`, a composition-only key. A dark cover paints the theme's brand panel. Old spellings are lint errors with a --fix.
---

# Covers follow the color mode; `cover:` becomes `cover-layout:` (2026-11-23)

**Decided by the owner** in the presets-desk session on 2026-11-23: D4a A, D4b A, D10 A. This note
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

## 5. Open question: dividers

`section.divider:not(.light)` is forced dark by the same rule, and `divider light` is a layout
variant that sets the slide's mode: the same second mechanism. D4a names only covers. **Asked of
the owner before the build:** do dividers follow the color mode too (`divider light` removed, a
light divider is `<!-- _class: divider light -->` through the ordinary mode token)? The recommendation
is yes, in the same PR, since the rule and the player code are shared.

## 6. Build and verification

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
