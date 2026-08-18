---
status: shipped
summary: >
  An audit of every deck front-matter key and per-slide directive the engine reads against
  what the three settings surfaces actually offer. Twelve deck registers have NO control
  anywhere — including all six `logo*` keys, `meta:`, `corners:`, `claim:`, and the deck-wide
  `stamp:`/`tone:` shapes whose per-slide overrides DO have controls. Two defects fall out of
  the sweep: the Playground's Mode row never renders (its host never passes `modes`), and its
  `math:` control writes a key nothing in the engine reads. Four hand-maintained enumerations
  of the same surface are drifting (deck-config `FIELD_DEFAULTS`, the Studio Inspector's rows,
  the editor's `FRONT_MATTER_KEYS`, and the engine's own register reads) with no parity gate.
  Shipped: one tab vocabulary across both scopes, ordered by likely reach, with a clause per
  row and the full prose behind a new touch-capable `HelpTip` popover (Radix Tooltip cannot
  open on touch), and controls for nine of the twelve uncovered registers. The deck's Marks
  tab is now Chrome and the slide's Status + Decoration merge into Marks; a new General tab
  holds the deck's name, language and structure. Both Playground defects are fixed in place.
---

# Deck & Slide settings — front-matter coverage audit + a UX redesign

**Date:** 2026-08-18
**Status:** shipped — the catalog (§2–3) is fact; the redesign (§5) landed with the
amendments in §7.

The ask: *"we have front matter that doesn't have a setting entry in deck or slide
settings? let's catalog them. also let's look at reorganizing and grouping things in
the deck and slide settings panels. we should also reduce the description so they are
brief without losing clarity. maybe even introduce a help icon."*

This note is the catalog (§2–3), the diagnosis (§4), and the design model (§5).

---

## 1. The three surfaces, and who owns what

