---
status: shipped
summary: The deck settings panel had grown to about 46 controls, ten of them accent dials that each opened on "Auto" or "None", and authors could not tell which ones mattered. Three changes answer it. A `preset:` front-matter register names a coherent look (classic, editorial, brand, minimal) that differs at a glance, title slide included, because it sets alignment and a backdrop as well as the accent dials; the dials become overrides of it, and the picker shows each as a live preview in the deck's own theme and color mode. Both settings panels open on a BASIC tier of a few essentials, with ADVANCED one tap away. The three "More…" drawers are gone. A preset resolves in the one front-matter reader every render path shares, so it has no class token and no CSS of its own.
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
cards, and the owner could not tell them apart; §7 has the measurement and the fix.

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
back in round two (§7), with the owner's sign-off: the backdrop is one of the two settings
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
- **Picking a preset keeps what the author wrote** (`applyPreset` only writes `preset:`).
  The first build cleared the family's overrides on every pick, so a `rule: short` left over
  from Editorial could not ride into Minimal. The round-two check showed the cost: the picker
  is a radiogroup, a radiogroup selects on arrow-key focus (Radix, like a native radio), so a
  keyboard user walking the four pictures deleted their settings one arrow press at a time.
  Now a leftover key shows as "Minimal · 1 change" with a Reset, which is the only thing that
  removes overrides, and only when asked.
- **`finish:` is in the family**, so its drift counts too. A deck that already had
  `finish: atrium` and no preset now reads "1 setting differs from Classic", and Reset removes
  that line (a saved `finish-<slug>` included). That is the rule working, but it is new
  behavior for decks that predate presets.

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

## 7. Round two — the four presets looked the same

The owner, on the deployed preview: *"i am having a hard time distinguishing the 4 presets."*
Rendering one four-slide deck (title, finding, cards, table) under each preset confirmed it.
**The four title slides had the same layout**, because an inverse title slide draws no bar and
no heading rule, and those were most of what the first presets changed. On content slides
Classic and Editorial differed by a shorter rule, a 2px bar on the kicker and a faint shadow,
which vanish at phone size.

