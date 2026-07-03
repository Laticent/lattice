---
status: proposed
summary: Design model for the Drawing Board browser-only deck studio and its on-device AI assistant, the Architect
---

# The Drawing Board — browser deck studio + the Architect (2026-06-07)

> **FROZEN (2026-07-03).** The Drawing Board is development-frozen and will be
> removed; the Studio succeeds it. Direction now lives in
> `2026-07-03-studio-succession.md`. The Architect's architectural decisions
> (tooling-first, Coach-vs-Converse, the canon pack) remain canonical and bind
> the Studio.

> Status: **proposal / design model.** No code yet. This doc fixes direction
> before implementation, per the "design before code on rethink requests" rule
> in `CLAUDE.md`. Product name **decided: Drawing Board** — bare mark for the
> route/nav/labels, voiced *the Drawing Board* in prose (the same article pattern
> as the Architect). Assistant name **decided: Architect**, voiced *the Architect*
> (§4 "Name & voice"; **Frame** is the reserved fallback).

## Problem / intent

We want a genuinely functional, browser-only slide editor on GitHub Pages — a
**first-class top-level capability**, a sibling to (not a replacement for) the
existing component playground. It should let someone author a full Lattice deck
in the browser with no install, persist their work locally, and get
conversational authoring help from an on-device AI assistant, **the Architect**.

Requested capabilities:

1. **CodeMirror-based editor**, browser-only, backed by IndexedDB.
2. **History** like Claude Code's — navigable, restorable revisions.
3. **The Architect**: an integral AI chat with its own conversational history,
   deck/slide recommendations, and **quick actions** to adopt those
   recommendations. Powered by a JavaScript small language model — explicitly
   *not* "yet another corny copilot."
4. **Three-panel UX** (Architect · editor · preview), desktop-primary but responsive.
5. **Conversation-first onboarding** — talk to the Architect before authoring.
6. **Focus edit modes** for Mermaid, math, etc.
7. **Editor↔preview sync** with auto-scroll keeping the edited section visible.
8. **Export** to Markdown, PDF, and PowerPoint.

## Why this is unusually feasible here

The hard infrastructure already exists in this repo — the Drawing Board is
largely an *assembly + persistence + assistant* layer over parts that already run:

- **The engine already renders client-side.** `tools/build-playground.js`
  bundles marp-core + the shared Marp plugins (`lib/integrations/markdown-it/plugins.js`)
  + the transformer registry into one browser IIFE
  (`docs/public/playground/lattice-playground.js`) that runs **render path #2
  entirely in the browser**. The Drawing Board reuses this; it does **not**
  introduce a 4th render path (the three-paths rule in `CLAUDE.md` stays intact).
- **CodeMirror 6 is already a dependency** (`docs/package.json`) with markdown
  support and a hand-ported Mermaid `StreamLanguage` grammar, themed through the
  palette CSS variables. `docs/src/playground/editor.js` is a 264-line
  proto-editor to grow from.
- **Deterministic deck intelligence already exists**: the author linter
  (`lib/authoring/lint.js` → `npm run lint:deck`), the machine catalog
  (`dist/docs/components.json` — when/anti-pattern/slots/skeletons per
  component), the parser, and the enriched manifests. This is what makes the
  Architect trustworthy (see §4).
- **GitHub Pages deploy already runs** (`.github/workflows/docs.yml`, Astro).

Positioning: the **playground** answers "let me try one component fast." The
**Drawing Board** answers "let me author and keep a whole deck, with help."
Different jobs; the Drawing Board is a new top-level Astro route (e.g.
`/drawing-board`), not an evolution of the playground page.

**Name & voice.** The mark is **Drawing Board** (route, nav, labels); prose uses
*the Drawing Board* with the article. This closes the brand trinity into one
story — **Lattice** (the engine) · **the Architect** (your master) · **the Drawing
Board** (where you build together) — and rides the idiom: "Open the Drawing
Board," "back to the Drawing Board." *The Drawing Board* (capitalised article) is
acceptable at the start of a sentence; the route/logo stay article-free.

## 1. Layout & responsiveness

Three resizable panels plus a left rail:

