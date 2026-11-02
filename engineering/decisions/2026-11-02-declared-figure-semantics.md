---
status: proposed
summary: >
  A figure kind (each chart, each Mermaid diagram type, any future plugin kind) declares what it MEANS in its own
  manifest, a versioned per-kind contract, and emits that meaning once as a semantic tree on its output. Every host
  capability (the narrator, screen readers, the Guide and its gestures, hover detail, focus and build steps, motion,
  lint) reads the declaration and the tree, and none keeps a per-kind branch or roster. WHEN things happen is a third
  layer, delivery: a kind declares the steps it can be revealed in, the author chooses which and the deck's pace, and
  each surface (Present, the narrated player, a static PDF) schedules them. Today's seeds are real: the manifest
  `gesture` units, the `data-mark`/`data-label`/`data-series` attributes, the `{act, unit, id}` narration refs and the
  motion roles. What is missing is one contract tying them together: narration re-parses Markdown in a 6,543-line
  shared file with ~39 per-chart branches, and three rosters hard-code chart names.
---

# Figure kinds declare their semantics; capabilities consume them (2026-11-02)

**Answer.** Three layers, each with one owner:

| Layer | Owns | Never owns |
|---|---|---|
| **The kind** (a chart, a diagram type) | What it means: its units, how each is named and spoken, which can be pointed at or stepped through, its rules (lint) | Time, surfaces, other kinds |
| **Host capabilities** | How a meaning is used: speaking it, exposing it to assistive technology, pointing at it, revealing it, checking it | Any one kind's knowledge |
| **Delivery** | When: which steps play, in what order, at what pace, on which surface | What a figure means |

A kind joins every capability by declaring its semantics and emitting its tree. A capability serves every kind by
reading them. Neither names the other.

The owner's direction (2026-11-02): charts are best placed to say what can be narrated and how; that should be driven
by the manifest; the same holds for screen-reader attributes, guides and gestures, and lint; each chart is independent
and may need its own manifest and contract; pace and delivery need a deliberate owner; and the result must be a
stable contract other plugins can tap into.

## 1. What exists today (measured on `claude/codebase-structure-v2`)

