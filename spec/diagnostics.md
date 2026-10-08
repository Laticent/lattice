# LFM Diagnostic Protocol 1.1

**Status:** Draft · **Version:** 1.1 · **Date:** 2026-10-08 · **Owner:** @saden1
**Companion to:** [`LFM-1.0.md`](./LFM-1.0.md) (conformance level **L2**)

A conformant LFM document is always valid Markdown (§ LFM L0), so LFM
diagnostics are never *parse errors*. They are **authoring findings**:
constructs that are valid Markdown but, on *this Lattice layout*, will not
render the way the author intends. This document specifies the stable shape of a
finding, the rule registry, severities, and the contract for
machine-applicable fixes.

This is the surface a tooling vendor implements to give LFM authors inline
findings and quick-fixes — in an editor, a CI check, a PR bot, or a host like
GitHub. This protocol is the foundation of a future LFM Language Server (§6).

The reference implementation is `lib/authoring/lint-core.js` (pure, fs-free,
shared by the CLI `tools/lint-deck.js`, the engine's `validate()`, and the
browser panels in the Studio and the Playground). This document *publishes* that implementation's
contract; the contract, not the implementation, is the standard.

---

## 1. The finding shape

A diagnostic is a JSON object:

```jsonc
{
  "slide": 3,                       // 1-based slide number; 0 = deck-wide (front matter)
  "rule": "card-style-inline-title",// stable rule ID from the registry (§3)
  "severity": "error",              // "error" | "warning" (§2)
  "classToken": "cards-grid",       // the component/modifier token the finding is about
  "line": "- **Title.** body",      // the offending source line (trimmed), or the directive
  "message": "inline \"- **Title.** body\" on a card-style slide — the body inherits the parent li bold",
  "fix": "Use the nested-list shape:\n    - Title\n      - body text",
  "autofixable": true               // optional; present and true when an automatic fix exists (§4)
}
```

| Field | Type | Required | Meaning |
|---|---|---|---|
| `slide` | integer | yes | 1-based slide number, matching the preview's "Slide N" and edit markers. `0` for a deck-wide finding sourced from front matter. |
| `rule` | string | yes | A stable ID from the registry (§3). Tools key suppression and docs links off this. |
| `severity` | string | yes | `error`, `warning`, `info` or `suggestion` (§2). |
| `classToken` | string | yes | The `_class` component or modifier token, or front-matter value, the finding concerns. |
| `line` | string | yes | The offending source line (trimmed) or the `_class`/front-matter directive line, for locating and display. |
| `message` | string | yes | Human-readable explanation of *what* and *why it matters*. |
| `fix` | string | yes | Author-facing guidance — the canonical correct shape. |
| `autofixable` | boolean | no | `true` when a deterministic automatic fix exists (§4). Absent means no automatic fix; apply `fix` by hand. |

> **Location note (v1):** v1 locates a finding by `slide` + `line` (the text of
> the offending line, scoped to the slide). A future minor version MAY add a
> precise `range` (`{ start, end }` line/column) for editors that want
> character-level squiggles; tools MUST treat an absent `range` as "highlight
> the matching `line` within `slide`."

## 2. Severities

- **`error`** — the slide will render visibly wrong (a slot inherits the wrong
  weight, a grid row splits, a required slot renders empty). Authors SHOULD
  resolve every error before publishing.
- **`warning`** — the slide will render, but likely not as intended; for
  example, a typo silently selected a fallback (unknown class, unknown finish,
  unresolved map region). Warnings are surfaced but do not block rendering.

- **`info`** *(1.1)* — the slide renders as written, but something the author
  may not expect is happening: a retired name still accepted, a code line whose
  end is cut off. Nothing is wrong enough to fix by default.
- **`suggestion`** *(1.1)* — advice. The slide renders whole and as intended;
  the finding says it could read better (a crowded layout, a long heading). A
  tool SHOULD show suggestions apart from errors and warnings, and MUST NOT
  count them as failures.

