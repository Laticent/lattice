---
status: proposed
summary: >
  The Theme spec becomes a token-system spec (owner, 2026-11-27). Measured on main: themes declare 198 tokens in
  30 families, mentioned 22,325 times in 1,015 files, with four numbering styles and a duplicated categorical
  family. Themes are already hand-curated (indaco: 152 of 168 tokens), but the renderers compute about 440 colors of
  their own, mostly in the chart family, and Mermaid fills every setting we do not map. After the owner's "we curate
  and only derive out of desperation", the note proposes a curation-first contract: every visible color is curated,
  derivation only for see-through washes and marked fallbacks of optional tokens, and renderers compute no color.
  Naming principles, their SOLID mapping and before/after names stand; the 10-seed option is withdrawn (§7).
builds-on:
  - 2026-11-27-specs-1-0.md
  - 2026-06-11-universal-token-system.md
  - 2026-07-15-categorical-token-contract.md
  - 2026-08-09-theme-token-contract.md
  - 2026-08-09-color-theme-ownership.md
---

# The token system at 1.0: what a theme must give, and how tokens are named (2026-11-27)

**Status:** proposed; the scope question is on the ❓ card (§6). Nothing is renamed until the owner answers.

**The owner's words (2026-11-27, command center, typed on iOS):** "theme should be a spec as a token system. we
need to audit our tokens and their nomenclature for sure because we have been adding to it as we go for what we
needed but a spec can't operate like that. we need to apply a systems thinking and make sure our tokens are named
appropriately and easy understand and easy to use. whatever we put in there has to be load bearing and it will be
hard to change. they must great and built on solid principles too."

## 1. The answer

Freeze the smallest set of tokens a theme must give and derive the rest. The engine already works this way for
generated themes: `deriveTheme` (`lib/theme/derive.js`) takes **10 starting colors** (`ESSENTIAL_KEYS`: canvas,
alternate canvas, heading ink, body ink, muted ink, accent, soft accent, pass, warn, fail) and returns **132**
tokens, the same count THEME 1.0 names. So THEME 1.0's core is those 10 seeds, under names that pass the principles
in §3. Every derived token is listed with its recipe and marked experimental: a theme MAY override one, but 1.0 does
not promise its name. The full audit and rename of the derived tokens lands in a later version, with a crosswalk
(`lib/tokens/crosswalk.js` already migrates a theme mechanically) so an outside theme moves in one step.

## 2. What is there today (measured, `main` at `90a387d4`)

A throwaway script, not committed: it collects every custom property declared in `themes/**/*.css`, then counts
the `var(--…)` reads of each in `lib/`, `docs/src/` and `themes/`, and the mentions of each name anywhere in the
tree. The seed counts below are `grep -rlE -- '--<name>([^a-z0-9-]|$)'` over the same directories.

| Measure | Value |
|---|---|
| Tokens declared by at least one theme | **198** |
| Tokens THEME 1.0 names | 132 (68 declared tokens are not in the spec; 2 spec tokens no theme declares) |
| Theme directories | 33 (light themes declare; most `-dark` themes compose a light one) |
| Mentions of the 198 names in the tree | **22,325**, in **1,015** files (lib 219, docs/src 312, test 144, engineering 232, examples 32, tools 29, themes 22, spec 15, design 10) |
| Engine-declared tokens (`lib/**/*.css`) | 1,082, built on the theme tokens; layouts read these |
| Theme tokens with exactly one reader file | 50 |
| Theme tokens with no `var()` reader | 17, but most are read by string building (`--cat-N-ink`, `--diagram-*`), so "unused" needs a second pass before anything is deleted |

**Largest families:** `--cat-N-*` 48, `--chart-*` 17, `--syntax-*` 14, `--diagram-*` 11, `--heatmap-*` 10,
`--scheme-dark-*` 10, status (`--pass` `--warn` `--fail` `--info` `--mute` and their tiers) 33.

**Mentions of the 10 seeds** (files): `--accent` 481, `--bg` 314, `--text-heading` 314, `--text-body` 200,
`--text-muted` 193, `--bg-alt` 191, `--accent-soft` 131, `--warn` 125, `--fail` 114, `--pass` 103.

### 2.1 Where the names break their own system

