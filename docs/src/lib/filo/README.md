# Filo

**One undo history for every way a document changes.**

*Filo* is Italian for "thread": the thread Ariadne gave Theseus so he could walk back out of the
labyrinth the way he came in. Every change leaves a length of thread, and ⌘Z walks back along it,
whichever view made the change.

An editor, a settings panel, an AI action and a preview popup can all change one document. Give
each its own undo stack and none can answer "undo the last thing I did". Filo keeps **one history
per document**, records each change as a small invertible patch, and hands back the one change to
apply when the author presses ⌘Z. It is framework-free with zero dependencies, and it knows nothing
about what the document is.

Design and measurements: `engineering/decisions/2026-10-27-filo-undo-history.md`. This folder is
the in-memory core (slice 2). Persistence, the cross-document byte budget, the docs site and the
mark come in later slices.

**In the Studio** (slice 3): the glue lives outside this folder, in
`docs/src/components/studio/studio-filo.ts` (the commit rules, the ⌘Z routing) and the
`filo:commit-path` block of `StudioShell.tsx` (every deck-source setter stamps an intent; one
effect commits). `checkFiloCommitPath` in `tools/check-ownership.js` keeps every source write on
that path and every Studio surface off an undo stack of its own. Compose (slice 4) applies an
undo through `docs/src/lib/compose/filo-history.ts`, changing only the slides that differ.

## Sixty-second start

```ts
import { createFilo } from './index';

const filo = createFilo({ limits: { entries: 100 } }); // default 100 steps, at most 500
const h = filo.load('deck:abc', text); // one history per document; this one is now active

// Every writer commits, against the head it last saw.
h.commit({ base: h.head, edits: [{ from: 10, to: 10, insert: 'x' }], label: 'Typing', origin: 'markdown' });
h.commit({ base: h.head, next: aiText, label: 'AI: tighten slide 3', origin: 'ai' });

// One ⌘Z: apply the patch it returns, and put the caret where the change was.
const m = h.undo(); // { patch, text, caret, label, origin } or null
if (m) editor.apply(m.patch, m.caret);
```

## The model

| Term | Meaning |
|---|---|
| Entry | One recorded change: a patch, a label, an origin, the caret before and after |
| Step | What one ⌘Z undoes: an entry, or a group (typing that coalesced, a `batch`, a drag). A step keeps ONE net patch, so undoing 2,000 coalesced keystrokes is one apply |
| Patch | Sorted, non-overlapping changes, each storing the text it deleted, so it inverts without a copy of the document |
| Floor | A full copy of the text at the oldest kept step; steps past the caps fold into it |
| Mark | A named point (a saved version). A mark older than the window keeps an anchor patch from the floor, so it still restores |
| Gap | A change made outside the history (`sync`). The next undo records it as one step and stops |

## The history

| Call | What it does |
|---|---|
| `commit({ base, edits \| next, label, origin, before?, after? })` | Record a change. Refused when `base` is not `head` (`stale`) or nothing changed (`noop`) |
| `undo()` · `redo()` | Move one step. Returns `{ patch, text, caret, label, origin }`, or null. `caret` is null when nothing moved |
| `batch(label, fn)` | Every commit `fn` makes is one step. `fn` must be synchronous, and may not call `undo`, `redo` or `restore`. A batch that edits two distant places is stored as one change spanning both |
| `openGroup(label)` · `closeGroup()` | A drag or slider as one step; it closes itself after 2 s of quiet or when another origin commits |
| `mark(label)` · `marks()` · `markText(id)` · `restore(id)` | Named versions. A mark ends any open typing run and records any outside change first, so it names exactly what the author sees; a restore is a step you can undo |
| `sync(text)` | The host's text moved without a commit; the next undo records the gap first |
| `subscribe(select, listener)` | Hear `canUndo`, `canRedo`, labels and more, only when the selected value changes |

Typing coalesces into one step when it has the same origin and label, comes within 500 ms and sits
next to the previous edit, and never across a `boundary` the host names (a slide break).

## The registry

`createFilo()` holds one history per document. `load(doc, text)` opens one and makes it the base
(the open deck). A modal editor loads its own document with `{ activate: false }` and `push`es it;
the function `push` returns removes exactly that scope, whatever opened after it. `drop(doc)`
forgets a document and removes it from the stack.

## The guarantees

| Guarantee | Mechanism | Test |
|---|---|---|
| Every undo, redo and restore lands on an exact earlier text | Each step's net patch is composed exactly (`composePatch`) | A reference model over 300 random runs of 60 operations, caps from 1 to 12 steps; 8,000 random compositions |
| An undo, redo or restore never lands on the wrong text, however coalescing, batches, drags, outside changes and marks interleave | Marks close the open run and record outside changes first; restore records the gap before it computes its patch | A second reference model, written by an independent checker: 1,200 seeds of 200 operations with keystrokes 0-120 ms apart, large and small caps. It fails on the code before the fixes |
| An undo is synchronous and cheap | The whole capped stack stays in memory; one patch per step | On the 134 KB deck in Node: a keystroke records in 0.09 ms (median), an undo of a 2,000-keystroke step takes at most ~4 ms |
| Apply then invert is the identity | Patches store deleted text | 5,000 seeded random patches |
| A mark survives its steps folding away | Anchors re-based onto the floor on each fold | "a mark older than the window still restores" |
| One ⌘Z never crosses documents | One history per document id | "keeps one history per document" |
| An old patch is never applied to text it was not recorded against | `sync` and the gap step | "the next undo records the gap and stops" |
