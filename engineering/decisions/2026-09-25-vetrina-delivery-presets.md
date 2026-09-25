---
status: in-progress
summary: Vetrina gets delivery presets (restrained, expressive, somber) that decide how MUCH a narrated deck gestures, a salience budget that decides WHICH moments on a slide earn a gesture, a second gesture family that changes the content itself (recolor a bullet, swap its marker, spotlight a table row, column or cell, emphasize a chart series or bar), word-by-word read-along on the slide text driven by the LTT, and a path into the exported HTML player so a deck sent to a board member or a prospect plays the same way it does in the Studio. Nearly all the addressing already exists (`_focus` axes, chart data attributes, the Guide resolver); the work is a shared kernel, a small gesture extension, one front-matter register and the player wiring. The owner settled the five forks on 2026-09-25: three tone presets, model suggestions at authoring time on the user's key, the player embeds the kernel opt-in, decks reuse the LTT actions layer, and foundations (steps 1–4) ship first.
companion:
  - ./2026-07-05-vetrina-walkthrough-library.md
  - ./2026-08-05-guide-gesture-vocabulary.md
  - ./2026-06-16-focus-highlighting.md
  - ./2026-09-24-lattice-timing-track.md
---

# Vetrina delivery presets, content gestures and read-along

> **Proposed; forks settled.** Nothing here is built yet. The owner settled the
> forks on 2026-09-25 (§9): three tone presets, model suggestions at authoring
> time, the player embeds the kernel opt-in, decks reuse the LTT `actions`
> layer, and the first slice is steps 1–4 of §8.

## 1. The ask, and what it means in this repo

The owner's brief (2026-09-25), restated as requirements:

1. **Presets** such as *restrained*, *expressive* and *somber*, and the functions
   each one needs.
2. **Gestures that change the content**: highlight one bullet by changing its
   color or its marker shape, or by ringing it.
3. **Word read-along on the slide itself**, the way the Studio already does on
   captions, now that the LTT (Lattice Timing Track) gives every word a time.
4. **Judgment about what matters.** Not every sentence earns a gesture. A slide
   may have several important moments and a lot that is not.
5. **Chart and SVG targets**: one bar, one wedge, one line or series.
6. **Table targets**: a row, a column or a cell.
7. **Venues**: boardroom, an HTML file sent to a board member, a lightning talk,
   a lunch-and-learn, a live sales room, and a file sent to a sales prospect.
8. **A demo page that shows every capability**, plus a docs section that teaches
   it, at the standard of the Lattice docs site.
9. **Polished and jank-free.**

"Vetrina" covers two consumers today, and the brief is about the second:

- **Product tours** (`/vetrina`, the Studio "Show Me" tours): a fake cursor drives
  an app. That is what the library was built for.
- **The Guide** (`docs/src/components/studio/present-guide.ts`): during Present
  mode read-aloud, a Vetrina cursor names the part of the slide being narrated.
  This is the only place Vetrina touches slide content, it runs only in the
  Studio, and it is the thing the brief wants turned into a delivery system.

## 2. What already exists (measured 2026-09-25)

The brief says "we have most of the structure in the markdown, HTML and SVG". That
is true, and it is more true than the brief assumes:

| Need | What exists | Where |
|---|---|---|
| Name a table row, column or cell; a list item; code lines | `<!-- _focus: row 4 \| col 5 \| cell 4,5 \| item 3 \| line 8-9 -->` resolves an ordinal target and tags it `.lat-focus` | `lib/transformers/focus.js`, `lib/base/base.docs.md` §Focus |
| Theme-safe highlight looks | `_focusStyle: spotlight \| blur \| ring \| list-fill \| pop`, palette-blind, survives PDF and PPTX | `lib/base/base.focus.css` (`--focus-ring`, `--focus-fill`, `--focus-dim`) |
| Step a slide through its units | `_build` stamps `data-build-step`; **nothing sets `data-build-at` yet**, so no player drives it | `lib/transformers/build.js` |
| Chart marks | bar `rect.bar[data-mark][data-label][data-value]`, line `path.line-path[data-series]` + `circle.line-dot`, pie `path.wedge[data-mark]` | `bar.transform.js:574`, `line.transform.js:817,864`, `piechart.transform.js:139` |
| Word timings | LTT: one segment per slide, a Cadenza track with per-word `startMs`/`endMs` | `engineering/ltt.md`, `lib/core/ltt-deck.mjs` |
| Word-anchored actions | LTT `actions` layer `{cue, word, match, verb, target?}`, validated against the word; defined, **not built** | `docs/src/lib/ltt/types.ts:166`, followup `2339-p4` |
| Which gesture fits a target | shape rule: wash, bracket, tap, ring, underline; escalates to `strength: 'notable'` on `.lat-focus` | `present-guide.ts` `chooseGesture` (:1327), decision `2026-08-05` §4 |
| Find the narrated element | text match against the live slide, plus chart and manifest-handle resolvers | `present-guide.ts` `findCueTarget` (:124) |
| Motion tiers, pace, hand | `motion: full \| legible \| still`, `speed`, `hand 0–2`, `pointer` | `docs/src/lib/vetrina/theme.ts` |

