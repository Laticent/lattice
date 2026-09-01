---
status: proposed
summary: LPM — a unified plugin model promoting Lattice's six ad-hoc extension idioms into one spec'd, shared-kernel system
---

# LPM — a unified plugin model for Lattice extensions

**Date:** 2026-06-14
**Status:** Proposed (design model). Spec to be versioned `LPM 1.0` (draft)
under `spec/`, a sibling profile to [`LFM 1.0`](../../spec/LFM-1.0.md).
**Decision owner:** Sharmarke
**Supersedes nothing.** Formalises and unifies what the engine already does in
six places.

**Status update (2026-09-01):** Phase 1 items 1–2 — the dispatch half — shipped as
`2026-09-01-manifest-driven-chart-dispatch.md` (#287). All fourteen chart kernels
now dispatch off a manifest block and `chart-family.js` names no chart. Two naming
divergences that note records: the block ships as `kernel`, because `render` had
since been claimed by the render-nature enum, and `transform` by the transform DSL;
and the ratified entrypoint takes `(html, ctx)` rather than
`(inner, classTokens, ctx)`, with a `{ html, cls }` return arm roadmap needs.
Items 3–5 (function-plot, the `lpm-conformance` fixtures + parity gate, and
`spec/LPM-1.0.md`) are NOT built, so this note stays **Proposed** and the
`kind` / `trigger` / `order` / `parity` / `degradesTo` / `tokens` fields below
remain design, not schema.

---

## The question

Lattice already extends itself in many ways — Mermaid, function-plot, KaTeX
math, syntax highlighting, 53 layout components, a dozen section transforms,
deck-level islands. Informally we call this "the plugin system." But there is no
*system*: each extension kind is wired by hand in its own idiom. PR #263 made the
owned `lib/engine` **canonical** and demoted marp-cli to a BYO-compatibility
surface (see [`../marp-independence.md`](../marp-independence.md)), and HARD RULE
#1 now reads "land transforms in the **shared kernel**, not one path" — which is
exactly this note's thesis. Yet the *integrations* still don't share that single
source: each is wired per-surface across the owned engine, the BYO `marp.config.js`,
and the vscode runtime, and "they agree" rides on a header comment, not code.

Can we promote this to one **plugin model** — easy to understand, easy to use,
easy to implement — that scales to the extensions we'll add tomorrow (Graphviz,
Vega-Lite, WaveDrom, chemistry, citations…) and is *ready* for a third-party
ecosystem without taking on that burden yet?

This note records the audit, the model, and the phased rollout. The governing
posture (decided 2026-06-14): **ecosystem-ready, first-party-first**, rolled out
**incrementally with the chart family as the proof-of-concept.**

## What we already have (the raw material)

Audit finding: there are **six** distinct extension mechanisms, not three, each
with its own registration idiom. (Full trace in the four research reports that
produced this note; key file:line anchors inline below.)

