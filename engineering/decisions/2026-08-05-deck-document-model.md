---
status: proposed
summary: >
  Six surfaces each hand-wrote their own reader for a deck's front matter and slide
  directives — four key-charset regexes, 1,019 lines of standalone parsing in the two
  largest, and a recurring defect family (#1326, #1329, #1340, #1358, #1374, #1402) whose
  single shape is "two readers, one question, opposite answers". HARD RULE #1 did not stop
  it because it governs RENDER PATHS and TRANSFORMS, and a linter, an autocomplete, a
  front-matter writer and a preview router are none of those. This proposes the engine own
  TWO objects, not one, and the split is load-bearing. (1) The VOCABULARY — a declared JSON
  file plus a JSON Schema, listing every front-matter key and comment directive with its
  type, legal values, consuming kernel, precedence and exclusivity group. Mechanism copies
  lib/components/manifest.schema.json exactly: standard JSON Schema as the declaration, a
  hand-written checker that DERIVES its vocabulary from the schema, and fixture-pinned tests
  so a schema edit can never read as "just docs". (2) The DECK INDEX — a per-deck projection
  emitted by the engine (counts, front matter, and a slides[] carrying a stable id, page number,
  class tokens, component, title and source span), never edited in place but NOT "the un-authored
  half": slide metadata IS authored — a human types `<!-- _class: … -->` / describe / tier with
  autocomplete assisting, and the Studio Inspector writes the same directives — so every field
  carries a PROVENANCE (authored / resolved / computed), and authored vs resolved class tokens stay
  separate rather than collapsed. Provenance is load-bearing, not decorative: #1416 names its
  absence as the root of four regressions ("subtraction needs to know whether a token came from the
  deck or from the slide"). The index is still the valuable half, because the COMPUTED part is what
  the surfaces demonstrably cannot derive: positionIsTrustworthy
  exists solely to REFUSE the question (126 of 128 corpus decks refused before one fix), and
  the Studio re-parses the whole deck to learn one slide's page number at a measured 4x cost.
  CRUD splits along that seam: reads come from the index, writes go to the SOURCE through a
  spliced writer the vocabulary validates. Writing markdown back out of a parsed object is
  explicitly barred — that is what #1256 deleted setFrontMatter for. Nothing lands here; this
  is the model for a human pick.
companion:
  - ./2026-08-03-authoring-vocabulary-audit.md
  - ./2026-07-29-front-matter-lossless-writers.md
  - ./2026-08-02-slide-class-taxonomy.md
  - ./2026-06-13-lfm-standard.md
---

# The deck document model — one engine-owned object the surfaces read

**Date:** 2026-08-05 · **Status:** proposed · **Decision owner:** Sharmarke
**Area:** engine / authoring vocabulary / docs-site Studio + playground / export

## The ask

> "what i am concerned about is different surfaces having their own kernels/engine
> for this stuff. it makes it harder to edit and maintain and drift becomes a real
> problem."
>
> "my hope is there is a single shared object between the surfaces in json object
> with schema. this way we have a true spec for all the surfaces to perform CRUD
> operation on that is owned by the engine. this object can then become what the
> manifest uses."
>
> "the object should hold front matter, additional deck metadata like page count,
> slide metadata … think about what is of value across the surfaces that use it and
> how it would and could be used in the future."

---

## 1 — Symptom

A deck is a markdown file with a settings block and per-slide comment directives:

```markdown
---
theme: indaco
color-mode: dark
---

<!-- _class: kpi -->
```

**Six surfaces read those settings, and each hand-wrote its own reader.** Measured
on the tree at `c502f9b`:

| Surface | File | Lines | Reads a shared kernel? | Drift gate |
|---|---|---:|---|---|
| Engine | `lib/engine/directives.js` | — | **is** the kernel | — |
| Studio front matter | `docs/src/components/studio/front-matter.ts` | 418 | **no imports at all** | **none** |
| Playground config | `docs/src/playground/deck-config.js` | 601 | only `deck-sizes.js` | **none** |
| Studio directives | `docs/src/components/studio/slide-directives.ts` | 252 | none at runtime | parity test |
| Editor autocomplete | `docs/src/components/studio/editor-complete.ts` | 170 | `PACE_NAMES` only | none |
| Linter | `lib/authoring/lint-core.js` | — | must stay a dependency-free leaf | — |

**1,019 lines of standalone front-matter parsing with no shared kernel and no gate**
(`front-matter.ts` + `deck-config.js`). The disagreement is visible in the key
charset alone — three different answers to "what is a legal key name":

```
lib/engine/directives.js:113            /^([A-Za-z_][\w]*)\s*:\s*(.*)$/       ← no hyphens
docs/src/playground/deck-config.js:187  /^([A-Za-z_][\w-]*)\s*:\s*(.*)$/
docs/src/components/studio/front-matter.ts:76  /^([A-Za-z][\w-]*)\s*:\s*(.*)$/
```

The engine's own reader is the narrowest. `\w` excludes `-`, so `color-mode:`,
`spectrum-*` and `motion-*` **never enter the directive map** — they work only
because each kernel separately re-reads the raw text (#1339).

### The defect family this produces

One shape, six landed instances: *two readers, one question, opposite answers.*

- **#1358** — `data-class="<raw payload>"` precedes `class="<resolved list>"`, and an
  unguarded `/class="([^"]*)"/` matches leftmost. Two transforms shipped reading the
  directive payload instead of the resolved list.
- **#1374** (`c502f9b`) — `slide-class-spans.js` reconstructs each slide's class from
  raw source for Mermaid pre-render. Three drifts proven live: a global
  `<!-- class: X -->` invisible, a directive quoted as prose counted, a `$$…$$`
  equation inventing a slide.
- **#1402 / #1416** — `color-mode:` vs legacy `class:`; 40 of 168 permutations wrong.
  The first fix was pulled after the trio found four regressions.
- **#1326, #1329, #1340** — earlier instances, named as such in #1416.

### Why no rule caught it

**HARD RULE #1 reads: "*Render paths* share one source of truth… land *transforms*
in the shared kernel."**

A linter is not a render path. Neither is an autocomplete, a front-matter writer, or
a preview router. None is a transform. **The rule that should have prevented this does
not textually cover any of the four surfaces that drifted** — so each was written
standalone by an author who was, strictly, in compliance.

That is the root cause. Not carelessness: a gap in the rule, and no home in `lib/` for
a *source-side reader*.

### What is NOT broken

`lib/` is genuinely consolidated — **75 kernels in `lib/core/`**, and they are shared:
`comment-directive.js` alone has 12 call sites across `lib/engine/slides.js`,
`lib/runtime/index.js`, `plugins.js`, `boundary-parser.js`, `slide-class-spans.js`
and more. The drift is concentrated at exactly one seam: **source-side readers on the
docs site** — code that must answer a question *before* the engine has run, when
there is no `<section>` to inspect.

And the "we cannot share it, it is a browser bundle" defense does not hold. The docs
site already imports engine code at runtime in ~15 places (`lib/core/present-transport.mjs`,
`glossary-auto.mjs`, `resolve-pace.mjs`, `resolve-captions.mjs`, `lib/engine/math-detect.mjs`,
`lib/diagnostics/slice-equivalence-core.mjs`), and `slide-directives.test.ts` already
does `require('../../../../lib/engine/directives.js')`. The path is open in both
directions and already used. **The mirrors that drifted are mirrors by habit, not by
constraint.**

Note which one held: the parity-gated mirror. The ungated ones are the ones producing
issues — `editor-complete.ts`'s `FRONT_MATTER_KEYS` is stale *and user-visible*, offering
`ai-lang` / `finish-override` / `present` while omitting `color-mode`, every `spectrum*`,
`stamp`, `tone`, `rule`, `eyebrow`, `headline`, `captions` and `motion*`.

---

## 2 — The finding: this is two objects, not one

The ask names one object. The repo needs two, and conflating them is how this design
fails.

| | **The vocabulary** | **The deck index** |
|---|---|---|
| What it is | The rules: which keys exist, what they mean | One deck's facts, field by field |
| Authored or derived? | **Authored**, ships with the engine | **Projected** — carries authored *and* computed fields |
| Same for every deck? | Yes | No |
| Opened and edited directly? | Yes, in a reviewed diff | **Never** — it is not a file anyone opens |
| How its contents change | a reviewed PR | by editing the **source** (§5) |
| Lifetime | A release | A render |
| Analogue in tree | `lib/components/manifest.schema.json` | *(does not exist)* |

> **The index is not "the un-authored half."** Much of what it carries *is* authored —
> a slide's `_class`, its `describe`, its `tier` are all typed by a human (or written by
> the Studio Inspector on their behalf, with autocomplete assisting). What is never
> authored is **the index artifact itself**: you change a slide's component by editing
> the comment in the source, never by editing the index. See §4.1 — the distinction is
> per FIELD, and getting it wrong is what #1416 is about.

They answer different questions. "Is `color-mode` a real key, and does it outrank
`class`?" is the vocabulary. "What page is this slide on, and what component does it
carry?" is the index. Today **both** are re-derived privately by every surface, which
is why one concern reads as one object.

---

## 3 — Object 1: the vocabulary

### Mechanism — copy the component precedent exactly

`lib/components/manifest.schema.json` is standard JSON Schema draft 2020-12 (`$id`,
enums, `pattern`, `additionalProperties: false`), and 61 component manifests carry
`"$schema": "../../manifest.schema.json"`.

**There is no JSON Schema validator installed** — no `ajv`, no `jsonschema`, in either
`package.json`. The `$schema` reference buys editor autocomplete and nothing more.
Validation is a hand-written `validate()` in `lib/components/index.js`, and what keeps
it honest is that the code **derives its vocabulary from the schema file**:

```js
assert.deepEqual([...components.FUNCTIONS], schema.properties.function.enum);
```

`test/unit/components/schema-source-of-truth.test.js` calls the schema "the manifest
contract's SOURCE OF TRUTH" and gates three things: derived vocabularies equal the
schema's enums; every schema-required field is enforced by `validate()`; `validate()`
enforces `additionalProperties: false`. Plus **fixture pins** — literal copies of
load-bearing schema content, so widening or deleting a rule must change a fixture in
the same reviewed diff, and "a schema change can never again read as *just docs*."

**That is the pattern to extend.** Standard JSON Schema as the declaration; derived
code as the enforcement; tests as the anti-drift gate. No bespoke constraint language.

This also answers #1339's "a declared registry will rot" objection directly:
`manifest.schema.json` is *declared*, not derived, and does not rot — because the
artifacts it governs are gated against it.

### Shape

```jsonc
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "$id": "https://lattice.slidewright.dev/vocabulary.schema.json",
  "version": 1,
  "keys": {
    "color-mode": {
      "channel": "front-matter",        // front-matter | slide-comment | both
      "type": "enum",
      "values": ["light", "dark", "system", "inherited", "print"],
      "kernel": "lib/core/resolve-color-mode.js",   // a STRING, never an import
      "outranks": ["class:color-axis"],  // the #1402 precedence rule, declared
      "scope": "deck",
      "degrades": "L0-clean",
      "since": "LFM 1.0"
    },
    "_class": {
      "channel": "slide-comment",
      "type": "token-bag",
      "vocabulary": "dist/docs/grammar.json#/components",
      "scope": "slide",
      "global-form": "class"             // the running-global spelling
    }
  },
  "exclusiveGroups": {
    "color-axis": ["dark", "light", "print"],
    "tone": ["…"]
  }
}
```

### What JSON Schema can and cannot carry

JSON Schema checks **shape**. Some of what this object must say is **relationship**:

- `color-mode:` outranks `class:` on the color axis (#1402)
- these variant tokens are mutually exclusive — today **179 variant tokens across 61
  components are registered as exclusive nowhere** (`2026-08-02-slide-class-taxonomy.md`),
  which is why Reshape stacks classes (#1281) and autocomplete offers everything (#1284)
- this key is consumed by `resolve-color-mode.js`

JSON Schema expresses the first awkwardly (`dependentSchemas`/`oneOf`) and the other
two not at all. **They become ordinary declared fields in the object** — exactly as
`manifest.schema.json` already carries `slots`, `variants` and `adapt.mode` as data —
checked by a derived checker. The object stays a state object with a schema; it does
not become a language.

### Two constraints the shape must respect

- **Kernels are named as strings.** `lib/engine/directives.js` is inlined verbatim into
  `docs/public/playground/lattice-playground.js`. Importing the kernels would newly drag
  `resolve-captions.mjs`, `notes-core.js` and `tier-filter.js` (~36 KB raw) into the
  browser bundle (#1339). **JSON satisfies this for free where a JS module would not** —
  a point in favor of the ask's chosen format.
- **`lint-core.js` stays a dependency-free leaf.** Vite dev serves it directly, so it
  cannot `require` a module. It can read a JSON object, or stay a **sync-gated mirror**
  the way `focus.js` and `carousel.js` already do.

---

## 4 — Object 2: the deck index

The engine is the only thing in the system that genuinely parses a deck. Every other
surface *guesses from raw text*. The index is the engine handing over what it already
knows.

```jsonc
{
  "format": "lattice-index",
  "version": 1,
  "counts": { "slides": 24, "pages": 26 },   // pages ≠ slides: focusSteps expands
  "frontMatter": {
    "raw":      { "theme": "indaco", "color-mode": "dark" },   // as authored
    "resolved": { "theme": "indaco", "colorMode": "dark" }     // after precedence
  },
  "slides": [
    {
      "id": "s_ab12",              // computed · STABLE across reorder, not an ordinal
      "ordinal": 3,                // computed
      "page": 4,                   // computed · differs from ordinal when focusSteps expands
      "classTokens": {
        "authored": ["kpi"],       // AUTHORED — what the slide's own comment says
        "resolved": ["kpi", "form"] // resolved — after the deck-wide merge + engine rules
      },
      "component": "kpi",          // resolved
      "describe": "Revenue by …",  // AUTHORED — a body annotation (#1339 vocabulary 3)
      "tier": "short",             // AUTHORED
      "title": "Q3 revenue",       // computed — read off the slide's heading
      "sourceSpan": { "start": 1204, "end": 1876 },  // computed
      "hasNotes": true             // computed
    }
  ]
}
```

**Three properties are non-negotiable:**

1. **Never edited in place.** No human opens the index and types; no surface writes to
   it. Its *contents* are a different matter — see §4.1 — but every change to them
   enters through the source.
2. **Regenerable.** Rebuilding it from source reproduces it byte-for-byte. That is a
   property test, not a comment.
3. **Not the write target.** See §5.

### 4.1 — Authored slide metadata is first-class, and provenance is per field

Slide metadata **is authored.** A human types `<!-- _class: split-compare -->`,
`<!-- describe: … -->`, `<!-- tier: short -->` directly into the deck, with the
editor's autocomplete assisting; the Studio Inspector writes the same directives on
the author's behalf. That is the normal path, not an edge case — so the index is not
"the derived object" in contrast to "the authored object". Both objects carry authored
material; they differ in **who may change it and how**.

What that means concretely:

- **Every field carries a provenance:** `authored` (a directive a human wrote),
  `resolved` (authored plus the engine's precedence and merge rules), or `computed`
  (the engine alone — ordinals, pages, spans, ids).
- **Slide-comment directives are full vocabulary entries**, not an afterthought. §3's
  `channel` field already admits `slide-comment`, and it is what makes autocomplete
  correct: today `editor-complete.ts` offers a stale hand-list, and #1339's *third*
  vocabulary — the body annotations `describe`, `caption`, `tier`, `note`, `Speaker` —
  has **no registry at all**. Those are exactly the authored slide metadata this
  paragraph is about.
- **`authored` and `resolved` are kept as separate fields**, never collapsed. Collapsing
  them is the #1358 defect in a different costume: a transform that reads the directive
  payload where it meant the resolved list, or the reverse.

**Provenance is not a nicety — its absence caused four regressions.** #1416's postmortem
states the root directly: *"Subtraction needs to know whether a token came from the deck
or from the slide — and only one of the three code paths can know that."* The attempt
recorded provenance for spot keys only, which is why a mid-deck global directive was
silently deleted (R4) and why the runtime stripped a slide's own component (R1). An index
that publishes provenance per field makes that question answerable by every surface
instead of by one.

### Why the index is the valuable half

The surfaces do not merely duplicate this work — **they cannot do it correctly, and
the code says so.**

**`positionIsTrustworthy` (`lib/diagnostics/slice-equivalence-core.mjs:204`) is a
function whose entire job is to REFUSE the question.** It bails when it finds:

- a `_focusSteps` slide (one slide becomes N; "the count is not derivable here at all")
- an `hr` form markdown-it recognizes and the caller's splitter does not (`***`, `___`,
  `- - -`, `---` with a trailing space) — "either side miscounts; bail"
- a `---` **inside an HTML comment**, where a naive lazy pattern spanned an intervening
  `-->`. Measured before the fix: **126 of 128 corpus decks refused**, i.e. the whole
  optimization silently switched off while every test stayed green
- a **setext heading** — `Text` over `---` is an h2 to markdown-it and a slide separator
  to the caller, "so the two disagree about the same three characters"

Its own comment names the stakes: refusing exists to prevent "the **plausible lie**" —
the preview painting "3" on the slide the deck numbers 4.

**And where a surface refuses to guess, it pays instead.** `single-slide-render.ts`
carries a module-level memo whose comment explains that "the deck-context render
re-parses the WHOLE deck to learn one slide's true page number." Measured on the real
built Studio at 4× CPU on a 40-slide deck: a rail click cost **52.1 ms p50 / 43.8 ms
render, against 12.8 ms / 6.8 ms on `main` — a 4× regression** that crossed the frame
scheduler's 50 ms heavy threshold so every navigation coalesced instead of painting.
The overview grid was worse: "every visible tile renders the SAME deck document… so N
tiles paid N identical parses for one modal."

A deck index makes both disappear. Page number becomes a lookup. `positionIsTrustworthy`
becomes unnecessary rather than merely correct — you cannot lie about a number you were
handed.

### What each surface gets

| Surface | Needs from the vocabulary | Needs from the index |
|---|---|---|
| Studio editor / autocomplete | the real key set, legal values, exclusivity | — |
| Studio Inspector / drawers | which keys are writable, their types | this deck's resolved values |
| Studio rail + overview grid | — | slide list, titles, page numbers *(kills the 4× reparse)* |
| Playground `deck-config` | keys + defaults *(replaces its private 16)* | counts |
| Preview router | — | per-slide class + position *(replaces the over-matching probe, #1333)* |
| Linter | key set + legal values, for real key-level diagnostics | slide spans for accurate ranges |
| Mermaid pre-render | the two `class` spellings | per-slide class *(replaces `slide-class-spans.js`, #1374)* |
| Export (PDF/PPTX/player) | key set, for the lowering | counts, notes, stable ids |
| Export-to-Marp | which keys are LFM-only and how each lowers | baked splits |
| Docs portal / `grammar.json` | the whole vocabulary, published | — |
| AI / Architect | the vocabulary, to generate valid decks | — |

### The manifest connection the ask names

`lib/core/lattice-doc.js` is already "the Lattice document manifest envelope — the
SINGLE source-of-truth container that both the self-contained `.html` player and the
`.lattice` project zip encode." Its stated one rule: **"carry the deck SOURCE verbatim,
never scrape the render,"** with lossless round-trip by construction.

The index slots in as one of the envelope's optional **projections**, beside `config`,
`theme` and `assets` — carried for speed and inspection, always regenerable from
`source`. The envelope's existing caveat already covers it exactly: projections are a
"viewing-projection caveat, not a data-loss bug," because editing re-parses `source`.

---

## 5 — The CRUD contract

The ask is for surfaces to "perform CRUD operations" on a shared object. The split:

| Operation | Target | Mechanism |
|---|---|---|
| **Read** | the index | a lookup — no parse |
| **Create / Update / Delete** | **the source markdown** | a line splice, validated against the vocabulary |

An engine-owned API gives real CRUD *semantics* with lossless *mechanics*:

```js
setDirective(source, 'color-mode', 'dark') → source'   // splices one line
```

### Why writes may never go through a parsed object

This is the one thing in the design that is not a preference.

`2026-07-29-front-matter-lossless-writers.md` (shipped) records what happened when a
control rebuilt the front-matter block from a parsed model. On a deck like:

```markdown
---
theme: indaco
# reminder: don't switch this before the board review
style: |
  section { --accent: red; }
tags: [alpha, beta]
---
```

setting a Header **erased the YAML comment, dropped `_class:`, reduced `style: |` to
the literal string `"|"` (deleting its CSS body), stringified the flow sequence,
reordered the survivors, and converted CRLF to LF** — and on a deck whose leading `---`
is a slide separator, deleted the swallowed slide outright.

All 27 flat-scalar call sites moved to `writeFrontMatterLine`, and **`setFrontMatter`
was DELETED rather than deprecated** — because "a destructive writer that stays exported
is one autocomplete away from returning and its failure is silent." The worst call site
was the export path: "the drawer damages your own copy, where Undo is a click away,
while the export shipped a corrupted `.md` to someone else with nothing to surface it."

A plain JSON object has nowhere to put a YAML comment or a block scalar. **Making the
index the write target re-creates that defect by construction.** If a true document
*model* is ever wanted as the write target, it needs a lossless CST — a much larger
piece of work, and a separate decision.

**Finding:** the lossless writer lives at
`docs/src/components/studio/front-matter.ts:216` — **docs-side, not engine-side.** If
the engine owns CRUD, `writeFrontMatterLine` moves to `lib/core/` and the Studio imports
it. That move is small and is the natural first slice.

---

## 6 — What this unlocks later

The ask is explicit that future use matters. Ranked by what each de-risks:

1. **Stable slide ids.** `2026-07-04-comments-layer.md` specifies comments anchored to
   "a STABLE per-slide id, NOT an ordinal," and warns a comment "moves to the wrong slide
   the moment a slide moves" — but the shipped feature is "anchored by slide **index**."
   The index's `id` closes that gap, and is the same primitive the Yjs collaboration
   layer needs (`2026-06-14-yjs-collaboration-exploration.md`).
2. **The incremental render cache, step 2.** `2026-07-15-incremental-per-slide-render-cache.md`
   deferred the engine-side transform cache (~26 ms residual) as "a large blast-radius
   change". A per-slide `sourceSpan` + stable id is precisely the dirty-check key that
   change needs, and `render-ids.js` already made renders deterministic so the guard can
   be a plain byte comparison.
3. **Key-level lint that actually knows the vocabulary** — a misspelled `pagniate:` is
   told, not ignored (#1339 item 4).
4. **AI-generated decks validated before they reach the engine**, against the same object
   the Architect was taught from.
5. **Deck diffing / change detection** — comparing two indexes is cheaper and more
   meaningful than diffing markdown.
6. **`export-to-Marp` lowering driven by data** rather than the five hand-written rewrite
   steps that "just do not cover directives yet" (`2026-08-02-marp-reference-register.md`).

---

## 7 — Non-goals

- **Not a lossless CST.** The source stays the truth; the index is a projection.
- **Does not close the comment channel.** Marpit's contract — reproduced at
  `directives.js:27-30` — is that an unknown comment stays a comment, which is what makes
  `<!-- remember to pause here -->` usable. The vocabulary *classifies* what it knows;
  anything unrecognized stays an ordinary comment rather than silently becoming a speaker
  note (#1350). Closing it is a breaking engine change and a separate decision.
- **Not a fifth enumeration.** See the first risk below.
- **Does not replace `grammar.json`.** It fills the hole in it: `grammar.json` today
  describes the `_class` directive as the bare string
  `"<!-- _class: <name> [modifier …] -->"` with no key vocabulary behind it.

---

## 8 — How this fails

| Risk | Mitigation |
|---|---|
| **It becomes a fifth thing to be wrong.** #1339's adversarial pass found four enumerations already exist and disagree; a fifth declaration makes it worse. | The rival readers are **deleted in the same PR that adds the object** — not left as fallbacks. If they cannot all be deleted, the slice is wrong. Gate it the way `schema-source-of-truth.test.js` gates the manifest. |
| **The index goes stale** and a surface paints a plausible lie. | Derived per render, never stored as truth; a property test asserts rebuild-from-source is byte-identical. The `.lattice` envelope already frames projections this way. |
| **Bundle weight** on the playground. | JSON, not modules; kernels named as strings (#1339's ~36 KB constraint). |
| **`lint-core` purity** breaks. | It reads JSON or stays a sync-gated mirror, exactly like `focus.js` and `carousel.js` today. |
| **Corpus coverage ≠ vocabulary coverage.** `logo-style:`, `ai-lang:`, `finish-override:`, `validate:`, `math:`, `title:` are real, have consumers, and appear in **no** committed deck (#1339). | The vocabulary is declared and gated against **consumers**, not against the corpus — every entry names a live kernel, and a dead entry fails the gate. |
| **Scope sprawl** — this touches engine, Studio, playground, linter and export. | Three slices (§9), each independently shippable, each deleting more than it adds. |

---

## 9 — Migration

**Slice 1 — the vocabulary, and one reader.** Add the object + schema + derived checker
+ fixture-pinned test. Make `frontMatterValue` (`lib/core/front-matter-key.js`) the one
key reader — it is already linear-time and already shared. Delete the three rival
charsets. Move `writeFrontMatterLine` to `lib/core/`. Point `editor-complete.ts`'s
`FRONT_MATTER_KEYS` and `deck-config.js`'s `FIELD_DEFAULTS` at it. *Closes #1339's four
open questions; fixes the user-visible stale autocomplete.*

**Slice 2 — the deck index.** Emit it from the engine. Consume it in the preview router,
the rail and the overview grid; retire the whole-deck memo and `positionIsTrustworthy`'s
refusal path. Replace `slide-class-spans.js`'s reconstruction. *Removes the 4× navigation
cost and the #1374 drift surface.*

**Slice 3 — the manifest projection.** Carry the index in the `lattice-doc` envelope;
mint stable slide ids; re-anchor comments off ordinals.

**Also required, in slice 1:** extend HARD RULE #1 to cover **source-side readers**, not
only render paths and transforms. Without that, the next linter/autocomplete/probe is
written standalone in full compliance, and this recurs.

---

## 10 — Open questions

1. **Where does the vocabulary live?** `lib/core/vocabulary.json` + `vocabulary.schema.json`,
   or folded into `spec/` beside `LFM-1.0.md`? The spec is prose and CC-BY licensed; the
   object is machine data. Leaning `lib/core/`, projected into `spec/` and `grammar.json`
   by the existing generators.
2. **Does `parseFrontMatter` learn `-`, or does `frontMatterValue` become canonical?**
   #1339 frames this as "which of the four becomes canonical" and notes `frontMatterValue`
   is the existing shared answer. Slice 1 must pick one.
3. **Slide id derivation.** Content hash (stable across reorder, changes on edit) versus a
   minted id persisted into the source (stable across edit, but writes to the author's
   file). Comments and collaboration want the second; the "never write the source" instinct
   wants the first.
4. **`note:` / `Speaker:`** — collapsing to one key changes what 14 existing slides export.
   Rewrite the decks, or accept both spellings permanently? (Carried from #1339.)
5. **`player:` and `present:`** appear in front matter with no traced consumer. Both have
   dedicated example decks, suggesting regression rather than fiction. Trace before the
   vocabulary either registers or prunes them.