```
┌──────┬───────────────┬───────────────┬───────────────┐
│ rail │ Architect chat│  CodeMirror   │  live preview │
│ decks│  (own history)│   (focus modes)│  (filmstrip) │
│ +hist│               │               │  synced scroll│
└──────┴───────────────┴───────────────┴───────────────┘
```

- **Desktop-primary**, panels drag-resizable, widths persisted.
- **Responsive collapse** under ~1024px: panels become a segmented
  control / tabbed view (Architect · Edit · Preview); the rail becomes a drawer.
- **Empty state = conversation-first onboarding.** With no deck open, the
  center/right are a welcome and the Architect asks "What are you presenting, and
  to whom?" Onboarding retrieval (§4) turns the answer into a starter deck +
  component suggestions, then the editor populates.

## 2. Persistence & history (IndexedDB)

- **Store**: IndexedDB via a thin wrapper (`idb` or Dexie). Object stores:
  `decks`, `revisions`, `chats`, `messages`, `settings`, plus a `models`
  cache namespace (browser Cache API handles model weights for WebLLM/
  Transformers.js).
- **Two independent histories, as specified:**
  - **Deck revisions** — checkpoint snapshots + restore, Claude-Code-style:
    time-ordered, labeled, restorable; a restore forks rather than destroys.
    Append-only event log with periodic full snapshots keeps storage bounded.
  - **Chat thread** — the Architect's conversations persist with their own
    history and can be resumed/branched, separate from deck revisions.
- **Not** full git-in-the-browser (isomorphic-git). A checkpoint/restore model
  meets the "like Claude Code history" bar without the weight; revisit only if
  real branching/merging is needed later.

## 3. Editor, focus modes, sync

- **Editor**: grow `editor.js` — markdown + Mermaid highlighting already
  present; add slot/`<!-- _class: -->` awareness, the author-linter surfaced as
  inline diagnostics (reuse `lib/authoring/lint.js`), and component/skeleton
  completions from `components.json`.
- **Focus edit modes**: open the fenced block under the cursor (` ```mermaid `,
  `$$…$$` math, ` ```chart `) in an isolated sub-editor with specialized
  highlighting and a **live fragment preview** (Mermaid highlighting + KaTeX
  already in the tree). Distraction-free, validates the fragment in isolation.
- **Editor↔preview sync**: slides are `---`-separated, so map cursor line →
  slide index → scroll preview to that slide and highlight it; reverse on
  preview click. **One real change from today:** the playground preview is a
  single fixed 1280×720 specimen iframe; the Drawing Board needs a **scrollable
  filmstrip** of all slides with the active one tracked. Moderate work, still
  render path #2.

## 4. The Architect — *tooling-first, SLM as the conversational coat*

### Name & voice

The assistant is **Architect** as a brand mark (the chip, the menu item) and
*the Architect* in prose and its own voice — "Ask the Architect," "the Architect
suggests," "I'm the Architect." The definite article makes it read as a senior
colleague rather than a feature, while the bare mark stays crisp as a label. The
metaphor is self-explaining and needs no gloss: **Lattice is the structural
framework; the Architect designs what goes in it** — narrative structure,
load-bearing slides, flow. Recommendations surface as "the Architect suggests:"
/ "the Architect flags:". **Frame** is the reserved fallback (the tightest pun on
the lattice metaphor — *framing an argument* = *the structural frame*); the
formal *The Architect* (capitalised, *Economist*-style) is available if a heavier
register is ever wanted, at the cost of a faint *Matrix* echo.

### Tooling-first architecture

**Decision (confirmed): the model never owns knowledge or correctness.**
Recommendations and quick-actions are produced by the existing deterministic
Lattice tooling; the small language model only handles phrasing, intent
classification, and onboarding retrieval framing. This is what keeps a 1–3B
on-device model from inventing non-existent components or emitting malformed
markdown, and it reuses infrastructure we already ship.

Pipeline:

1. **Parse + lint the live deck** → structured facts + deterministic findings
   (`lib/authoring/lint.js`, the parser, manifests). e.g. "card-style slide uses
   `- **Title.** body` → adopt nested format" is a deterministic finding with a
   deterministic fix.