What does **not** exist:

- **No preset bundle.** `speed` is the only named choice. Every other knob is
  separate, and nothing ties them into a way of presenting.
- **No gesture changes the content.** All nine gestures are ink or cursor
  overlays. None recolors a bullet, swaps its marker or dims the rest.
- **No importance budget.** The Guide gestures on every block change. A dense
  slide gets a gesture per paragraph whether or not the paragraph matters.
- **No read-along on slide text.** Words light up in the caption strip only
  (`PresentCaption.tsx`, and `.lp-said` in the player).
- **No chart-series or SVG axis in `_focus`.** Charts carry the attributes, but
  the grammar cannot name `bar 3` or `series 2`.
- **The exported HTML player has no Guide.** The CSP (Content Security Policy)
  allows exactly one hashed script (`player-core.mjs:2793`), so a sent file can
  only do what was baked into that script at export time.
- **Known misses.** The Guide resolves 37 of 63 cues on the Q3 board fixture
  (`followups.d/2363-p3-studio-component-gestures.md`), and
  `vetrina-geometry.spec.ts:35` fails in every nightly on record
  (`engineering/gotchas/ci.md:476`).

## 3. The design model — five axes

A narrated deck's delivery is five separate questions. Keeping them separate is
what lets a preset be a small, readable bundle instead of a pile of flags.

| Axis | Question | Decided by |
|---|---|---|
| **A. Salience** | Which moments on this slide matter? | the author first, then the engine's structural signals, then (optionally) a model at authoring time — §4 |
| **B. Budget** | How many of those moments get a gesture? | the preset — §6 |
| **C. Vocabulary** | What does a gesture look like? | the target's shape, then the preset's allowed families — §5 |
| **D. Timing** | When does it fire? | a word in the narration (LTT), never a timer — §7 |
| **E. Surface** | Where does it play? | the Studio and the exported player share one kernel — §7 |

A preset only sets **B** and filters **C** (plus pace, motion and caption
defaults). It never decides **A**: what matters on a slide is a fact about the
content, not about the mood of the room. That split is the whole design. A
somber deck and an expressive deck point at the same important numbers; one of
them points at fewer of them, more quietly.

## 4. Salience — deciding what matters (axis A)

A slide's candidate moments are ranked from three sources, in this order. A
higher source always beats a lower one, and the budget (§6) cuts from the bottom.

1. **Authored.** The deck already says what matters when it uses `_focus`, and
   the Guide already honors it (decision `2026-08-05` §4.1). This proposal adds
   one directive, `_cues` (§7.1), that ties a `_focus` target to a word in the
   narration. Authored moments are never dropped by the budget.
2. **Structural.** Signals the engine can read with no model and no guessing,
   each deterministic and testable:
   - a `**strong**` phrase or an inline number with a unit (`$4.2M`, `18%`);
   - the extreme or the outlier in a chart (the tallest bar, the largest wedge,
     the point where a line changes direction), from the data attributes;
   - the row, column or cell a table's caption or narration names;
   - the first item of a list whose narration opens with a summary sentence.

   Each signal gets a fixed weight in one pure function, so a sweep over the
   gallery can report the distribution the way `tools/sweep-guide-gestures.mjs`
   already does for gesture shape.