*(This section is the state the audit found — before §7's changes.)*

There is not one settings panel. There are three, written at different times, with
three different groupings and three different vocabularies for the same registers.

| Surface | File | Shape | Controls |
|---|---|---|---|
| **Studio Inspector · deck scope** | `docs/src/components/studio/StudioShell.tsx` (`inspectorBody`, `DECK_TABS`) | React, 5 pill-tabs + a `Developer` disclosure | 27 |
| **Studio Inspector · slide scope** | `docs/src/components/studio/SlideContext.tsx` (`SlideContextBody`) | React, up to 8 pill-tabs | ~30 |
| **Playground Deck settings** | `docs/src/playground/deck-config.js` mounted by `docs/src/components/playground/DeckSetupSheet.tsx` | vanilla DOM, one flat scroll + an `Advanced` sub-head | 15 fields (one dead — §4.2) |

The Studio Inspector is the primary surface. The Playground panel is the older
vanilla one; its docstring still names two consumers (Workbench, Drawing Board) that
were **removed** (`2026-07-03-studio-succession.md`), so `DeckSetupSheet` is its only
live mount.

A fourth surface *describes* front matter without editing it: the editor's
autocomplete (`docs/src/components/studio/editor-complete.ts`, `FRONT_MATTER_KEYS`) —
a **fourth, separately-drifting list** of 15 keys.

---

## 2. Catalog — deck front matter

Legend: **S** = Studio Inspector · **P** = Playground Deck settings · **A** =
editor autocomplete only · **—** = no control anywhere.

### 2.1 Covered by at least one panel

| Key | Reader | S | P | Note |
|---|---|:-:|:-:|---|
| `title:` | `studio-store.ts:157` (app metadata, not LFM) | ✓ | — | "Deck name" |
| `theme:` | `lib/core/resolve-palette.js` | ✓ | ✓* | *P omits it by profile — the top bar owns theme there |
| `lang:` | `lib/engine/directives.js` | ✓ | ✓ | |
| `size:` | `lib/engine/directives.js` | ✓ | ✓ | |
| `color-mode:` | `lib/core/resolve-color-mode.js` | ✓ | ✓ | |
| `mode:` | `lib/core/resolve-mode.js` | ✓ | ✗ | P's row is **dead** — §4.2 |
| `finish:` | `lib/core/resolve-finish.js` | ✓ | ✓ | |
| `lift:` | `lib/core/resolve-lift.js` | ✓ | ✓ | |
| `header:` / `footer:` | `lib/engine/directives.js` | ✓ | ✓ | |
| `paginate:` | `lib/engine/directives.js` | ✓ | ✓ | |
| `class:` | `lib/core/deck-class-register.js` | ~ | ✓ | S writes it **only** for the `no-progress` rail token; no general control |
| `spectrum:` | `lib/core/resolve-spectrum.js` | ✓ | ✗ | |
| `spectrum-edge:` · `spectrum-card:` · `spectrum-card-edge:` · `spectrum-trim:` | same | ✓ | ✗ | |
| `rule:` · `eyebrow:` · `headline:` | `resolve-rule.js` / `resolve-eyebrow.js` / `resolve-headline.js` | ✓ | ✗ | |
| `motion:` · `motion-style:` · `motion-speed:` | Studio/anima host | ✓ | ✗ | |
| `lexicon:` · `acronyms:` | `lib/core/resolve-captions.mjs` | ✓ | ✗ | Speech tab |
| `debug:` | `lib/engine/directives.js` | ✓ | ~ | P offers only a **session override**, not the key |
| `split:` | `lib/core/resolve-split.js` | ✗ | ✓ | |
| `glossary:` | `lib/core/glossary-auto.mjs` | ✗ | ✓ | |
| `form:` | `plugins.js:754` (`readFormMode`) | ✗ | ✓ | |
| `validate:` | `docs/src/playground/editor.js:425` | ✗ | ✓ | S uses a **workspace** setting instead — §4.3 |
| `lenses:` | `docs/src/lib/lente/registry` | ✓† | ✗ | †own panel (`LensesPanel`), not the Inspector |
| `finish-override:` | `front-matter.ts:parseFinishOverride` | ✓† | ✗ | †authored in Fabricate, correctly not a row |

### 2.2 **THE GAP — the engine reads it, nothing offers a control**

| Key | Values | Reader | What it does |
|---|---|---|---|
| `claim:` | `framed` \| `quiet` \| `hero` \| `bleed` | `lib/core/resolve-claim.js`, `plugins.js:255` | Deck-wide claim framing (`claim-*` on every slide) |
| `corners:` | `rounded` \| `square` | `lib/core/resolve-corners.js`, `plugins.js:293` | Whether the slide surface itself is rounded |
| `stamp:` | shape name (`seal`, `tab`, …) | `lib/core/resolve-stamp.js`, `plugins.js:259` | Deck-wide stamp SHAPE. **The per-slide override has a control; the deck default does not.** |
| `tone:` | `rail` \| `edge` \| `glow` | `lib/core/resolve-tone-style.js`, `plugins.js:261` | Deck-wide tone SHAPE. Same asymmetry as `stamp:`. |
| `logo:` | path | `plugins.js:452`, `lib/runtime/index.js:1517`, `lib/forms/tile/logo` | The deck logo in the masthead. **Zero UI anywhere** — you must hand-write YAML. |
| `logo-on:` | `all` \| `title` | `plugins.js:455` | Which slides carry it |
| `logo-style:` | `auto` \| `brand` | `plugins.js:454` | Mark treatment |
| `logo-x:` · `logo-y:` | 0–100 (center, %) | `plugins.js:470-471` | Placement |
| `logo-scale:` | multiplier 0.2–3 | `plugins.js:472` | Size |
| `meta:` | free text | `lib/forms/tile/meta/meta.transform.js:39` | The masthead bay's meta line |
| `pace:` | `brisk` \| `natural` \| `deliberate` | `lib/core/resolve-pace.mjs` | Self-presenting hold before speaking. **A** only |
| `captions:` | slide № → read-as text | `lib/core/resolve-captions.mjs:170` | Deck-level read-as map (the per-slide `<!-- caption: -->` has a control; this sibling does not) |
| `ai-lang:` | BCP-47 | `docs/src/components/studio/studio-language.ts:90` | AI output language when it differs from `lang:`. **A** only |
| `style:` | CSS block scalar | `lib/engine/directives.js` | Raw deck CSS |
| `color:` · `backgroundColor:` · `backgroundImage:` · `backgroundPosition:` · `backgroundRepeat:` · `backgroundSize:` | Marp values | `lib/engine/directives.js` `APPLIED_DIRECTIVES` | Marp-inherited background/color directives |

**Nine of these — the six `logo*` keys, `meta:`, `corners:`, `claim:` — are
first-class Lattice registers a boardroom author would reach for, and the only way to
set any of them today is to hand-write YAML.** `logo:` is the sharpest: a deck logo
is table stakes for a client deck, and the Studio has no control for it at all.

### 2.3 Deliberately NOT front matter — do not add a control

Recorded here so the next audit doesn't "fix" them:

- `autosplit:` — **retired.** Page count is a function of content and box, not an
  authoring switch (`2026-07-29-autosplit-is-not-a-toggle.md`); `lint-core.js:252`
  flags a deck that still carries it.
- `overflow-marker:` — moved out of front matter into the export-settings data block
  (`2026-07-30-overflow-marker-register.md`, `lib/core/export-settings.js`).
- `present:` / `player:` — read by `lattice-emulator.js:1694/1710` as a CLI
  convenience, but they are **render-target properties**, which `export-settings.js`
  argues at length do not belong in the deck. The Studio decides both at export time
  (ShareSheet). Leave them CLI-only.
- `marp:` — mechanical (`deck-config.js` emits it so an exported `.md` renders through
  marp-cli). Not an author-facing setting.

### 2.4 Phantom — a control with no reader

- **`math:`** — the Playground's Advanced section offers *Math renderer → KaTeX /
  MathJax*, writing `math: mathjax`. **Nothing in `lib/` or `lattice-emulator.js`
  reads the key.** A grep for `mathjax` across the engine returns only the control
  itself. It is inert except insofar as an export-to-Marp deck is later rendered by
  marp-cli, which honors marp-core's own `math:`. This is the exact failure mode
  `export-settings.js` warns about: *"a key that LOOKS like an input and is not."*

---

## 3. Catalog — per-slide directives

The slide panel edits the `_class:` token list plus three comment channels
(`note` / `caption:` / `describe:`). Everything else in `KNOWN_DIRECTIVES`
(`lib/engine/directives.js:38`) is *preserved* by the span-surgical writer but has
**no control**:

| Directive | What it does | Control? |
|---|---|---|
| `_focus:` | Ordinal spotlight (`row 4`, `col 5`, `line 3-4`) | ✗ |
| `_focusStyle:` | `spotlight` \| `ring` \| `list-fill` | ✗ |
| `_focusSteps:` | Pipe-separated walk — expands one slide into N | ✗ |
| `_build` | Progressive disclosure | ✗ |
| `_debug` | Per-slide layout overlay | ✗ (deck-level only) |
| `_paginate:` · `_header:` · `_footer:` | Per-slide Marp overrides | ~ — the panel offers the `no-*` class tokens instead, which is the better shape |
| `_backgroundImage:` · `_backgroundColor:` · `_color:` · `_style:` | Marp per-slide | ✗ |
| `_lens:` | Reader-lens membership | ✓ — own panel (`LensesPanel`) |

`_focus` / `_focusSteps` / `_build` are the notable absence: they are Lattice's own
narrative grammar (two dated decision records back them) and they drive Present's
"Notable" behavior (`present-guide.ts:449`), yet an author can only reach them by
typing the comment.

---

## 4. Diagnosis — what's actually wrong with the panels

### 4.1 Four lists of the same thing, drifting
`FIELD_DEFAULTS` (deck-config), `DECK_TABS`+`inspectorBody` (Studio), `FRONT_MATTER_KEYS`
(autocomplete), and `deckClassPropagate`'s register reads (the engine) are four
hand-maintained enumerations of the deck's front-matter surface. Only the last is
authoritative. There is no gate holding the other three to it — the same class of
drift `slide-directives.ts` already solved for `DIRECTIVE_KEYS` with a parity test.

### 4.2 A dead control
`DeckSetupSheet` never passes `modes`, and `deck-config.js:490` renders the Mode row
only `if (show('mode') && modes.length)`. **The Playground's Mode row never renders.**
`mode` is in the `noTheme` profile, so the intent was clearly for it to.

### 4.3 The same setting, two mechanisms
Inline validation is a **deck** setting in the Playground (`validate:` front matter,
travels with the deck) and a **workspace** setting in the Studio
(`loadSettings().validation`, `StudioShell.tsx:779`). One of the two is wrong; the
front-matter one has the better argument (the choice belongs to the deck that needs it).

### 4.4 Descriptions are paragraphs
Every row carries a `desc` that is one to three full sentences, always visible. Sampled:

> "Which way the framing text — eyebrow, heading, rule, subtitle, note, key insight,
> caption — aligns. Auto keeps each component's own default; Left / Center / Right pin
> the whole cluster." — 32 words, Accent tab, one of eight such rows.

Eight rows × ~30 words = a wall of gray the eye skips, which defeats the purpose the
prose was written for. The Accent tab is ~1100px tall on desktop for eight controls.

### 4.5 No progressive disclosure inside a tab
Every control in a tab is equally prominent. `Card rail placement` (a sub-option of a
sub-option) sits at the same weight as `Brand bar`.

### 4.6 The two scopes don't share a spine
Deck tabs are *Look · Accent · Marks · Motion · Speech*. Slide tabs are *Look · Accent
· Motion · Status · Decoration · Chrome · Notes · Comments*. "Marks" (deck) and
"Chrome" (slide) are the same idea under two names, and "Marks" is the more natural
name for the slide's Status+Decoration overlays — i.e. the vocabulary is not just
different, it is **crossed**.

---

## 5. The design model

### 5.1 Axes

1. **Grouping** — how the ~30 controls per scope divide, and whether the two scopes
   share one spine.
2. **Coverage** — which of §2.2's twelve uncovered registers earn a control.
3. **Description model** — how much prose is visible, and where the rest lives.
4. **Surface consolidation** — whether the Playground's vanilla panel is rebuilt on
   the Studio's React rows, or left alone.

### 5.2 Recommended moves

**A. One spine, both scopes.** Rename the deck's *Marks* → **Chrome**, freeing
*Marks* for the slide's Status+Decoration merge (both are overlays on the slide;
they differ only in whether they carry meaning, which a group heading can say).

