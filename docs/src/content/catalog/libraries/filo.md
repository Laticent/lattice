---
kind: library
name: Filo
order: 13
promise: One undo history for every way a document changes.
intro: An editor, a settings panel, an AI action and a drag on a rail can all change one document. Give each its own undo and none of them can answer "undo the last thing I did". Filo keeps one history per document, records each change as a small patch it can reverse, and hands back the one change to apply when the author presses ⌘Z.
group: Writing and editing
inLattice: Holds the Studio's one undo history, so ⌘Z works from any pane.
mark: /filo-mark.svg
useWhen: More than one part of your app changes the same document, and ⌘Z only undoes what the focused part did.
facts:
  - { k: Package, v: '@laticent/filo' }
  - { k: Status, v: Coming to npm with Lattice 1.0 }
  - { k: Runs in, v: The browser and Node }
  - { k: Dependencies, v: None }
  - { k: License, v: AGPL-3.0 }
reference:
  - label: The README
    href: https://github.com/Laticent/lattice/blob/main/docs/src/lib/filo/README.md
    note: The model, every call, the registry and the guarantees.
  - label: The history
    href: https://github.com/Laticent/lattice/blob/main/docs/src/lib/filo/history.ts
    note: Commits, grouping, undo and redo, marks and the caps, in one file.
  - label: The fuzz test
    href: https://github.com/Laticent/lattice/blob/main/docs/src/lib/filo/history.fuzz.test.ts
    note: A reference model that checks every undo, redo and restore against the exact text it must produce.
  - label: Why we built it
    href: https://github.com/Laticent/lattice/blob/main/engineering/decisions/2026-10-27-filo-undo-history.md
    note: The seven undo mechanisms it replaced, the design, and the measurements.
---

## The problem

You're building an editor, and the document changes in more ways than typing. A settings panel rewrites a value, a button applies an AI edit, a list reorders sections, a lint fix rewrites a line. The author presses ⌘Z and expects the last of those to go back.

The usual way is to give each part its own undo, and it falls apart as soon as there are two:

- **Stacks that can't see each other.** The text editor undoes typing, but not the setting the author changed afterwards. The author presses ⌘Z three times looking for a change that the editor never knew about.
- **An outside change wipes the stack.** Many editors rebuild their state when the document changes under them, and their undo history goes with it. One settings write, and every earlier edit is out of reach.
- **⌘Z with nowhere to go.** With focus on a button or a list, nothing handles the key at all.
- **Copies instead of changes.** Saved versions are kept as full copies of the document, so a large document runs out of storage after a few dozen.

## The idea

- **Undo tracks the document, not the editor.** Every change, whoever made it, goes into one history for that document. The parts of your app stop keeping their own.
- **A change is a patch.** Filo stores what each change replaced and with what, so it can reverse it without a copy of the document. Undoing a step that coalesced 2,000 keystrokes is still one patch.
- **One ⌘Z is one intention.** Typing joins into one step (same source, close together, next to each other). A command that makes several changes is one step, and so is a slider drag.
- **Every commit names the version it was made against.** A commit against an older version is refused, so two writers racing can't corrupt the history.
- **A change made outside the history is never undone blindly.** Report it with `sync`, and the next ⌘Z records it as one step and stops there. An old patch is never applied to text it wasn't recorded against.
- **Redo is not a trap door.** Typing after an undo drops the redo branch, but Filo keeps one automatic mark for it, so "I undid too far and then typed" is a restore, not a loss.
- **It knows nothing about your document.** It takes text in and gives patches back. Slides, sections and settings are your app's business; a `boundary` callback keeps typing from joining across them.

## How to use it

Install it:

```sh
npm install @laticent/filo
```

> Filo publishes to npm with Lattice 1.0. Until then it lives in the Lattice repository at `docs/src/lib/filo`.

One history per document, every writer committing to it:

```ts
import { createFilo } from '@laticent/filo';

const filo = createFilo({ limits: { entries: 100 } }); // 100 steps by default, 500 at most
const h = filo.load('doc:readme', text);                // one history per document

// Typing, with the editor's precise change: it joins into one step.
h.commit({ base: h.head, edits: [{ from: 42, to: 42, insert: 'x' }], label: 'Typing', origin: 'editor' });

// A settings panel and an AI action, with the whole new text.
h.commit({ base: h.head, next: withTheme, label: 'Theme → Cuoio', origin: 'settings' });
h.commit({ base: h.head, next: aiText, label: 'AI: tighten section 3', origin: 'ai' });

// One ⌘Z, from anywhere: apply the patch it returns, put the caret where the change was.
const m = h.undo(); // { patch, text, caret, label, origin } or null
if (m) editor.apply(m.patch, m.caret);
```