3. **Suggested (optional).** A model reads the slide and its narration and
   proposes cues. **It runs at authoring time in the Studio, on the user's own
   key, and writes ordinary `_cues` directives the author can read, edit or
   delete.** It never runs at play time. That keeps the exported file
   deterministic, keeps our OpenRouter budget out of it (HARD RULE #24), and means
   a board member's copy never depends on a network call. Fork 2 in §9.

## 5. Vocabulary — content gestures (axis C)

Today's nine gestures are all **ink**: a stroke, a ring or a ripple drawn over
the content. The brief asks for gestures that **change the content**. They are a
new family, and they differ in one way that matters for the gesture gate
(`SANCTIONED_GESTURES`, `tools/check-ownership.js:8290`): each one sets a state on
the target element for as long as the narration dwells on it, then clears it.

| Proposed gesture | Meaning | What it does | Reuses |
|---|---|---|---|
| `mark` | "this one, among its siblings" | recolors the item's text to `--focus-ring` and swaps its bullet to a `--mark-*` shape | `--mark-*` mask tokens (HARD RULE #29), `list-fill` |
| `spotlight` | "look only here" | recedes every sibling, the target stays full | `_focusStyle: spotlight` / `blur` |
| `trace` | "follow this line" | draws a stroke along a chart path or SVG path, then holds it at the accent weight while the other series recede | `path.line-path[data-series]`, `stroke-dasharray` |
| `lift` | "this bar / wedge / cell" | raises the mark forward and recedes its peers | `_focusStyle: pop`, `data-mark` |

Three rules keep the family honest:

- **The shape rule still picks.** A table cell still gets a ring; `mark` is what
  the ring becomes when the preset forbids ink. Content gestures do not compete
  with the shape rule, they replace ink under presets that want no cursor.
- **State, not paint.** A content gesture toggles the existing `.lat-focus` /
  `.lat-recede` classes plus one attribute. Every color comes from focus tokens
  (HARD RULE #3), every shape from a mask token (HARD RULE #29), so each theme's
  look is automatic and nothing new is typed into CSS.
- **Always reversible.** The class leaves when the narration leaves the target.
  A slide seeked to, paused or printed shows its plain self, the same guarantee
  `_build` gives.

Axes to add to `_focus` so every target is nameable in one grammar: `bar N`,
`wedge N`, `series N`, `point S,N` (a series' Nth point) and `node <id>` for a
Mermaid node, which is the one SVG target we do not control and must verify first
(§10).

### 5.1 Read-along on the slide

The Guide already measures sentence and word rectangles (`textGeometry`,
`present-guide.ts:837-912`). Read-along reuses them: as each LTT word starts, its
range on the slide gets the same `.lp-said` treatment the caption uses, as a CSS
Highlight (`::highlight()`) so the slide DOM is never rewritten. That matters
twice: DOMPurify'd slide markup stays untouched (HARD RULE #22), and a word that
is split across inline markup still highlights as one word.

It is a preset setting, not a gesture: on for teaching venues, off for the
boardroom, where a moving highlight across the text competes with the speaker.

## 6. Presets (axis B)

`tone:` is already a front-matter register (marker shape). So the proposal is a
new deck register, **`delivery:`**, overridable per slide with `_delivery:`, and
readable by the Studio and the exported player.

| | `restrained` (default) | `expressive` | `somber` |
|---|---|---|---|
| Gestures per slide | at most 2 | at most 4 | at most 1, authored only |
| Families allowed | ink + content | ink + content + `trace` | content only; **no cursor** |
| Strength | `quiet`; `notable` on authored | `notable` on the top moment | `quiet` |
| Pace | `moderate` | `moderate`, faster travel | `slow`, long holds |
| Motion | `legible` | `full` | `legible` |
| Read-along on slide | off | on | off |
| Wave / check / cross | never | allowed | never |

The venues in the brief map onto these three plus pace, rather than each getting
a preset of its own:

| Venue | Preset | Why |
|---|---|---|
| Boardroom, live | `restrained` | the speaker leads, and the deck supports; two moments a slide at most |
| Board member reads the sent file alone | `restrained`, captions on | no speaker, so captions carry the voice and gestures carry the eye |
| Sales room, live | `expressive` | the product is the story; the top number gets the heavy ink |
| Sales prospect opens the sent file | `expressive`, captions on | the first 30 seconds decide whether they keep watching |
| Lightning talk | `expressive`, `speed: fast` | five minutes; one strong move per slide beats four quiet ones |
| Lunch-and-learn | `expressive` + read-along | teaching: the eye should find the word being said |
| Bad news, a layoff, a loss, a memorial | `somber` | nothing moves that does not have to; no cursor at all |

A four-preset or two-axis scheme (tone × venue) was considered and is Fork 1.

## 7. Timing and surface (axes D, E)

### 7.1 Word-anchored cues

```markdown
<!-- _class: table -->
<!-- _cues: row 4 @ "churn" | col 3 @ "Europe" -->
```

Each cue is a `_focus` target and a word from the slide's narration. The deck
producer (`lib/core/ltt-deck.mjs`) resolves the word against the slide's LTT track
and writes an `actions` entry `{cue, word, match, verb, target}`. That layer
already exists in the spec, already stores `match` so a narration edit that moves
the word is caught by `validateLtt`, and already belongs to Vetrina. What changes:
it is written for **decks**, not only for recorded tours. Under the LTT spec's G4
rule a change to what a layer means needs the spec owner's sign-off (Fork 4).

A cue with no anchor word fires when the narration reaches the block, as the
Guide does today. A cue whose word is missing is a lint error
(`lib/authoring/lint-core.js`, HARD RULE #7).

### 7.2 One kernel, two surfaces

The Guide's target resolver and `chooseGesture` move out of `present-guide.ts`
into a shared, DOM-only kernel (Vetrina subpath `@laticent/vetrina/deck`). The
Studio imports it; the exported player inlines it into its one hashed script,
the way it already inlines the Anima and chart bundles (`player-core.mjs:2483-2513`).
That is HARD RULE #1 applied to delivery: the Studio and a sent file cannot
disagree about which row gets marked.

Measured cost: Vetrina's ESM build minifies to **47,104 bytes (16,018 gzipped)**.
The resolver is not measured yet. A deck with no `delivery:` key exports without
it, so today's exports stay byte-identical. A deck with one changes the export's
bytes, which is the Quality Bar's export exception: dark and light renders go to
the owner before merge.

## 8. Order of work

Ordered by what each step unblocks. Each ships on its own branch and PR (HARD
RULE #17) unless it needs the one before it.

1. **Jank first.** Fix the Guide misses (26 of 63 cues) and the geometry nightly.
   Nothing built on the Guide can be excellent while a third of its aims miss.
2. **Addressing.** Chart axes in `_focus` (`bar`, `wedge`, `series`, `point`),
   plus lint. Every later step names targets through this.
3. **The shared kernel.** Move the resolver and `chooseGesture` to
   `@laticent/vetrina/deck`, with the Studio as its first caller (G2 in the LTT
   note: no kernel ships without a production caller).
4. **Content gestures** `mark`, `spotlight`, `trace`, `lift`, each with its
   `SANCTIONED_GESTURES` entry and meaning.
5. **Salience + `delivery:`.** The structural scorer, the budget, the register,
   the three presets. Demo deck `examples/delivery-presets.md` (HARD RULE #9).
6. **Read-along on the slide.**
7. **`_cues` and the deck `actions` layer.**
8. **The exported player.** Export sign-off, dark and light.
9. **The demo page and the docs section.** `/vetrina` becomes a deck that plays
   under a preset switcher, one slide per capability, with the storyboard pane
   kept. A Starlight section "Vetrina" (Guides: presets, gestures, cues,
   read-along, sending a deck; Reference: the grammar and the gesture table)
   joins the site sidebar. Screenshots at 1440, 820 and 390 px.
10. **Model suggestions** (if Fork 2 says yes).

Steps 1–4 are unconditional. 5–10 wait on the forks.

## 9. Forks for the owner

**Rulings (owner, 2026-09-25):** 1(a), 2(b), 3(a) together with 4(a), and 5(a).
Fork 4 was asked together with Fork 3 as one question; the answer is also the
spec owner's G4 sign-off for writing `actions` from the deck producer.

1. **Preset shape.** (a) Three tone presets, venues documented as pairings
   (recommended: one knob, and each venue is a line in the docs); (b) tone ×
   venue, two keys; (c) one preset per venue (seven presets, overlapping).
2. **Semantic salience.** (a) Authored + structural only; (b) plus model
   suggestions at authoring time, BYOK, written back as `_cues` (recommended);
   (c) a model at play time (rejected here: non-deterministic, needs a network
   call from a sent file).
3. **The exported player.** (a) Embed the kernel when a deck sets `delivery:`
   (recommended; today's exports unchanged); (b) always embed; (c) Studio only.
4. **The deck `actions` layer.** (a) Reuse the LTT `actions` layer for decks
   (recommended; needs the spec owner's G4 sign-off); (b) keep cues in the
   manifest and out of the LTT.
5. **First slice.** (a) Steps 1–4 in one PR (recommended: jank, addressing,
   kernel, content gestures, all without an owner decision); (b) the presets
   first, on today's Guide, to feel the difference sooner.

## 10. Not verified yet

- **Mermaid node ids** in the baked export SVG. `node <id>` depends on them.
- **The resolver's size** once extracted.
- **`::highlight()` in the exported player on iOS Safari.** It is supported
  there since 17.2, but this sandbox cannot drive iOS, so it stays
  **UNVERIFIED** (HARD RULE #23) until someone opens a sent file on a device.
- **Whether the structural signals rank the gallery sensibly.** The sweep in step 5
  answers it; the weights are not taste and must come from that distribution.
