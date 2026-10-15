---
kind: library
name: Fuoco
order: 9
promise: Every view of a document agrees on where the reader is.
intro: An editor, an outline, a preview and a minimap all show one document, and each needs to know where the reader is. Fuoco gives them one place to say it. Each view reports what it knows and asks for moves; the others hear only the changes they care about, and none of them calls another.
group: Showing and reading
inLattice: Keeps the Studio's editor, slide rail and preview on the same slide.
mark: /fuoco-mark.svg
useWhen: Your app shows one document in more than one view — source and preview, a page and its outline, a player and its transcript — and the views keep drifting out of step.
facts:
  - { k: Package, v: '@laticent/fuoco' }
  - { k: Status, v: Coming to npm with Lattice 1.0 }
  - { k: Runs in, v: The browser and Node }
  - { k: Dependencies, v: None (React optional, for the hook) }
  - { k: License, v: AGPL-3.0 }
reference:
  - label: The README
    href: https://github.com/Laticent/lattice/blob/main/docs/src/lib/fuoco/README.md
    note: The model, every call on the hub, the lanes and the guarantees.
  - label: The hub
    href: https://github.com/Laticent/lattice/blob/main/docs/src/lib/fuoco/hub.ts
    note: Reports, moves, stamping and the three delivery lanes, in one file.
  - label: The test suite
    href: https://github.com/Laticent/lattice/blob/main/docs/src/lib/fuoco/hub.test.ts
    note: An editor, a rail and a preview driven through random actions, checked after every one.
  - label: Why we built it
    href: https://github.com/Laticent/lattice/blob/main/engineering/decisions/2026-10-15-fuoco-focus-sync.md
    note: The failures it replaced, the design, and the before-and-after measurements.
---

## The problem

You're writing in an editor with a live preview beside it and an outline down the side. Move the caret, and the preview should show that section and the outline should light it. Click the outline, and the editor should jump there. Each view has to know where the reader is.

The usual way is to wire the views to each other: the editor tells the preview, the preview tells the outline, the outline tells the editor. That works for two views and gets worse with each one you add:

- **Echoes.** The editor moves the preview, the preview reports its new position, and the editor moves again — sometimes to the wrong place.
- **Late answers.** A view finishes working out where the reader is just after the text changed, and moves everyone to a spot that no longer exists.
- **Timers as glue.** "Insert a section, then go to it" waits one animation frame and hopes the text has arrived. Sometimes it hasn't.
- **Copies of the truth.** Each view keeps its own idea of "the current section", and the copies drift. Lattice's editor had about nine copies of the current slide and eight hand-written guards against echoes, and something broke whenever an unrelated change touched them.

## The idea

- **One hub holds the focus.** Where the reader is — which section, which part of it, which page of the preview, where the caret is — lives in one place. Views don't talk to each other.
- **Report, ask, hear.** A view **reports** facts ("my caret is here"), **asks** for moves ("go to section 3"), and **hears** the changes it subscribed to. Every change carries who made it, so a view never hears its own move.
- **Each answer is stamped.** A report says which version of the text it was worked out against. One that arrives after the text changed is dropped instead of applied to the wrong text.
- **It knows nothing about your document.** You give it an **outliner**: a function that cuts your text into units (sections, slides, functions, cues) and parts. Fuoco ships one for plain text and Markdown; a slide deck, a notebook or a code file brings its own.
- **Delivered at the right moment.** Pick a lane per subscription: `sync` for state, `frame` for drawing (a held key that crosses three sections in one frame moves a view once), `idle` for saving.

## How to use it

Install it:

```sh
npm install @laticent/fuoco
```

> Fuoco publishes to npm with Lattice 1.0. Until then it lives in the Lattice repository at `docs/src/lib/fuoco`.

One hub, one document, an outline that follows the editor:

