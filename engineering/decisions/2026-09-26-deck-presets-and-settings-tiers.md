---
status: shipped
summary: The deck settings panel had grown to about 46 controls, ten of them accent dials that each opened on "Auto" or "None", and authors could not tell which ones mattered. Three changes answer it. A `preset:` front-matter register names a coherent look (classic, editorial, brand, minimal) and the dials become overrides of it. Both settings panels open on a BASIC tier of a few essentials, with ADVANCED one tap away. The three "More…" drawers are gone. A preset resolves in the one front-matter reader every render path shares, so it has no class token and no CSS of its own.
companion:
  - ./2026-09-13-settings-find-and-list-view.md
  - ./2026-08-18-settings-panel-coverage-and-ux.md
---

# Deck presets, and Basic / Advanced settings

**Date:** 2026-09-26 · **Status:** shipped

The ask, from a phone screenshot of the deck panel's Accent section: *"as we add more
features to lattice deck and slide settings it gets harder for authors to choose… we need
presets concepts for deck settings. we also need basic and advanced view. we should also stop
using 'more accent settings' accordion… The Cognitive Sweet Spot (Avoiding Binary &
Paralysis)."*

## 1. The problem, measured

The deck panel held **46 controls**: Look 10, Chrome 11, General 8, Accent 10, Motion 4,
Speech 3. Three more rows hid in "More …" drawers. Ten of the forty-six were the accent and
surface dials (brand bar, bar placement, card rail, its placement, trim, heading rule,
eyebrow, headline alignment, card lift, corners). Each one opens on a default ("Auto",
"None", "Plain"), so a new author sees ten equal-weight choices and no signal about which of
them changes the deck.

Two failure modes sit on either side of the fix. A single switch ("fancy styling on/off") is
too coarse to express a look. Ten free dials are too many to choose between. People choose
well from roughly three to five named options that look clearly different, so every layer
below lands in that range.

## 2. The decisions (owner-settled 2026-09-26, one round)

| Fork | Chosen | Rejected, and why |
|---|---|---|
| Where a preset lives | An engine `preset:` register | The Studio writing out the ten keys: no engine change, but the deck forgets which look it came from and the front matter grows by up to ten lines |
| How many presets | 4 | 3 would merge Minimal or Brand-forward into a neighbor; 5–6 (adding Sketch and Data-dense) starts to produce neighbors that look alike |
| What Basic holds (deck) | Preset · Theme · Color mode · Size · Page numbers · Logo | 4 (no page numbers or logo) hides first-session tasks; 8 (adding header and footer) scrolls on a phone |
| Which panels | Both, presets deck-only | Deck-only would leave the two panels behaving differently until a follow-up |

## 3. Presets — one word, ten registers

```yaml
preset: editorial     # rule: short · eyebrow: bar · spectrum-trim: restrained · lift: on
rule: none            # an explicit key always wins over the preset
```

| Preset | Sets |
|---|---|
| `classic` | nothing: the house default, named |
| `editorial` | `rule: short` · `eyebrow: bar` · `spectrum-trim: restrained` · `lift: on` |
| `brand` | `spectrum: solid` · `spectrum-card: auto` · `spectrum-trim: on` · `rule: accent` · `eyebrow: dot` · `lift: on` |
| `minimal` | `spectrum: off` · `rule: none` · `corners: rounded` |

