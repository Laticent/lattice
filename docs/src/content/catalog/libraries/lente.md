---
kind: library
name: Lente
order: 4
promise: One deck. Every reader gets the view they need, and you approve each one.
intro: Write your deck once, and Lente lets each reader open it at the depth they need — the two-slide bottom line for the executive, the full evidence for the auditor. A person approves every shorter view, and if anyone edits a slide afterward, that view locks until it's checked again.
group: Showing and reading
inLattice: Powers the Studio's reader views and Present-mode picker.
useWhen: Different readers need different views of the same document, and you can't risk anyone seeing a view nobody signed off on.
mark: /lente-mark.svg
facts:
  - { k: Package, v: '@laticent/lente' }
  - { k: Status, v: Coming to npm with Lattice 1.0 }
  - { k: Runs in, v: Anywhere JavaScript runs }
  - { k: Dependencies, v: None }
  - { k: License, v: AGPL-3.0 }
reference:
  - label: The README
    href: https://github.com/Laticent/lattice/blob/main/docs/src/lib/lente/README.md
    note: Tags, the settings block, approval and the full API.
  - label: The read path
    href: https://github.com/Laticent/lattice/blob/main/docs/src/lib/lente/project.ts
    note: The one function readers go through, and every reason it can say no.
  - label: Why we built it
    href: https://github.com/Laticent/lattice/blob/main/engineering/decisions/2026-07-13-lente-reader-lenses.md
    note: The design note — including the automatic summaries it replaced.
  - label: Depth and nesting
    href: https://github.com/Laticent/lattice/blob/main/engineering/decisions/2026-08-25-lens-view-defaults-and-depth.md
    note: How a short view nests inside a longer one.
---

## The problem

You write a 20-slide quarterly review. The CEO wants the three slides that matter. Finance wants every number. A new hire wants the story.

So you either send everyone all twenty slides, or you copy the file three times and keep the copies in step by hand. Neither holds up:

- **Copies drift.** Three files means three places to fix a wrong number, and someone always reads the stale one.
- **An automatic summary isn't a decision.** A rule or an AI model can guess which slides are "the bottom line", but the author never agreed to that view.
- **Approval goes stale silently.** A short view approved on Monday is wrong after Tuesday's edit, and nothing tells the reader.
- **Quiet fallbacks over-share.** When a short view breaks, a naive viewer shows the whole document instead — including slides that were meant to be left out.

## The idea

A **lens** is a named view of the same slides — "Bottom line", "The evidence", "The ask". The document itself is never copied or edited to make one.

- **Each slide says which lenses it belongs to**, in a comment readers never see: `<!-- _lens: brief story -->`. A lens can start empty and add slides, or start with everything and take some out.
- **Approval is a fingerprint.** When a person approves a lens, Lente records a fingerprint of exactly what that reader will see — a short code computed from the content, which changes if a single character changes.
- **It refuses rather than over-shares.** Ask for a lens and you get either its slides or a reason you can't have them: not approved yet, changed since approval, empty, or hidden. It *never* falls back to showing the whole document.
- **It suggests; it never decides.** A separate rule-based helper — no AI, no network — proposes which slides might fit each lens. It writes nothing. A person accepts or rejects.

Some lenses nest: the bottom line sits inside the evidence, which sits inside the full deck, so "go deeper" only ever *adds* slides.

## How to use it

Install the package:

```sh
npm install @laticent/lente
```

> Lente publishes to npm with Lattice 1.0. Until then it lives in the Lattice repository at `docs/src/lib/lente`.

The whole life of a lens in one example — refused, approved, then locked by an edit:

```ts
import { approvalHash, lens, parseLensRegistry } from '@laticent/lente';

// A deck is an array of slide strings. Tags say which lens each slide belongs to.
let slides = [
  '<!-- _lens: brief -->\n# Recommendation: approve $2M',
  '## Cost breakdown, line by line',
  '<!-- _lens: brief -->\n## Revenue +18% this quarter',
];

// The lens settings, as they'd appear in the deck's front matter.
const registry = parseLensRegistry('lenses:\n  brief: { label: "Bottom line", base: none }');

lens(slides).registry(registry).pick('brief').project();
// → { status: 'unavailable', reason: 'unapproved' }   nobody has signed off yet

// A person reviews the two-slide view and approves it: store the fingerprint.
registry.lenses.find((l) => l.id === 'brief').approved = approvalHash(slides, registry, 'brief');
lens(slides).registry(registry).pick('brief').project();
// → { status: 'ok', pairs: [ slide 0, slide 2 ] }

// Someone edits an approved slide afterward: the view locks itself.
slides = [slides[0] + ' (revised)', slides[1], slides[2]];
lens(slides).registry(registry).pick('brief').project();
// → { status: 'unavailable', reason: 'drifted' }
```

| Call | What it gives you |
| --- | --- |
| `lens(slides).registry(r).pick(id).project()` | The reader's view, or the reason there isn't one |
| `parseLensRegistry(frontMatter)` | Reads the `lenses:` settings block |
| `readerLenses(slides, registry)` | Every lens a reader may open right now |
| `approvalHash(slides, registry, id)` | The fingerprint to store when a person approves |
| `lensSlides(slides, registry, id)` | The author's preview, ignoring approval — never show it to readers |
| `suggestMembership(slides, registry, catalog)` | Proposals for which slides fit which lens |

## Where else it fits

Lente reads a list of text sections and a small settings block. It has no interface and no dependencies, so it suits anything split into ordered sections where readers need different subsets:

- **Long reports and memos** with an executive-summary view someone actually signed off on.
- **Course material**: a quick refresher and a full module from one source, where the longer view always contains the shorter.
- **Documents that need sign-off**, where any reduced version must be approved and an edit must void the approval.
- **Site and docs generators** that publish an "overview" and a "deep dive" from one source at build time.
- **Share links that open at a chosen depth**, such as a link that always opens on the bottom line.

## How Lattice uses it

Lente runs inside the **Studio**. Its Lenses panel shows the helper's suggestions, lets the author change which slides belong where, previews each reader's actual deck, and only unlocks Approve after that preview. In **Present** mode, Lente decides which views a viewer may pick. The rendering engine knows the `_lens` tag only so it can strip it from what gets rendered and exported.

## What it doesn't do

- **It catches drift, not forgery.** Anyone who can edit the deck can recompute a fingerprint. The guarantee is that a person approved this view, not cryptographic proof.
- **It doesn't summarize.** It picks and orders whole slides. It never rewrites, shortens or merges them.
- **Its suggestions know Lattice's slide types.** Content without those types still works, but gets no suggestions; tag it by hand.
- **It ships no Approve button.** Lente computes the fingerprint; your app provides the review screen.
