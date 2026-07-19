# Lente

**Read one deck at the altitude the reader chose — but only ever a view a human approved.**

A deck is written once. Different readers open it for different jobs: the executive wants the
bottom line, the auditor wants the data, the skeptic wants the story. Lente projects the *same*
source at the altitude a reader picks. Membership lives on each slide as an **author-approved**
comment tag; a deterministic, no-AI suggester only *proposes* — nothing a machine suggested reaches
a reader until a human has looked at that reader's actual deck and said yes.

It is **framework-free** (imports nothing but its own folder), **zero-dependency**, and **has no
DOM** — the whole thing is a pure function from `(slides, registry, lensId)` to an ordered slide
subset.

> The full design contract, the communication-science grounding, the adversarial review that shaped
> it, and the human-in-the-loop guarantee live in
> [`engineering/decisions/2026-07-13-lente-reader-lenses.md`](../../../../engineering/decisions/2026-07-13-lente-reader-lenses.md).

## 60-second start

```ts
import { parseLensRegistry, lensSlides, readerLenses, lensEligibility } from './lente/index.js';

const slides = splitDeckIntoSlides(source);          // your `---`-splitter
const registry = parseLensRegistry(frontMatterText); // the deck's `lenses:` block

// AUTHOR-PREVIEW only — the members the "brief" lens WOULD show, ignoring approval.
// Never render this to a reader; it is the editor's "what does this lens contain?" view:
const briefPreview = lensSlides(slides, registry, 'brief');

// What a READER sees — ALWAYS through the eligibility gate, which fails CLOSED
// (never a silent full-deck fallback):
const view = lensEligibility(slides, registry, 'brief');
if (view.status === 'ok') render(view.pairs);
else showUnavailable(view.reason);   // 'unapproved' | 'drifted' | 'empty' | 'hidden' | 'unknown'

// The lenses a reader may actually pick (full + every APPROVED, non-empty, visible lens):
const pickable = readerLenses(slides, registry);
```

### Or chain it — the `lens()` front door

For call-sites that would otherwise thread `(slides, registry, lensId)` through every call, `lens()`
collects them once and you pick a terminal. It is **pure sugar over the read path** — each terminal
is exactly the matching `project.ts` function, guarded by a parity test — so it stays fail-CLOSED and
adds no behavior:

```ts
import { lens } from './lente/index.js';

const view = lens(slides).registry(frontMatterText).pick('brief').project();
if (view.status === 'ok') render(view.pairs);

const brief    = lens(slides).registry(registry).pick('brief').slides();   // === lensSlides(…)
const pickable = lens(slides).registry(registry).pickable();               // === readerLenses(…)
```

Read-path only by construction: `lens()` never imports the suggester and has **no `.approve()` /
`.suggest()` verb** — the human-Approve gate is still the only bridge from a proposal to a reader.

## The two paths never touch

- **Read** (`project.ts`) computes a reader's view from approved tags + the registry. It **does not
  import the suggester** — a boundary kept by construction (the read module simply never references
  `./suggest`). It is a convention, not a CI-enforced gate.
- **Suggest** (`suggest.ts`) is a transparent rule table over each slide's `_class`. It returns
  *proposals* and writes nothing.

The only bridge is a human pressing **Approve** in the Studio, which writes the tags and stamps a
**content hash** (`approved: "sha256:…"`) over an injective encoding of exactly what the reader would
see. **What the hash does and does not do:** it binds the reader-visible content, so any later edit,
reorder, or retag **de-approves the lens** at read — for every consumer (editor, export, share link,
headless), not just the Studio picker. It is an *unkeyed* SHA-256, so it detects **drift**, not
**forgery**: an actor that can already write the deck source can recompute a matching digest. The
human-in-the-loop assurance is the **Approve gate itself** (a person looked and clicked), not a
cryptographic property of the hash.

## The default lenses

| Lens | Base | Serves | Suggests |
|---|---|---|---|
| `full` | — | the whole case; the safe default | identity (every slide) |
| `brief` | none | bottom-line / TLDR / exec summary / so-what | bookend frame · assertions · headline metrics |
| `ask` | none, single | the ask | one slide: the CTA / decision / top metric — or none |
| `story` | none | story / problem statement | anchors (incl. dividers) · the journey · the problem setup |
| `evidence` | all | technical depth (the auditor) | everything substantive; drops decoration / logistics / dividers |

Membership is a **diff from the base**: a `base:none` lens carries an include token
(`<!-- _lens: brief -->`) only for members; a `base:all` lens carries a `-`exclude
(`<!-- _lens: -evidence -->`) only for non-members. Slides stay clean.

## Where things live

| File | Role |
|---|---|
| `types.ts` | the shared type surface |
| `tags.ts` | per-slide `_lens` tag parse + `applyTag` writer |
| `registry.ts` | the front-matter `lenses:` block parse / emit / upsert (Lente is the sole writer) |
| `project.ts` | the read path — `lensPairs`/`lensSlides`/`lensIndices`, `readerLenses`, `approvalHash`, eligibility |
| `builder.ts` | the fluent `lens()` front door — a pass-through over `project.ts` (read-path only) |
| `suggest.ts` | the suggest path — the no-AI heuristic rule table (a separate module) |
| `validate.ts` | `unknownLensTokens`, `validateRegistry`, `rebaseLensTags` |
| `hash.ts` | a pure, dependency-free SHA-256 (deterministic in Node + browser) |
| `index.ts` | the curated public surface |

Everything is covered by co-located `*.test.ts` (vitest), including the caption-coupling invariant
(`lensPairs` is a predicate filter, so author indices stay unique and monotonic) and the
registry round-trip (`parseLensRegistry(emitRegistry(x))` ≡ `x`).