2. **Catalog retrieval** for onboarding / "which component fits": embed the
   user's description, retrieve candidates from `components.json` by semantic
   similarity. The when/anti-pattern prose is already authored per component.
3. **SLM frames** the findings/retrieval conversationally and classifies intent.
   It does *not* generate the advice content or the edits.
4. **Quick actions are engine-generated CodeMirror transactions** — insert this
   skeleton, rewrite this `li` to nested format, swap `cards-grid`→`verdict-grid`.
   "Adopt recommendation" applies a real, validated edit, never model-typed
   markdown.

Consequence: across *all* model backends, **what the Architect knows and can do
is identical**; only the phrasing/latency vary (see §5).

### Persona & conversational variation

The Architect must feel like *one recognizable human* across every session, not a
different bot each time — but the fix is not a tone randomizer (that reads as
*unstable*, which is worse). The rule:

> **Consistent character. Varied expression. Invariant judgment.**

Three layers, mapping onto the tooling-first split:

- **Character** (who it is) — *never varies.* A fixed persona prompt: a senior
  presentation architect, opinionated about structure, economical, warm but not
  soft; structural metaphors ("through-line," "load-bearing," "the spine"); never
  hype / emoji / filler / "Great question!"; always references what you already
  said. This is what makes it feel like *one* person you build rapport with.
- **Judgment** (the onboarding questions, the structure logic, the component
  picks) — *deterministic*, per the tooling-first pipeline above. Trustworthy and
  offline-capable.
- **Expression** (wording, framing, what it reacts to) — *fresh every turn.* This
  is the SLM's only job, so variation is **free** wherever a model is present.

The humanizing signal is **reaction, not rewording.** "A board update asking for
$4M — those live or die on momentum before the ask" feels human because it
*listened*; synonym-shuffling feels robotic. So variation is driven by the user's
specifics + session memory, never by a tone generator.

**Beats, not lines.** Each conversational step is a *beat* —
`{goal, must-extract, deterministic-facts, escape, exemplars[]}` — that the model
realizes fresh from `persona + goal + facts + session memory`. The orchestrator
fixes *what* is asked and *what* is built; only the wording samples (bounded
temperature). So variation can never drift into asking the wrong thing or
inventing a component — character and judgment stay pinned while expression
varies. The onboarding flow in **Appendix A is one *performance* of the beats**,
not the canonical lines.

**Per-tier variation:**
- *Model present:* generated, conditioned on specifics + session memory, bounded.
- *Zero-model floor:* phrasing pools + slot-filling the user's real answers
  (rotated openers, several frames per beat). Repetition risk is highest here —
  the documented cost of running with no model — mitigated by pool variety and by
  the specifics doing the heavy lifting (retrieval still runs, so even templated
  lines reference *their* deck).

## 5. On-device model stack — tiered, with a hard consistency split

**Confirmed strategy**: built-in browser Prompt API as default where present,
Transformers.js as the portable fallback, WebLLM as the power-user opt-in.
Refined into a ladder behind one adapter:

- **Embeddings — *always* Transformers.js `bge-small-en-v1.5`** (~50MB, WASM,
  universal). This **pins the consistency-critical surface** (onboarding
  retrieval, "which component fits") to one model for 100% of users. *Which
  components the Architect surfaces is identical for everyone.* Generation tiers;
  retrieval does not.
- **Generation — feature-detected ladder:**
  1. **Built-in Prompt API** (Chrome → Gemini Nano, Edge → Phi). Zero site bytes
     (browser owns the weights), fast. **Must be runtime-detected
     (`await LanguageModel.availability()`), never assumed** — it is hardware/
     disk-gated, may be undownloaded, and can be enterprise-disabled even on
     Chrome/Edge.
  2. **Transformers.js generation** (small ONNX, WebGPU when available, WASM
     otherwise) — portable fallback; WASM generation is functional but slow.
  3. **WebLLM** (Qwen2.5-1.5B q4f16, ~1GB; Llama-3.2-3B quality tier) — explicit
     **power-user opt-in download**, WebGPU-only.
  4. **Deterministic templated floor** — if every model tier is unavailable or
     declined, the Architect still works as a linter/recommendation panel with
     templated phrasing. **Never a dead Architect.**