| Problem | Today |
|---|---|
| Four numbering styles | `--cat-3-fill` (hyphen, 1–12), `--chart-cat3` (no hyphen, 1–8), `--heatmap-step3` (word + number), `--seq-500` (a 100–900 scale) |
| One hue, two families | `--chart-cat3` and `--cat-3-fill` / `--cat-3-mark` / `--cat-3-ink` both name categorical color 3 |
| "On" in three places | `--on-accent` (prefix), `--cat-on-fill` (middle), `--c-on-container` (after a cryptic prefix) |
| Two words for one role | `--bg` and `--surface-inverse` are both surfaces; `--mute`, `--text-muted` and `--muted-mark` are one idea in two spellings |
| A name that says the wrong thing | `--diagram-critical` is filed as "Universal signal" in THEME 1.0 |
| A cryptic prefix | `--c-container`, `--c-subcontainer-edge` (`c-` is left over from the pre-2026-06 names) |
| A color mode in a name | the ten `--scheme-dark-*` tokens repeat the light names for the dark face |
| A tool's name in a token | `--marp-slide-pagination-font-size`, declared by a theme |

## 3. Naming principles

1. **Role, never look.** A name says what the token is for (`--text-heading`), never how it looks (`--blue`,
   `--light-gray`) or which mode it is in. HARD RULE #11 states this for the engine; the spec states it for everyone.
2. **One word per role, across every family.** `surface` is a surface, `text` is ink for reading, `mark` is ink for
   a graphic, `muted` is de-emphasis. No synonyms.
3. **One grammar:** `--{family}-{role}[-{variant}][-{state}]`, every part lowercase, words joined by hyphens.
   Numbers are always `-N`, counted from 1 (`--cat-3`, `--ramp-3`). Ink that sits on a surface is always
   `--on-{surface}` (`--on-accent`, `--on-cat-fill`, `--on-container`).
4. **Color mode is not in the name.** A theme gives each token a light and a dark value (CSS `light-dark()`), so
   `--scheme-dark-text-body` becomes the dark value of `--text-body`.
5. **A small required core; everything else optional, with a default.** A theme MUST give the core. A derived token
   has a recipe the engine applies when a theme does not override it.
6. **Every token is load-bearing.** A token enters the spec only if a layout reads it and no other token could
   serve. A token with one reader is a candidate to fold into that reader.
7. **Outside additions are prefixed.** A plugin's tokens start with its name (`--acme-gauge-fill`), so they can never
   collide with a core family (EXTENDING §4). CSS names cannot hold a `.`, so the prefix is joined by a hyphen and
   the core families are a reserved list.

### 3.1 SOLID, for tokens

| Principle | For tokens | Test |
|---|---|---|
| Single responsibility | one token, one role; no token is both an area color and an ink | no token is read both as `background` and as `color` |
| Open/closed | a new family or a plugin's tokens add names; they never change a core one | adding a chart kind adds no core token |
| Liskov | any theme that passes the gate drops in for any other, in both modes | the contrast gate passes for every theme and every layout |
| Interface segregation | a theme gives 10 seeds, not 132 tokens; a chart-only consumer reads only the categorical family | `deriveTheme` from the 10 seeds alone passes the gate |
| Dependency inversion | layouts read roles, never a theme's own values or a derived recipe's internals | HARD RULE #3's hex gate, plus no layout reads a `--scheme-dark-*` name |

### 3.2 Before and after

| Before | After | Principle |
|---|---|---|
| `--chart-cat3`, `--cat-3-fill`, `--cat-3-mark`, `--cat-3-ink` | `--cat-3` (the seed hue), and `--cat-3-fill`, `--cat-3-mark`, `--cat-3-text` derived from it | 2, 3, 5 |
| `--heatmap-step1` … `--heatmap-step5`, `--seq-500` | `--ramp-1` … `--ramp-5` | 3 |
| `--c-container`, `--c-on-container`, `--cat-on-fill` | `--surface-container`, `--on-container`, `--on-cat-fill` | 2, 3 |
| `--scheme-dark-text-body` | the dark value of `--text-body` | 4 |
| `--mute`, `--muted-mark` | `--muted`, `--muted-mark` | 2 |

