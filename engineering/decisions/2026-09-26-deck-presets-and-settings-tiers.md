---
status: shipped
summary: The deck settings panel had grown to about 46 controls, ten of them accent dials that each opened on "Auto" or "None", and authors could not tell which ones mattered. Three changes answer it. A `preset:` front-matter register names a coherent look (classic, editorial, brand, minimal) that differs at a glance, title slide included, because it sets alignment and a backdrop as well as the accent dials; the dials become overrides of it, and the picker shows each as a picture. Both settings panels open on a BASIC tier of a few essentials, with ADVANCED one tap away. The three "More…" drawers are gone. A preset resolves in the one front-matter reader every render path shares, so it has no class token and no CSS of its own.
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
| What Basic holds (deck) | Theme · Preset · Color mode · Size · Page numbers · Logo | 4 (no page numbers or logo) hides first-session tasks; 8 (adding header and footer) scrolls on a phone |
| Which panels | Both, presets deck-only | Deck-only would leave the two panels behaving differently until a follow-up |

## 3. Presets — one word, eleven registers

```yaml
preset: editorial     # finish: ledger · headline: left · rule: short · eyebrow: bar · …
rule: none            # an explicit key always wins over the preset
```

| Preset | Sets |
|---|---|
| `classic` | nothing: the house default, named |
| `editorial` | `finish: ledger` · `headline: left` · `rule: short` · `eyebrow: bar` · `spectrum-trim: restrained` · `lift: on` |
| `brand` | `finish: strata` · `headline: center` · `spectrum: solid` · `spectrum-card: auto` · `spectrum-trim: on` · `rule: accent` · `eyebrow: dot` · `lift: on` |
| `minimal` | `headline: left` · `spectrum: off` · `rule: none` · `corners: rounded` |

These are the second definitions. The first four varied only the bar, rule, kicker, trim and
cards, and the owner could not tell them apart; §8 has the measurement and the fix.

**How it resolves.** `frontMatterValue` in `lib/core/front-matter-key.js` is the reader
every RENDER path resolves a register through: the markdown-it plugins, the browser runtime
and the `resolve-*` kernels. When one of the ten keys is **absent**, or written empty
(`rule:`, `rule: # todo`), that reader now answers with the preset's value instead of `null`.
`preset:` itself is read **top-level only** (`topLevelFrontMatterValue`), like every register
something writes: the Studio's picker writes column 0, so a nested `pptx:\n  preset: brand`
would otherwise drive a render the picker could neither see nor change. Two readers sit
outside the shared one. The linter's `findUnknown*` finders check only what the deck wrote,
and the Studio mirrors the rule in `deck-preset.ts` (it cannot import the CommonJS reader
by name); `deck-preset.test.ts` pins the mirror against the engine on commented, empty and
nested input. Every downstream kernel then stamps the class tokens it
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
rendering hand), `claim:` and `cards:` (how a layout composes; they do not ride a split page
either, see `lib/core/surface-registers.js`), `stamp:` and `tone:` (only decks that carry
badges care), and every content key. `finish:` was on this list in the first build and came
back in round two (§8), with the owner's sign-off: the backdrop is one of the two settings
that visibly change a title slide.

**Naming.** The default was proposed as "Boardroom" and ships as **Classic**. The Look tab
already has a *Mode* row whose default is **Boardroom** (`mode: boardroom`, the clean hand
as opposed to sketch). The first screenshot showed two dropdowns, one above the other,
both reading "Boardroom" and meaning different things.

## 4. The Studio row

`docs/src/components/studio/deck-preset.ts` holds the rules; the row in `StudioShell.tsx`
only draws them.

- **Shows** a dial's value as the deck's own key if it wrote one, else the preset's, else the
  engine default (`registerValue`), read with the engine's rule: a trailing comment is
  stripped, and an empty or comment-only key falls through to the preset. Every accent getter
  goes through it, and so do the Slide panel's "from deck" hints (`slide-provenance.ts`) and
  Compose's trim reader. The first cut read with `getFrontMatter`, which keeps the comment;
  the independent check caught `rule: short  # house` counting as a change from Editorial.
- **Writes** nothing when the choice equals what the preset already gives (`writeRegister`).
  Before presets, every setter cleared its key at the *engine* default. Under a preset that
  would have turned "set the rule back to Auto" into "fall back to the preset's short rule",
  which is the opposite of the click.