Design rules that keep the tiers coherent:

- **One internal `ArchitectModel` adapter** — `complete(messages, {json})` +
  `embed(text)`. App code never branches on backend; the ladder lives behind it.
- **Prompts target the weakest tier** — short, single-intent, structured JSON —
  so they run on Gemini Nano/Phi; stronger models just execute them better.
- **Optional progressive enhancement**: Chrome/Edge **Rewriter/Summarizer**
  built-in APIs can power quick-actions like "tighten this prose" for free where
  present. Not load-bearing.

**"Different experiences?" — honest answer:**

| Axis | Varies? | Handling |
|---|---|---|
| Phrasing / tone | Yes (Nano ≠ Phi ≠ Qwen) | Acceptable — wording only |
| Latency | Yes (Prompt API fast, WASM slow) | Tier-gated streaming UX |
| **What the Architect knows & can do** | **No — identical** | Guaranteed by §4 tooling-first |

## 6. Export — all three from phase 1 (confirmed), with honest fidelity

- **Markdown** — perfect; it is the source.
- **PDF** — high-fidelity **print-to-PDF** via a one-slide-per-`@page` print
  stylesheet over the rendered slides. **Not byte-identical** to the puppeteer/
  marp-cli pipeline (headless Chrome is impossible in-browser); it is a
  browser-render of the same HTML/CSS, which is high but not pixel-locked
  fidelity. State this in the UI.
- **PowerPoint** — **image-slides**: rasterize each rendered slide to PNG
  (foreignObject/canvas) and assemble with **PptxGenJS** as full-bleed slide
  backgrounds. Editable *container*, **non-editable image content**. True
  editable-text PPTX is not realistic from this engine; the UI must say so.

Export honesty is a UX requirement, not a footnote — surface the fidelity
tradeoff at the export action.

## 7. Where it lives / what ships

- A **`docs/`-site app**, new top-level Astro route, reusing the playground
  bundle + runtime. **It does not enter the npm tarball** (`@slidewright/lattice`
  `files` allowlist stays as-is; the Drawing Board is a documentation-site asset
  like the playground). No bloat to the published engine.
- Reuses, does not fork: `components.json`, `lib/authoring/lint.js`, the
  playground engine IIFE, the runtime bundle, the theme CSS files.

## 8. Risks & open hard parts

- **Built-in Prompt API availability is flaky** even on Chrome/Edge → mandatory
  runtime detection + graceful fall-through (handled by the ladder).
- **WebLLM first-load is ~1GB** → strictly opt-in, with a deliberate
  "summoning the Architect" download experience; never blocks core authoring.
- **Filmstrip preview** is the one genuinely new render-surface piece vs. the
  single-specimen playground; needs slide-index ↔ source-line mapping.
- **PDF/PPTX fidelity** is bounded by what a browser can do without headless
  Chrome; mitigated by honest UI framing, not by pretending parity.
- **IndexedDB durability** — browsers can evict; offer explicit "export deck"
  and consider `navigator.storage.persist()`.

## 9. Phased plan

