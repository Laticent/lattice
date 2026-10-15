# Fuoco

**One focus for every view of a document.**

An editor, an outline, a preview and a minimap are four views of one document, and each needs
to know where the reader is. Wire them to each other and every new view multiplies the echo
loops. Fuoco gives them one focus hub instead: views **report** facts, **ask** for moves, and
**hear** only the changes they care about.

*Fuoco* is Italian for "focus". It knows nothing about what a document is. You hand it an
**outliner** that cuts text into units and parts: slides, chapters, timed cues, functions,
notebook cells. It is framework-free with zero dependencies; React is an optional adapter.

Live demo: `/fuoco` on the docs site. Design and
measurements: `engineering/decisions/2026-10-15-fuoco-focus-sync.md`.

## Install

```sh
npm i @laticent/fuoco
```

React is an optional peer, needed only for `@laticent/fuoco/react`.

## Sixty-second start

```ts
import { byHeadings, createFocusHub, createTextOutliner, revealOffset } from '@laticent/fuoco';

// One hub per document. The outliner says what a unit and a part are: here, `#` and `##`.
const hub = createFocusHub({ outliner: createTextOutliner(byHeadings({ unit: 1, part: 2 })) });

// The editor reports what it knows: its text, and its caret.
editor.onChange((text, span) => hub.update(text, { span, by: 'editor' }));
editor.onCaret((head) => hub.report('editor', { head }));

// …and moves when another view navigates. It never hears its own moves.
hub.subscribe(
  (f) => f,
  (f) => { if (f.cause === 'nav' || f.cause === 'pick') editor.reveal(revealOffset(hub.outline()!, f)); },
  { ignoreOrigin: 'editor', equals: (a, b) => a.seq === b.seq },
);

// The outline asks for moves, and redraws only when the focused part changes, once a frame.
outline.onPick((unitIndex, part) => hub.go('outline', { unitIndex, part }));
hub.subscribe((f) => f.flat, (flat) => outline.highlight(flat), { lane: 'frame' });
```

In React, a component re-renders only when the value it selects changes:

```tsx
import { useFocus } from '@laticent/fuoco/react';
const flat = useFocus(hub, (f) => f.flat);
```

## The model

A document is text cut into **units**, and each unit into one or more **parts**. Units carry
stable ids that survive edits; parts are addressed by their position inside a unit. A **flat**
number counts parts across the whole document, which is what a reader counts.

| Domain | Unit | Part |
|---|---|---|
| A Markdown document | `#` section | `##` heading |
| A slide deck (Lattice) | authored slide | rendered slide (heading split) |
| A transcript | timed cue | — |
| A code file | top-level function or class | method |
| A notebook | cell | output |

An **outliner** turns text into an `Outline` and keeps it current:

```ts
interface Outliner { update(prev: Outline | null, text: string, opts?: { span?: EditSpan }): Outline }
```

It must return `prev` itself when the text is unchanged. Fuoco ships one for plain text,
`createTextOutliner({ units, parts?, dropEmpty? })`, with three splitters:

- `byPattern(/^\[\d\d:\d\d\]/)`: every line the pattern matches opens a unit.
- `byHeadings({ unit: 1, part: 2 })`: Markdown ATX headings, fenced code skipped.
- `byBlankLines()`: paragraphs.

A host with its own parser writes its own outliner. The exported helpers do the bookkeeping:
`carryIds` keeps ids through an edit, `diffSpan` finds the edit when the editor does not say,
`nextUnitId`, `nextRevision` and `partBaseOf` finish the outline. Lattice's slide outliner
(`docs/src/lib/deck-outline`) is one of these. It re-parses only the slides an edit touched and
matches ids inside that region itself, drawing them from the shared `nextUnitId`.

## The hub

| Call | What it does |
|---|---|
| `update(text, { span?, by?, duringRender? })` | Feed the text. Returns the outline revision; equal text is a no-op. |
| `report(origin, { head, anchor?, line?, rev?, quiet? })` | A view's caret moved. A report against an older `rev` is dropped. `quiet` marks the caret move a reveal made. |
| `reportUnit(origin, { unitIndex, part? })` | A view without offsets (a form, a card editor) says which unit it is on. |
| `go(origin, target, { after? })` | Navigate to `{ unit }`, `{ unitIndex, part }` or `{ flat }`, optionally a `page`. With `after`, wait for exactly that text. |
| `step(origin, 'next' \| 'prev' \| 'first' \| 'last', { view?, pages? })` | Pages of the rendering first, then parts, then units. `view` limits it to the units a filtered view shows. |
| `pages(origin, { unit, part, count, shown, canSplit? })` | The rendering view reports how many pages the focused part has. |
| `pick(origin, { unit, start, end, kind })` | A rendered element was picked; its source span becomes the selection. |
| `subscribe(select, listener, { lane?, ignoreOrigin?, equals? })` | Hear changes to `select(focus)`, on a lane. Returns an unsubscribe. |
| `get()` · `outline()` · `stats` · `flush()` · `cancelWaiting()` | Read the focus and outline, count publications, drain lanes (tests), drop a waiting step. |

`Focus.cause` says what moved it: `caret`, `nav`, `page`, `pick`, `edit`, `load` or `report`.
An editor reveals on `nav` and `pick`, and leaves its own caret alone on the rest.

**Lanes.** `sync` delivers at once, for state. `frame` (the default) delivers the latest focus
once per animation frame, for DOM work: a held key that crosses three parts in a frame moves a
view once. `idle` delivers when the browser is idle, for saving and presence. Pass a
`scheduler` to `createFocusHub` to run the lanes somewhere other than a browser.

## The guarantees

| Guarantee | Mechanism |
|---|---|
| A view never hears its own move | Each publication names its `origin`; subscribe with `ignoreOrigin`. A reveal's caret is reported `quiet`, so the hub agrees and publishes nothing. |
| A late answer never moves anyone | A report carries the `rev` it was computed against; an older one is dropped. |
| Nothing re-enters | A publication made during a delivery is queued until the delivery ends. |
| No timers | "Insert a unit, then go to it" waits for that exact text (`go(…, { after })`). |
| A list keyed by id does not remount on typing | Unit ids carry through edits; a duplicate gets a new one. |
| A subscriber runs only when its value changes | `select` + `equals`, checked per publication. |

## Tests

`hub.test.ts` drives a model (an editor, a rail and a preview) through random typing, caret
moves, rail picks, steps, deletions and late reports, and checks after every action that all
three agree. Each property has a **failing arm**, the same property run against a deliberately
broken hub, which must go red. Raise the run count with `FUOCO_RUNS=5000`.
`text-outline.test.ts` covers the splitters, id carrying and the change span.
`deck-outline.test.ts` holds Lattice's incremental outliner to a full build on every committed
deck.

## Boundaries

The core imports nothing outside this folder, and only `react.ts` imports React
(`checkFuocoBoundary` in `tools/check-ownership.js`). `npm run fuoco-lib:build` builds the
package; `npm run check:fuoco` (in `docs/`) typechecks the core on its own.