These are examples of the principles, not a proposed rename list. The audit (§5, option B's later step) produces
the list, with a reader count and a migration row for each.

## 4. The seeds, against the principles

Nine of the ten seed names already pass: `--text-heading`, `--text-body`, `--text-muted`, `--accent`,
`--accent-soft`, `--pass`, `--warn`, `--fail`, and `--bg-alt` passes only alongside `--bg`. The one that fails
principle 2 is `--bg` itself: it and `--surface-inverse` are the same kind of thing under two words. Renaming
`--bg` and `--bg-alt` to `--surface` and `--surface-alt` touches 314 and 191 files and every theme. That is W1 on
the card, with "keep `--bg`" as the default, because "background" is the word every CSS author already knows and the
rename buys consistency only.

## 5. Options for the scope before 1.0

| Option | What ships at 1.0 | Measured cost | Risk |
|---|---|---|---|
| **A. Full audit and rename now** | all ~200 tokens renamed by the principles | 22,325 mentions in 1,015 files; every theme, every layout; exported HTML changes, so the dark and light export sign-off; the trio; about 4 days to release | the bar drops to make the date, or the date moves |
| **B. Freeze the 10 seeds now, the rest experimental** (recommended) | THEME 1.0 = the 10 seeds (principles §3, the derive recipes listed); derived tokens documented, overridable, name not promised | the spec rewrite and this audit; zero renames if W1 keeps `--bg` | the derived names stay inconsistent until the audit lands; an outside theme that overrides one may need the crosswalk later |
| **C. THEME stays a draft at 1.0** | nothing promised | none now | outside themes have no contract at all |

B is honest about what is load-bearing today. A theme author who gives the 10 seeds gets a theme that passes the
gate, and that promise is already true in the code. The rest can be designed properly instead of renamed in a rush.

## 6. Verification B owes

- `deriveTheme` from the 10 seeds alone passes `lib/theme/gate.js` for every shipped theme's seeds, in both modes.
  The 2026-08-09 contract note measured a generated theme failing the hand-theme gate on 27 tokens; that number is
  re-measured first, and closing it is part of B.
- The second "unused" pass (§2) before the spec lists anything as unread.
- The THEME PR gets the adversarial trio (#25) and a checker-graded 🚦 card. With no rename, no export bytes change.

## 7. Revision: curation first (owner, 2026-11-27)

**The owner's words (event `6086f4d5`, typed on iOS):** "i hate the fact that mermaid and other tools use derived
colors. We curate and only derive our of desperation". This reverses §1's model. The 10 seeds in `deriveTheme` are
how the Studio's generator starts a theme, not what the spec promises. Option A in §5 is withdrawn; §7.4 replaces it.
Nothing is renamed or changed until the owner answers.

### 7.1 What is curated today, and what is computed

**Themes are already curated.** In the five themes measured, almost every token is a hand-picked value:

| Theme | Tokens | Hand hex | Hand light/dark pair | Points at another token | Mixes two colors |
|---|---|---|---|---|---|
| indaco | 168 | 36 | 116 | 6 | 3 |
| cuoio | 173 | 33 | 116 | 10 | 7 |
| ardesia | 164 | 34 | 114 | 6 | 3 |
| carta | 167 | 35 | 116 | 6 | 3 |
| onyx | 201 | 32 | 114 | 9 | 3 |

The chart solids are curated too: `tools/curate-chart-solids.js` runs the solver once, and the theme commits the
resulting hex values, so a reviewer sees each one.

**The renderers compute.** CSS formulas that make a new color from others (`color-mix` of two colors, or
`oklch(from …)`), counted by line across `lib/` and `themes/`:

| Where | Mixes of two colors | See-through washes of one color |
|---|---|---|
| chart family (`lib/plugins/chart-family/`) | about 305 | about 114 |
| engine base CSS (`lib/base/`) | 64 | 152 |
| components | 20 | 24 |
| Mermaid's CSS | 13 | 0 |
| themes | 4 | 46 |
| `oklch(from …)` / `rgb(from …)` | 24, in 4 files | — |

A see-through wash keeps the curated color and only lowers its opacity; a mix makes a color nobody picked.

**Mermaid computes what we do not hand it.** Lattice maps 166 Mermaid theme settings to tokens
(`lib/plugins/mermaid/shared/mermaid-theme-map.js`). Mermaid fills every other setting from its own formulas
(`lighten`, `darken`, `invert` of the background). Its bundled theme code holds about 212 settings with a computed
default (an estimate from the minified bundle, `chunk-VLFMOWSA.mjs`; a measured run of which settings a Lattice deck
leaves to Mermaid is the first step of §7.4). The map's own comments record two that shipped off-brand before they
were mapped: the ER row bands (`lighten(background)`) and the flowchart arrowhead (`invert(background)`, a light
peach on a dark deck).

### 7.2 Concrete examples, checked on rendered slides

Rendered in indaco, light and dark, with `dist/lattice.js` to HTML and Playwright (scratch only, `.scratch/tok/`).
Two of the four first-draft examples were wrong, and are corrected here.

1. **Default charts paint curated colors.** A bar, a pie and a flowchart in indaco all paint category 1 with
   `#005D8F`, the theme's curated `--chart-cat1` solid. The computed tier `--chart-cat-1-fill` (24% of that hue
   mixed into the page, `chart-family.styles.css:320`) reaches a slide only where an author opts into a slot fill
   (`data-slot`, `data-fill`) or a kind that paints the pale tier. The first draft said bars ignore the theme; that
   was wrong. What is true: category 1 has two curated colors in indaco, `--cat-1-fill` `#BCD5EC` and
   `--chart-cat1` `#005D8F`, plus computed tiers between them.
2. **Chart text ink is a formula** where the theme states no `--chart-catN-ink` (`:359`). Unchanged.
3. **Mindmap lines keep each branch's hue and take an engine-set lightness** (`mermaid.styles.css:1197–1222`):
   0.47 on a light slide, 0.8 on a dark one. They are not a gray (the first draft said so); the comment there
   records why: every line clears 3:1 on all 14 color themes.
4. **A missing chart hue falls back to the engine's hex** (`--chart-cat-1-hue`). Unchanged.

**What the mindmap mock-up showed.** Swapping those lines to the theme's existing `--cat-N-mark` made both modes
worse. In light mode the lines no longer match their boxes, because indaco's curated pairs disagree in hue: category 2
is a yellow fill (`#EBE2B8`) with a red mark (`#863236`), category 3 a pink fill with an olive mark. In dark mode every
`--cat-N-mark` is near-white (`#E7D5D6`), so the lines wash out. So "curate, don't derive" needs a curated role made
for the job (a line color per category, in both modes), and the curated pairs need auditing: the 2026-07-15
categorical contract says fill and mark are tiers of ONE hue, and indaco's slots 2 and 3 break it.

### 7.3 Answers to the three questions

- **Which tokens must every theme curate by hand?** Every color a reader can see as its own color: surfaces, the ink
  tiers, the accent pair, the status colors and their tiers, the 12 categorical colors (fill, mark, text), the chart
  solids, the code-highlighting roles. That is today's required list (132 in THEME 1.0), which shipped themes already
  curate. The audit renames them by §3's principles before they freeze.
- **Where may a color be derived, and how is it marked?** Two places only. (a) A see-through wash of one curated
  color, which changes opacity and nothing else. (b) A fallback for an OPTIONAL token a theme leaves out, listed in
  the token registry with `derived: <recipe>`; the theme gate warns on every fallback it uses, so "derive out of
  desperation" is visible, never silent. A required token never has a fallback.
- **How do Mermaid and the other renderers get curated colors?** A renderer reads tokens and computes no new color.
  For Mermaid, every setting a rendered diagram consumes is mapped to a curated token, and a test fails if Mermaid
  would fill one itself. For the chart family, bars, edges and text read the curated `--cat-N-*` and chart solids,
  and the ~305 mixes become reads or marked fallbacks. A plugin's own colors follow the same rule (EXTENDING §4).

### 7.4 The scope question, revised

The honest size: making every renderer read curated colors touches about 440 formulas, mostly in the chart family,
and changes rendered colors, so it owes the dark and light export sign-off. That does not fit before 1.0 at the bar.
What can freeze at 1.0 is the CONTRACT: the curated required list, the two derivation exceptions, and the rule that
renderers compute no color. The renderer work then lands as fixes against that contract, each a visible improvement
with before/after renders, and no outside theme breaks because the theme side is already curated. This goes to the
owner as a visual explainer through the command center, not as a card.

### 7.5 The command center's two-layer proposal, tested against the code

The proposal: theme tokens are brand roles, hand-picked; each plugin declares its own tokens whose defaults point at
a theme role (an alias, never a formula); a theme may override a plugin token; Mermaid receives every setting
explicitly.

- **Mermaid already works this way.** `mermaid-theme-map.js` maps 206 Mermaid settings onto 41 theme tokens, every one
  an alias. What remains is (a) the 13 CSS mixes in `mermaid.styles.css` (the mindmap lines among them) and (b) the
  settings Mermaid fills itself, to be measured.
- **The chart family is the real work.** It declares 274 tokens; 167 declaration lines are formulas or engine hex.
- **The manifest cannot carry it yet.** `contributes.tokens` (`plugin.schema.json:485`, LPM §3.4) lists the tokens a
  plugin's CSS READS; it has no place for a token the plugin DEFINES with a default. The proposal needs a new field
  (for example `defines: { "--mermaid-edge": "--rule" }`), a schema change, an LPM change and a generator. LPM is a
  draft, so this is allowed, but it is new work.
- **What an alias cannot do.** §7.2's mock-up is the counterexample: an alias to an existing role gave the wrong
  color, because no role was picked for that job. Under the proposal the theme would need a role for it, or the
  plugin token's default would be wrong until a theme overrides it. Either way the theme's curated set grows (a line
  tier per category is 12 more picks per mode), or the plugin keeps a formula for the gap.
- **Contrast is the cost nobody sees.** Today's formulas exist mostly to guarantee contrast (the mindmap's 3:1, the
  chart ink's 7:1). An alias guarantees nothing; the gate has to check every plugin token against its surface in
  every theme, so `lib/theme/gate.js` grows from theme tokens to plugin tokens.

### 7.6 Chart category colors, and what the model does to the token count (2026-11-27)

The owner (event `6057f90b`, typed on iOS): "i am aligned but what about the chart categorical colors?" The command
center reads "aligned" as agreement with the two-step model (a theme picks colors by job; a plugin points its parts at
a job, with no math), and not as a decision on timing or freezing.

**What a theme picks for categories today (indaco).** 12 categories, each a fill, a mark and a text ink, each as a
light and dark pair: 36 hand-picked pairs. Charts have their own 8 solids (`--chart-cat1` … `--chart-cat8`) and 8 inks
on them, also hand-picked (written once by `tools/curate-chart-solids.js`, then committed). Caveat: the contract says
fill and mark are two tiers of one hue, and indaco's categories 2 and 3 break it (§7.2).

**Where the chart family computes a category shade instead of reading one.**

| Shade | How it is computed | Where it shows |
|---|---|---|
| `--chart-cat-N-fill`, the pale tier | 24% of the solid mixed into the page (light), 40% into black (dark), `chart-family.styles.css:320` | slot fills, flowchart slots, quadrant and pie variants; not a default bar, pie or flowchart |
| `--chart-cat-N-ink` | the theme's `--chart-catN-ink`, else a mix of the solid with the heading ink (`:359`); word clouds always mix, 75% (`word-cloud.styles.css:213`) | labels on category color |
| `--chart-cat-N-hue` fallback | the engine's own hex when a theme leaves out `--chart-catN` | any theme without chart solids |
| heatmap cells | the theme picks 5 mix percentages and 5 inks; the color is a mix of two poles (`heatmap.styles.css:82`) | heatmap, journey |
| map base | 16% of `--muted-mark` into the page (`map/*.css:18`) | choropleth map |
| waterfall, risk matrix, matrix grid | 13 mixes between them | those kinds |

No hover, selected or muted state token exists in the chart family's CSS.

**Past the curated set.** Charts pick 8 series colors, but the Cartesian charts cap at six series on purpose
(`parseSeries`, `cartesian.js:881`, citing Wong 2011), and a grouped bar or slope chart DROPS series 7 and up from the
slide: no bar, no key entry, no lint finding; only the chart's text description names them (rendered and checked,
`followups.d/3554-p2-chart-series-past-six-vanish.md`). An earlier draft of this note said they repeat; they vanish.
Nothing anywhere goes past 12. There is one sequential ramp (the heatmap's) and no curated diverging scale.

**Recommendation.** Categories: the theme picks, per category, a fill and a mark of one hue in both modes, and the
chart solids become the category's "solid" job, so charts and the rest of the deck draw category 3 from the same
family. Ramps: a theme picks one 5-step sequential ramp and one diverging scale (two ends and a middle), each step a
real color plus its ink, written once by a solver and committed for review, the way chart solids already are; nothing
mixes at render time. Past 12 series: no invented colors. A chart repeats the cycle and adds the texture channel the
a11y themes already ship (`--cat-N-texture`), and lint tells the author to group the tail into "Other". The silent drop past six is a defect to fix on its own.

**Token counts under the model** (measured where marked; "about" where the answer depends on the choices above).

| | Today | Under the model |
|---|---|---|
| Names a theme declares | 164–201 (measured, 5 themes) | about the same: the jobs stay; a dark value moves into its light name's pair |
| …of which repeat another name's exact value | 21–34 (measured) | 0 is the goal: one name per job |
| Required list in the spec | 132 (THEME 1.0) | about 122 (the 10 `--scheme-dark-*` fold into pairs), plus 10 per ramp step pair and any new job such as a line color per category (+12) |
| Mermaid's own named colors | 0 (206 settings point at 41 theme tokens) | about 41, one per job it uses, each an alias |
| Chart family's own names | 274 (measured) | about the same count; the 167 formula or engine-hex definitions become aliases or theme reads |
| Sparks / icons | 22 / 14 (12 / 3 formulas) | same names, no formulas |
| Two-color formulas at definition | about 195 (167 chart, 13 Mermaid, 12 sparks, 3 icons) | 0, apart from see-through washes |

The model does not cut the total much. It cuts the formulas to zero, moves plugin colors out of the theme spec into
the plugins, and turns the duplicates into one name per job. What a theme author must pick stays about the same,
because the curated colors already exist.

### 7.7 Plugin colors live in the plugin (owner, 2026-11-27)

**The owner's words (event `1cb83b87`, typed on iOS):** "today our themes vary tokens for things like mermaid and hljs.
my thought is these belong with the plugin. … i'm a perfectly comfortable with the mermaid plugin containing multiple
theme css file of its one that it loads for each them. … the plugin designer has to want to provide color tokens
semantics for their plug for each theme. the plugin owns it and we know nothing about that. we should have our own
base categorical colors and ramp colors any plugin can use. i imagine our charts would just directly use them."

This replaces §7.5's alias layer. Two owners: the THEME picks the core (brand roles, the base categorical colors, the
ramps); a PLUGIN that wants its own per-theme colors ships them, one file per theme, and the core does not know what
they mean.