**The fix gives each preset something big.** A preset now also sets **headline alignment**
(Editorial and Minimal left, Brand-forward centered, Classic the component's own) and a
**backdrop** (`finish:` — Editorial `ledger`, a ruled field with a rail on the left edge;
Brand-forward `strata`, corner marks over a faint grid). The owner saw the old and new
side-by-side renders and approved the new set before any code changed. The two backdrops were
picked from all nine finishes rendered on the same pair of slides: the others were busier
(`atrium`, `savile`, `meridian`) or too close to plain (`gallery`, `nimbus`).

**The picker shows live previews.** The dropdown of four names became a 2×2 radiogroup
(`docs/src/components/studio/PresetPicker.tsx`, on `ui/radio-group`). Each card renders one
sample slide under that preset, and it went through two designs.

- **First: fixed images.** The owner first chose a fixed sample image per preset over a live
  render of their own slide: instant, about 7KB of WebP, the same for everyone. A generator
  (`tools/build-preset-thumbs.mjs`) rendered them through the emulator in `indaco`, light mode,
  with a hash test for staleness.
- **Then: live, in the deck's theme.** On the deployed preview the owner asked for a sample
  that "really show cases the difference" and for the tiles to "adapt to color mode change and
  theme change". A fixed image cannot: a WebP per built-in theme per mode would still miss
  every saved theme. So each tile is now a live render through the same kernel as the main
  preview (`PooledThumbFace` in a `PreviewPool`, the machinery the Reshape picker already
  uses), fed the resolved `preview.*` theme, `options` and `previewExtraCss`. A saved theme
  and a color-mode flip reach the tiles the way they reach the main preview (checked on a
  production build: Cuoio light, then Indaco dark, all four tiles re-rendered). The generator,
  the four WebPs, the hash file and the freshness test are deleted.
- **The sample** (`deck-preset.ts` `PRESET_SAMPLE`) is a kicker, a heading and a row of three
  cards. It was picked from renders of a card row, a title slide and a table under all four
  presets. The card row carries every surface a preset changes that a small tile can still
  show: the page edge (bar, backdrop), the heading (alignment, rule), the kicker (eyebrow) and
  the cards (lift, rails). The title slide hid the bar, the rule and the cards, and the table
  hid the cards. At a live tile's size Classic and Minimal separate on the bar and the rule.
- **What a tile renders** (`presetSampleDeck`): the deck's own front matter, so theme and color
  mode match, with `preset:` set to the tile's preset and every preset-family key the author
  wrote removed, so each tile shows the preset rather than the author's overrides of it. `size:`
  is dropped: every tile box is 16:9 and the frame scales by width, so the third check showed a
  portrait or square deck cropping the tile to its heading, cutting off the cards the sample
  was chosen for. It uses the editable `fm`, not `previewFm`: `previewFm` stamps a saved finish's
  class onto the front matter, which would paint that finish over all four tiles.
- **Cost.** Four more preview documents while the deck panel is open (measured: 5 iframes, the
  main preview plus four tiles). The engine is already loaded for the main preview, so there is
  nothing new to download. By this repo's own measurements a live preview document costs about
  1.2MB on Chromium and about 11MB on WebKit, and WebKit never gives a torn-down one back
  (2026-07-30-preview-deck-context-and-render-cost.md, 2026-09-13-gallery-preview-memory.md).
  - **The pool lives at panel level** (StudioShell `inspectorBody`), not inside the picker. The
    third check found that a picker-level pool unmounted, and so rebuilt four documents, every
    time the Preset row left the screen: Basic ↔ Advanced, a tab change, a search. Hoisted, the
    same frames survive all of those. Measured on the production build: tagged at open, the
    5 iframes were the same 5 after Advanced → Chrome tab → Basic.
  - **Still rebuilt:** closing the desktop inspector, switching to the Slide scope, and closing
    the phone sheet all unmount the panel. Not measured on WebKit; recorded as
    `followups.d/2391-p3-preview-pool-webkit-memory-on-panel-reopen.md`.
  - **Typing:** the Studio re-renders on every keystroke, and every render of a tile re-points
    its pooled frame. `PresetPicker` is memoized with stable callbacks, and its four sample decks
    are built once per front-matter change.
- **Dev-server note.** On `astro dev` the pool paints no frames, for this picker and for the
  existing Reshape picker alike; on a production build both paint. It predates this change,
  though the preset picker only became exposed to it here. Recorded as
  `followups.d/2391-p2-preview-pool-blank-on-astro-dev.md`.

**Readers that stay outside the shared one, each on purpose.**

- The linter's `bookend-finish-contrast` note ("the house pattern keeps a title slide clean")
  reads only a `finish:` the author wrote. A preset's backdrop is a look the author picked
  whole; if the note read it, every Editorial and Brand-forward deck would carry it on its
  title slide.
- The Playground's deck sheet (`docs/src/playground/deck-config.js`) edits `finish` and `lift`
  with its own read/write rules. The round-two check found that it showed "None" for a
  preset's backdrop and that picking None deleted the key, handing control back to the preset.
  It now reads the engine table's `presetEffective`: the preset's value shows as current, and
  the engine default under a preset that changes it is written as an override.
- `slide-provenance.ts` reads the deck's finish through the Studio mirror (`registerValue`),
  so a comment-only `finish: # todo` resolves as the engine renders it, not as its raw text.

## 8. Verified

| Claim | Surface | Artifact |
|---|---|---|
| The engine stamps a preset on every slide, the backdrop included, and an explicit key overrides it | `lib/engine` render | `test/unit/core/preset-register.test.js`, each case with its no-preset control |
| `classic` renders byte-identical to no preset | `lib/engine` render | same file |
| The Studio agrees with the engine key by key, on clean, commented, empty and nested input | `deck-preset.ts` against `front-matter-key.js` | `deck-preset.test.ts` |
| The Playground sheet shows and overrides a preset's backdrop and lift | `deck-config.js`, the module the sheet renders | `test/unit/playground/deck-config.test.js`, with a no-preset control |
| Picking Editorial in the real Studio renders the ledger backdrop and left alignment in the live preview | The real Studio (docs dev server, Chromium 1440×900) | screenshot shared with the owner |
| Arrow keys in the picker switch the preset and keep the author's keys | The real Studio, keyboard-driven | the deck source read back after the key presses |
| The four presets differ on a title slide and on content slides | The same four-slide deck rendered under each preset, old set and new, side by side (shown to the owner) | those renders; `examples/deck-presets.pdf` shows the same looks through per-slide classes, since one deck can carry only one preset |
| The picker's tiles follow the deck's theme and color mode | The real Studio, production build (Chromium 1440×900 and 390×844): Cuoio light, then Indaco dark | screenshots shared with the owner in the session (not committed); `deck-preset.test.ts` pins the sample deck each tile renders |
| The preview frames survive the panel's own switches | The real Studio, production build: frames tagged at open, then Advanced → Chrome tab → Basic | the same 5 iframes before and after |
| The owner can tell the four apart | The owner's own phone, the deployed preview | "looks great" |
| Basic and Advanced at desktop, tablet and phone widths | The real Studio at 1440, 820 and 390 | screenshots shared with the owner |
| Independent eyes | Three checker passes: round one, round two, and the live-preview commit | every confirmed finding fixed with a test, a corrected claim or a `followups.d/` entry |

Not verified: iOS Safari. The phone shots come from headless Chromium at 390×844 with touch
emulation, which is emulation (HARD RULE #23).

## 9. After `backdrop:` landed (#2388)

#2388 added `backdrop:`, which dims or masks any finish. It composes with a preset with no
extra code. The deck panel reads the finish through `registerValue`, and so does the slide
panel through `slide-provenance.ts`. So under Editorial or Brand-forward the new Backdrop
rows appear and restrain the preset's finish, like any other override.

**No preset sets a backdrop, by the owner's choice.** Rendered on the two presets that
carry a finish, `backdrop: clear` barely changes Editorial's `ledger` rail, which lives in
the margin. On Brand-forward, `clear` and `40` strip the `strata` texture behind the words.
Both make the presets quieter and closer to Classic and Minimal, which undoes §7's goal.
The idea with a real upside is a preset that wears a bolder finish and uses `clear` to
keep the words on clean canvas. It needs new looks and an owner pick, so it is logged in
`followups.d/2391-p3-presets-bolder-finish-with-backdrop.md`. A preset could not set it
today anyway: `readBackdrop` reads the key directly, not through `frontMatterValue`, so
`backdrop` would first have to join `PRESET_KEYS`.

`examples/deck-presets.pdf` renders pixel-identical before and after #2388: all ten
pages, 0 differing pixels at 40 dpi.
