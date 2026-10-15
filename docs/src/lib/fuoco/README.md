# Fuoco

*Fuoco* is Italian for "focus". It holds where the author's focus is in a deck — which
slide, which page of it, which source range, which preview element — and tells every pane
that cares when it moves. The Studio's editors, slide rail and live preview talk to one hub
instead of to each other.

Design and measurements: `engineering/decisions/2026-10-15-fuoco-focus-sync.md`.

## The two parts

**`deck-index.ts` — which slide is this offset in.** An immutable snapshot of one deck
source: each authored slide (a *chunk*, the text between separators) with a stable id, and
where each rendered slide (a *section*) begins inside it. A chunk is several sections when
the deck splits on headings, the engine's default. The index reuses the engine's own
kernels (`parseSlideBoundaries`, `headingSplitPoints`), so its count is the PDF's count.

`updateDeckIndex(prev, next, { span })` re-parses only the separator-bounded region an edit
touched and shifts the rest. It falls back to a full build when the edit could change how
later text parses (an opened fence, a setext underline, a `$$` block). The test suite holds
every incremental result to the full build of the same text.

**`hub.ts` — who needs to hear.** Panes report facts and request moves; the hub resolves
both against the index and publishes one `Focus` record.

```ts
import { createFocusHub } from '@/lib/fuoco';

const hub = createFocusHub();
hub.source(deckText, span, 'markdown');          // the text changed (span: the editor's own account)
hub.report('markdown', { head, anchor, line });  // an editor's caret moved
hub.go('rail', { flat: 7 });                     // navigate to rendered slide 8
hub.step('keys', 'next');                        // next page, then section, then slide
hub.pages('preview', { chunk, section, count, shown }); // the preview's page run for what it shows

const off = hub.subscribe(
  (f) => f.flat,                                 // select only what you need
  (flat, f) => highlight(flat),
  { lane: 'frame', ignoreOrigin: 'rail' },       // once per frame; never your own moves
);
```

In React: `const flat = useFocus(hub, (f) => f.flat)` from `./react`.

## The guarantees

| Guarantee | What it replaces |
|---|---|
| A subscriber never hears its own origin (`ignoreOrigin`) | `lastSlideRef` pre-seeding in each editor, `navigatingRef` |
| A report against an older index revision is dropped | the 1500 ms `waitingStepRef` window |
| A navigation to text not yet applied waits for that text (`go(…, { after })`) | `requestAnimationFrame` before `revealSlide` |
| A publication inside a delivery is queued, never re-entered | the echo loops the guards above existed to stop |
| A subscriber hears only when its selected value changes | the shell re-rendering on every caret line |

## Reacting to a focus

`Focus.cause` says what moved it. An editor reveals on `nav` and `pick` and leaves its own
caret alone on `caret` and `edit` (its own text mapping already moved it). A rail and a
preview follow every cause.

## Tests

`deck-index.test.ts` checks the index against `splitSlides`, `slideIndexAt` and the engine's
`splitSourceToSections` on every committed deck, then fuzzes incremental updates against
full builds. `hub.test.ts` drives a model (an editor, a rail and a preview) through random
typing, caret moves, rail picks, steps, deletions and late reports, and checks after every
action that all three agree. Each property has a **failing arm**: the same property run
against a deliberately broken index or hub, which must go red. Raise the run count with
`FUOCO_RUNS=5000`.