> **Phase 1 — ✅ COMPLETE** (branch `claude/github-pages-slide-editor-6zJe3`,
> PR #79). All six slices shipped and gate-green. Spec + final state:
> `engineering/decisions/2026-06-07-drawing-board-phase-1-plan.md`.
>
> **Phase 2 is specced in full** in
> `engineering/decisions/2026-06-08-drawing-board-phase-2-plan.md` — the
> `ArchitectModel` adapter, the embeddings + Prompt-API + WebLLM tiers, chat
> history, and the model-fed onboarding/findings, slice-by-slice. **Start there
> to resume.**

- **Phase 1 — Walking skeleton (no LLM):** the Drawing Board route, 3-panel shell + rail,
  CodeMirror editor wired to the playground engine, **filmstrip preview with
  synced scroll**, IndexedDB decks + checkpoint history, MD/PDF/PPTX export, and
  a **deterministic Architect panel** (linter findings + catalog retrieval +
  quick actions) with the templated floor — *fully useful with zero model*.
- **Phase 2 — the Architect gets a voice:** `ArchitectModel` adapter + embeddings
  (Transformers.js) + built-in Prompt API tier; conversation-first onboarding;
  chat history.
- **Phase 3 — Heavier tiers & polish:** WebLLM power-user tier, focus edit modes
  for Mermaid/math, Rewriter/Summarizer quick-actions, responsive/mobile pass.

Phase 1 is independently shippable and proves the architecture before any model
weight is downloaded.

## 10. Open questions

- **Naming** — *resolved.* Product **Drawing Board** (mark; *the Drawing Board* in
  prose); assistant **Architect** (voiced *the Architect*; **Frame** reserved as
  fallback; formal *The Architect* available for a heavier register).
- **Route + nav**: `/drawing-board` (or a shorter `/draw`)? Still open is *how
  prominently* it's surfaced vs. the playground/docs, not the slug.
- **Onboarding depth** — *resolved (Appendix A):* three questions max
  (*what · who · the one outcome*), each skippable, scaffold only on approval.
- **Conversational voice** — *resolved (§4 "Persona & conversational
  variation"):* fixed persona, beat-driven generation; consistent character,
  varied expression, invariant judgment.
- **Storage-eviction stance**: prompt for `persist()`, or rely on explicit
  export as the durability guarantee?

## Appendix A — Onboarding flow (one performance of the beats)

This is an *exemplar*, not the canonical script — the Architect improvises each
take from the persona + beats (§4 "Persona & conversational variation"). What is
fixed: **three questions max** (*what · who · the one outcome*), each escapable
via "I'll just start writing →", and the deck is **scaffolded only on explicit
approval**.

**Beat 1 — what (cold open / empty state).** Goal: deck type + topic.
> "I'm the Architect. Before we open the editor, tell me what you're building and
> I'll lay out the structure — the through-line, the load-bearing slides, the
> order. Two minutes, then we author. *What are you presenting?*"
>
> chips: `Board update` · `Investor pitch` · `Strategy / proposal` ·
> `Product / project review` · `Something else…` — or **I'll just start writing →**

**Beat 2 — who (the audience).** Goal: audience + decision-maker. Realized fresh,
reacting to Beat 1 — e.g. for a $4M board ask: *"Who's deciding — the full board
or a committee? If it's the board, we lead with the ask early; their time is
short and they've read the pre-read."* Escape: **assume a senior audience →**.

**Beat 3 — the one outcome (the keystone).** Goal: the single result the deck must
earn. *"Last one, and it's the important one. What's the single outcome you need
when you close? One sentence — the thing every slide has to earn."* Offers
`Help me find it` (one clarifying question, then a candidate outcome) and
**Skip — I'll set the spine later →**.

**Beat 4 — synthesis (the payoff).** Retrieval over `components.json` has resolved;
the Architect maps the brief to a *real* component outline and explains the logic,
e.g. for the board/$4M case:
> Title (ask in the subtitle) → `kpi` (where we are) → `roadmap` (the trajectory)
> → `decision` (the ask) → `matrix-2x2` (risks vs. mitigations) → `key-insight`
> (the close). "Set in cuoio — switch anytime."
>
> **`Build this outline →`** · `Tweak it first` · `Start blank instead`

On **Build**, the editor populates with the scaffolded skeletons, the filmstrip
renders, the chat docks to the side, and the Architect hands off to the first
recommendation (*"slide 4 is your ask — let's make it the strongest in the deck"*).

**Branches:** "just start writing" → blank deck, docked one-line offer; pasted
markdown → skip to "restructure into components, or keep your structure and just
advise?"; returning user → "pick up [deck] or start new?" (onboarding runs for
*new* only); vague input → sensible general outline, stated as such.

**Zero-model floor:** same three questions as fixed prompts (Beat 3 stored
verbatim), retrieval still runs, Beat 4 becomes a templated outline keyed to the
deck type. Loses the tailored framing + the "draft the ask" offer; keeps the
questions, a real component outline, and the scaffold. Never a dead end.
