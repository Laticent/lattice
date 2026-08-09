---
status: proposed
summary: >
  Six surfaces each hand-wrote their own reader for a deck's front matter and slide
  directives — three line-level key-charset regexes (plus a fourth block-parser variant) and
  a recurring defect family whose single shape is "two readers, one question, opposite
  answers". #1427 (merged 2026-08-05, while this doc was in review) closed three of that
  family's instances — #1402, #1416, #1383 — and its own sweep found the drift is NOT
  concentrated on the docs site as an earlier draft of this doc claimed: 5 of 7 straggler
  readers were in lib/authoring/, one in lib/core, only 2 in docs/src. HARD RULE #1 still did
  not stop any of it, because it governs RENDER PATHS and TRANSFORMS, and none of the drifted
  surfaces are those. This proposes the engine own TWO objects, not one, and the split is
  load-bearing. (1) The VOCABULARY — a declared JSON file plus a JSON Schema, listing every
  front-matter key and comment directive with its type, legal values, consuming kernel,
  precedence, exclusivity group, and READ STRICTNESS (a live distinction post-#1427:
  lib/core/front-matter-key.js now ships TWO readers on purpose — loose for keys nothing
  writes, column-0-strict for keys a writer also touches — so this vocabulary declares that
  choice per key rather than picking one universal reader). Mechanism copies
  lib/components/manifest.schema.json exactly: standard JSON Schema as the declaration, a
  hand-written checker that DERIVES its vocabulary from the schema, and fixture-pinned tests
  so a schema edit can never read as "just docs". (2) The DECK INDEX — a per-deck projection
  emitted by the engine (counts, front matter, and a slides[] carrying a stable id, page number,
  class tokens, component, title and source span), never edited in place but NOT "the un-authored
  half": slide metadata IS authored — a human types `<!-- _class: … -->` / describe / tier with
  autocomplete assisting, and the Studio Inspector writes the same directives — so every field
  carries a PROVENANCE (authored / resolved / computed), and authored vs resolved class tokens stay
  separate rather than collapsed. #1427 shipped #1416's fix WITHOUT provenance (filtering an
  illegal token at the boundary so nothing is ever stamped, per #1416's own prescription — "no
  provenance record is needed at all"), so provenance is no longer justified by that citation;
  it is kept here as a design choice for a DIFFERENT consumer — a Studio Inspector that must show
  "what you wrote" distinctly from "what rendered." The index is still the valuable half, because
  its COMPUTED part is what the surfaces demonstrably cannot derive: positionIsTrustworthy still
  refuses on a `_focusSteps` slide and a setext heading (two other refusals it used to need were
  retired by #1433, closing behind the engine's own boundary parser), and the Studio re-parses the
  whole deck to learn one slide's page number at a measured 4x cost. A live, still-open residual —
  splitTopLevel's slide numbering disagreeing with the engine on 2 decks under heading-split
  injection — is the sharpest current evidence an index would close. CRUD splits along that seam:
  reads come from the index, writes go to the SOURCE through a spliced writer the vocabulary
  validates. Writing markdown back out of a parsed object is explicitly barred — that is what
  #1256 deleted setFrontMatter for. Nothing lands here; this is the model for a human pick.
companion:
  - ./2026-08-03-authoring-vocabulary-audit.md
  - ./2026-07-29-front-matter-lossless-writers.md
  - ./2026-08-02-slide-class-taxonomy.md
  - ./2026-06-13-lfm-standard.md
  - ./2026-08-05-deck-class-register-boundary.md
  - ./2026-08-05-one-class-directive-reader.md
---

# The deck document model — one engine-owned object the surfaces read

**Date:** 2026-08-05 · **Status:** proposed · **Decision owner:** Sharmarke
**Area:** engine / authoring vocabulary / docs-site Studio + playground / export

> **Revised 2026-08-05, same day, after a `fact-checker` pass against `origin/main` at
> `fa2fa69`.** PR #1427 merged mid-review of this doc and closed #1402, #1416 and #1383 —
> three of the defects §1 originally cited as open evidence. The fact-check also found
> two claims in the first draft were wrong rather than merely stale: the diagnosis that
> drift concentrates on "the docs site" (#1427's own sweep found the opposite — 5 of 7
> stragglers were in `lib/authoring/`), and the citation of #1416 as proof provenance is
> necessary (#1416's shipped fix explicitly did NOT need provenance). Both are corrected
> in place below, marked where they occur, rather than silently smoothed over — the
> corrections are load-bearing for §1 and §4.1 respectively. Line numbers and counts
> throughout are re-verified against `fa2fa69`.

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

**Six surfaces read those settings, and each hand-wrote its own reader.** First
measured on the tree at `c502f9b`; re-verified below against `origin/main` at
`fa2fa69`, which includes PR #1427 (merged 2026-08-05, mid-review of this doc):

| Surface | File | Lines | Reads a shared kernel? | Drift gate |
|---|---|---:|---|---|
| Engine | `lib/engine/directives.js` | — | **is** the kernel | — |
| Studio front matter | `docs/src/components/studio/front-matter.ts` | 433 | **no imports at all** | **none** |
| Playground config | `docs/src/playground/deck-config.js` | 605 | only `deck-sizes.js` | **none** |
| Studio directives | `docs/src/components/studio/slide-directives.ts` | 252 | none at runtime | parity test |
| Editor autocomplete | `docs/src/components/studio/editor-complete.ts` | 170 | `PACE_NAMES` only | none |
| Linter | `lib/authoring/lint-core.js` | — | see correction below | — |

**~1,040 lines of standalone front-matter parsing with no shared kernel and no gate**
(`front-matter.ts` + `deck-config.js` — both grew slightly under #1427, which touched
neither's parsing logic). The disagreement is visible in the key charset alone —
three different line-level answers to "what is a legal key name", plus a fourth
block-parser variant (`lib/core/resolve-captions.mjs:110`,
`/^\s*([A-Za-z][\w-]*)\s*:\s*([\s\S]*)$/`):

```
lib/engine/directives.js:113            /^([A-Za-z_][\w]*)\s*:\s*(.*)$/       ← no hyphens
docs/src/playground/deck-config.js:188  /^([A-Za-z_][\w-]*)\s*:\s*(.*)$/
docs/src/components/studio/front-matter.ts:76  /^([A-Za-z][\w-]*)\s*:\s*(.*)$/
```

The engine's own reader is the narrowest. `\w` excludes `-`, so `color-mode:`,
`spectrum-*` and `motion-*` **never enter the directive map** — they work only
because each kernel separately re-reads the raw text (#1339). **All three still
stand unchanged on `main`** — #1427 didn't touch this seam.

### The defect family this produces

One shape: *two readers, one question, opposite answers.* Three instances have now
shipped fixes (via #1427, landing mid-review of this doc) and stand as precedent
rather than open evidence; the rest are as first measured.

- **#1358** *(closed)* — `data-class="<raw payload>"` precedes `class="<resolved list>"`,
  and an unguarded `/class="([^"]*)"/` matches leftmost. Two transforms shipped reading
  the directive payload instead of the resolved list.
- **#1374** *(landed, `c502f9b`)* — `slide-class-spans.js` reconstructs each slide's
  class from raw source for Mermaid pre-render. Three drifts proven live: a global
  `<!-- class: X -->` invisible, a directive quoted as prose counted, a `$$…$$`
  equation inventing a slide.
- **#1402 / #1416** *(closed by #1427)* — `color-mode:` vs legacy `class:`; 40 of 168
  permutations wrong. A first fix was pulled after the trio found four regressions; the
  shipped fix took a different shape entirely (§4.1).
- **#1383** *(closed by #1427)* — seven modules re-spelled the class-directive regex;
  now share `lib/core/class-directive-scan.mjs` (§"What changed since" below).
- **#1326, #1329, #1340** — earlier instances, named as such in #1416's own body.

### Why no rule caught it

**HARD RULE #1 reads: "*Render paths* share one source of truth… land *transforms*
in the shared kernel."**

A linter is not a render path. Neither is an autocomplete, a front-matter writer, or
a preview router. None is a transform. **The rule that should have prevented this does
not textually cover any of the four surfaces that drifted** — so each was written
standalone by an author who was, strictly, in compliance.

That is the root cause. Not carelessness: a gap in the rule, and no home in `lib/` for
a *source-side reader*.

### What is NOT broken, and a framing this doc got wrong

**Correction, from a fact-check against `main` at `fa2fa69`.** An earlier draft of
this section claimed the drift "is concentrated at exactly one seam: source-side
readers on the docs site" and cited `comment-directive.js`'s call sites as proof
`lib/` is consolidated. Both claims don't survive contact with #1427's own sweep.
`comment-directive.js` has **3** non-test call sites, not 12, and never had 12. And
#1427's PR for #1383 found **seven** modules re-spelling the class-directive regex —
**five in `lib/authoring/`**, one more in `lib/core` (`chart-narration.js:49`), and
only **two in `docs/src`**. Its own decision record says it plainly: *"One straggler
is in `lib/core`, not the docs site, and saying otherwise would be the comfortable
version."* (`2026-08-05-one-class-directive-reader.md`)

The corrected picture: drift is not a docs-site problem, it is a **source-side
reader** problem — anywhere a question about a deck must be answered before the
engine has run, regardless of which directory that code lives in. `lib/core/bg-image.js:132`
and three modules under `tools/` carry the same private regex too.

**What genuinely does hold, on the same corrected evidence:** the newly-shared
kernels work, and they're now the strongest argument for this doc's approach rather
than an aspirational one. `lib/core/class-directive-scan.mjs` reads both class-comment
forms once, is consumed by **six** modules including `lint-core.js` itself, and is
corpus-gated at 274 of 276 decks (2,785 slides, 0 disagreements) against the regex it
replaced. That also retires this doc's earlier claim that `lint-core.js` "must stay a
dependency-free leaf" and "cannot require a module" — it already requires six modules
on `main`, three of them `lib/core/*`. Its real, narrower invariant (stated in its own
header) is *no `fs` and no `require` of `lib/components`* — a much smaller constraint
than "cannot share a kernel," and one this design comfortably fits inside.

One constraint from the same PR is real and does bind the index design (§9 Slice 2):
a full markdown-it-based reader (`lib/core/boundary-parser.js`) was explicitly
considered and **refused, with a reason** — it would roughly triple `lint-core.js`'s
bundle size on a panel that lints as you type. The lesson isn't "surfaces can't share
kernels" (they now demonstrably do); it's "a *browser-side* consumer needs the answer
as **data**, not as a second copy of the parser." That is exactly why the deck index
(§4) ships as JSON rather than as an importable module.

And the docs site already imports engine code at runtime in ~15 places
(`lib/core/present-transport.mjs`, `glossary-auto.mjs`, `resolve-pace.mjs`,
`resolve-captions.mjs`, `lib/engine/math-detect.mjs`,
`lib/diagnostics/slice-equivalence-core.mjs`), and `slide-directives.test.ts` already
does `require('../../../../lib/engine/directives.js')`. The path is open in both
directions and already used. **The mirrors that drifted are mirrors by habit, not by
constraint** — that conclusion survives the correction; the evidence for it changed.

Two straggler readers the #1427 sweep left unswept, still live on `main` today:
`docs/src/components/studio/present/rehearsal.js` (own `parseSlides`, indices that
don't align with `splitTopLevel`) and `editor-complete.ts`'s `FRONT_MATTER_KEYS`,
which is stale *and user-visible*, offering `ai-lang` / `finish-override` / `present`
while omitting `color-mode`, every `spectrum*`, `stamp`, `tone`, `rule`, `eyebrow`,
`headline`, `captions` and `motion*`.

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
> per FIELD, and #1416's postmortem is why this doc tracks it that finely, even though
> (correction below) #1416's own fix ended up not needing it.

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

**This is a forward-proposal against #1339's current, rescoped recommendation, not an
answer to a stray remark.** #1339 was rescoped 2026-08-03 after its own adversarial
pass, and its live text argues the opposite of what this doc proposes: *"derive the
registry rather than declaring it… if that scan turns out not to be buildable, that
is the honest signal that a declared registry would be unverifiable."* The
`manifest.schema.json` precedent is this doc's counter-evidence — it is *declared*,
not derived, and has not rotted, because the artifacts it governs are gated against
it rather than left to drift. Whoever picks this up should read #1339's rescoped
reasoning and decide between the two positions explicitly; this doc does not get to
declare the disagreement resolved by citing itself.

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
      "readStrictness": "top-level",    // #1427: strict for any key a WRITER also touches
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
- **this key must be read strictly (column 0 only) rather than loosely** — a fact that
  exists in the codebase today only as a 25-line rationale comment on
  `lib/core/front-matter-key.js:44-64` and a table in a PR description, not as a
  declaration anything can query

JSON Schema expresses the first awkwardly (`dependentSchemas`/`oneOf`) and the rest
not at all. **They become ordinary declared fields in the object** — exactly as
`manifest.schema.json` already carries `slots`, `variants` and `adapt.mode` as data —
checked by a derived checker. The object stays a state object with a schema; it does
not become a language.

**The read-strictness field is not hypothetical — it is the single clearest gap this
doc's revision found.** #1427 shipped `lib/core/front-matter-key.js` with two readers:
`frontMatterValue` (loose — matches a key at any indentation) and the new
`topLevelFrontMatterValue` (strict — column 0 only), with the rule *"read the key the
way the thing that acts on it reads it": loosely for a key nothing writes, strictly for
a key a writer also touches* (`class:` and `color-mode:`, today). That rule is real,
load-bearing, and currently lives nowhere queryable — a future key gets it right only
if whoever adds it reads the same comment. A `readStrictness` field on every vocabulary
entry is that rule, declared once instead of re-derived by convention.

### Two constraints the shape must respect

- **Kernels are named as strings.** `lib/engine/directives.js` is inlined verbatim into
  `docs/public/playground/lattice-playground.js`. Importing the kernels would newly drag
  `resolve-captions.mjs`, `notes-core.js` and `tier-filter.js` (~36 KB raw) into the
  browser bundle (#1339). **JSON satisfies this for free where a JS module would not** —
  a point in favor of the ask's chosen format.
- **`lint-core.js`'s real invariant is narrower than this doc first stated.** An
  earlier draft claimed it "must stay a dependency-free leaf" and "cannot `require` a
  module." Both are false on `main` today — it requires six modules, three of them
  under `lib/core/` (`deck-class-register.js`, `front-matter-key.js`,
  `class-directive-scan.mjs`), added by #1427. Its own header states the actual rule:
  *no `fs`, and no `require` of `lib/components`.* A JSON vocabulary object satisfies
  that trivially. (The genuinely bundle-sensitive constraint is the browser-side
  playground reader, covered above and in §"What is NOT broken".)

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

**Correction, from a fact-check against `main`: #1416 does not support provenance as
argued below — it supports the opposite design, and the doc had this backwards.**

An earlier draft cited #1416's four regressions as proof provenance is load-bearing,
quoting its postmortem: *"Subtraction needs to know whether a token came from the deck
or from the slide — and only one of the three code paths can know that."* True as a
description of why the *reverted* attempt failed. But #1416's own prescribed fix, in
its own words, is: **"No provenance record is needed at all: `latticeSpotKeys` and
`deckClassTokensToUnstamp` both disappear."** And that is exactly what #1427 shipped —
`lib/core/deck-class-register.js` **filters an illegal token where the register is
read**, at four boundaries, so nothing illegal is ever stamped in the first place.
Its own decision record states the consequence directly: *"no kernel removes
anything. R1 and R4 are not fixed; they are unrepresentable."* A design that never
stamps a bad token has no need to know where a token came from in order to remove it.

So the #1416 citation is retracted as evidence for provenance. **Provenance may still
be worth keeping in the index, but on different grounds**, and this doc should be
honest that those grounds are weaker — a plausible future need, not a proven one:

- A Studio Inspector that wants to show an author "here is what *you* wrote on this
  slide" distinct from "here is what actually rendered, after the deck-wide merge" —
  a UI affordance, not a correctness requirement the engine has hit yet.
- Diffing two decks' resolved state without also diffing what changed *because a human
  typed it* versus *because the deck-wide register changed underneath the slide*.

Neither is demonstrated by a landed defect the way #1416 appeared to be. If the vocabulary
and index ship without per-field provenance and nothing breaks, that is real evidence
against carrying it — not a signal the design missed something.

### Why the index is the valuable half

The surfaces do not merely duplicate this work — **they cannot do it correctly, and
the code says so.**

**`positionIsTrustworthy` (`lib/diagnostics/slice-equivalence-core.mjs:188` — moved
from `:204` by later edits) is a function whose entire job is to REFUSE the
question.** As first measured it bailed on four cases; a **correction**: a later
change (#1433, landed after #1427) retired two of the four once the engine grew its
own boundary parser to answer them, leaving two live:

- a `_focusSteps` slide (one slide becomes N; "the count is not derivable here at all")
  — **still refuses, on `main` today**
- a **setext heading** — `Text` over `---` is an h2 to markdown-it and a slide
  separator to the caller, "so the two disagree about the same three characters" —
  **still refuses, on `main` today**
- ~~an `hr` form markdown-it recognizes and the caller's splitter does not~~ —
  **retired by #1433**: "boundaries now come from the engine's own parser"
- ~~a `---` inside an HTML comment (126 of 128 corpus decks refused before the
  original fix)~~ — **retired by #1433**, same reason

Its own comment names the stakes for the two that remain: refusing exists to prevent
"the **plausible lie**" — the preview painting "3" on the slide the deck numbers 4.
The sharpest *current* evidence for the index, though, is a residual named in
#1427's own decision record rather than in this function: **`splitTopLevel`'s slide
NUMBERING still diverges from the engine on 2 decks under heading-split injection** —
a live, un-refused disagreement between "what the caller counted" and "what the
engine rendered," today, on `main`.

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
| Mermaid pre-render | the two `class` spellings | per-slide class *(`slide-class-spans.js` already derives its boundaries from `lib/core/boundary-parser.js` post-#1374; an index would let it stop reconstructing entirely)* |
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
| **`lint-core` purity** breaks. | Already narrower than this doc first assumed: `lint-core.js` requires `lib/core` modules today (§3). It reads the JSON vocabulary directly; only a full markdown-it-based reader is barred, on bundle-size grounds (§1). |
| **Corpus coverage ≠ vocabulary coverage.** `logo-style:`, `ai-lang:`, `finish-override:`, `validate:`, `math:`, `title:` are real, have consumers, and appear in **no** committed deck (#1339). | The vocabulary is declared and gated against **consumers**, not against the corpus — every entry names a live kernel, and a dead entry fails the gate. |
| **Scope sprawl** — this touches engine, Studio, playground, linter and export. | Three slices (§9), each independently shippable, each deleting more than it adds. |

---

## 9 — Migration

**Slice 1 — the vocabulary. Revised: not "one reader" — declare per-key read strictness.**
An earlier draft of this slice said "make `frontMatterValue` the one key reader, delete
the three rival charsets." That collides with a shipped, reasoned decision: #1427 added
`topLevelFrontMatterValue` as a deliberate **second** reader, because `class:` (which the
engine's own `parseFrontMatter` stamps at any indentation) and `color-mode:` (which only
Lattice writers touch, always at column 0) genuinely need different strictness — see §3's
`readStrictness` field. The corrected slice: add the vocabulary object + schema + derived
checker + fixture-pinned test, with `readStrictness` declared per key; both
`frontMatterValue` and `topLevelFrontMatterValue` stay, selected by that field instead of
by which author remembered the JSDoc comment. Delete the block-parser charsets that don't
correspond to either (`deck-config.js`, `front-matter.ts`, `resolve-captions.mjs`'s
variant). Move `writeFrontMatterLine` to `lib/core/`. Point `editor-complete.ts`'s
`FRONT_MATTER_KEYS` and `deck-config.js`'s `FIELD_DEFAULTS` at the vocabulary. **Half of
this slice's shape has already shipped**, for the slide-comment side: `lib/core/class-directive-scan.mjs`
is exactly "one shared source-side reader," corpus-gated, consumed by six modules — the
remaining gap is the front-matter-key side and the *declaration* (a schema, not a
convention in a comment). *Closes #1339's remaining open questions (the `readStrictness`
one is new since #1427); fixes the user-visible stale autocomplete.*

**Slice 2 — the deck index.** Emit it from the engine. Consume it in the preview router,
the rail and the overview grid. Two of `positionIsTrustworthy`'s four refusals were
already retired by #1433 (the engine's own boundary parser now answers them); this slice
retires the remaining two (`_focusSteps`, setext-heading counting) and closes the still-live
`splitTopLevel` 2-deck numbering residual named in #1427's own record — that residual, not
the (mostly-already-closed) `positionIsTrustworthy` refusal path, is the sharper target.
*Removes the 4× navigation cost.*

**Slice 3 — the manifest projection.** Carry the index in the `lattice-doc` envelope;
mint stable slide ids; re-anchor comments off ordinals.

**Also required, in slice 1:** extend HARD RULE #1 to cover **source-side readers**, not
only render paths and transforms. Without that, the next linter/autocomplete/probe is
written standalone in full compliance, and this recurs — `docs/src/components/studio/present/rehearsal.js`,
still on `main` today with its own `parseSlides`, is a live instance right now, not a
hypothetical one.

---

## 10 — Open questions

1. **Where does the vocabulary live?** `lib/core/vocabulary.json` + `vocabulary.schema.json`,
   or folded into `spec/` beside `LFM-1.0.md`? The spec is prose and CC-BY licensed; the
   object is machine data. Leaning `lib/core/`, projected into `spec/` and `grammar.json`
   by the existing generators.
2. **Revised by #1427: not "which single reader becomes canonical" — does `readStrictness`
   fully replace the need for `parseFrontMatter` to learn `-`?** `frontMatterValue` and
   `topLevelFrontMatterValue` now coexist by design (§3, §9). The open part is narrower:
   does the engine's own `parseFrontMatter` (`lib/engine/directives.js:113`, still
   hyphen-blind) also need to learn `-`, so `color-mode:`/`spectrum-*`/`motion-*` finally
   enter `KNOWN_DIRECTIVES`, or does the vocabulary object supersede `KNOWN_DIRECTIVES`
   entirely and make that question moot? Slice 1 must pick one.
3. **Slide id derivation.** Content hash (stable across reorder, changes on edit) versus a
   minted id persisted into the source (stable across edit, but writes to the author's
   file). Comments and collaboration want the second; the "never write the source" instinct
   wants the first.
4. **`note:` / `Speaker:`** — collapsing to one key changes what 14 existing slides export.
   Rewrite the decks, or accept both spellings permanently? (Carried from #1339.)
5. **`player:` and `present:`** appear in front matter with no traced consumer. Both have
   dedicated example decks, suggesting regression rather than fiction. Trace before the
   vocabulary either registers or prunes them.