| Capability | Where per-kind knowledge lives | What connects it to the chart |
|---|---|---|
| Narration | `lib/core/chart-narration.js`, 6,543 lines: 20 chart narrators + a generic floor + 9 Mermaid narrators, ~39 class branches, 24 unit names as string literals | Nothing: it **re-parses the slide's Markdown**. It emits refs `{start, end, act, unit, id, label, value}` the Guide and the player consume |
| Screen readers | Each transform builds its own `role="img"`, `<title>`, `<desc>`; counts range 0–46 per chart | An undeclared attribute vocabulary (`data-mark`, `data-label`, `data-series`, `data-value`, `data-mark-for`, `data-cat`), emitted by 27 of 28 charts; tied to speech only by a test (`chart-a11y-contract.test.js`) |
| Guide and gestures | Manifest `gesture` block in all 28 charts (units with selectors) over 10 archetypes (`lib/core/gesture-archetypes.json`), resolved by `scene-resolve.mjs` | **Declared** — the best seed |
| Hover detail | `chart-interact.js` `CHART_SVG_SEL`: 22 figure classes by hand | A roster |
| Callouts | `lib/core/legend.js` `CALLOUT_READERS`: 22 charts by hand, also read by narration and lint | A roster |
| Steps | `_focus` supports `mark`/`series` (`focus.js` `ATTR_AXES`); `_build` does not; manifest `focusAxes` (22 charts) only drives editor completion | Partly declared, not as a contract |
| Motion | `data-anima-role`/`-order`, 20 of 28 charts; Mermaid through an adapter (`motion-roles.js`) | An undeclared vocabulary a plugin already joins |
| Lint | 21 kind-specific rules and 5 per-kind model imports in `lint-core.js` | Now movable: plugins may contribute a `lint` role (HARD RULE #7, amended 2026-11-01) |
| Pace | `pace:` register (arrival hold before speech, `resolve-pace.mjs`, duplicated in Cadenza and pinned by a test); `_build`/`_focusSteps` order; Anima timing; the narrator's ref order drives the Guide | Three mechanisms overlap; no per-kind step contract |

## 2. The kind's contract

Each kind has **its own manifest**, validated by one shared schema (`kind.schema.json`, versioned, published in
`@laticent/plugin-api`). A plugin that hosts many kinds (charts, Mermaid) lists them; each kind stays independent and
testable on its own. The kind manifest grows from today's component manifest (docs, slots, sample, anti-patterns stay)
and adds a `semantics` block:

| Field | Says | Grows from |
|---|---|---|
| `units` | The things the figure is made of — `mark`, `series`, `category`, `task`, `node`, `edge`, `figure` — each with its role, the attribute that identifies it, and which attributes name and value it | `gesture.units`, `kernel.marks[].encodes` |
| `speech` | Per unit, how it is spoken (which attributes, in which order, with which value grammar), the order units are visited, and which of the eight acts of 2026-09-27 §3 the kind uses (`frame`, `enter`, `visit`, `note`, `compare`, `peak`, `verdict`, `aside`; open to new ones with a declared fallback) | the narrators' refs, `projection.frame` |
| `steps` | The axes the figure can be revealed along (`series`, `mark`, `stage`), in their natural order — structure, never timing | `focusAxes`, `ATTR_AXES`, motion order |
| `point` | What the Guide may point at (units, with the archetype that supplies defaults) | `gesture` |
| `rules` | The kind's lint rules, through its `lint` role | the `lint` role built on 2026-11-01 |

**The no-DSL rule holds** (Hollywood note §3): where a declaration cannot say it without a mini-language (a verdict
such as "the largest gap is between Q2 and Q3", a trend, a dependency chain), the kind ships a **hook** for that act
(`speak.verdict(model)`) and the manifest names the hook. Data for the common case, a hook for the rest.

## 3. The semantic tree: emitted once, read by everyone

At render, before any browser pass, the engine produces a **slide tree** as host data: the slide's prose nodes
(heading, eyebrow, paragraphs, item details, callouts) and, inside, each figure's units with their ids, labels, values
and relations, as the kind returned them beside its HTML, validated against its declared `units`. It is produced the
same way on every path (CLI, Studio, player); a hydration pass may amend it only through a declared amendment schema.

**The tree is never read back out of markup.** Author HTML can carry any `data-*` attribute through the engine, so a
tree scraped from the output is forgeable (the adversarial review reproduced it, `2026-11-02-regia-narrator.md` §7
#1). What the Guide needs on the page is one host-written marker (`data-lattice-semantics`, a host marker the
author-markup rule renames), and every query is scoped to the figure root the host marked.

Every capability reads the tree, never the source:

- **The narrator** speaks units through the kind's `speech` declaration and hooks; the 6,543-line re-parser retires,
  chart by chart.
- **Assistive technology** gets the accessible name and description from the same tree, so what a screen reader says
  and what the narrator says cannot drift; today's contract test becomes a host gate over every kind.
- **The Guide, hover detail and callouts** resolve units through the declaration; `CHART_SVG_SEL` and
  `CALLOUT_READERS` are deleted.
- **Steps and motion** reveal units along the declared axes; `_build` gains the axes `_focus` already has.

A Mermaid diagram type joins the same way: the plugin emits its tree from the parsed diagram (nodes, edges, message
order), not from the SVG it draws, and the Guide can point inside a diagram, which today it cannot.

## 4. Delivery: neither the kind nor the core

A kind declares what can be said and revealed; it never knows when. The rest is split by craft
(`2026-11-02-regia-narrator.md`):

1. **What is said**: Regia, the narrator library, turns the slide tree and the kinds' speech declarations into beats
   (`{ act, targets, text, anchor, span }`), applying the author's density, register and variants.
2. **When**: Cadenza times the beats and owns pace.
3. **The timeline**: the Lattice Timing Track carries every cue, and its existing `actions` layer carries each beat's
   targets, word-anchored, file or in memory.
4. **Performing**: Suono speaks, Vetrina points (given the delivery style as host data), the surface reveals; a static
   PDF shows the end state.

This keeps every chart working unchanged on every surface, and lets a new surface (an AI presenter, a video export)
read the same timeline.

## 4a. Speech: declared phrases with slots, facts from a function

A kind declares, per act, the sentences it may say, as **phrases with slots** filled from the semantic tree:

```json
"speech": {
  "visit":   ["series", "mark"],
  "frame":   ["Each bar is one quarter's revenue.", "Revenue by quarter."],
  "series":  ["{name}."],
  "mark":    ["{name}: {value}.", "{name} comes in at {value}.", "{value} for {name}."],
  "verdict": { "facts": "speak.verdict", "say": ["{top.name} is the largest, {top.lead} above {next.name}."] }
}
```

- **Slots only.** A phrase interpolates named values (`{name}`, `{value}`, `{top.lead}`) and nothing else: no
  conditionals, no loops, no arithmetic. That is the no-DSL rule applied to narration.
- **Values come from the tree,** spoken through the host's shared grammar (numbers, money, lists; later, other
  languages), so a value reads the same in every chart and in the screen reader's description.
- **Insight is a function that returns typed facts, never words.** `speak.verdict(tree)` returns
  `{ top, next, lead }` or nothing when there is nothing worth saying; a direction is `'up' | 'down' | 'flat'`, a
  delta a quantity. Regia's grammar owns how a typed value is spoken (rose, fell or held; plurals; units; lists), so
  conditional English never lands in a phrase. The kind decides what is notable; the manifest decides how it is said.
  (Settling typed facts against a standard message format is an owner decision, Regia note §7.) Fact functions are
  in-tree code only; a zip kind declares phrases as data.
- **Several phrasings per act,** chosen deterministically, seeded by a hash of the slide's own tree and kind, never its
  position, so inserting a slide changes nothing else; no phrasing repeats on consecutive beats within a slide. The
  accessible description always uses phrasing 0. A phrasing may carry a register (`formal`,
  `conversational`) that a delivery style selects.