A rule may emit more than one severity depending on context (§3 lists each
one); the severity on a finding is the one that applies to that finding.

## 3. The rule registry

The rule IDs below are **stable** for LFM 1.x: a tool may rely on them, and
they will not be renamed or repurposed within the major version. New rules are
added in minor versions; a rule is never silently removed (it may be deprecated).

The published namespace convention going forward is `lfm/<rule>`; the bare IDs
below are the canonical identifiers the reference implementation emits, and
`lfm/<rule>` is the equivalent qualified form a host MAY present.

**The registry is complete.** Every rule ID the reference implementation can
emit is listed here, and every ID listed here is one it emits.
`test/unit/authoring/diagnostics-registry.test.js` fails when the two disagree,
so a new rule cannot ship without a row. (Version 1.0 listed 13 IDs while the
implementation emitted 177; §7 records the catch-up.)

**Families.** A row whose ID contains `<…>` stands for a family: one ID per
member, generated at run time (for example, `unknown-<axis register>` covers
`unknown-spark` and `unknown-icon`). A tool MUST treat every member as a
distinct, stable ID.

### 3.1 Slide structure and slots

| Rule ID | Severity | Autofix | What it catches |
|---|---|---|---|
| `unknown-class` | warning | ✓ | A `_class` token that is not a known component or modifier, or one that was renamed. Carries a did-you-mean. |
| `conflicting-variants` | warning | — | Two tokens on one slide from an axis that takes one value at a time (two variants, two finishes); only one wins. |
| `block-unsupported` | warning | — | An editorial modifier (`insight-*`, `no-note`) on a layout that has nothing for it to act on. |
| `list-modifier-inert` | warning | — | A `list` counter modifier that the slide's list register never reads (`numbered` on `principles`, `roman` on `takeaway`). |
| `card-style-inline-title` | error | ✓ | `- **Title.** body` on a card-style layout — the body inherits the parent `li` bold. Fix: nested `- Title` / `  - body`. |
| `ledger-inline-title` | error | ✓ | The unordered inline-bold shape on a ledger/numbered layout — autofixes to the ordered `1. Name` / `   - body` shape the layout wants. |
| `statement-ol-bold` | error | — | A `**bold**` span inside an ordered-list statement, which splits the counter-grid row (e.g. `principles`). |
| `split-bodyless-item` | error | ✓ | A right-panel item with no nested body on a split layout — the title won't lift to bold. |
| `split-missing-headline` | warning | — | An h2-anchored split slide (`split-panel`/`split-compare`) with no `## ` headline — the left panel renders empty. |
| `split-statement-missing-quote` | warning | — | A `split-panel pullquote` with no `> ` blockquote — the pull-quote (the variant's point) renders empty. |
| `split-compare-option-count` | warning | — | `split-compare` without exactly two top-level options — the layout assumes a two-up and highlights the 2nd as preferred. |
| `number-slot-bodyless-item` | warning | — | A `kpi`/`stats` number item with no nested label — the number won't render in display type. |
| `big-number-hero-heading` | warning | — | A `big-number` slide whose number is written as a heading, so the required number slot (the first list item) is empty. |
| `claim-bleed-unsafe` | warning | — | A claim variant that bleeds to the true edge of the slide, where its content is cropped. |
| `qr-empty-payload` | error | — | A `qr` payload bullet with no value. |
| `qr-missing-payload` | error | — | A `qr` slide with no scannable payload bullet. |
| `qr-duplicate-payload` | error | — | A `qr` slide with more than one payload bullet; it renders only one. |
| `track-directive` | warning | — | A bare `track:` (deck-wide from that slide on) where `_track:` was meant, or `_track` on a slide that is not `topic`. |
| `track-list` | warning | — | A list on a `topic` slide, which shows as plain content; the track is built from the section's headings. |
| `focus-spec` | warning | — | A malformed `_focus` directive, which silently does nothing at render. |
| `focus-style` | warning | — | A `_focusStyle` value that is not `spotlight`, `ring` or `list-fill`. |
| `focus-steps` | warning | — | A `_focusSteps` step that is not a valid `_focus` spec. |
| `unknown-map-region` | warning | — | A `map` list item whose lead name the basemap can't resolve. Carries a did-you-mean against the basemap vocabulary. |
| `trail-budget` | warning | — | A word in an `authority-chain trail` column too long for the column, which squeezes the others. |
| `tag-budget` | warning | — | A card tag or band label long enough to wrap, which pushes every card on the slide down. |
| `tag-alias` | info | — | `banner-tag`, the old name for `tag-band`. |
| `label-set-above-body` | warning | — | A bracketed label list above a chart that cannot name its axes (too many items, or a component with no key). |
| `label-set-unbound` | warning | — | A bracketed label list on a component that has no key, so it does nothing. |
| `shell-fence-is-script` | info | — | A `shell` (or similar) fence holding a script; the language only colors terminal prompts, so it renders nearly plain. |

### 3.2 Fit and capacity

| Rule ID | Severity | Autofix | What it catches |
|---|---|---|---|
| `capacity-overflow` | warning | — | More elements than the layout fits; whatever does not fit may be cut off. |
| `capacity-crowd` | suggestion | — | More elements than the layout reads well with; it still renders whole. |
| `capacity-scale` | warning | — | Content that fits at the designed size but not at the deck's `venue:` / type scale. |
| `spot-scale` | warning / info | — | A `scale-*` or `venue-*` class on some slides only, so type size jumps between slides. |
| `code-line-clipped` | info | — | A code line wider than the pane it renders into, so its end is cut off. |
| `pane-layout` | warning | — | A pane layout set deck-wide in front matter, where it does nothing; pane layouts are per slide. |
| `pane-syntax` | warning | — | The old pane syntax (`<!-- panes: -->`, `<!-- pane: -->`), which still works but may be removed. |
| `pane-title` | suggestion | — | A pill or label above a pane title that joins the title on one line. |
| `pane-insight` | warning | — | More than one Key Insight on a panes slide; they all show together below the panes. |
| `pane-arrange` | suggestion | — | Panes that will render reoriented, or split into one slide per pane, rather than as written. |
| `pane-overflow` | warning | — | A pane with more than fits on the slide it becomes. |
| `pane-crowd` | suggestion | — | A pane with more elements than it reads well with. |

### 3.3 Inline notation (pills, sparks, marks, plugin kinds)

| Rule ID | Severity | Autofix | What it catches |
|---|---|---|---|
| `pill-literal` | warning | — | A span that opens like a pill (`{…}`) but does not parse, so it renders as code. |
| `spark-literal` | warning | — | A span that opens like a spark (`~{…}`) but does not parse, so it renders as code. |
| `<inline kind>-literal` | warning | — | A family: one ID per plugin inline kind (for example `icon-literal`). A span that opens like the kind but renders as code; the plugin supplies the reason. |
| `spark-too-big` | warning | ✓ | A spark too tall or too wide for its line. The autofix resizes it. |
| `pill-shape-crowded` | warning | — | A shaped pill (`{X, circle}`) holding more than the shape can, so it stretches out of shape. |
| `bracket-list-closed-early` | warning | — | An extra `]` that closes a bracketed list early, so it shows as plain text. |
| `mixed-spelling` | warning | — | A word spelled two ways in one deck's inline notation; the fix uses the spelling the deck uses most. |
| `typed-shape-glyph` | warning | — | A typed glyph (`✓`, `→`, `●`) doing the job of a drawn shape (HARD RULE #29); the fix names the modifier or mark that draws it. |

### 3.4 Front matter: unknown or retired values

| Rule ID | Severity | Autofix | What it catches |
|---|---|---|---|
| `unknown-finish` | warning | ✓ | A front-matter `finish:` value that isn't a known register — the deck ignores it and draws no backdrop. |
| `unknown-plugin` | warning | ✓ | A name in the front-matter `plugins:` import list that no plugin has — the list only adds, so the deck would silently load nothing for it. |
| `unknown-mode` | warning | ✓ | A `mode:` value the engine does not know; the deck uses `boardroom`. |
| `unknown-preset` | warning | ✓ | A `preset:` name the engine does not know; no preset applies. |
| `unknown-fit` | warning | — | A `fit:` value the engine does not know; the deck uses `heal`. |
| `unknown-split` | warning | ✓ | A `split:` value the engine does not know; the deck uses `headings`. |
| `unknown-claim` | warning | ✓ | A `claim:` value the engine does not know; the deck uses `framed`. |
| `unknown-stamp` | warning | ✓ | A `stamp:` value the engine does not know; markers use the `tab` shape. |
| `unknown-tone` | warning | ✓ | A `tone:` value the engine does not know; markers use the `rail` shape. |
| `unknown-spectrum` | warning | ✓ | A `spectrum:` value the engine does not know; the deck uses the rainbow default. |
| `unknown-spectrum-edge` | warning | ✓ | A `spectrum-edge:` value the engine does not know; the bar sits on top. |
| `unknown-spectrum-card` | warning | ✓ | A `spectrum-card:` value the engine does not know; no card rail is drawn. |
| `unknown-spectrum-card-edge` | warning | ✓ | A `spectrum-card-edge:` value the engine does not know; the rail sits on the left. |
| `unknown-spectrum-trim` | warning | ✓ | A `spectrum-trim:` value the engine does not know; the accents stay plain. |
| `unknown-rule` | warning | ✓ | A `rule:` value the engine does not know; headings keep the default underline. |
| `unknown-inline-code` | warning | ✓ | An `inline-code:` value the engine does not know; pills and marks keep rendering. |
| `unknown-eyebrow` | warning | ✓ | An `eyebrow:` value the engine does not know; eyebrows render as the bare label. |
| `unknown-headline` | warning | ✓ | A `headline:` value the engine does not know; each layout keeps its own alignment. |
| `unknown-corners` | warning | — | A `corners:` value the engine does not know; corners render square. |
| `unknown-lift` | warning | ✓ | A `lift:` value the engine does not know; cards render flat. |
| `unknown-venue` | warning | ✓ | A `venue:` value the engine does not know; the deck renders at the designed size. |
| `unknown-chart-finish` | warning | ✓ | A `chart-finish:` value the engine does not know; charts keep their default colors. |
| `unknown-cards` | warning | ✓ | A `cards:` value the engine does not know; each layout keeps its own card spacing. |
| `unknown-backdrop` | warning | ✓ | A `backdrop:` word that is neither a strength nor a mask, or a second word for an axis already set. |
| `unknown-tag` | warning | ✓ | A `tag:` word the engine does not know, or a second word for an axis already set. |
| `unknown-<axis register>` | warning | ✓ | A family: one ID per axis register (`unknown-spark`, and one per register a plugin declares, such as `unknown-icon`). An unknown word, or a second word for an axis already set. |
| `unknown-color-mode` | warning | ✓ | A `color-mode:` value the engine does not know; the deck uses the theme's default colors. |
| `unknown-delivery` | warning | ✓ | A `delivery:` value the engine does not know; the deck uses `restrained`. |
| `unknown-pace` | warning | ✓ | A `pace:` value the engine does not know; playback uses each viewer's own setting. |
| `unknown-debug-facet` | warning | — | A `debug:` value the engine does not know; the overlay falls back to on-hover. |
| `deck-wide-component` | warning | — | A component named in the deck-wide `class:` register (every slide would become it), or a class `color-mode:` overrides. Ignored. |
| `bad-render-target-value` | warning | — | A render-target setting that is neither on nor off; the export treats it as off. |
| `nested-render-target-key` | warning | — | An indented render-target key that the export still reads as the deck setting. |
| `guards-renamed` | warning / info | — | `guards:`, the old name of `fit:`. |
| `retired-backdrop-key` | warning | — | The retired multi-line `backdrop:` block, which is no longer read. |
| `retired-form-key` | warning | — | `form: off`, which no longer works; slides now show the title band and progress bar. |
| `retired-form-token` | warning | — | The retired `no-form` class token. |
| `autosplit-retired` | error / suggestion | — | `autosplit:`, which no longer controls splitting. An error where the engine splits anyway; a suggestion where nothing splits. |
| `paginate-unsupported-value` | suggestion | — | `paginate: skip` or `paginate: hold`, Marp values Lattice treats as `false`. |
| `stray-overflow-marker` | warning | — | `overflow-marker:` in the deck; it is an export setting, so the line does nothing. |
| `stray-export-settings` | warning | — | An export-settings block copied in from another export. |

### 3.5 Narration and speaker notes

| Rule ID | Severity | Autofix | What it catches |
|---|---|---|---|
| `caption-key-retired` | error / warning | — | `captions:` / `caption:`, renamed `say:`; the line is ignored. An error in lowercase, a warning when capitalized (it may be a real note). |
| `say-key-case` | warning | — | A capitalized `Say:`, which is a speaker note; only lowercase `say:` is spoken. |
| `lexicon-single-letter-key` | warning | — | A single-letter/digit `lexicon:` key (`e:`, `2:`) — read-aloud rewrites every embedded occurrence, not just the standalone token, garbling the deck's narration. A single glyph (`→`, `×`) is safe. |
| `greeting-hardcoded-period` | warning | — | A greeting that names a time of day; `{greeting}` adapts to the listener's clock. |
| `greeting-not-english` | warning | — | `{greeting}` (always English) in a deck whose `lang:` is not English. |
| `unknown-bookend-placeholder` | warning | — | A `{placeholder}` in a greeting or closing that the voice would read aloud as written. |
| `unterminated-comment` | error | — | A `<!--` that is never closed: everything after it disappears, and its text ships inside any export that carries the source. |
| `author-script-defers` | warning | — | A `<script>` that runs later; PDF, PPTX and PNG exports capture before it runs. |

### 3.6 Charts: gantt and quadrant

| Rule ID | Severity | Autofix | What it catches |
|---|---|---|---|
| `gantt-retired-delimiter` | error | ✓ | A gantt span using a retired delimiter; the only delimiter is `..`. Autofixes. |
| `gantt-bad-span` | error | — | A gantt span whose sides are not dates, quarters or months. |
| `gantt-unknown-token` | warning | — | A gantt token that is not a span, a status, `after=` or `milestone`. |
| `gantt-mixed-time` | warning | — | A gantt mixing dates with quarters or months. |
| `gantt-dangling-after` | error | — | A gantt `after=` naming no task on the slide. |
| `gantt-inverted-dependency` | warning | — | A gantt task that starts before the task it depends on. |
| `quadrant-axis-part` | warning | — | A quadrant axis list with the wrong number of members, or a member part the chart ignores. |
| `quadrant-retired-axis` | error | ✓ | The retired quadrant axis format. Autofixes to the bracketed list. |

### 3.7 Charts: flowchart and state chart

| Rule ID | Severity | Autofix | What it catches |
|---|---|---|---|
| `flowchart-list-split` | warning | — | A numbered list past 9 whose sub-items are not indented far enough, so later items drop from the chart. |
| `state-chart-v1-transition` | warning | — | The retired v1 state-chart transition or self-loop form. |
| `state-chart-v1-tint` | warning | — | The retired v1 `:::token` tint, which is read as part of the name. |
| `flowchart-duplicate-id` | error | — | An `#id` already used by another shape. |
| `flowchart-conflicting-style` | error | — | A shape styled twice with different values. |
| `flowchart-unknown-modifier` | warning | — | A span that is not a style; it is ignored. |
| `flowchart-orphan-connection` | error | — | A connection row with no shape above it. |
| `flowchart-nested-under-connection` | error | — | A row nested under a connection, which is neither a member nor a connection. |
| `flowchart-empty-name` | error | — | A row with no usable shape name. |
| `flowchart-two-groups` | error | — | A shape placed in two groups. |
| `flowchart-line-word-on-shape` | error | — | A line style written after a shape rather than a connection target. |
| `flowchart-shape-word-on-line` | error | — | A shape id or style written after a connection. |
| `flowchart-missing-target` | error | — | An arrow with no target. |
| `flowchart-mermaid-arrow` | info | — | A Mermaid-style arrow, read as the house form. |
| `flowchart-comparison-arrow` | warning | — | A comparison (`<=`) that reads as a connection to a shape. |
| `flowchart-near-duplicate` | warning | — | A new shape whose name is one or two letters from an existing one. |
| `flowchart-group-self-edge` | error | — | A group connected to itself or to its own member. |
| `flowchart-icon-on-group` | warning | — | An icon on a group, whose title draws none. |
| `flowchart-unknown-icon` | warning | — | An icon name the icon set does not have; the shape shows its text alone. |
| `flowchart-icon-only-without-icon` | warning | — | `icon-only` on a shape that names no icon. |
| `flowchart-key-shape` | warning | — | A key line that is not a key set. |
| `flowchart-key-unbound` | warning | — | A key entry naming a word the chart does not use. |

### 3.8 Charts: hub-spoke

| Rule ID | Severity | Autofix | What it catches |
|---|---|---|---|
| `hub-spoke-empty` | warning | — | A hub with no satellites; nothing is drawn. |
| `hub-spoke-extra-hub` | warning | — | A second top-level item; hub-spoke draws one hub. |
| `hub-spoke-hub-status` | warning | — | A status on the hub, which is not drawn. |
| `hub-spoke-too-few` | warning | — | One satellite, which reads as a caption, not a structure. |
| `hub-spoke-too-many` | warning | — | More satellites than are drawn; the rest are dropped. |
| `hub-spoke-tiered-branches` | warning | — | More branches than `tiered` draws. |
| `hub-spoke-tiered-leaves` | warning | — | More leaves than `tiered` draws. |
| `hub-spoke-tiered-channel` | warning | — | `sized` or `flow-*` on a `tiered` figure, which prints values but does not scale them. |
| `hub-spoke-two-flows` | warning | — | More than one `flow-*` class; only one applies. |
| `hub-spoke-two-channels` | warning | — | `sized` and `flow-*` together; connector weight wins. |
| `hub-spoke-extra-value` | warning | — | A second value pill on a satellite; it is dropped. |
| `hub-spoke-numeric-group` | warning | — | A group pill that looks like a figure but is not a readable value. |
| `hub-spoke-extra-status` | warning | — | A second status on a satellite; one is drawn. |
| `hub-spoke-extra-group` | warning | — | A second group on a satellite. |
| `hub-spoke-unknown-icon` | warning | — | An icon name the icon set does not have. |
| `hub-spoke-icon-only-without-icon` | warning | — | `icon-only` on an item that names no icon. |
| `hub-spoke-icon-only-empty-name` | warning | — | An icon-only item with no name for a screen reader. |
| `hub-spoke-bad-record` | warning | — | A record that is not an icon record; it is dropped. |
| `hub-spoke-inline-kind` | warning | — | A mark, spark or icon kind on a hub-spoke row, which draws nothing there. |
| `hub-spoke-extra-record` | warning | — | A second icon record on an item. |
| `hub-spoke-status-group` | warning | — | Every satellite carrying a status, which most likely meant groups. |
| `hub-spoke-too-many-groups` | warning | — | More groups than the hue cap; satellites stay neutral and no key is drawn. |
| `hub-spoke-missing-value` | warning | — | Some satellites with a value and some without, or a scaling modifier with no values. |
| `hub-spoke-nonpositive-value` | warning | — | A zero or negative value, which no area or weight can show; scaling is off. |
| `hub-spoke-mixed-units` | warning | — | Satellite values in different units; scaling is off. |
| `hub-spoke-sized-many` | warning | — | `sized` across more satellites than the eye can rank; sizing is off. |
| `hub-spoke-sized-floor` | warning | — | Several satellites too small to draw to scale, so their areas no longer compare. |
| `hub-spoke-flow-step` | warning | — | Two values within a few percent that draw a weight step apart. |
| `hub-spoke-sum` | warning | — | Satellites that add up to more than the hub. |
| `hub-spoke-hub-overflow` | error | — | Hub text that does not fit the hub at the smallest type. |
| `hub-spoke-crowded` | warning | — | A figure outside the envelope the layout is certified for (names, pills or spokes past their limits). |

### 3.9 The review tier (opt-in)

These come from `reviewText` in `lib/authoring/review-core.js`, which a tool runs only when asked (`lint:deck --review`, the Studio's review panel). They judge how well a slide communicates, not whether it renders, so every one is a `suggestion`.

| Rule ID | Severity | Autofix | What it catches |
|---|---|---|---|
| `label-title` | suggestion | — | A heading that is a category label, not the takeaway. |
| `chart-no-takeaway` | suggestion | — | A data slide whose heading names the topic, not the "so what". |
| `wall-of-text` | suggestion | — | A slide past the deck profile's word or bullet budget. |
| `long-heading` | suggestion | — | A heading past its word budget. |
| `divider-numbered-heading` | suggestion | — | A numbered divider heading long enough to run off the frame. |
| `density-overflow` | suggestion | — | An element run well past its word budget. |
| `density-crowd` | suggestion | — | An element crowding its word budget. |
| `verbose-<chrome slot>` | suggestion | — | A family: one ID per chrome slot (`verbose-eyebrow`, `verbose-subtitle`, `verbose-key-insight`). The slot is past its word budget. |
| `pill-not-a-checkbox` | suggestion | — | `{x}` written as a checkbox; braces make a pill, brackets make a mark. |
| `stub-slide` | suggestion | — | A heading with no body. |
| `metric-no-referent` | suggestion | — | A hero number with nothing to compare it to. |
| `image-no-alt` | suggestion | — | An image with empty alt text. |
| `possessive-stacking` | suggestion | — | Stacked possessives that stumble read aloud. |
| `title-incomplete` | suggestion | — | A title slide with placeholder text, or no subtitle. |
| `duplicate-heading` | suggestion | — | A heading that repeats an earlier slide's. |
| `monotone-openings` | suggestion | — | Many headings that open the same way. |
| `no-ask` | suggestion | — | A deck of four or more content slides with no ask or recommendation. |
| `agenda-missing` | suggestion | — | A long deck with no agenda. |
| `length-vs-time` | suggestion | — | More slides than the stated talk length allows. |

### 3.10 The CLI's narration discovery pass

Emitted by `tools/lint-deck.js` itself (`--discover`), not by `lint-core`, because they need the narration normalizer.

| Rule ID | Severity | Autofix | What it catches |
|---|---|---|---|
| `narration-acronyms` | suggestion | — | All-caps tokens that narration will read letter by letter. |
| `narration-passthrough` | suggestion | — | Slash, ratio and identifier tokens that narration will read as glyphs. |

> **Autofix is per-finding, not per-rule.** The ✓ marks rules that *can* offer a
> deterministic autofix; whether a given finding carries one depends on its
> source line. `card-style-inline-title`, `ledger-inline-title`, and
> `split-bodyless-item` autofix the bold inline shape (`- **Title.** body`); the
> gantt span rule `gantt-retired-delimiter` autofixes the retired delimiter to
> `..`. A rule with a did-you-mean (`unknown-class` and the `unknown-*`
> front-matter rules) autofixes only when a valid name is close enough to
> suggest; the finding then carries `replace: { from, to }`. A bare-title or
> otherwise ambiguous finding emits `autofixable: false` and relies on the
> `fix` guidance (§4).

The machine-readable companion to this table is the per-component grammar in
[`dist/docs/grammar.json`](../dist/docs/grammar.json), which records, per
component, the slot/shape contract these rules enforce.

## 4. Machine-applicable fixes

When `autofixable` is `true`, exactly one correct rewrite exists, so a tool MAY
apply it without prompting the author. The reference implementation exposes:

- `autofixNestedTitle(line)` — converts the **unordered** inline shape
  `- **Title.** body` → `- Title` / `  - body` (card-style and split rules). It
  returns `null` for shapes that are not uniquely fixable (a bare title, an
  ambiguous non-bold split), which emit `autofixable: false`.
- `autofixOrderedNestedTitle(line)` — the ledger variant: `- **Title.** body` →
  `1. Title` / `   - body` (Markdown auto-numbers, so the literal `1.` is fine).
- `autofixGanttDelimiter(line)` — swaps a retired gantt span delimiter
  (`→` / `–` / `—` / `->`) for `..`, only inside the line's inline-code spans.
- `applyFix(source, finding)` — applies an autofixable finding to the document,
  scoped to the finding's slide so an identical line elsewhere is untouched. The
  rewrite is computed from the located source line, so its indentation is kept.
- `applyAllFixes(source, vocab)` — applies every autofixable finding in one pass
  loop (re-linting between fixes, since each shifts line numbers), returning the
  fully-fixed source. Backs the Studio's "Fix all issues" and an editor command.

A conformant L2 tool MAY implement its own fixer; it MUST NOT mark a finding
`autofixable` unless the rewrite is deterministic and unique.

## 5. Producing diagnostics

The reference engine is `lintTextWith(source, vocab)` in `lint-core.js`:

- **Pure** — no `fs`, no network, no model call. Every finding (including
  did-you-mean) is computed deterministically. This is deliberate: diagnostics
  must be reproducible and runnable in a browser, a CI gate, and an editor
  alike.
- **Vocabulary-injected** — the set of valid names/modifiers/map-regions/finish
  names is passed in, built from the component manifests
  (`lib/authoring/lint.js` on Node; a build-time precomputed vocab in the
  browser). The same manifests generate `grammar.json`, so diagnostics and the
  published grammar can never disagree.

## 6. Non-goals / future work

- **A Language Server.** This protocol is its foundation — a server wraps
  `lintTextWith` + `applyFix` behind LSP `textDocument/publishDiagnostics` and
  `textDocument/codeAction`. Not built here.
- **Character-precise `range`s.** v1 locates by slide + line; ranges are a
  forward-compatible addition (§1).
- **Cross-document / deck-level findings** beyond front matter (e.g. duplicate
  slide IDs, asset existence). Out of scope for 1.x.
- **The optional fields the reference implementation already emits.** Some
  findings carry fields §1 does not define yet: `didYouMean` and `replace`
  (a did-you-mean rewrite), `span` and `col` (a span inside the line), and
  `shapeChange` (the fix changes how an existing deck renders). Some findings
  also omit `classToken`, which §1 lists as required. Specifying these is the
  next minor version's work.

## 7. Change log

- **1.1 (2026-10-08).** The registry catches up with the reference
  implementation: 13 rows became 177 rule IDs plus three families, grouped by
  what they check (§3), and a test now pins the registry to the code. Two
  severities join `error` and `warning`: `info` and `suggestion` (§2). Rows for
  rules with a did-you-mean (`unknown-class`, the `unknown-*` front-matter
  rules) now mark autofix ✓, because the reference implementation offers the
  rewrite. No rule ID was renamed or removed. The spec gains an owner. Source:
  `engineering/decisions/2026-10-08-spec-audit.md` §4.1.
- **1.0 (2026-06-13).** First draft: the finding shape, two severities, and a
  registry of 13 rules.