**(a) Plugin-specific tokens in a theme today** (indaco; the other light themes match within a few):

| Family | Count | Who reads it | Under the model |
|---|---|---|---|
| `--syntax-*` | 14 | the code plugin (highlighting), the docs site's code blocks | code plugin's own per-theme file |
| `--diagram-*` | 11 | Mermaid (through `mermaid-theme-map.js`), and two chart-family files (flowchart) | Mermaid's own file; the flowchart moves to core roles |
| `--c-*` (containment) | 6 | Mermaid only | Mermaid's own file |
| `--chart-cat1…8`, their inks, `--chart-neutral-mark` | 17 | chart family | fold into the core categorical set (a "solid" job per category) |
| `--heatmap-step*` | 10 | chart family | replaced by the core sequential ramp |
| `--code-*` | 2 | code component, code plugin | core (a code block is a core surface) |

So 31 tokens per theme (14 + 11 + 6) leave the theme for two plugins, and 27 chart tokens become core categorical
and ramp jobs.

**(b) How a plugin finds the current theme's file.** Recommended: at BUILD time. The plugin declares
`contributes.themes: { "indaco": "themes/indaco.css", …, "default": "themes/default.css" }` in its manifest;
`tools/build-css.js` already writes one file per theme (`dist/themes/<name>-min.css`) and appends each plugin's file
for that theme to it. Every render path (preview, PDF, PPTX, the player, the Marp export) already loads the theme's
file, so the plugin's colors arrive with no runtime lookup and no second code path (HARD RULE #1). A `-dark` theme that
composes a light one gets the light one's plugin file, because the values are light/dark pairs. Needs: a manifest
field, `plugin.schema.json`, LPM §3.3, and the bundler step. A zip plugin's theme files are a stylesheet channel, so
they pass `sanitizeStyleText` (HARD RULE #22) before they join a theme file. The runtime alternative (the plugin's
browser half fetches its file by theme name) is rejected: the CLI export has no browser half to run it.

