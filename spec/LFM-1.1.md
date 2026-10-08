# LFM 1.1 — Lattice-Flavored Markdown

<!-- spec-parts
schema: tools/build-docs-portal.js lib/components/index.js
reference: lib/engine/index.js lib/authoring/lint-core.js docs/src/lib/segno/ docs/src/lib/lente/tags.ts
tests: spec/conformance/lfm/ tools/lfm-conformance.js
-->

**Version:** 1.1 · **Status:** Draft, for the owner's sign-off · **Date:** 2026-10-08 · **Owner:** @saden1
**Supersedes:** [LFM 1.0](./LFM-1.0.md) once ratified. 1.1 adds the front-matter registers (§2.3), the `_lens` tag (§2.4) and the inline notation (§3.6); nothing in 1.0 changes meaning.
**License:** [CC-BY-4.0](#12-governance--license)

LFM (Lattice-Flavored Markdown) is the authoring dialect of the
[Lattice](../README.md) slide engine. Its name follows *GitHub-Flavored
Markdown*: LFM is **a profile of Markdown, not a new language.**

> **LFM = CommonMark + GFM task lists + the Lattice extension set.**

A document written in LFM is a valid Markdown document. Every LFM extension
MUST render readably in a CommonMark viewer that has **no knowledge of
Lattice** — GitHub, GitLab, Bitbucket, and Confluence included. That property is
**graceful degradation**, the governing rule of the standard and the criterion
for adopting any future extension (§5).

This document specifies what LFM adds to Markdown, how each addition degrades,
and what makes a document *conformant*. It does not specify a parser: LFM rides
CommonMark, and any conformant CommonMark/GFM parser plus the extension handlers
below is a conformant LFM implementation.

---

## 1. Conformance levels

LFM defines three levels so a tool can advertise precisely what it supports.

| Level | Name | What it means |
|---|---|---|
| **L0** | *Markdown-faithful* | The document is valid CommonMark + GFM. An LFM-unaware renderer produces a readable result. **Every conformant LFM document is L0.** |
| **L1** | *Lattice-structured* | The renderer understands the **slide** and **block** extensions (§2–§3): `_class` directives, front-matter directives, the `_lens` tag, the card grammar, state markers and the inline notation. It produces Lattice layouts. |
| **L2** | *Lattice-diagnostic* | The tool additionally implements the [Diagnostic Protocol](./diagnostics.md): it validates a document, reports findings with stable rule IDs, and offers machine-applicable fixes. |

A **conformant LFM document** is valid at L0 and follows the grammar in §2–§4
for every Lattice construct it uses. A **conformant LFM renderer** declares the
highest level it implements.

## 2. Slide-level extensions

### 2.1 The `_class` directive

A slide selects a Lattice component with a Marpit class directive — an **HTML
comment**, so it is invisible in every Markdown renderer:

```markdown
<!-- _class: split-compare -->
```

The value is a space-separated list of one **component name** plus zero or more
**modifier tokens** (§4). The complete, machine-readable vocabulary of names,
modifiers, slots, and skeletons is published in
[`dist/docs/grammar.json`](../dist/docs/grammar.json), generated from the
component manifests.

- **Degrades to:** nothing visible (HTML comment). **L0-clean.**

### 2.2 Slide separators

Slides are separated by a thematic break on its own line (`---`). This is
CommonMark `<hr>`; an unaware renderer shows horizontal rules between sections.

A renderer also starts a slide at a heading unless the deck sets `split: rule` (§2.3): at
the first `#` and at every `##`, never at `###` or deeper. A `---` still divides with
headings on, so a deck that puts `---` between every slide has the same slides either way.
A slide's lead-in (its directive comments, and an eyebrow written above the heading) belongs
to the heading's slide, not the one before.

- **Degrades to:** horizontal rules. **L0-clean.**

### 2.3 Front-matter directives

A leading YAML front-matter block carries deck-wide directives. Besides Marpit's own
(`theme`, `paginate`, `class`, `header`, `footer`, …), LFM 1.1 defines two kinds of key.

**Registers** set one deck-wide choice from a closed list of values. Each value is a word.
A renderer applies the register to every slide, and a slide can override it with the
matching token in its own `_class` (§2.1). A value outside the list MUST NOT change the
render, and an L2 tool reports it as `unknown-<key>` (the rule ID in the last column).

| Key | Values (default first, where one applies) | What it sets | Rule |
|---|---|---|---|
| `mode:` | `boardroom` · `sketch` · `sketch-clean` | The rendering mode: clean, or drawn by hand. | `unknown-mode` |
| `finish:` | `none` · `atrium` · `meridian` · `strata` · `halo` · `ledger` · `nimbus` · `loom` · `savile` · `gallery` | The backdrop painted behind every slide. | `unknown-finish` |
| `backdrop:` | a strength (`20` `40` `60` `80` `full`), a mask (`clear` `open`) or a spot (`spot-tl` `spot-t` `spot-tr` `spot-l` `spot-c` `spot-r` `spot-bl` `spot-b` `spot-br`); up to one of each | How strongly the finish shows, and where it clears. | `unknown-backdrop` |
| `preset:` | `classic` · `editorial` · `brand` · `minimal` | A named look that sets several registers at once. A register the deck sets itself wins over the preset's. | `unknown-preset` |
| `split:` | `rule` · `headings` | How the deck divides into slides: at `---` (§2.2), or at every `#`/`##` heading as well. | `unknown-split` |
| `stamp:` | `tab` `notch` `bracket` `seal` `pill` `ribbon` `flag` `underline` `dot` `mark` `veil` `bar` `pin` | The shape of a slide's marker. | `unknown-stamp` |
| `tone:` | `rail` · `edge` · `glow` | The marker's tone. | `unknown-tone` |
| `spectrum:` | `on` · `solid` · `duo` · `mono` · `off` | The spectrum accent. | `unknown-spectrum` |
| `spectrum-edge:` | `top` · `left` · `right` · `bottom` · `off` | Which slide edge carries the spectrum. | `unknown-spectrum-edge` |
| `rule:` | `auto` · `full` · `short` · `accent` · `none` | The underline beneath a slide heading. | `unknown-rule` |
| `eyebrow:` | `plain` · `dot` · `bar` · `arrow` · `underline` | The decoration on a kicker (§3.4). | `unknown-eyebrow` |
| `headline:` | `auto` · `left` · `center` · `right` | The alignment of a slide's framing text. | `unknown-headline` |
| `lift:` | `on` · `off` | Whether cards are raised off the slide. | `unknown-lift` |
| `cards:` | `center` · `stretch` · `top` · `spread` | Where a row of cards puts the height it does not need. | `unknown-cards` |
| `tag:` | up to one word per axis: color (`color` `plain` `none`), size (`small` `regular` `large`), placement (`corner` `foot` `notch` `band` `inline`), alignment (`start` `center` `end`) | The look of a card's tag. | `unknown-tag` |
| `corners:` | `square` · `rounded` | The corners of the slide itself. | `unknown-corners` |
| `chart-finish:` | `off` · `pigment` · `etching` · `tone` | How every chart spends its color. | `unknown-chart-finish` |
| `spark:` | up to one word per axis: frame (`framed` `bare`), look (`pigment` `etching` `tone`), corners (`square` `rounded`) | The deck's default for inline sparks (§3.6). | `unknown-spark` |
| `icon:` | up to one word per axis: frame (`framed` `bare`), look (`pigment` `etching` `tone`), corners (`square` `rounded`) | The deck's default for inline icons (§3.6). | `unknown-icon` |
| `inline-code:` | `rich` · `literal` | Whether the inline notation (§3.6) runs. `literal` leaves every single-backtick span as code. | `unknown-inline-code` |
| `claim:` | `framed` · `quiet` · `hero` · `bleed` | The treatment of a slide's lead claim. | `unknown-claim` |
| `color-mode:` | `light` · `dark` · `system` · `inherited` · `print` | Which palette the deck renders in. | `unknown-color-mode` |
| `fit:` | `heal` · `report` · `trim` | What the renderer may do to make a slide fit: repair, only report, or cut. `guards:` is an older spelling a renderer SHOULD accept. | `unknown-fit` |
| `venue:` | `laptop` · `huddle` · `conference` · `hall` | Where the deck is seen, which sets its type scale. | `unknown-venue` |

**Settings** carry a value that is not one word from a list.

| Key | Value | What it sets | Rule |
|---|---|---|---|
| `logo:` | a path or URL | The deck's logo on every slide. | — |
| `plugins:` | a list of plugin names | The plugins the deck needs loaded. It only adds: a renderer that loads more by default still does. | `unknown-plugin` |

**Delivery** keys change no rendered pixel. They tell a self-presenting player how to
present the deck, so a renderer ignores them, but an export MUST keep them.

| Key | Values | What it sets | Rule |
|---|---|---|---|
| `pace:` | `natural` · `brisk` · `deliberate` | How long a narrated slide holds before and after speaking. | `unknown-pace` |
| `delivery:` | `restrained` · `expressive` · `somber` | How a narrated guide gestures. | `unknown-delivery` |
| `greeting:` / `closing:` | text | What a narrated deck says first and last. A `{placeholder}` the voice would read aloud as written is `unknown-bookend-placeholder`. | — |

A *host application* MAY read its own front-matter keys that LFM does not define, and a
conforming renderer ignores them. The Lattice Studio reads `title:` to name a deck, for
instance. Such keys are application metadata, not language surface.

The value lists above are the ones the reference implementation ships, each defined once
in `lib/core/resolve-<key>.js` (`*_NAMES`). The full behavior of every register is
documented in `lib/base/base.registers.docs.md`. Where that page and this table disagree
about a value list, this table is the contract and the disagreement is a defect.

- **Degrades to:** front matter is hidden or shown as a metadata table, depending on the
  host. **L0-clean.**

### 2.4 The `_lens` tag (reader-lens membership)

A slide declares the reader lenses it belongs to in one HTML comment, written like a class
directive:

```markdown
<!-- _lens: brief ask -->
<!-- _lens: -evidence -->
```

The value is a space-separated list of lens ids. A bare id or `+id` puts the slide **in**
that lens; `-id` takes it **out**. Ids are lowercase, and so is `_lens` itself: a renderer
MUST NOT treat `_Lens` as a lens tag. Only a slide's first `_lens` comment outside a fenced
code block counts.

A `_lens` tag is a directive (§3.5), so it is never a speaker note, and a renderer MUST NOT
copy it into rendered or exported output: it says who a slide is for, which an exported
deck should not reveal. What a lens *does* (which slides a reader sees) belongs to the host
application. LFM fixes only the tag. The reference implementation is
`parseSlideTags` in `@laticent/lente`.

- **Degrades to:** nothing visible (HTML comment). **L0-clean.**

## 3. Block-level extensions

### 3.1 The card grammar (nested-list slots)

Card-style and ledger layouts read a **title + body** from a nested list (a
*card-style* layout is one whose grammar declares a card slot; the set is
published in [`dist/docs/grammar.json`](../dist/docs/grammar.json)). The
canonical shape is:

```markdown
- Title
  - body text
```

The inline form `- **Title.** body` is **not** valid LFM on a card-style
layout: the body inherits the title's weight. This is enforced as a diagnostic
(`card-style-inline-title`, with an autofix). Ledger/numbered layouts use the
ordered form:

```markdown
1. Name
   - body text
```

- **Degrades to:** a nested bullet list — exactly what it reads as. **L0-clean.**

### 3.2 State markers

A single-character marker at the start of a list item (or alone in a table cell,
or inside single-backtick inline code) encodes an answer. The grammar is
**shared** across `checklist`, `verdict-grid`, `obligation-matrix`, `roadmap`,
`pricing`, `state-cells` tables and inline marks, and each marker MUST carry the
same answer in every one of them. A component MAY name an answer in its own
words (a roadmap's *missed* for `[!]`); it MUST NOT change the answer.

| Marker | Answer | Notes |
|---|---|---|
| `[x]` | yes / done / met | GFM task-list syntax. |
| `[-]` | partly / in progress | **Not GFM syntax** (see §5.1). |
| `[!]` | no / failed / not met | **Not GFM syntax** (see §5.1). |
| `[?]` | unknown — looked at, cannot be settled | **Not GFM syntax** (see §5.1). |
| `[ ]` | open — not started, not assessed | GFM task-list syntax. |
| `[/]` | does not apply / out of scope | **Not GFM syntax** (see §5.1). |

`[X]` (capital) is **not** a marker. GFM reads it as a *checked* box, the
opposite of what a cross suggests, so LFM leaves it literal.

- **`[x]` / `[ ]` degrade to:** real checkboxes in any GFM host. **L0-clean.**
- **`[-]` / `[!]` / `[?]` / `[/]` degrade to:** literal text (`[-] …`). Readable
  but not a checkbox — LFM's only non-GFM-clean construct (§5.1).

### 3.3 Fenced sub-languages (charts, diagrams & motion)

A fenced code block with a recognized info string is a **sub-language**. Each
is its own mini-spec; LFM only requires that it degrades to a code block.

| Info string | Sub-language | Degrades to |
|---|---|---|
| `functionplot` | A [function-plot](https://mauriciopoppe.github.io/function-plot/) graph spec (JSON body: mathematical functions + axes). Used today by the `math` component's `canvas` variant to draw a curve beside an equation. | A code block showing the JSON config. **L0-clean.** |
| `mermaid` | Mermaid (passthrough), used by the `diagram` component. | A code block. **L0-clean** (and Mermaid-aware hosts render the diagram). |
| `math` | A TeX display equation, used by the `math` component, written as a fence instead of `$$…$$`. | A code block showing the TeX. **L0-clean.** |
| `anima` | An Anima motion-scene spec (JSON body), used by the `scene` component to animate its poster still on the HTML and present surfaces. The PDF keeps the poster. | A code block showing the JSON spec. **L0-clean.** |

Each fence is **named after the library that renders it**: `functionplot` for
function-plot, `mermaid` for Mermaid, `anima` for Anima, Lattice's own motion
host. This matches how the equation half of the
`math` component uses standard `$$…$$` to pass through to KaTeX. LFM does
**not** rebrand these libraries or claim to own their config languages.

What LFM owns is narrow and consistent across every fence: the fence
registration, the SVG **theming** that makes the output inherit the deck's
palette tokens, and the **degradation contract**. The fence body is the
renderer library's own configuration language, not Markdown, and LFM does not
own its schema — including Anima's, which Lattice writes but which belongs to
the Anima host (its scene parser validates it), not to this spec.
[`dist/docs/grammar.json`](../dist/docs/grammar.json) records
each fence's library, component, and deprecated aliases; the config schema stays
with that library, so this prose spec stays stable as those options evolve.

> **Deprecated alias.** The `functionplot` fence was previously named
> `latticeplot`. That name implied a Lattice-owned grammar that does not exist
> (the body is function-plot's, verbatim), so it was renamed for honesty.
> ```` ```latticeplot ```` is accepted as a **deprecated alias for one release**
> and will be removed in a future major version. See the
> `2026-06-13-lfm-standard` decision note.

### 3.4 Other inline conventions

- **Eyebrow / subtitle / hero number** and similar slot conventions are
  ordinary Markdown (a leading inline-code span, an `<em>`-wrapped unit, an
  `<h2>` lifted into a panel). They are structural reads over standard Markdown,
  documented per component in `grammar.json`, and are **L0-clean** by
  construction.

### 3.5 Speaker notes

An **HTML comment on a slide that is neither a directive nor a tooling pragma**
is that slide's speaker note. This is Marp's own semantics, unchanged:

```markdown
# The slide title

<!-- Open cold. Pause two seconds before the first word. -->
```

A slide may carry several note comments; they are concatenated in order. Two
comment kinds are **not** notes, matching Marpit exactly:

- **Directives** — `<!-- _class: … -->`, `<!-- paginate: true -->`, and any
  comment that parses as a block of known directive keys (§2.1, §2.3).
- **Tooling pragmas** — `markdownlint-*`, `prettier-ignore[-start|-end]`, and
  `lint disable|enable|ignore …` (the editor/formatter control comments). The
  recognized set is Marpit's `magicCommentMatchers`, mirrored in the reference
  implementation `lib/authoring/notes-core.js` so every render path agrees on
  the note/non-note boundary.

A conformant L1 renderer SHOULD surface notes through whatever presenter channel
it offers. How a note is *presented* is implementation-defined; *what counts as a
note* is the contract above, and that boundary is what conformance fixes. Among
the reference render paths today, **Lattice's emulator** materialises notes — a
per-page PDF text annotation plus a hidden `aside.lattice-notes` element in the
HTML sidecar; under marp-cli the same comments are marp-core's native notes
(surfaced by `marp --pdf-notes` or a PPTX export); the VS Code preview does not
surface them yet.

The **directive and tooling-pragma exclusions** above are the pinned part of the
contract: they are identical across implementations (the reference
implementation pins them against marp-core's documented comment-collection
behavior — hardcoded expected outputs, not a live marp-core comparison; see
`test/unit/authoring/notes-core.test.js`). A few rare
comment-*placement* cases are explicitly **not** guaranteed identical, because
they depend on how a given parser segments comments rather than on the note
boundary: a comment buried inside a raw HTML block, two comments with no blank
line between them, and a single comment that mixes a directive with prose. A
conformant tool MAY collect these differently; authors should keep a note in its
own comment, on its own line.

- **Degrades to:** nothing visible — an HTML comment is invisible in every
  Markdown renderer, and on GitHub/GitLab a comment is already how an author
  leaves an out-of-band remark. **L0-clean.**

### 3.6 Inline notation (pills, marks, sparks and icons)

A **single-backtick inline code span** whose whole content matches one of the forms below
renders as a drawn element instead of code. Every form shares one notation
([Segno](../docs/src/lib/segno/README.md)): an opening sigil and brace, a comma-separated
list of words, a closing brace. The first item is the subject; the rest are modifier words
in any order, each also writable by name (`shape=tag`). An item that holds a comma, `|`,
`=`, `[`, `]`, `{`, `}` or `"` is quoted (`{"Cost, excluding tax"}`).

| Form | Example | Renders as |
|---|---|---|
| `{LABEL, …}` | `` `{BETA, tag, c4}` `` | A **pill**: a label in a shape and a color. |
| `[x]` `[-]` `[!]` `[?]` `[ ]` `[/]` | `` `[x]` `` | A **state mark** carrying the §3.2 answer. |
| `~{DATA, …}` | `` `~{12 14 17, end}` `` | A **spark**: a chart the size of a word. |
| `^{NAME, …}` | `` `^{database, c3}` `` | An **icon** (the `icons` plugin). |

**Pill words.** A shape (`tag` `tag-bordered` `chip` `circle` `chevron-right`
`chevron-left` `diamond`; none gives the capsule `pill`), a color slot (`c1` … `c12`), a
size (`sm` `lg`), and `icon=NAME` to lead the label with an icon.

**Spark data and words.** The data is a series of 2 to 48 numbers, space-separated and
oldest first, or a ratio (`72/80`, or `72%` for 72 of 100). The words are a type (`line`
`area` `bar` `step` `winloss` for a series, `line` by default; `ring` `bullet` for a ratio,
`ring` by default), a size (`sm` `md` `lg` `fill`), `zero`, markers (`end` `minmax`), a color
slot (`c1` … `c12`), and the frame, look and corner words of the `spark:` register (§2.3).

**Icon words.** A color slot, a size (`sm` `md` `lg`), the frame, look and corner words of the
`icon:` register (§2.3), and `label="…"` for what a screen reader says.

Three rules hold for every form:

1. **All or nothing.** A span that does not parse, or that names a word the form does not
   know or names one twice, renders as the code it is. A renderer MUST NOT draw a partial
   element, and an L2 tool reports the span (`pill-literal`, `spark-literal`,
   `<kind>-literal`).
2. **An escape keeps it literal.** A backslash before the sigil (`` `\{LIVE}` ``,
   `` `\[x]` ``) renders the span as code without the backslash. A backslash anywhere else is
   left alone.
3. **Only inline code.** A fenced or indented code block is never read as notation, and
   neither is any span when the deck sets `inline-code: literal` (§2.3).

The full behavior of each form is documented in `lib/base/base.docs.md` (§ Inline pills,
§ Inline sparks, § Inline state marks) and `lib/plugins/icons/icons.docs.md`.

- **Degrades to:** inline code showing the span as written. A reader of the raw Markdown
  sees `{BETA, tag, c4}` or `~{12 14 17}`. **L0-clean.**

## 4. The component & modifier vocabulary

`_class` tokens are one **component name** plus modifier tokens. The full list
is generated, not enumerated here, so it cannot drift:

- **Component names** — `dist/docs/components.json` (`vocabularies.buckets` and
  the per-component entries) and the human catalog `dist/docs/components.md`.
- **Per-component grammar** — `dist/docs/grammar.json`: for each component, its
  `_class` token, its required and optional **slots** (CSS selector +
  description), its **skeleton**, and the **fences/state-markers** it reads.
- **Modifiers** — recognized by set membership or by these prefix families:
  `tint-`, `mark-`, `with-`, `at-`, `no-`, `tone-`, `treatment-`, `checks-`,
  plus the universal/semi-universal variant sets. The authoritative prefix list
  is `MODIFIER_PREFIXES` in
  [`lib/authoring/lint-core.js`](../lib/authoring/lint-core.js); the enumerated
  variant tiers are cataloged in
  [`design/design-system.md`](../design/design-system.md) §6.5.

An unrecognised token is a diagnostic (`unknown-class`) with a did-you-mean
suggestion, never a hard parse error — an LFM document with a typo is still a
valid Markdown document.

## 5. Graceful degradation — the governing rule

**Every LFM extension MUST render as readable Markdown in an LFM-unaware
renderer.** This is the property that makes LFM safe for a host like GitHub to
render, and safe for an author to write without lock-in.

**Rule for future extensions:** no construct may be added to LFM without a row
in the degradation table (§2–§3) stating exactly what an unaware renderer
shows. If a construct cannot degrade readably, it is rejected or redesigned.

### 5.1 Known non-GFM-clean constructs

LFM 1.1 has exactly one: the **`[-]`, `[!]`, `[?]` and `[/]` state markers**
(§3.2). GFM task-list syntax covers only `[x]` and `[ ]`, so the other four
render as literal text in a vanilla GFM host. They are retained because the
six-answer grammar is load-bearing across every stateful component and the
literal-text fallback is readable.
A future LFM version MAY introduce GFM-clean aliases. Until then, this is a
documented exception, not a conformance failure.

## 6. Relationship to other standards

- **CommonMark** — LFM is a strict superset. Every CommonMark document is a
  valid (if Lattice-inert) LFM document.
- **GFM** — LFM adopts GFM task lists and tables. The only divergence is §5.1.
- **Marpit / Marp** — LFM's slide model (`_class`, `---` separators, front
  matter) is Marpit-compatible; Lattice's own engine natively re-implements
  that model (zero `@marp-team` runtime dependency — see
  `engineering/marp-independence.md`), it isn't a Marp wrapper. Marpit gives
  you slides and a directive syntax; LFM adds what Marpit does not specify — a
  named, versioned, conformance-levelled contract, the degradation guarantee
  (§5), a fixed component/modifier vocabulary (§4), and a stable diagnostic
  protocol. LFM names and constrains the subset that produces boardroom layouts.
- **Mermaid** — embedded as a fenced sub-language (§3.3), unchanged.

## 7. Versioning

LFM follows SemVer at the *standard* level, tracking the engine's stability
contract: layouts and tokens are stable surfaces (see `CHANGELOG.md`).

- **Major** — removing or breaking an extension, or breaking degradation.
- **Minor** — adding an extension (with its degradation row) or a component.
- **Patch** — clarifications and editorial fixes.

The machine-readable surface (`grammar.json`, `components.json`) is regenerated
from the manifests on every build, so it always matches the engine that ships
alongside this document.

## 8. Conformance testing

Conformance is verifiable at each level, with a distinct test shape per level:

- **L0 (degradation).** A fixture pairs an LFM source fragment with the readable
  Markdown a Lattice-unaware renderer MUST produce. The degradation rows in
  §2–§3 are the normative seed for this corpus.
- **L1 (structure).** A fixture pairs an LFM document with the components and
  slots a renderer MUST resolve from it — the `_class` token, the card-grammar
  reads, the state-marker semantics. The per-component grammar in
  [`dist/docs/grammar.json`](../dist/docs/grammar.json) is the oracle.
- **L2 (diagnostics).** A fixture pairs an LFM document with the exact set of
  findings (diagnostics §1) a tool MUST emit: rule ID, severity, slide, and any
  autofix result. The reference implementation's lint fixtures are the seed and
  its output is the v1 oracle.

The shared test cases live in [`spec/conformance/lfm/`](./conformance/lfm/README.md):
small decks, each with the L0, L1 and L2 results it must produce, in JSON a second
implementation can read. They cover §2 and §3. A case's `spec` field names the version
that introduced it: a 1.1 implementation passes every case, and a 1.0 implementation passes
the `LFM-1.0` ones. The reference adapter,
`tools/lfm-conformance.js`, runs them against the Lattice engine in the unit tier.
Where a case and this prose disagree, the disagreement is a defect in one of them,
and the owner decides which.

## 9. Security considerations

LFM itself executes nothing: the prose layer is CommonMark, and every extension
degrades to valid Markdown. The security surface is the fenced **sub-languages a
host renders** (§3.3): Mermaid and function-plot both produce SVG from
author-supplied configuration. A host that renders untrusted LFM MUST treat
them as it treats any embedded renderer.

- **Sanitise the rendered SVG.** Strip scripts, foreign objects, and event
  handlers before inlining the output — exactly as a host already does for a
  `mermaid` block.
- **Bound the work.** A fence body is attacker-controllable. A host SHOULD cap
  render time and output size to resist denial-of-service from a pathological
  config.
- **Resolve asset paths under the host's policy.** The `logo:` directive (§2.3)
  and any local-file reference resolve against the host's asset policy, not
  LFM's; a host MUST NOT widen its file-access surface to render LFM. The
  Lattice reference engine gates local files behind an explicit
  `--allow-local-files` flag.

## 10. Adding to the vocabulary

The component, modifier, and fence vocabulary is **closed to the manifest set**
in LFM 1.1: a third party cannot register a new `_class` component, modifier
prefix, or fence into the standard at authoring time. New vocabulary enters LFM
the way every current entry did — a component manifest (or a fence
registration) is added to the engine, and the build projects it into
`grammar.json`, so the published grammar and the linter vocabulary update
together and cannot drift (§4).

An unrecognised token is therefore a diagnostic (`unknown-class`), never a parse
error: an author who reaches for vocabulary that does not exist is warned, not
blocked. A registration path for out-of-tree vocabulary — an org-private
modifier family, a third-party fence such as `vega-lite` — is deferred (§11).

## 11. Non-goals (LFM 1.1)

LFM 1.1 deliberately does **not**:

- **Define a parser or a formal grammar (ABNF/EBNF) for the prose layer.** LFM
  rides CommonMark; the parser is CommonMark's. `grammar.json` is a structural
  projection (selectors + skeletons), not a parser grammar.
- **Re-encode the `[-]` / `[!]` / `[?]` / `[/]` state markers** into GFM-clean glyphs (§5.1).
  The current glyphs are documented, not changed, in 1.1.
- **Open a registration path** for out-of-tree components, modifiers, or fences
  (§10).
- **Ship a Language Server or character-precise diagnostic ranges.** The
  diagnostic protocol is their foundation; see diagnostics §6.

## 12. Governance & license

- **License.** This specification — the prose under `spec/` — is published under
  **[CC-BY-4.0](https://creativecommons.org/licenses/by/4.0/)**. Anyone may
  implement LFM (a renderer, a linter, a `remark` plugin) and redistribute the
  spec, with attribution. The Lattice engine's *code* is AGPL-3.0; the spec carries
  its own license because a normative document is a different artifact from the
  reference implementation.
- **Owner.** @saden1 owns this spec and signs off every change to its meaning.
- **Steward.** The Laticent project stewards LFM. The spec is the owned
  asset; conformant implementations are interchangeable, and a second
  implementation is an explicit adoption goal.
- **Amendments.** Changes follow the SemVer rules in §7 and land through the
  project's normal review — a PR against `spec/`, recorded in the history below
  and in `CHANGELOG.md`. Any change to a normative MUST/MAY requires a version
  bump per §7.

### Document history

| Version | Date | Change |
|---|---|---|
| 1.0-draft | 2026-06-13 | Initial draft. Formalises the existing extension set, conformance levels, degradation table, and the companion diagnostic protocol. |
| 1.0-draft | 2026-09-24 | §3.3 registers the `anima` fence (JSON body, read by `scene`). The engine already rendered it; the table and `grammar.json` now say so. Additive — a new extension with its degradation row (§7). |
| 1.0-draft | 2026-09-24 | §3.2 state markers: six answers, one meaning each in every component. Adds `[!]` (no) and `[?]` (unknown); `[ ]` is "open" everywhere, where verdict-grid used to read it as "not met". §5.1 lists the new non-GFM markers. A breaking change to a normative meaning, landed in the pre-ratification draft per §7; the engine's changelog carries the `Breaking:` line. Record: `engineering/decisions/2026-09-24-six-state-marks.md`. |
| **1.0** | 2026-10-08 | **Ratified** as the core it describes, with an owner. §2.3 now matches the engine: `boardroom`, `sketch` and `sketch-clean` are `mode:` values (they moved off `finish:` before ratification), and `finish:` names a backdrop. §2.2 notes that a renderer may also divide at headings, as the reference implementation does by default. §3.3 lists the `math` fence, which `grammar.json` already recorded. §8: the shared test cases ship in `spec/conformance/lfm/`. Owner ruling: `engineering/decisions/2026-10-08-spec-audit.md` §8.2. |
| 1.1-draft | 2026-10-08 | §2.3 lists every front-matter register the reference implementation reads, each with its values and its `unknown-<key>` diagnostic, plus the settings (`logo:`, `plugins:`) and the delivery keys (`pace:`, `delivery:`, `greeting:`, `closing:`). §2.2 specifies the heading split. §2.4 adds the `_lens` tag. §3.6 adds the inline notation: pills, marks, sparks and icons. Each has shared test cases in `spec/conformance/lfm/`. Additive (a minor version, §7). Waits on the owner's sign-off. |

## Appendix A — A worked example (informative)

A three-slide LFM deck, and how the same source reads in each environment:

````markdown
---
theme: indaco
mode: boardroom
paginate: true
---

<!-- _class: title -->

# Q3 Strategy

`Board review · 2026-06-13`

How we get to plan by year-end.

---

<!-- _class: checklist -->

## Readiness

- [x] Revenue plan signed
- [-] Hiring partially staffed
- [ ] Security audit scheduled

---

<!-- _class: cards-grid -->

## Bets

- Expand EU
  - Two markets live by Q4.
- Ship the API
  - Private beta with six design partners.
````

**In a Lattice-unaware viewer (GitHub, plain CommonMark):**

- The front matter is hidden or shown as a metadata table.
- The `_class` comments are invisible.
- `---` renders as horizontal rules between sections.
- `[x]` and `[ ]` render as real checkboxes; `[-]` renders as the literal text
  `[-]` (§5.1).
- The eyebrow code-span and the "Bets" nested list render as ordinary inline
  code and a nested bullet list.

A reviewer on GitHub sees a titled, sectioned checklist and a list of bets — the
document is **completely readable** with no Lattice support.

**In Lattice (L1+):**

- Slide 1 renders the `title` component: display headline, eyebrow, standfirst.
- Slide 2 renders `checklist`, mapping `[x]` / `[-]` / `[ ]` to pass / partial /
  todo states.
- Slide 3 renders `cards-grid`, lifting each card's first line to a bold title
  above its body.

Nothing in the source is lost on the way down, and nothing Lattice-specific
leaks up into the degraded view.

---

*This spec is generated-adjacent: `tools/build-docs-portal.js` builds the
vocabulary and per-component grammar it points to (`dist/docs/grammar.json`,
`dist/docs/components.json`) from the component manifests. This prose is the
stable contract; the machine artifacts are the always-current detail.*