A command that makes several changes is one step, and a named version is a mark you can go back to:

```ts
h.batch('Fix all (4)', () => {
	for (const fix of fixes) h.commit({ base: h.head, edits: fix.edits, label: 'Fix', origin: 'lint' });
});

const saved = h.mark('Saved version');
// …more edits…
h.restore(saved); // one new step, so the restore itself can be undone
```

| Call | What it does |
| --- | --- |
| `commit({ base, edits \| next, label, origin })` | Record a change. Refused when `base` isn't `head`, or when nothing changed |
| `undo()` · `redo()` | Move one step; returns the patch to apply and where the caret goes |
| `batch(label, fn)` | Every commit `fn` makes is one step |
| `openGroup(label)` · `closeGroup()` | A drag as one step; it closes itself after 2 s of quiet or when another source writes |
| `mark(label)` · `restore(id)` | Name a point, and go back to it as a step you can undo |
| `sync(text)` | The text moved without a commit; the next undo records the difference first |
| `subscribe(pick, listener)` | Hear `canUndo`, `canRedo`, the labels and more, only when they change |
| `filo.load(doc, text)` · `push(doc)` | One history per document; a modal editor pushes its own and pops it on close |

Filo guarantees these, and its tests check them:

| Guarantee | How |
| --- | --- |
| Every undo, redo and restore lands on an exact earlier text | Each step keeps one net patch, composed exactly; checked against a reference model over hundreds of random runs |
| An old patch never lands on the wrong text | Outside changes become their own step before anything older is undone |
| Two writers can't corrupt the history | A commit names the head it was made against |
| One document's undo never reaches another | One history per document id, never matched by content |
| Undo is synchronous | The whole capped history stays in memory; one apply per step |
| Memory stays bounded | A step cap (100 by default, 500 at most) and a byte cap; old steps fold into one copy of the text, and a mark older than the window still restores |

## Where else it fits

- **Notes and Markdown apps** with a settings sidebar, a find-and-replace and an outline that reorders sections.
- **Config and form builders**, where a field, a toggle and a drag all change one document and ⌘Z should step back through all of them.
- **Writing tools with AI actions**: a rewrite is one labeled step the author can take back, not a wall of edits mixed into their typing.
- **Apps with saved versions**: marks name points on the history, so a version costs a patch instead of a full copy.
- **Desktop apps** where a file can change on disk: the change becomes one step the author can see, never a silent undo of something else.

## How Lattice uses it

In the Studio, Lattice's editor in the browser, every way a deck changes goes through Filo: typing in the Markdown editor or in Compose, a deck setting, a slide moved on the rail, an AI edit, a lint fix and a restored version. ⌘Z works from the editor, the preview, the rail, a settings panel or the page body, and each undo moves every pane to the slide it changed. Measured on a 134 KB deck, same machine, the slowest history step in each browser:

| Step | Chromium | Firefox | WebKit |
| --- | --- | --- | --- |
| A keystroke, an undo, a redo, a settings write | 1.1 ms | 1.0 ms | 3.0 ms |
| An undo applied to Compose (only the slides it touched) | 3–9 ms | 4–8 ms | 6–11 ms |

One frame of the screen is about 16 ms. A three-slide rewrite of that deck is a patch about 33 times smaller than a copy of it. The Lattice engine and its command-line tool don't use Filo.

## What it doesn't do

- **It doesn't save anything yet.** The history lives in memory, so it lasts for the session; surviving a reload (in IndexedDB) and a byte budget across documents are the next step.
- **It only handles text.** A document that isn't text, such as a JSON tree or a canvas, would need a second patch format, which Filo doesn't ship yet.
- **It doesn't catch the keys for you.** Routing ⌘Z to the right history, and leaving a text field's own undo alone, is your app's job; the Studio's glue is one small file you can copy.
- **It doesn't merge two people's edits.** Undo is "undo my edits"; in a live session, the collaboration layer's own undo does that job.