**(c) A theme the plugin has no file for** (an outside theme, or one added after the plugin):

| Option | What happens | Cost |
|---|---|---|
| A. The plugin's `default` file, built only from core roles (recommended) | the plugin looks on-brand in any theme that picks the core, just not hand-tuned | each plugin writes one default; a theme stays complete |
| B. The theme package ships the plugin's file (`themes/acme/plugins/mermaid.css`) | a theme author tunes a plugin they care about | optional, on top of A |
| C. No file, no colors | the plugin falls back to its library's own colors (Mermaid's stock look) | off-brand; this is today's failure, made official |

A plus B: the default keeps every theme working, and a theme or a plugin author may tune.

**(d) Ramps the core adds, measured from what charts use today.** A sequential ramp: the heatmap uses 5 steps, and the
choropleth map the same pole-and-base mix (`--chart-ramp-hue` and `--heatmap-base`, both computed today). A diverging
scale: the bar chart's `diverging` form colors by sign. So: one 5-step sequential ramp and one 5-step diverging scale
(two ends, a middle, two between), each step a color plus its ink, in both modes: 20 picks per theme, written once by
a solver and reviewed, like the chart solids. `--seq-500` folds into the sequential ramp.

**(e) Token counts per theme, before and after** (indaco; "about" where the categorical-solid choice decides it):

