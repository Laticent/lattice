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
> [`engineering/decisions/2026-07-13-lente-reader-lenses.md`](https://github.com/Laticent/lattice/blob/main/engineering/decisions/2026-07-13-lente-reader-lenses.md).

## Install

```sh
npm i @laticent/lente
```

## 60-second start

A deck declares its lenses in front matter, and each slide opts in with a comment tag:

```md
---
title: Q3 review
lenses:
  brief: { label: "Bottom line", base: none }
---
<!-- _lens: brief -->
# Q3 in one line
---
# Context
---
<!-- _lens: brief -->
# Revenue up 12%
```

```ts
import { approvalHash, lensEligibility, lensSlides, parseLensRegistry, readerLenses, upsertLensRegistry } from '@laticent/lente';

const slides = splitDeckIntoSlides(body);       // your own `---` splitter: one string per slide
const registry = parseLensRegistry(frontMatter); // the text between the `---` fences

// AUTHOR PREVIEW only: the slides "brief" WOULD show, ignoring approval. Never show this to a reader.
lensSlides(slides, registry, 'brief');          // slides 0 and 2

// What a READER sees always goes through the eligibility gate, which fails CLOSED:
lensEligibility(slides, registry, 'brief');     // { status: 'unavailable', reason: 'unapproved' }

// A human looked at that view and said yes: stamp it, and write the front matter back.
registry.lenses.find((l) => l.id === 'brief')!.approved = approvalHash(slides, registry, 'brief');
const saved = upsertLensRegistry(frontMatter, registry);
// lenses:
//   brief: { label: "Bottom line", base: none, approved: "sha256:9456ad8a…" }

const view = lensEligibility(slides, parseLensRegistry(saved), 'brief');
if (view.status === 'ok') render(view.pairs); // [{ slide, index: 0 }, { slide, index: 2 }]
else showUnavailable(view.reason);            // 'unapproved' | 'drifted' | 'empty' | 'hidden' | 'unknown'

// The lenses a reader may pick: full, plus every approved, non-empty, visible lens.
readerLenses(slides, parseLensRegistry(saved)); // [full, brief]
```

Edit slide 2 after approving (say, 12% becomes 14%) and the same call returns
`{ status: 'unavailable', reason: 'drifted' }` until someone approves the new view.

### Or chain it — the `lens()` front door

For call-sites that would otherwise thread `(slides, registry, lensId)` through every call, `lens()`
collects them once and you pick a terminal. It is **pure sugar over the read path** — each terminal
is exactly the matching `project.ts` function, guarded by a parity test — so it stays fail-CLOSED and
adds no behavior:

```ts
import { lens } from '@laticent/lente';

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
- **Suggest** (`suggest.ts`) is a transparent rule table over each slide's class. It reads `_class` comments by default; a host with the engine passes its own reader as `suggestMembership`'s fourth argument (`classOf`), and the Studio passes the engine's, so a `@meta{layout=…}` record counts too. It returns
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

Lente ships no lenses of its own except `full`. A host passes its defaults as the second argument,
`parseLensRegistry(frontMatter, workspace)`, and a deck's `lenses:` block overrides them lens by lens.
The table is the set Lattice's Studio offers; its "Default reader views" setting starts every deck
with two of them, `brief` and `evidence`. The suggester (`suggestMembership`) has a rule for each of the four below `full`:

| Lens | Base | Kind | Serves | Suggests |
|---|---|---|---|---|
| `full` | — | rung (top) | the whole case; the safe default | identity (every slide) |
| `brief` | none | **rung** | bottom-line / TLDR / exec summary / so-what | bookend frame · assertions · headline metrics |
| `ask` | none, single | cut | the ask | one slide: the CTA / decision / top metric — or none |
| `story` | none | cut | story / problem statement | anchors (incl. dividers) · the journey · the problem setup |
| `evidence` | all | **rung** | technical depth (the auditor) | everything substantive; drops decoration / logistics / dividers |

Membership is a **diff from the base**: a `base:none` lens carries an include token
(`<!-- _lens: brief -->`) only for members; a `base:all` lens carries a `-`exclude
(`<!-- _lens: -evidence -->`) only for non-members. Slides stay clean.

## Depth — rungs and cuts

Views are two different kinds of thing, and only one has a "deeper". **Rungs** are
altitudes in one containment-checked chain (`brief` ⊂ `evidence` ⊂ `full`): each
contains the one below, so climbing is guaranteed *additive* and a reader never
loses a slide they just read. **Cuts** are arbitrary subsets — `ask`, `story` — with
no order and no containment; you land on a cut or you are handed one.

```ts
import { ladderRungs, validateLadder, deeperLens } from '@laticent/lente';

ladderRungs(slides, registry);            // [brief, evidence, full] — narrowest first
validateLadder(slides, registry);          // [] when every rung contains the one below

// The read-path primitive a "go deeper" affordance is built on. Fails CLOSED: it
// returns the next rung that is reader-eligible AND strictly contains the current
// view, stepping over one that is neither — and `undefined` from a cut, from
// `full`, and whenever nothing honest is available.
deeperLens(slides, registry, 'brief');
```

`kind: 'rung'` on a `LensDef` declares an altitude; **absent means `cut`**, so a
view that never claimed to nest promises nothing. Altitude itself is *derived* from
what each rung projects, not declared — `order` is a picker position and
deliberately not this. Design note:
[`2026-08-25-lens-view-defaults-and-depth.md`](https://github.com/Laticent/lattice/blob/main/engineering/decisions/2026-08-25-lens-view-defaults-and-depth.md) §4.

## Where things live

| File | Role |
|---|---|
| `types.ts` | the shared type surface |
| `tags.ts` | per-slide `_lens` tag parse + `applyTag` writer |
| `registry.ts` | the front-matter `lenses:` block parse / emit / upsert (Lente is the sole writer) |
| `project.ts` | the read path — `lensPairs`/`lensSlides`/`lensIndices`, `readerLenses`, `approvalHash`, eligibility, and the ladder (`lensKind`, `ladderRungs`, `lensEscapees`, `deeperLens`) |
| `builder.ts` | the fluent `lens()` front door — a pass-through over `project.ts` (read-path only) |
| `suggest.ts` | the suggest path — the no-AI heuristic rule table (a separate module) |
| `validate.ts` | `unknownLensTokens`, `validateRegistry`, `validateLadder`, `rebaseLensTags` |
| `hash.ts` | a pure, dependency-free SHA-256 (deterministic in Node + browser) |
| `index.ts` | the curated public surface |

Everything is covered by co-located `*.test.ts` (vitest), including the caption-coupling invariant
(`lensPairs` is a predicate filter, so author indices stay unique and monotonic) and the
registry round-trip (`parseLensRegistry(emitRegistry(x))` ≡ `x`).

## License

AGPL-3.0-only. The full text ships as `LICENSE` in the package.
