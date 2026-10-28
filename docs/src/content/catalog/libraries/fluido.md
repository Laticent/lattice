---
kind: library
name: Fluido
order: 12
promise: Content takes the shape of any box, and breaks only where it may.
intro: Give Fluido the facts about a rendered slide and the box it is shown in, and it decides what the slide becomes. It stays one page, or it breaks into one element per page, along a seam the content declares, opening on a cover and closing on a note page when the slide has them. It also cuts a single over-budget element, such as a long code block, into runs. It reads no markup and draws nothing, so every surface that asks gets the same answer.
group: Showing and reading
inLattice: Decides which slides split, on which seam, and how many pages each becomes, in the export and every live preview.
mark: /fluido-mark.svg
useWhen: The same content has to read well in boxes of very different shapes, and you need one rule, shared by every surface, for when it reflows and when it breaks onto the next page.
facts:
  - { k: Package, v: '@laticent/fluido' }
  - { k: Status, v: Coming to npm with Lattice 1.0 }
  - { k: Runs in, v: 'The browser, Node and workers' }
  - { k: Dependencies, v: None }
  - { k: License, v: AGPL-3.0 }
reference:
  - label: The README
    href: https://github.com/Laticent/lattice/blob/main/docs/src/lib/fluido/README.md
    note: The model, every call, the page cap and the cost.
  - label: The plan
    href: https://github.com/Laticent/lattice/blob/main/docs/src/lib/fluido/plan.ts
    note: The decision order, the size gate and the budget rescue, in one file.
  - label: Why we built it
    href: https://github.com/Laticent/lattice/blob/main/engineering/decisions/2026-10-27-fluid-layout-library.md
    note: The audit of five paginating paths, the design, and what the adversarial review changed.
---

## The problem

A deck is written once and shown in boxes of every shape: a 16:9 projector, a square social
post, a phone held upright. A list of eight points fits a wide slide and clips on a phone. The
usual answers each give something up:

- **Shrink the text** until it fits. On a phone it shrinks past the point anyone can read it.
- **Clip and scroll.** A slide is not a web page; a reader in a meeting cannot scroll the
  projector.
- **Paginate by measuring.** Cut wherever the box runs out. Now the page count depends on the
  fonts and the browser, so the same deck becomes a different deck on another machine, and
  nothing that does not render it, a linter or an AI assistant, can say what it will become.

## The idea

Fluido keeps two questions apart. **Where may the content break?** The content says so: every
component declares its seam, such as between list items, table rows or panes. **Does it break
here?** The box says so: a wide box never breaks, and the other shapes break on the seam, one
element to a page, with a cover when the slide has a heading and a closing page when it has a note.

Because the seam is a fact about the content, the decision is too. Fluido reads no markup and
measures nothing: the host hands it the facts and builds the pages it names. The same facts give
the same pages on every machine.

Some content is one element that is simply too long, like a 40-line code block. For that Fluido
has a **budget rescue**: it cuts the one element into runs of at most its budget, 12 lines a page
for code. Files use the budget, so they stay reproducible.

## How to use it

```ts
import { paginates, planSlide, rescueRuns } from '@laticent/fluido';

// The size gate: only a wide box keeps everything on one page.
paginates('wide');  // false
paginates('tall');  // true

// What a slide becomes. Pass the seam up front, or a reader Fluido calls only if it needs it.
const move = planSlide({ enrolled: true }, () => ({ seam: 'item', members: 6 }));
// { kind: 'paginate', seam: 'item', perPage: 1, envelope: true }  → 6 pages, plus a cover and a closing page if it has them

// A component with its own recipe is asked first; if the recipe declines, ask again.
planSlide({ enrolled: true, recipe: { strategy: 'cover-rows', shapeReader: true } });
// { kind: 'recipe', strategy: 'cover-rows' }

// One element over its budget: a 34-line code block, 12 lines a page.
rescueRuns(34, 12);
// [{ from: 0, to: 12 }, { from: 12, to: 24 }, { from: 24, to: 34 }]
```

A slide stays whole, with a reason, when the author opts out, when it has no seam, when its one
recipe vetoes a cut, or when it has a single member. And every run the host builds is checked with
`fitsCap(pages)`: past **64 pages** the slide stays whole and is marked, however the run was built,
so a runaway or forged seam can never cost a reader thousands of pages.

## Where else it fits

- A document viewer that shows the same report on a laptop and a phone.
- A print layout that has to break a long table on its rows and nowhere else.
- A kiosk or a signage screen whose shape you do not know until it boots.

## How Lattice uses it

Every surface that splits a slide asks Fluido: the command-line export, the Playground and the
Studio preview. The move into Fluido changed no output: 402 decks at three sizes split byte for
byte as before, and a golden of 7,347 pages keeps it that way. Fluido's decision takes about 23
nanoseconds; building the pages it names takes about 0.2 milliseconds each.

## What it doesn't do

- **Not measurement, yet.** The live screens will add a measured rescue for an element that still
  overflows its own page; files will keep the budget. Both are later phases of the design.
- **Not the box.** Fluido decides from the box's shape class; the box itself comes from the page
  that shows it.
- **No shrinking.** A page that still does not fit is marked, never scaled down.