| | Before | After |
|---|---|---|
| Theme file | 168 | about 144: minus 31 plugin tokens, minus 10 `--scheme-dark-*` folded into pairs, minus 10 heatmap and 17 chart tokens, plus 12 category solids with inks (24) and the two ramps (20) |
| Mermaid's file for indaco | 0 | about 17 (today's `--diagram-*` and `--c-*`) |
| Code plugin's file for indaco | 0 | 14 (today's `--syntax-*`) |
| Duplicate names in the theme | 23 | 0 is the goal |
| Formulas a render computes | about 195 | 0 apart from see-through washes |

The total stays near 170 per theme. The spec freezes the theme file's core only, about 144 names, and a plugin's
file versions with its plugin.

**(f) Who checks contrast.** Today `lib/theme/gate.js` checks theme tokens. Under the model, the core gate checks
the core roles in every theme. Each plugin declares its contrast pairs in its manifest (which of its colors sits on
which, and the floor: 4.5:1 for text, 3:1 for lines), and the build runs the same checker over every plugin file for
every theme, the default included. A plugin that declares no pairs is not checked, and the theme gallery says so. That
keeps "the core knows nothing about plugin semantics" true: the plugin states its pairs, the core only measures them.

## 8. The design (owner's direction, 2026-11-27)