| # | Mechanism | Trigger | Stage(s) | Discovery today |
|---|---|---|---|---|
| 1 | **Layout components** (53) | `<!-- _class: X -->` | CSS + optional transform | **Auto** — drop a folder; manifest → catalog/grammar/docs/snippets/lint |
| 2 | **Section transforms** (~10) | section class | HTML-rewrite + DOM | One ordered list, dual-adapter (`lib/transformers/registry.js`) |
| 3 | **Chart types** (13, *inside* #2) | layout class | inside chart-family | **Hard-coded `if/else` + require list + body-class regex** |
| 4 | **Parse-time md-it plugins** | tokens/markers/fences | parse-time | Single function source, but the `.use()` **ordering** is duplicated across **2 sites** (`lib/engine/index.js`, `marp.config.js`) |
| 5 | **External renderers** (mermaid, function-plot, KaTeX, highlight.js) | fence / `$…$` / lang | bake / parse / inflate | Per-path bespoke wiring |
| 6 | **Deck directives / islands** | front-matter | whole-deck HTML/DOM | Hand-wired, outside the registry |

**Two of these already work the way we want, and they are the templates:**

- **The component manifest (#1)** is zero-registration and *projected*: one
  `*.manifest.json` is the single source for the machine catalog
  (`dist/docs/components.json`), the LFM grammar (`grammar.json`), human docs,
  galleries, VS Code snippets, editor autocomplete, and the linter vocabulary.
  Adding a CSS-only component touches **no** central file.
- **The transformer registry (#2)** is inversion-of-control: one ordered
  `TRANSFORMERS` array of `{ name, selector, applyToHtml, applyToDom }`, iterated
  by every render path. It already solved "adding a transform meant editing
  three files in lock-step" — for the *outer* layer.

**The other four are the informality.** The sharpest example is the chart family
(#3): a clean outer registry wrapping a **hard-coded `if/else if` switch**
(`lib/components/chart/_chart-family/chart-family.js:633-730`) plus a layout
array (`:26`), a hand-`require` list (`:50-94`), and a body-class alternation
regex that must name every figure class (`:735`). Adding one chart = **four
hand-edits to one file** — the exact lock-step problem the outer registry was
built to kill, reproduced one level down. Transforms are **not auto-discovered**
even though they live beside their manifests. function-plot has **no
`lib/integrations/function-plot/` directory of its own** (unlike mermaid, katex,
highlight-js) — its contract is scattered across four files — and renders on only
**2 of 3** paths (pure marp-cli yields an empty box).

So we are not designing a plugin system from nothing. We are **promoting an
undocumented one to a named, declared, conformant model** — exactly the move
[`LFM`](2026-06-13-lfm-standard.md) made for the authoring dialect.

## The latent contract (it already exists, unwritten)

Across all four external renderers the shape is already consistent:

> **Register a markdown trigger → pass the body to a library verbatim (Lattice
> owns registration, theming, and degradation — never the body grammar) → emit
> inline SVG/HTML → theme palette-blind via `var(--token)` → fail soft to a code
> block, never throw.**

This is the spine of the model. It is even pre-litigated: the
`latticeplot → functionplot` rename established "fences are named after the
library that renders them; we don't own the config language" — the same posture
LFM took for the document.

### The four divergences a model must reconcile

The latent contract is real, but the implementations diverge on four axes that
the model must make *declared* rather than implicit:

1. **Execution model** — KaTeX/highlight.js render **synchronously in Node**;
   function-plot is **browser-inflate only**; Mermaid is **subprocess + client**.
   Math's sync requirement is a deliberate defense against headless-Chromium
   reflow races (`lib/engine/math.js:5-9`). We **cannot** force one model.
2. **Render-surface coverage** — across the owned engine (canonical), BYO
   marp-cli, and the vscode runtime, mermaid/katex/highlight cover all three;
   function-plot skips BYO marp-cli (it needs an inflater the BYO recipient
   doesn't bundle). HARD RULE #1 is honored by convention, not enforced.
3. **Theming** — three philosophies: a clean `--hljs-*` token family;
   `var(--token)` + `!important` to beat inline SVG attributes
   (mermaid/function-plot); and *none* (KaTeX vendors its own sheet).
4. **Structure** — components are zero-registration; transforms and integrations
   are hand-wired; enums are frozen arrays duplicated between
   `lib/components/index.js` and `manifest.schema.json`.

*(Two honesty bugs to fix in passing: `highlight-js.docs.md`'s token table has
**two phantom rows** — `--hljs-name`, `--hljs-meta` — that aren't in the real
12-token `--hljs-*` family in `base.tokens.css`; and the emulator's
`applyHighlighting` regex is almost certainly dead (its `<pre class="language-X">`
selector doesn't match the engine's `<pre><code class="language-X">` output —
to confirm by render in Phase 2, not assumed).)*

## The model: one manifest, one loader, declared contracts

**Thesis.** Every Lattice extension is a **Plugin**: a self-describing folder
whose manifest declares its **kind**, **trigger**, per-stage **adapters**,
**tokens**, **degradation**, and **dependencies**. One loader discovers every
plugin (zero-registration), one validator enforces the kind's contract *and that
its declared render paths actually agree*, and the build projects every plugin
into the existing catalog/grammar/docs/lint surfaces.

We do not invent a new file or registry. We **generalise the two things that
already work**: the component manifest gains an optional **`render` block**, and
the transformer registry's dual-adapter shape grows to an **N-stage adapter set**
built *from* those manifests instead of from hand-maintained arrays.

### Two orthogonal axes — `kind` (what the author writes) and `render` (how it runs)

The earlier draft of this note tried to make `kind` carry both "where the author
triggers it" *and* "how it's implemented," and ended up with seven kinds two of
which (`transform`, `lang`) weren't actually carved by authoring surface — a
`transform` has no author-visible trigger of its own (it *implements* a
component), and `lang` is just a code-fence that colourises instead of replacing.
That's a leaky taxonomy. The fix is to split the two concerns:

**`kind` — the authoring surface (5, and only 5).** This is the "easy to
understand" headline, and now it actually holds: a plugin's `kind` is exactly
*what the author types.*

| `kind` | The author writes… | Emits | Absorbs today's |
|---|---|---|---|
| `component` | `<!-- _class: X -->` | a styled `<section>` | #1, and each **chart** (#3) |
| `block` | a fence ` ```name ` | an inline SVG/HTML figure | mermaid, function-plot, future graphviz/vega (#5 fences) |
| `inline` | delimiters (`$…$`) | inline HTML | KaTeX (#5 math) |
| `directive` | a front-matter key | whole-deck shell injection | #6 islands/logo/meta |
| `marker` | inline list/token grammar | semantic classes / badges | #4 state-markers/badges |

**`render` — the implementation mechanism (orthogonal to `kind`).** *Transform*
and *lang* were never authoring surfaces; they're **mechanisms** a `kind` can use,
declared in the `render` block (next section):

- A **transform** (post-render section rewrite) is how a `component` or `block`
  is implemented when CSS alone can't do it — every chart is a `component` whose
  `render` uses an `html`/`dom` transform adapter.
- A **lang** registration (custom code-fence highlighting, e.g. the Mermaid
  hljs grammar) is a capability *any* plugin may contribute via a `lang` adapter;
  it is not a top-level kind.

So: **five authoring surfaces, one orthogonal mechanism layer.** A contributor
picks the surface from what the author should type, then declares how it renders.
That separation is what makes the model both *understandable* (5 kinds) and
*adaptive* (the mechanism layer absorbs new render strategies without new kinds).

### The render contract (generalises `{applyToHtml, applyToDom}`)

A plugin's `render` block declares **adapters keyed by stage**, plus the render
paths it guarantees:

```jsonc
// The honest function-plot contract (today's worst-behaved citizen):
"render": {
  "kind": "block",
  "trigger": { "fence": "functionplot", "aliases": ["latticeplot"] },
  "renderPaths": ["engine", "runtime"],   // engine=owned(canonical) — NOT BYO marp-cli (no inflater)
  "exec": "browser-inflate",            // sync-node | subprocess | browser-inflate
  "parity": "progressive",              // client path inflates SVG the static path can't
  "adapters": {                          // entrypoints; any subset of the stages
    "parse": "fp.parse",                 //  markdown-it: fence → placeholder div
    "dom":   "fp.dom"                    //  client DOM inflate (≡ applyToDom)
  },
  "figureClass": "functionplot",         // separately declared; ≠ the trigger name in general
  "degradesTo": "code-block",            // code-block | source-text | hidden | empty-figure
  "tokens": ["--accent", "--c4-dark", "--text-muted"],
  "themeStrategy": "override"            // token-family | override | vendor-css | none
}
```

This makes the four divergences **first-class and checkable**:

- **Execution model** is `exec` — declared, never assumed. The loader wires the
  right stages; math keeps its sync-Node guarantee, function-plot its
  browser-inflate one.
- **Render paths** are `renderPaths` + a `parity` mode — and the gate enforces
  the mode, not byte-equality. This matters: `state-chart`'s runtime path runs a
  browser-**measured** layout pass (`installStateChartLayout`) that draws edges the
  string-rewrite paths physically cannot; mermaid's mmdc SVG differs from
  `mermaid.render`; function-plot inflates only in a browser. Demanding identical
  output would **red-light working renderers on day one.** So a plugin declares one
  of two modes (see "Parity" below): `equivalent` (all paths emit the same
  semantic contract) or `progressive` (the static path emits an agreed skeleton/
  fallback, the client path enriches it). **HARD RULE #1 becomes a gate on the
  *declared* contract** — riding the per-component semantic-invariant suite that
  replaced the retired marp-parity gate in P4 — not a header comment. And
  function-plot's gap becomes an honest `renderPaths: ["engine","runtime"]`, not a
  hidden empty box.
- **Theming** is `tokens` + `themeStrategy` — declared. The validator checks
  every listed token exists in `base.tokens.css` (this kills the phantom-token
  doc class of bug), and the catalog projects the token contract so themes know
  what to supply.
- **Degradation** is `degradesTo` — and a test asserts the L0 fallback, making
  "fail soft, never throw" a checked invariant.

### The adapter interface contract (this *is* the spec)

The registry and the manifest are the easy part. The hard part — and the thing
every plugin author touches first — is the **signature, return contract, and
idempotence rule of each adapter.** Today's chart kernels prove the danger:
they disagree on this, in *two* incompatible shapes (kernel-as-module:
`parseX(inner) → model|null` + `buildX(model) → '<div class="X-figure">…'`; vs.
in-place `transformXSection(html, cls) → html`), and several carry bespoke
per-chart call sequences (radar's `parseRadar→resolveScale→buildRadar`, map's
basemap pick). "Drop a file, no edits" is only true once all kernels conform to
**one** signature. So that signature is normative, not incidental:

| Adapter | Signature | Returns | Pass-through signal |
|---|---|---|---|
| `bake` | `(source: string, ctx) → string` | rewritten source, pre-parse | return `source` unchanged |
| `parse` | `(md, ctx) → void` | — (registers markdown-it rules) | n/a |
| `html` | `(html: string, ctx) → string` | rewritten **full-document** HTML | return `html` unchanged |
| `dom` | `(root, ctx) → void` | — (mutates live DOM) | no-op |
| `lang` | `(hljs) → void` | — (registers a language) | n/a |

For `component`-via-transform plugins (every chart), the boundary is **one
function**, not declarative metadata — because the per-chart dispatch is
irreducibly bespoke and *must* live somewhere: radar threads its variant back
into `parse`, map resolves a basemap before `parse`, gantt/piechart read class
tokens and an eyebrow into `build`. No `figureClass`/`trigger` metadata can derive
that wiring. So the kernel owns it, behind a uniform entrypoint:

```
transformSection(inner, classTokens, ctx) → figureHtml | null   // null ⇒ pass through
```

The framework owns what is genuinely common — discovery, the section **walk**
(so kernels stop re-implementing `parseTopLevelLis`/`topLevelLis`/`splitTopLevelLI`;
`ctx` exposes them as shared utilities), trigger dispatch, the chart-frame **wrap**,
the `figureClass` body-detection (replacing the hand-maintained `bodyRE` — note
`figureClass` is a *separately declared* field, since it differs from the trigger:
`timeline-list`→`timeline-spine`, `kanban`→`kanban-board`), and the idempotence
guard. The kernel owns everything between "here is your section's inner HTML +
class tokens" and "here is the figure." The 13 charts standardise on exactly this
entrypoint; the three that already use the in-place `transformXSection(html, cls)`
shape barely change, and the kernel-as-module ones (radar/map/funnel/…) wrap their
existing `parse`/`build` inside it.

`match → parse → build` remains an **offered internal pattern** (and a default
helper for the simple `block`/figure case) — a kernel whose dispatch *is* uniform
may use it — but it is not the contract boundary. **Ratifying this `transformSection`
signature, and what rides in `ctx`, is the real Phase-1 deliverable; the generic
dispatcher falls out of it.**

Three invariants are mandatory and tested:

1. **Idempotence.** Every `html`/`dom` adapter must be safe to run twice (the
   marp-cli HTML pass and the runtime DOM pass can both fire on one VS Code
   refresh). Standard guard: early-return on the marker class.
2. **Fail-soft.** A throwing adapter is a defect; on bad input a plugin returns
   its `degradesTo` fallback, never an exception that aborts the deck.
3. **Purity of `parse`/`build`.** No filesystem, no global state — so the same
   kernel runs unchanged in Node (emulator), marp-cli, and the browser bundle.

### Ordering and conflict

A declarative model that pushes ordering into an array index would *regress* from
the hand-reasoned prose comments it replaces ("chart-family runs first so
`chart-frame` is visible downstream"). So ordering is **declared, not positional.**
The `render` block carries:

```jsonc
"order": { "phase": "section", "after": ["image-asset", "image-scrim"] }
```

- `phase` is `bake → parse → section → deck` — whole-deck `directive` plugins
  (islands/logo/meta) run in the `deck` phase, strictly after all per-section
  work, resolving this note's original Open Question #3.
- `after` declares intra-phase dependencies; the loader topologically sorts and
  **fails the build on a cycle or an unsatisfiable `after`.** Two plugins that
  claim the same `trigger` are a build error (and an authoring diagnostic).

This is also the #1 thing third-party plugins break on, so it is schema'd in 1.0,
not deferred.

### Diagnostics — author-facing, not just degradation

`degradesTo` is the *visual* fallback; it is not the *authoring* feedback. LFM
ships a [Diagnostic Protocol](../../spec/diagnostics.md) with frozen rule IDs, and
LPM must plug into it: a plugin **contributes rule IDs** (unknown fence body,
malformed config, trigger collision, declared-but-missing token) that flow through
the same L2 validator and autofix path decks already use. A 10/10 extension system
tells the author *why* their `graphviz` fence didn't render — it doesn't silently
emit an empty box.

### Parity — defining "the three paths agree"

HARD RULE #1 cannot mean "identical bytes," because three of the renderers
legitimately produce different output *by design*: a measured DOM pass, a
subprocess SVG, a browser-only inflation. The model makes the seam a **declared,
tested property** instead of a false promise. A plugin's `render` block declares:

```jsonc
"parity": "equivalent"   // or "progressive"
```

- **`equivalent`** — every declared path emits the same *semantic contract*
  (same figure structure / classes, modulo whitespace and renderer-specific
  attributes). The default; most charts qualify.
- **`progressive`** — the static (build/HTML) path emits an agreed
  **skeleton or fallback**, and the client (`dom`) path **enriches** it with work
  only a browser can do. `state-chart` (measured edges), `function-plot` and
  `mermaid` (client-only SVG) are `progressive`. The gate asserts *two* things:
  the static path produces the declared skeleton, and the client path produces the
  enriched form — never that they're identical.

This also resolves the `exec` enum gap inspection found: `exec` describes the
*external-renderer call* (`sync-node | subprocess | browser-inflate`); a renderer
whose `dom` path does extra post-layout work is simply `parity: progressive`, it
is not a fourth `exec` value. The two fields are orthogonal and together they
describe state-chart honestly (`exec: sync-node`, `parity: progressive`) where a
single axis could not.

### Conformance and the plugin-author test story

"Easy to implement" includes "easy to know it works." LPM defines an
**`lpm-conformance` fixture shape**, mirroring LFM's L0/L1/L2 fixtures: for each
declared render path, `trigger input → expected emitted markup`, plus
`malformed input → expected degradation`. The 3-path parity gate consumes these
fixtures; a plugin author writes the fixture, not the harness. First-party plugins
ship them under the component folder; the build runs them.

### Versioning and migration

`engine: { lattice: "^1.0" }` versions the *host API*; a plugin also carries its
own `version`, and the spec states the **deprecation path for the adapter contract
itself** (per CLAUDE.md #10, every behavior change owns its migration — the plugin
format is no exception). A major LPM bump obligates: a one-release alias window
(as `latticeplot → functionplot` already did), a codemod where mechanical, and a
`CHANGELOG` `**Breaking:**` entry.

### Performance — discovery is build-time-frozen

Discovery is **not** a per-render cost. The loader runs at build time and freezes
a generated registry (exactly as `dist/docs/components.json` is generated today);
all three render paths consume the frozen registry, so the runtime/DOM path pays
**zero** discovery or manifest-parse cost. "Zero-registration" describes the
*authoring* experience, never a hot-path scan.

### Ecosystem-ready, first-party-first

The *schema* is third-party-ready; the *loader* stays first-party for 1.0.

- The manifest carries `engine: { lattice: "^1.0" }` (semver against a **stable,
  versioned plugin API**), `deps: { "function-plot": "^1.25" }`, and
  `trust: "first-party"`. These fields exist now so nothing has to change shape
  later.
- 1.0 discovery loads only first-party `lib/components/**`. A later phase adds
  `node_modules/lattice-plugin-*` discovery and an execution **sandbox** (the
  hard part: plugins run arbitrary code across three render paths, one of them
  headless Chromium). `trust` is the hook that gates it.
- This is why we don't big-bang: we prove the model internally, freeze the
  public API surface, *then* open the door.

## Why this is 10/10, not just tidy

- **Easy to understand** — one artifact (the manifest), one rule (`kind` =
  authoring surface), one invariant (declared paths agree).
- **Easy to use** — authoring is unchanged; LFM already specifies the triggers.
  The catalog/grammar/docs an author or agent reads are *generated* from the same
  manifest, so they can't drift.
- **Easy to implement** — adding an extension becomes a **folder-drop**: write
  the manifest's `render` block + the adapter functions; the loader registers it
  everywhere. The chart family's four hand-edits → zero.
- **Self-policing** — the divergences that today live in prose (exec model,
  path coverage, theming, degradation) become validated fields. The build's
  existing stale-gates (`docs:portal:check`, ownership guard) extend to cover
  them.

## Rollout — incremental, chart family first

Each phase ships independently behind the existing gates; no phase destabilises
more than one mechanism at a time.

**Phase 1 — the model, the chart family, *and one `block`*.**
Charts alone are the *easy* case: they share one `exec` (sync-Node), one trigger
(`_class`), one path profile (3/3), so they exercise the dispatcher but **never
stress the four divergences the model exists to reconcile.** A green Phase 1 built
only on charts would "prove" a schema that could be subtly wrong for exactly the
hard cases — and by Phase 2 the API is frozen. So Phase 1 deliberately includes
**function-plot**, the worst-behaved citizen (no home of its own under
`lib/integrations/`, scattered across four files, `browser-inflate` exec, honest
2/3 paths). If one
schema models both a uniform chart kernel *and* function-plot's
`exec: browser-inflate` + `renderPaths: ["engine","runtime"]`, the model is
proven across its real stress axes before anything freezes.
1. Add the optional `render` block to `manifest.schema.json` + `validate()`
   (`lib/components/index.js`) **together** — the schema is
   `additionalProperties: false`, so a `render` block without the matching schema
   property is a *hard* validation failure that breaks every manifest load, not a
   silently-ignored field. Build a **build-time-frozen** registry from manifests
   (`loadRenderContracts()`), generated like `components.json`.
2. **Ratify the adapter interface contract** (the section above) — the real
   deliverable. Replace chart-family's hard-coded switch/array/`bodyRE` with a
   generic dispatcher that calls each kernel's uniform `transformSection`
   entrypoint, keyed by registered `trigger`/`figureClass`. Refactor the 13
   kernels onto the one signature. Adding a chart = drop a `<name>.transform.js`;
   **no edit to chart-family.js**.
3. Give **function-plot** a `lib/integrations/function-plot/` home + a `block`
   `render` block; either close its marp-cli gap or declare `renderPaths`
   honestly. This is the canary for the `exec`/`renderPaths`/`degradesTo` fields.
4. Add the **3-path parity gate** driven by `lpm-conformance` fixtures; wire
   plugin diagnostics into the L2 validator.
5. Write `spec/LPM-1.0.md` (the normative draft) + scaffolder support.
Net: 13 charts migrate, the inner registry is gone, one real `block` integration
is modelled, and the schema is stress-tested on `exec`/path divergence — with
zero authoring change.

**Phase 2 — the remaining integrations + standalone transforms.**
Bring mermaid (`subprocess`), KaTeX (`sync-node` / `vendor-css` / `inline` kind),
and highlight.js (`lang`) under declared `exec`/`tokens`/`themeStrategy`/
`degradesTo`, and fold the standalone `lib/transformers/*` into manifest-declared
contracts. Fix the two honesty bugs (phantom `--hljs-*` doc table; dead
`applyHighlighting`). Derive `grammar.json`'s fence/state-marker sub-grammars from
manifests instead of the hand-maintained constants.

**Phase 3 — directives, markers, and the parse-time list.**
Bring `directive` (islands/logo/meta) and `marker` (state-markers/badges) under
the model; collapse the parse-time `.use()` list duplicated across three files
into manifest-declared `parse` adapters. De-duplicate the enum arrays between
`index.js` and the schema.

**Phase 4 (deferred) — third-party.**
`node_modules/lattice-plugin-*` discovery, the sandbox, signing, a published
plugin SDK + the frozen `engine.lattice` API. Only after Phases 1–3 prove the
internal model and the public surface has held stable for a release.

## Non-goals (1.0)

- **No authoring change.** LFM triggers are unchanged; this is an *engine
  refactor + a spec*, invisible to deck authors.
- **No new render path or execution model.** We *declare* the three that exist;
  we don't add a fourth or force-unify the existing three.
- **No third-party code execution yet.** Schema is ready; the loader and sandbox
  are Phase 4.
- **No parser.** Like LFM, LPM rides markdown-it/Marpit; a plugin registers
  handlers, it does not replace the engine.

## Open questions for ratification

- **Spec name.** `LPM` (Lattice Plugin Model) as the working title — sibling to
  LFM. Alternatives: LXM (eXtension), LPX. To settle at ratification.
- **Adapter entrypoint convention.** String references (`"fp.dom"`) resolved
  from a module export vs. direct function exports. Leaning string refs so the
  manifest stays declarative/serialisable and a future sandbox can mediate — but
  this trades a little ergonomics for that future. Settle in Phase 1.
- **`figureClass` for non-figure transforms.** `transformSection` + `figureClass`
  fit charts and `block` cleanly; the `lib/transformers/*` entries that *don't*
  emit a single figure root (e.g. split-panels, pill-tag) may need the raw `html`
  adapter directly rather than the figure-returning `transformSection`. Confirm in
  Phase 2.

*(Resolved during maker-checker: the whole-deck `directive` ordering question is
answered by the `order.phase` ladder — `deck` runs after `section`; the
`lang`/`block` overlap is answered by demoting `lang` to a mechanism, not a kind.)*

## References

- Research basis: render-path map, transformer/chart-family map, component
  manifest contract, and the four-integration comparative profile (this
  session). Key anchors: `lib/transformers/registry.js`,
  `lib/components/chart/_chart-family/chart-family.js:26-735`,
  `lib/components/index.js`, `lib/integrations/markdown-it/plugins.js`,
  `lib/engine/math.js`, `lib/runtime/index.js`.
- Sibling standard: [`LFM 1.0`](../../spec/LFM-1.0.md) and its decision note
  [`2026-06-13-lfm-standard.md`](2026-06-13-lfm-standard.md) — same "profile,
  not language / graceful degradation / declared contract" posture.
- Architecture: [`../architecture.md`](../architecture.md) (the three render
  paths), [`../workflow.md`](../workflow.md) (the 3-renderer gate).
