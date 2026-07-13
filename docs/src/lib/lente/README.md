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

// What a reader sees under the "brief" lens — a subset, in author order:
const brief = lensSlides(slides, registry, 'brief');

// The lenses a reader may actually pick (full + every APPROVED, non-empty, visible lens):
const pickable = readerLenses(slides, registry);

// A scoping lens fails CLOSED — never a silent full-deck fallback:
const view = lensEligibility(slides, registry, 'brief');
if (view.status === 'ok') render(view.pairs);
else showUnavailable(view.reason);   // 'unapproved' | 'drifted' | 'empty' | 'hidden' | 'unknown'
```

## The two paths never touch

- **Read** (`project.ts`) computes a reader's view from approved tags + the registry. It **cannot
  import the suggester** — a boundary the build gate enforces.
- **Suggest** (`suggest.ts`) is a transparent rule table over each slide's `_class`. It returns
  *proposals* and writes nothing.

The only bridge is a human pressing **Approve** in the Studio, which writes the tags and stamps a
**content hash** (`approved: "sha256:…"`) covering exactly what the reader would see. Any later edit,
reorder, or hand-forgery changes the hash, so the lens **de-approves itself** — for every consumer
(editor, export, share link, headless), not just the Studio picker.

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
| `suggest.ts` | the suggest path — the no-AI heuristic rule table (a separate module) |
| `validate.ts` | `unknownLensTokens`, `validateRegistry`, `rebaseLensTags` |
| `hash.ts` | a pure, dependency-free SHA-256 (deterministic in Node + browser) |
| `index.ts` | the curated public surface |

Everything is covered by co-located `*.test.ts` (vitest), including the caption-coupling invariant
(`lensPairs` is a predicate filter, so author indices stay unique and monotonic) and the
registry round-trip (`parseLensRegistry(emitRegistry(x))` ≡ `x`).