**Status of the direction.** The owner chose it in the command center's question tool at about 05:57 UTC, not in a
typed message, so it is recorded as "owner's choice in the question tool, typed confirmation pending". Their answers:
"Yes, this direction" (the design below), and "default file+override+warn" for a theme a plugin has no file for.
Timing and freezing are still under discussion: this section freezes nothing and changes no code.

### 8.1 Two owners, no math

| Owner | Owns | Knows about the other |
|---|---|---|
| **The theme** | the core: brand roles, the category colors, two ramps. Hand-picked, light and dark | nothing about any plugin |
| **A plugin** | its own per-theme colors, if it wants them (Mermaid, code highlighting): one file per theme plus a default, folded into the theme's built file | only the core roles, which any plugin may read |

No rendered color is computed from others, except a see-through wash of one picked color (opacity only). Charts are
part of the core's audience: they read the core category colors and ramps directly, with no chart-only palette.

### 8.2 The core a theme picks

| Job | Tokens (light and dark each) | Today |
|---|---|---|
| Surfaces | page, alternate page, inverse surface, border, containers | `--bg` `--bg-alt` `--surface-inverse` `--border`, `--c-*` (moves to core as containers) |
| Text | display, heading, body, secondary, label, muted | `--text-*` |
| Accent | accent, soft accent, ink on each | `--accent` `--accent-soft` `--on-accent` … |
| Status | pass, warn, fail, info, muted: each a strong color, a pale background and the ink on each | `--pass` … and their tiers |
| Categories 1–12 | each: **strong** (a mark, a bar, a box with white or dark ink), **pale** (a background behind text only), **ink on strong**, **ink on pale** | `--chart-catN` (strong, 8 of 12), `--cat-N-fill` (pale), `--cat-N-mark`, `--cat-N-ink`, `--chart-catN-ink` |
| Sequential ramp | 5 steps, each a color and its ink | computed today (`--heatmap-step*` are percentages) |
| Diverging ramp | 5 steps (two ends, a middle, two between), each a color and its ink | none today |
| Code | inline code ink, code block text | `--code-*` |