- **Counts drift** (`presetChanges`): a key the deck writes to something other than its
  preset's value. A key restated at the preset's own value is not a change. When the count
  is above zero, the select reads "Editorial · 1 change" and a Reset link appears under it.
- **Picking a preset starts from it** (`applyPreset`): it also clears the family's overrides.
  Otherwise a `rule: short` left over from Editorial would ride into Minimal, and the author
  would see neither the look they picked nor why. The Undo toast names how many lines it
  cleared, counting every family line removed, including one that restated the old preset.

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

## 8. Round two — the four presets looked the same

The owner, on the deployed preview: *"i am having a hard time distinguishing the 4 presets."*
Rendering one four-slide deck (title, finding, cards, table) under each preset confirmed it.
**The four title slides were pixel-for-pixel the same layout**, because an inverse title slide
draws no bar and no heading rule, and those were most of what the first presets changed. On
content slides Classic and Editorial differed by a shorter rule, a 2px bar on the kicker and a
faint shadow, which vanish at phone size.

**The fix gives each preset something big.** A preset now also sets **headline alignment**
(Editorial and Minimal left, Brand-forward centered, Classic the component's own) and a
**backdrop** (`finish:` — Editorial `ledger`, a ruled field with a rail on the left edge;
Brand-forward `strata`, corner marks over a faint grid). The owner saw the old and new
side-by-side renders and approved the new set before any code changed. The two backdrops were
picked from all nine finishes rendered on the same pair of slides: the others were busier
(`atrium`, `savile`, `meridian`) or too close to plain (`gallery`, `nimbus`).

**The picker shows pictures.** The dropdown of four names became a 2×2 radiogroup of
thumbnails (`docs/src/components/studio/PresetPicker.tsx`, on `ui/radio-group`). Each shows
ONE fixed sample slide rendered with that preset. The owner chose a fixed sample over
rendering their own current slide four times: it opens instantly, adds four small images
(about 7KB in all, loaded lazily) rather than eager JavaScript, and reads the same for
everyone. `tools/build-preset-thumbs.mjs` renders them through the real emulator into
`docs/public/presets/`, and records a hash of the preset table plus the sample slide in
`docs/scripts/preset-thumbs-sources.json`. `test/unit/core/preset-thumbs-fresh.test.js`
recomputes it, so changing a preset without regenerating fails `npm test` instead of showing
the author the old look under the new name. Minimal's picture takes rounded corners in CSS,
because the PNG cannot carry them.

**One reader stays outside, on purpose.** The linter's `bookend-finish-contrast` note ("the
house pattern keeps a title slide clean") reads only a `finish:` the author wrote. A preset's
backdrop is a look the author picked whole; if the note read it, every Editorial and
Brand-forward deck would carry it on its title slide.

## 7. Verified

| Claim | Surface | Artifact |
|---|---|---|
| The engine stamps a preset on every slide, and an explicit key overrides it | `lib/engine` render | `test/unit/core/preset-register.test.js`, 4/4, each with its control |
| `classic` renders byte-identical to no preset | `lib/engine` render | same file |
| The Studio agrees with the engine key by key | `deck-preset.ts` against `front-matter-key.js` | `deck-preset.test.ts`, 6/6 |
| An independent checker bug-hunted the diff; its four confirmed defects are fixed and each has a test (nested `preset:`, commented and empty keys, the commented lint typo, the Undo count) | engine + Studio | `preset-register.test.js` 6/6, `deck-preset.test.ts` 9/9 |
| Picking Editorial restyles the live preview; changing a dial shows "Editorial · 1 change" with Reset | The real Studio (docs dev server, Chromium 1440×900) | PR screenshots |
| Basic and Advanced at desktop, tablet and phone widths | The real Studio at 1440, 820 and 390 | PR screenshots |
| The four presets differ on a title slide and on content slides | The same four-slide deck rendered under each preset, old set and new, side by side (shown to the owner) | `examples/deck-presets.pdf` shows all four title slides |
| The picker's pictures match the presets | `tools/build-preset-thumbs.mjs` through the emulator | `preset-thumbs-fresh.test.js` |

Not verified: iOS Safari. The phone shots come from headless Chromium at 390×844 with touch
emulation, which is emulation (HARD RULE #23).
