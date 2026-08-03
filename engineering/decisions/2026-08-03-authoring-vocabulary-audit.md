---
status: proposed
summary: Lattice has THREE authoring vocabularies, not one, and only the smallest is enumerable. 22 Marpit directives have a registry; ~14 deck registers have 17 resolver kernels but no registry; 5 body-comment annotations have neither. Nothing gates any of them, so an unregistered key is indistinguishable from a typo in both directions — a misspelled directive silently does nothing, and a real feature silently works with no authority that says it exists. This audits every key against how it is produced, why, what consumes it, and in what context, and proposes one registry with a gate.
---

# The authoring vocabulary: three registers, one of them homeless

## Why this exists

The question that started it: *"we can't have people adding front matter for convenience or
shortcut in an unofficial way. Front matter should be official and load-bearing … as core engine
function."*

Agreed, and the standing rule from that conversation is: **anything the Studio produces is official
by definition** — but it must be validated: how it is produced, why, how it is used, in what
context. This is that validation.

The first cut of this audit got the framing wrong and said there were "15 unofficial front-matter
keys" — as if they were stray. They are not. Most of them are a **named, kernel-backed family**
with 17 dedicated resolvers and a bake-into-the-document mechanism. The real defect is narrower and
more actionable: **there is no single place that enumerates the vocabulary, and no gate that checks
against it.**

## The finding: three vocabularies

| # | vocabulary | surface | count | registry | mechanism | gated |
|---|---|---|---|---|---|---|
| 1 | **Marpit directives** | front matter + `<!-- key: -->` | 22 | `lib/engine/directives.js` `KNOWN_DIRECTIVES` | applied to `<section>` as `data-<kebab>` + `--<kebab>` | **no** |
| 2 | **Deck registers** | front matter only | ~14 | **none** — 17 `lib/core/resolve-*` kernels, discoverable only by `ls` | resolved into class tokens; baked into the document by `lib/core/deck-front-matter.js` for the runtime | **no** |
| 3 | **Body annotations** | `<!-- key: -->` only | 5 | **none** | consumed post-render by `lib/authoring/notes-core.js` / `lib/exemplars/tier-filter.js` | **no** |

Vocabulary 2 is invisible to vocabulary 1's parser. `parseFrontMatter` accepts **any**
`key: value` line into its directive map; `KNOWN_DIRECTIVES` filters only what gets applied as a
section attribute. So `spectrum:` is not a "directive" by the engine's own definition, yet:

```
render('---\ntheme: indaco\nspectrum: off\nstamp: dot\n---\n\n# T')
  base       →  <section id="1" class="content form">
  with keys  →  <section id="1" class="stamp-dot spectrum-off content form">
```

It is unambiguously load-bearing. It just has no registry entry anywhere.

## Vocabulary 1 — Marpit directives (22, registered)

`theme` `paginate` `header` `footer` `class` `color` `backgroundColor` `backgroundImage`
`backgroundPosition` `backgroundRepeat` `backgroundSize` `size` `style` `lang` `marp` `logo`
`focus` `focusStyle` `focusSteps` `build` `debug` `lens`

Sub-sets: `GLOBAL_ONLY` (4) — front-matter-only by nature. `APPLIED_DIRECTIVES` (16) — reach the
section. `FLAG_DIRECTIVES` (3) — may be written bare with no colon.

**This tier is healthy.** It has an explicit closed set, an enumerated rationale per entry, and the
parser leaves an unrecognized `<!-- foo: bar -->` as an inert comment rather than guessing. The one
gap is that nothing *lints* a misspelling: `<!-- pagniate: true -->` silently does nothing.

## Vocabulary 2 — Deck registers (kernel-backed, unregistered)

Named as a family in `lib/core/deck-front-matter.js:7`: *"the deck-wide registers: `color-mode:`,
`class:`, `logo:`, `meta:`, and the finish / mode / claim / stamp / tone / spectrum / rule /
eyebrow / headline / lift family."* Each has a resolver in `lib/core/`:

| register | what it controls | resolver |
|---|---|---|
| `color-mode:` | light/dark authoring — "the FIRST-CLASS way" | `resolve-color-mode.js` |
| `finish:` | the deck's backdrop | `resolve-finish.js` |
| `mode:` | the deck's rendering mode | `resolve-mode.js` |
| `spectrum:` (+ `-edge`, `-card`, `-card-edge`) | the accent gradient ribbon | `resolve-spectrum.js` |
| `stamp:` | deck-wide stamp style | `resolve-stamp.js` |
| `tone:` | deck-wide tone style (the marker SHAPE) | `resolve-tone-style.js` |
| `claim:` | how much of the frame the claim takes | `resolve-claim.js` |
| `rule:` | the heading underline | `resolve-rule.js` |
| `eyebrow:` | the eyebrow decoration | `resolve-eyebrow.js` |
| `headline:` | headline alignment | `resolve-headline.js` |
| `lift:` | "Struck" card elevation | `resolve-lift.js` |
| `split:` | how the body divides into slides | `resolve-split.js` |
| `captions:` | narration reference data | `resolve-captions.mjs` |
| `palette` / `component` / `token-expr` / `overflow-marker` | (not front-matter registers — resolvers for other precedence chains) | — |

**Why this tier exists at all** (`deck-front-matter.js` header, and it is a good reason): Marp
strips front matter cleanly, so a previewer rendering the deck without Lattice's plugins cannot see
these. The runtime used to recover them by `fetch`ing the source `.md` beside the rendered document
— which **never works on `file://`** (measured: 0 sections carried the deck's color mode when
double-clicking the exported HTML, the exact surface the export's README tells recipients to use).
The fix bakes the raw front matter into the document as an inert data block. So the registers are
not a shortcut; they are a deliberate, cross-path contract.

**What is missing** is only the registry. `ls lib/core/resolve-*` is the current enumeration.

## Vocabulary 3 — Body annotations (no home at all)

| annotation | corpus | what it is | consumer | status |
|---|---|---|---|---|
| `<!-- describe: … -->` | 5 | accessible description — what the slide SHOWS | `notes-core.js` `DESCRIBE_MATCHER` → PPTX alt text | structured, unregistered |
| `<!-- caption: … -->` | 4 | the slide's read-as line | `notes-core.js` `CAPTION_MATCHER` → read-along / WebVTT | structured, unregistered |
| `<!-- tier: … -->` | 553 | minimum tier at which the slide appears | `lib/exemplars/tier-filter.js` | structured, unregistered, **and leaks** (below) |
| `<!-- note: … -->` | 11 | presenter talk track | — **no handler** | pure convention |
| `<!-- Speaker: … -->` | 3 | same | — **no handler** | pure convention |

`note:` and `Speaker:` are **not keys**. Any comment that is not a tooling pragma becomes a speaker
note, prefix and all:

```
notesFromHtml → "note: say this out loud\n\ntier: full\n\nSpeaker: hello"
```

## Validation table — how produced, why, how used, in what context

Everything the Studio writes into deck source. Per the standing rule, all of it is official; this
is the record of what each one is for.

| written | produced by (Studio) | affordance | why | consumed by | context |
|---|---|---|---|---|---|
| `<!-- _class: … -->` | `slide-directives.ts:setClass` | component picker / library | names the slide's layout | engine `resolve-component.js` | every render path |
| `<!-- caption: … -->` | `slide-caption.ts:39 setCaption` (emits at `:51`) | Slide Context → caption field | the slide's read-as line, top of the narration chain | `notes-core` → `share-export.ts` read-along, WebVTT export | export + Present |
| `<!-- describe: … -->` | `slide-descriptions.ts:33 setDescription` (emits at `:43`) | Slide Context → description field | accessibility: what the slide shows, for someone who can't see it | `notes-core` → PPTX alt text | export |
| `spectrum:` (+ per-slide token) | `SlideContext.tsx:314` | Brand bar picker | deck accent gradient, with per-slide override | `resolve-spectrum.js` | render + runtime |
| `stamp:` / `tone:` | `SlideContext.tsx:444` | marker SHAPE pickers | deck-wide marker shape, per-slide override | `resolve-stamp.js`, `resolve-tone-style.js` | render + runtime |
| `finish:` | `SlideContext.tsx:312`, `finish-generate.ts` | finish picker / generator | deck backdrop | `resolve-finish.js` | render + runtime |
| `mode:` / `motion:` | `PrintOptionsPanel.tsx` | print options | rendering mode, motion policy | `resolve-mode.js`, player | export |
| `size:` | `slide-size.ts`, `finish-generate.ts` | Deck Setup | slide geometry | engine (official directive) | render + export |
| `captions:` | `share-export.ts` | read-along export | front-matter caption block, keyed by authored slide number | `resolve-captions.mjs` | export |
| `acronyms:` | `AcronymEditor.tsx` | acronym editor | glossary expansion source | `glossary-auto.mjs` | render |
| `tone:` | `present/rehearsal.js` | rehearsal | — | `resolve-tone-style.js` | Present |
| `meta:` / `color-mode:` / `logo:` | `ShareSheet.tsx`, `WebpageOptionsPanel.tsx`, `StudioShell.tsx` | share / webpage options | deck metadata, light-dark, brand mark | `deck-front-matter.js` bake → runtime | export + share |

**The Architect / Coach produces none of them.** `architect-knowledge.js` teaches only
`<!-- _class: NAME -->`. So AI-generated decks cannot carry a description, a caption, or any
register — a real capability gap, not just a vocabulary one.

## Defects this audit found

1. **`tier:` leaks into presenter notes.** `notes-core`'s tooling-comment allowlist covers prettier,
   markdownlint and remark-lint only, so every `tier:` marker falls through to the note channel.
   Verified on `exemplars/academic/research-findings.md`: the presenter-notes field is
   `"tier: short\n\ntier: short\n\ntier: standard\n…"`. 553 markers across the corpus, and
   `lib/export/pptx-export.js` defers to `notes-core` for the boundary, so this ships.
   **One-line fix:** add `/^tier\s*:/i` to `MAGIC_COMMENT_MATCHERS`.
2. **Two shipping Studio files misdescribe their own contract.** `slide-caption.ts:8` and
   `slide-descriptions.ts:7` both say *"the engine consumes"* — `lib/engine/` has **zero**
   references to either. `notes-core`, a post-render layer, consumes them.
3. **The preview's route probe has no vocabulary to consult**, so it treats any `<!-- word: -->` as
   a running global and sends 53 of 175 decks through a whole-deck re-parse on every keystroke
   (#1333). This is a direct, measured cost of the missing registry.
4. **`note:` / `Speaker:` are undocumented convention** that produces a visibly wrong artifact — the
   prefix ends up inside the exported note text.
5. **No lint, either direction.** A misspelled directive silently does nothing; an unregistered
   register silently works. Both are indistinguishable from correct authoring.

## Proposal

**One registry, three tiers, one gate.** The point is not to move everything into
`KNOWN_DIRECTIVES` — the three vocabularies apply by genuinely different mechanisms and merging them
would break the section-attribute contract. The point is that all three become **enumerable from one
place**, and every entry names its consumer.

1. **Declare the vocabulary** in `lib/engine/directives.js` (or a sibling it re-exports), adding two
   sets beside the existing three: `DECK_REGISTERS` (vocabulary 2, each naming its `resolve-*`
   kernel) and `ANNOTATIONS` (vocabulary 3, each naming its post-render consumer and its scope).
   Scope is the field the route probe needs, so #1333 becomes a lookup rather than a regex.
2. **Register the body annotations properly**: `describe`, `caption`, `tier` get entries; `note` and
   `Speaker` collapse into one real key with the prefix stripped from the note body.
3. **Gate it** — `checkAuthoringVocabulary` in `tools/check-ownership.js`, via `build:check`, in the
   shape of the existing `SANCTIONED_*` gates: every `key:` in front matter or a `<!-- key: -->`
   across `examples/`, `exemplars/`, `lib/components/**` must be registered, **and** every
   registered key must have a live consumer — so the registry cannot rot in either direction.
4. **Lint it** in `lib/authoring/lint-core.js` (HARD RULE #7 — one place), so an author writing
   `pagniate:` is told rather than ignored.
5. **Teach the Architect** the registered annotations, so generated decks can carry alt text and
   captions.

### Open questions for the human

- **Migration of `note:` / `Speaker:`** — collapsing them into one key changes what 14 existing
  slides export. Rewrite the decks, or accept both spellings permanently?
- **`meta:`, `form:`, `player:`, `present:`, `mode:`, `lexicon:`, `glossary:`** appear in front
  matter across the corpus but have no `resolve-*` kernel. Each needs its consumer traced
  individually before it is registered or pruned — deleting one silently breaks a deck, so this is
  not a bulk decision.
- **Scope**: registry + gate + lint is one PR; the Architect work is a second. Confirm the split.