**Strong and pale are two jobs, held to two rules.** The experiment of §7.8 (below) measured why: a strong category
color carries white text at 4.6:1 or better and stands 3.7:1 or better off the page, so it can be a bar, a line or a
box; a pale one stands only 1.3:1 off a light page, so it may sit only BEHIND text, never as a mark on the page. The
contrast check enforces both rules.

**Past six or twelve.** Charts keep their six-series cap and say so (lint), or fold the tail into "Other"
(`followups.d/3554-p2-chart-series-past-six-vanish.md`). Past 12 nothing invents a color: the cycle repeats and the
texture channel (`--cat-N-texture`, shipped by the a11y themes) tells repeats apart.

### 8.3 Plugin colors

A plugin that wants per-theme colors declares them in its manifest: `contributes.themes` maps a theme name to a CSS
file and names a `default`. The build appends the file to that theme's built stylesheet (§7.7 b). A plugin's file may
read core roles and may define names under its own prefix (`--mermaid-…`, `--code-…`), and nothing else. Code
highlighting's 14 colors and Mermaid's 17 leave the theme files for those plugins' files.

**A theme the plugin has no file for:** the plugin's `default` file, written from core roles; a theme package MAY ship
its own file for a plugin (`themes/<theme>/plugins/<plugin>.css`), which wins; and the build and the theme gallery
WARN, naming the plugin and the theme, whenever a plugin falls back to its default.

**Contrast:** each plugin declares its pairs in its manifest (which of its colors sits on which, and the floor). The
build measures every pair for every theme, the default file included. A plugin that declares none is unchecked, and
the gallery says so. The core gate checks the core in every theme.

**Safety:** a plugin's theme file is a stylesheet, so a zip plugin's file passes `sanitizeStyleText` before it joins
a theme's file (HARD RULE #22).

### 8.4 Naming, unchanged from §3

Role, never look; one word per role; `--{family}-{role}[-{variant}][-{state}]`; numbers `-N` from 1; `--on-{surface}`
for ink on a surface; no color mode in a name; outside names prefixed. The rename list comes from the audit and is
the THEME PR's, under the trio.

### 8.5 What this changes in the specs

- **THEME 1.0** describes the core of §8.2: the jobs, their names, and the two contrast rules. It cites a token
  registry (EXTENDING §3) for the list. It no longer lists `--syntax-*`, `--diagram-*`, `--c-*` or `--chart-*`.
- **LPM** gains `contributes.themes` and the contrast-pair declaration. LPM stays a draft at 1.0.
- **EXTENDING §4** already reserves prefixed names for plugins; a plugin's token prefix is its name.

### 8.6 Still open

Timing and freezing (whether THEME 1.0 freezes this core before Lattice 1.0, about December 1–2) are the owner's,
still under discussion. Nothing here is built. The work, when the owner says when: the audit and rename list; the
indaco category pairs that disagree in hue (§7.2); the two ramps for all 33 themes, solver-written and reviewed; the
plugin files for Mermaid and code highlighting; the manifest field and its build step; the contrast-pair checker. A
rename changes exported class and token names, so it owes the dark and light export sign-off.

### 7.8 The swap experiment (scratch, 2026-11-27)

Rendered at the owner's request: Mermaid (flowchart, mind map, sequence) drawn with the chart colors, and charts (bar,
pie, line) drawn with Mermaid's diagram colors, in indaco and cuoio, light and dark, beside today's. Scratch themes,
removed after; nothing committed but this paragraph. Contrast from the real values, with `contrastRatio`
(`lib/core/color.js`):

| | indaco light | indaco dark | cuoio light | cuoio dark |
|---|---|---|---|---|
| White on a chart (strong) color | 7.09 | 4.60 | 7.06 | 4.60 |
| Chart (strong) color against the page | 7.09 | 3.69 | 6.61 | 4.04 |
| Diagram (pale) color against the page | 1.30 | 2.41 | 1.29 | 2.64 |

Mermaid with the strong colors passes and matches the charts; charts with the pale colors fail the 3:1 a chart mark
needs, worst in light mode, where a line nearly disappears. In dark mode a theme's pale diagram fills are already close
to its strong chart colors.