**How it resolves.** `frontMatterValue` in `lib/core/front-matter-key.js` is the one reader
that every register goes through: the markdown-it plugins, the browser runtime, the linter
and the resolvers. When one of the ten keys is **absent**, that reader now answers with the
preset's value instead of `null`. Every downstream kernel then stamps the class tokens it
always did. So a preset has no class token, no CSS, and nothing for a second render path to
forget (HARD RULE #1). A preset lists only the keys it changes, so `classic` is empty and
renders byte-identical to a deck with no `preset:` key. `test/unit/core/preset-register.test.js`
pins that.

**Why the table lives in `front-matter-key.js`, not `resolve-preset.js`.** The docs dev
server loads a CommonJS file from `lib/` through `docs/src/plugins/vite-cjs-lib-dev.mjs`,
which **refuses any module that requires another**. Its regex matches `require(` even
inside a comment. `front-matter-key.js` is imported by `resolve-motion.mjs` in the Studio,
so it has to stay a leaf. `resolve-preset.js` re-exports the table and is the register's
named home, like every other `resolve-*` file.

**What a preset never sets:** `theme:` (the palette, a separate choice), `mode:` (the
rendering hand), `finish:` (the backdrop, which has its own presets), `claim:` and `cards:`
(how a layout composes; they do not ride a split page either, see
`lib/core/surface-registers.js`), `stamp:` and `tone:` (only decks that carry badges care),
and every content key. The first proposal to the owner listed mode, finish, claim and
stamp/tone as preset keys. They came out during the build for the reasons above.

**Naming.** The default was proposed as "Boardroom" and ships as **Classic**. The Look tab
already has a *Mode* row whose default is **Boardroom** (`mode: boardroom`, the clean hand
as opposed to sketch). The first screenshot showed two dropdowns, one above the other,
both reading "Boardroom" and meaning different things.

## 4. The Studio row

`docs/src/components/studio/deck-preset.ts` holds the rules; the row in `StudioShell.tsx`
only draws them.

- **Shows** a dial's value as the deck's own key if it wrote one, else the preset's, else the
  engine default (`registerValue`). Every accent getter goes through it. So do the Slide
  panel's "from deck" hints (`slide-provenance.ts`) and Compose's trim reader, which is why
  they agree with the render.
- **Writes** nothing when the choice equals what the preset already gives (`writeRegister`).
  Before presets, every setter cleared its key at the *engine* default. Under a preset that
  would have turned "set the rule back to Auto" into "fall back to the preset's short rule",
  which is the opposite of the click.
- **Counts drift** (`presetChanges`): a key the deck writes to something other than its
  preset's value. A key restated at the preset's own value is not a change. When the count
  is above zero, the select reads "Editorial · 1 change" and a Reset link appears under it.
- **Picking a preset starts from it** (`applyPreset`): it also clears the family's overrides.
  Otherwise a `rule: short` left over from Editorial would ride into Minimal, and the author
  would see neither the look they picked nor why. The Undo toast names how many settings it
  cleared.

The swatch sizes go in `backgroundSize`, not inside the `background` shorthand. Chrome parses
a shorthand that contains `var()` only when it computes the value, and `SwatchChip` then
writes `backgroundSize` on its own, which reset every layer's size to `auto`. Measured on the
live page: the Classic chip rendered as a solid rainbow square.

## 5. Basic / Advanced

`SettingsTier` in `docs/src/components/ui/settings-view.tsx`, stored per browser like the
grouped/list layout (`studio-store.ts`, `lattice-studio-settings-tier`, default **basic**).

- **Basic is an explicit list, not a filter.** Each panel composes its own out of shared
  control elements (`themeField`, `canvasRow`, …), so the Basic row and its home section
  render the same control (HARD RULE #15). **A new setting therefore lands in Advanced by
  default.** Promoting one to Basic is a decision someone makes on purpose, and that rule is
  what stops Basic from growing back into the panel it replaced.
  - Deck: Theme · Preset · Color mode · Size · Page numbers · Logo, in the same order as the Look tab.
  - Slide: Canvas · Type scale · Clean slide · the speaker note.
- **Search ignores the tier.** A query always spans every section, so an Advanced row is
  still found from Basic. The switch hides while a search is live, because it would state a
  choice the results are not honoring.
- **The switch sits at the top of the body, not in the scope banner.** At the docked default
  width (296px, 268px inside its padding) the banner already carries the scope line, search,
  the layout toggle and the collapse button. A two-word segment there would have left the
  scope line under 30px, which §8.1 of the find-and-list note rules out. The grouped/list
  toggle hides in Basic, since there is nothing to lay out.
- **The foot of Basic** says it is a subset and links to Advanced. It gives no count: a
  number there would go stale with the next setting anyone adds, and nothing would catch it.

## 6. The "More…" drawers are gone

`More` (a collapsed `<details>`) became `SubGroup`: a rule, a small caps heading and its rows.
The drawers used to keep rare rows from competing with common ones. The Basic tier does that
job now, so inside Advanced, where the author asked to see everything, a second per-tab layer
of hiding only made a setting harder to find. The three groups are renamed for what they hold:
*Frame and fit* (corners, claim, card rows, fit), *Badges* (stamp and tone shape; drawn only
when the deck's vocabulary has either) and *Developer*. A heading has no open state, so the
two desync bugs the disclosure caused under search (find-and-list note §§12–14) cannot
recur.

## 7. Verified

| Claim | Surface | Artifact |
|---|---|---|
| The engine stamps a preset on every slide, and an explicit key overrides it | `lib/engine` render | `test/unit/core/preset-register.test.js`, 4/4, each with its control |
| `classic` renders byte-identical to no preset | `lib/engine` render | same file |
| The Studio agrees with the engine key by key | `deck-preset.ts` against `front-matter-key.js` | `deck-preset.test.ts`, 6/6 |
| Picking Editorial restyles the live preview; changing a dial shows "Editorial · 1 change" with Reset | The real Studio (docs dev server, Chromium 1440×900) | PR screenshots |
| Basic and Advanced at desktop, tablet and phone widths | The real Studio at 1440, 820 and 390 | PR screenshots |
| Brand-forward and Minimal render as designed | `examples/deck-presets.pdf` (`preset: editorial` deck-wide, the other two looks shown with their per-slide tokens) | The committed PDF |

Not verified: iOS Safari. The phone shots come from headless Chromium at 390×844 with touch
emulation, which is emulation (HARD RULE #23).