| | Deck | Slide |
|---|---|---|
| identity strip (above the pills, always visible) | Deck name · Language | slide № · Reset |
| **Look** | theme, color mode, size, mode, finish, lift · *more:* corners, claim | canvas, type scale, finish, compact, accent |
| **Accent** | brand bar, bar placement, card rail (+placement), trim, heading rule, eyebrow, headline · *more:* stamp style, tone style | same seven |
| **Chrome** | header, footer, page numbers, section rail · *more:* logo (+ on/style/scale/x/y), meta line | clean slide, hide header/footer/page/rail |
| **Motion** | play, style, speed | play, style, speed |
| **Marks** | — | stamp chips + style, tone chips + style, tint, mark |
| **Speech** | lexicon, acronyms · *more:* pace | note, caption, description |
| **Comments** | — | review notes |
| footer `Advanced` disclosure | Structure (split, form, glossary, default class) · Developer (inline validation, debug) | — |

Deck name and Language leave *Look* — they are not appearance. Putting them in an
always-visible strip above the pills also means the two most-reached controls are
never behind a tab.

**B. Coverage: add nine, decline four.** Add controls for `logo` + its five
modifiers, `meta`, `corners`, `claim`, `stamp` (deck), `tone` (deck), `pace`, and —
for the Studio — `split`, `form`, `glossary`, `class`. Decline: `style:` and the
Marp `background*`/`color` directives (raw CSS and Marp-compat escape hatches; the
editor with autocomplete is the right surface), `captions:` (the per-slide caption
control is the ergonomic form of the same thing), `ai-lang:` (fold into the existing
Language row as a secondary field rather than its own).