- **The key beat is the manifest's existing `gesture.key`** selection rule (`largest`, `first`, `act:peak`, …, in 26
  of 28 charts), not a second declaration; a brief delivery says at least that beat.

## 4b. One beat drives speech and gesture

Filling a phrase yields one **beat**: `{ act, targets: [{ unit, id }], text, anchor, span }`. The narrator speaks `text`; the
Guide resolves `units` through the semantic tree and gestures at them; `anchor` is the slot where the unit is named,
so the player starts the gesture on that word (from Cadenza's word timings). Speech and gesture come from the
same record and cannot point at different things. This is the binding layer of
`2026-09-27-delivery-styles-and-component-scenes.md` (§2, §5), now produced from the declaration instead of from
per-chart narrator code. Which gesture expresses an act (focus, point, trace, sweep) is the delivery style's choice,
never the kind's.

## 4c. Delivery styles and the author's control

Delivery is policy over acts, owned by the delivery layer, never by a kind. It has **two axes**, each a register:

| Register | Axis | Values | Exists |
|---|---|---|---|
| `delivery:` | **Character**: how each act looks and moves (focus, point, ink, stillness), and caption and read-along policy | `restrained` (default), `expressive`, `somber` | deck level only, `lib/core/resolve-delivery.mjs` (2026-09-25 presets, 2026-09-27 styles); `_delivery:` per slide is new |
| (density; name pending, `narrate:` collides with `--narrate`) | **Density**: which acts are spoken, and which are switched off | `full` (default: all eight acts), `brief` (the key beat), `insight` (verdict, peak, compare); then `-act` to switch any act off | new |

A new style touches no kind; a new kind gets every style.

The author controls both **at the deck and at the slide** (owner decision, 2026-11-02):

- Deck: `delivery: expressive` and `<density>: full -note` in front matter.
- Slide: `_delivery: somber` and `_<density>: brief` (or `-frame`) on one slide, overriding the deck for that
  slide only.
- The producer adds one rule of its own when it builds a timeline (never in assistive output): a `frame` is skipped when the slide before framed the same kind, so a
  deck of five bar charts explains bars once.

## 5. Why this is stable

- **One versioned contract per kind** (`kind.schema.json` + the semantic tree vocabulary), conformance-tested per kind
  with its fixtures. A capability targets the contract, never a kind; a kind targets the contract, never a capability.
- **Additive by construction**: a new capability reads existing declarations; a new kind gets every capability by
  declaring. Neither change touches the other.
- **Gates replace rosters**: a kind that emits a unit it did not declare, or declares one it does not emit, fails its
  conformance test.

## 6. Questions for the owner

1. **Where narration reads from.** The emitted semantic tree (recommended; one source for speech, screen readers and
   the Guide), or a model object the kind returns beside its HTML, or source re-parsing as today.
2. **How much is declared.** Data for the common case plus named hooks for computed acts (recommended), or hooks only
   (simplest, least declarative), or data only (needs a template language, which the no-DSL rule refuses).
3. **Who owns delivery.** A separate delivery layer producing one plan per slide (recommended), or the host core, or
   each kind.
4. **Scope.** The contract, the charts plugin with per-kind manifests, and the migration of every capability is several
   times #2997's size. Either #2997 holds until all of it lands, or #2997 lands the plugin contract and the charts
   plugin with per-kind manifests and the semantics contract as data, and each capability then moves onto it in its own
   PR, each deleting one roster.

### Owner decisions (2026-11-02)

- **Q1:** every capability reads the **emitted semantic tree**.
- **Q3:** delivery is split by craft, with no scheduler library: **Regia is the narrator** ("our Vetrina for
  narration"), Cadenza times and owns pace, LTT carries each cue's act and targets, and Suono and Vetrina perform. An
  earlier proposal for a delivery scheduler was rejected as tight coupling (`2026-11-02-regia-narrator.md`).
- **Q4:** **#2997 holds for all of it**: the plugin contract, the charts plugin with per-kind manifests, the semantics
  contract, and every capability moved onto it, in one PR.
- **Q2:** data plus named functions, in the shape of §4a: phrases with slots filled from the tree, and a function per
  computed act that returns facts, never words.
- **Speech and gesture** are one beat (§4b); **delivery** is controlled at the deck and the slide (§4c).

## References

- `engineering/decisions/2026-11-01-charts-one-plugin.md`, `2026-11-01-plugin-contract-hollywood.md`.
- Prior notes this builds on: `2026-07-11-manifest-speech-contract.md` (proposed: narration should read manifest
  semantics), `2026-06-16-narrative-step-model.md` (the step is the unit of navigation), `2026-09-24-chart-accessibility-contract.md`,
  `2026-09-27-guide-storyboards.md` (archetypes), `2026-09-27-delivery-styles-and-component-scenes.md`,
  `2026-09-24-lattice-timing-track.md`, `2026-09-20-narration-audit.md`.