```ts
import { byHeadings, createFocusHub, createTextOutliner } from '@laticent/fuoco';

// One hub per document. The outliner says what a unit and a part are: here, # and ##.
const hub = createFocusHub({ outliner: createTextOutliner(byHeadings({ unit: 1, part: 2 })) });

const text = '# Intro\nHello.\n# Setup\n## Install\nnpm i\n## Run\nnpm start\n';
hub.update(text, { by: 'editor' });

// The outline hears every move except its own; `sync` delivers at once.
hub.subscribe((f) => f.flat, (flat) => console.log('outline highlights part', flat), { lane: 'sync', ignoreOrigin: 'outline' });

// The editor reports where its caret is…
hub.report('editor', { head: text.indexOf('npm start') });   // → outline highlights part 3
// …and the outline asks for a move. It never hears its own.
hub.go('outline', { unitIndex: 0, part: 0 });                // (silent: the outline asked for it)
hub.step('keys', 'next');                                     // → outline highlights part 1
```

In React, a component re-renders only when the value it picks changes:

```tsx
import { useFocus } from '@laticent/fuoco/react';

const flat = useFocus(hub, (f) => f.flat);
```

| Call | What it does |
| --- | --- |
| `update(text, { span? })` | Hands the hub the current text; equal text does nothing |
| `report(view, { head })` | A view's caret moved |
| `go(view, target, { after? })` | Move to a unit, a part or a page; with `after`, wait for exactly that text first |
| `step(view, 'next')` | Next page, then next part, then next unit |
| `subscribe(pick, listener, { lane?, ignoreOrigin? })` | Hear changes to one value, on one lane |
| `createTextOutliner(byHeadings(…))` | The outliner for Markdown; `byPattern` and `byBlankLines` cover cues and paragraphs |

Fuoco guarantees these, and its tests check each one against a deliberately broken hub that must fail:

| Guarantee | How |
| --- | --- |
| A view never hears its own move | Every change names the view that made it |
| A late answer moves no one | A report carries the text version it was worked out against |
| Nothing re-enters | A change made while others are being told is queued until they're done |
| No timers | `go(…, { after })` waits for exactly the text it names |
| A list doesn't remount as you type | Units keep their ids through edits |

## Where else it fits

- **Editor and preview**: Markdown, LaTeX, slides — the caret drives the preview, and a click in the preview selects the source.
- **Long pages and their outline**: docs sites, books and notes, where the page and its table of contents must point at the same heading.
- **Media and transcripts**: a player, a transcript and a chapter list, with timed cues as the units.
- **Code tools**: a file, its symbol outline and a minimap, with functions and classes as the units.
- **Notebooks**: cells as units and their outputs as parts.
- **Following someone**: a collaborator's cursor is one more view reporting to the hub — follow it, or don't, with nothing new to wire.

## How Lattice uses it

In the Studio, Lattice's editor in the browser, the Markdown editor, the slide rail, the slide counter and the live preview all report to one Fuoco hub, through an outliner that cuts a deck into slides. It replaced the eight hand-written guards the editor had, and made the Studio faster to use. Measured on a 123-slide deck, same machine, before and after:

| Interaction | Before | With Fuoco |
| --- | --- | --- |
| Arrow key along a line | 24 ms | 16 ms |
| Change slide, rail updates | 25 ms | 15 ms |
| Change slide, preview updates | 49 ms | 36 ms |
| Click in the rail | 76 ms | 48 ms |
| Typing, per key | 72 ms | 60 ms |

About 16 ms is the floor: one frame of the screen. The Lattice engine and its command-line tool don't use Fuoco.

## What it doesn't do

- **It doesn't parse your document for you** beyond plain text and Markdown headings. A format of your own needs an outliner, and the built-in one re-reads the whole text on each change — fine into the hundreds of kilobytes, but a very large document wants its own.
- **It doesn't move anything on screen.** It tells each view where to be; scrolling the editor or highlighting the outline is the view's job.
- **It doesn't save or share the focus.** It holds where one reader is, in one tab. Remembering it, or showing it to others, is your app's job — the `idle` lane is the place to do it.
- **It's one hub per document.** Two documents side by side get two hubs, and Fuoco won't relate a place in one to a place in the other.