Per-slide `_focus` / `_focusSteps` / `_build` are a **larger** design (they need an
ordinal picker against live slide content, not a dropdown) — out of scope here, and
recorded as such rather than silently skipped.

**C. Descriptions: a visible clause, a full explanation on demand.**
Every row becomes `label` + a ≤ 8-word clause, with the current prose moved verbatim
into an ⓘ affordance beside the label.

> **Headline alignment** ⓘ
> Auto, or pin left / center / right.

with the ⓘ carrying *"Which way the framing text — eyebrow, heading, rule, subtitle,
note, key insight, caption — aligns. Auto keeps each component's own default."*

**D. The help affordance is a new shared primitive, not a tooltip.**
`Tip` (`docs/src/components/ui/tooltip.tsx`) is Radix Tooltip, which **does not open
on touch** — its own docstring calls native `title` "touch-blind", and Radix Tooltip
has the same limitation. The ask is explicitly "hover **or touch**", so the widget is
`docs/src/components/ui/help-tip.tsx`: an ⓘ icon-button on Radix **Popover** (already
in `components/ui/`), opening on click/tap/Enter for touch + keyboard, with a
hover-intent open under `@media (hover: hover)` so a mouse still gets it for free.
One primitive, reused by both Inspector scopes (HARD RULE #15).

**E. Fix the two defects found by the audit** (§4.2 dead Mode row, §4.4 phantom
`math:` control) in the same change — they are on the path.

### 5.3 What this does NOT propose

Consolidating the Playground's vanilla `deck-config.js` onto the Studio's React rows
is the right end state (it would collapse two of the four drifting lists into one),
but it is a different change with a different blast radius, and folding it in here
would violate HARD RULE #17. Recorded as the follow-on, not done here.

---

## 6. What the human picked

1. **Scope** — Studio Inspector only. The Playground's vanilla panel keeps its layout;
   the two defects the audit found in it (§4.2, §2.4) were fixed in place, since they
   are on the path of the audit that found them.
2. **Coverage** — the nine high-value registers.
3. **Grouping** — see §7: a **General tab**, not a pinned strip, and **tabs ordered by
   likely reach**.
4. **Help model** — a short clause per row plus a ⓘ popover.

---

## 7. What shipped, where §5 was amended

The design proposed pinning the deck's identity fields (name, language) in an
always-visible strip above the tab strip. **That was rejected in favour of a General
tab** — the same reachability without a second kind of surface in the panel, and a
natural home for the structural keys (`split:`, `form:`, `glossary:`, `class:`) that
otherwise had nowhere to go. It also absorbs the Developer footer disclosure, so the
panel is a tab strip and nothing else.

The other amendment is the ORDER. §5 grouped the tabs; the shipped strip also *ranks*
them, left to right, by how often an author is likely to reach for each:

| | Deck | Slide |
|---|---|---|
| 1 | **Look** — theme, color mode, size, mode, finish, card lift · *more:* corners, claim | **Look** — canvas, type scale, finish, compact, accent |
| 2 | **Chrome** — header, footer, page numbers, section rail, logo (+4 modifiers), meta line | **Notes** — speaker note, caption, description |
| 3 | **General** — deck name, language, new-slide-on, deck chrome, auto-glossary, default class · *more:* Developer (validation, debug) | **Chrome** — clean slide, hide header / footer / page number / rail |
| 4 | **Accent** — brand bar, placements, card rail, trim, heading rule, eyebrow, headline · *more:* stamp shape, tone shape | **Marks** — stamp (+shape), tone (+shape), tint, mark |
| 5 | **Motion** — play, style, speed | **Accent** — the same seven axes, per-slide |
| 6 | **Speech** — pace, lexicon, acronyms | **Motion** — play, style, speed |
| 7 | — | **Comments** — review notes |

`Marks` → `Chrome` on the deck side and `Status` + `Decoration` → `Marks` on the slide
side are one move, not two: the two panels held each other's word (§4.6), and the merge
is what frees it. The merged tab keeps the distinction the two tabs used to carry as a
section head each — *Says something* (a state badge, a review tone) and *Says nothing*
(a tint, a mark).

**The help affordance is `docs/src/components/ui/help-tip.tsx`**, a Popover as §5.2 D
argued. One implementation detail earned its own note: the ⓘ is rendered INLINE
(`inline-grid` + `align-middle`), not as a flex sibling of the label. As a sibling it
took its own 20px of a no-wrap row, which broke "Color mode" onto two lines and then
orphaned the icon on a line of its own — visible in the first real-surface screenshot,
invisible to every unit test.

### 7.1 The second pass: one row geometry, and the resolved value everywhere

Three follow-on asks landed in the same PR, and the first two turn out to be one change.

**Every control now owns an equal half of its row.** `SETTING_ROW` /
`SETTING_LABEL_COL` / `SETTING_CONTROL_COL` (`docs/src/components/ui/panel.tsx`) split a
setting into `label | control` at 45/45 with the help line beneath, and both Inspector
scopes use them. Because the two columns are `flex-1 min-w-0`, the free space divides
evenly: every control starts at the same x whatever its label's length, and a filling
control (dropdown, text input, segmented control) takes `w-full` and TRUNCATES rather
than growing. Each control previously sized to its own content, so a column of them was
a ragged edge. The row still `flex-wrap`s, so a control whose min-content cannot fit its
half drops to its own full-width line instead of overflowing the panel.

The docked Inspector is already clamped to **260–420px** (`SET_MIN` / `PANEL_MAX` in
`StudioShell.tsx`) — so the max width the ask wondered about exists, and the narrowest
column this geometry has to survive is ~108px. That is the number the labels below are
written against.

**The resolved value is back in every "Auto".** It had been removed on purpose: a long
`Automatic — English (United States)` label widened its whole control, because the
trigger mirrors the selected row and every control sized to its content. That trade is
exactly what the geometry above dissolves, so the rule is now uniform — **wherever the
word Auto appears, what it resolves to follows it**:

| Where | Before | After |
|---|---|---|
| Deck ▸ Theme | `Auto` | `Auto — Cuoio` |
| Deck ▸ Language | `Auto` (value in the tooltip) | `Auto — English (United States)` |
| Deck ▸ Heading rule | `Auto` | `Auto — hairline` |
| Slide ▸ Brand bar (deck sets nothing) | `Rainbow` | `Auto — Rainbow` |
| Slide ▸ Heading rule | `Auto` (collapsed) | `Auto — hairline` |

Three shapes had been in play — a bare `Auto`, an `Auto — <value>`, and a bare `<value>`
— and no reader could see the rule that picked between them. The collapse to a bare
`Auto` existed to avoid an `Auto — Auto` echo on the four catalogs whose own value is
labeled "Auto"; those entries now carry an `autoLabel` naming what their auto LANDS on
(`hairline`, `component`, `by size`, `bar`), which `catalogOptions` and `autoHeadLabel`
both read. Keep those to one short word: the control truncates, and `Auto — masthead d…`
has spent the width and said nothing.

**A performance note, because it was nearly shipped twice.** Mounting a Radix Popover per
row for the ⓘ cost **44% of the StudioShell test file's runtime** (63.9s → 92.0s) and
tipped a lazy-panel test past its budget. `HelpTip` is now lazy — a plain button until the
tip is first asked for, the Popover mounting on the gesture that opens it. Re-measured
back-to-back, twice each: mine 69.8s / 63.2s, baseline 64.6s / 66.9s — parity. The first
two attempts to read this from a single run each gave a wrong answer (one contaminated by
a browser running alongside, one by run-to-run variance of ±14%), which is worth knowing
before anyone reads a single timing here as signal.

**Not done, and deliberately:** `style:`, the Marp `background*` / `color` directives,
`captions:`, and the per-slide `_focus` / `_focusSteps` / `_build` grammar. The first
group is an escape hatch the editor (with autocomplete) serves better; the last needs an
ordinal picker driven by live slide content, which is a design of its own rather than a
row in a panel.
