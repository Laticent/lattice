---
status: proposed
summary: >
  The Studio has seven separate undo mechanisms and no global one. CodeMirror and Compose each keep
  their own stack and neither sees the other's edits; Compose loses its whole stack whenever the
  source changes outside it; deck settings get a one-shot toast; AI edits, fixes and restores point
  at a version list that stores 25 full copies of the deck in localStorage; ⌘Z does nothing at all
  when focus is on the preview, the rail, a settings panel or the page. Measured in real browser
  engines: 25 checkpoints of a 134 KB deck do not fit WebKit's localStorage quota (Safari, and the
  Tauri webview), and use about two thirds of it in Chromium and Firefox, where a failed write is
  swallowed silently. A three-slide rewrite is about 33x smaller as a patch than as a copy.
  Proposed: Filo, a framework-free history library that records every change to a document as an
  invertible patch, keeps ONE stack per document whoever made the change, holds the whole capped
  stack in memory so undo is always synchronous, survives reload in IndexedDB, keeps every main-
  thread step under a 16 ms long-task budget (moving work to a worker only where that budget is
  missed), and caps each document at 100 steps by default (500 at most) under a cross-document LRU
  byte budget. The Studio routes every source write through it, Compose applies history patches
  even while focused, and one keymap at the Studio root plus `beforeinput` makes undo work from
  any focus and any input method. Revised after the adversarial trio (section 11).
companion:
  - ./2026-10-15-fuoco-focus-sync.md
  - ./2026-10-06-studio-live-collaboration.md
  - ./2026-07-08-library-shape-cadenza-vetrina.md
  - ./2026-07-18-sibling-brand-system.md
---

# Filo: one undo history for every way a deck changes (2026-10-27)

*Filo* is Italian for **thread**: the thread Ariadne gave Theseus so he could walk back out of
the labyrinth the way he came in. Every change leaves a length of thread, and ⌘Z walks back along
it, whichever room you are standing in.

**The answer in one paragraph.** Undo should track **the document, not the editor**. Every way a
deck changes (typing in Markdown, typing in Compose, a deck-settings row, a preview pill, a rail
move, an AI edit, a lint fix, a restore) ends as a new deck source string in `StudioShell`. Filo
sits at that point and records each change as a small invertible patch with a label, an origin
and an offset. The editors stop keeping their own stacks and ask Filo instead. The Studio turns
the offset into a slide through Fuoco, so an undo always shows you what it undid.

## 1. The audit: how undo works today

Seven mechanisms, each written for one surface, none aware of the others.

| # | Mechanism | Where | What it covers | Survives reload | Bound |
|---|---|---|---|---|---|
| 1 | CodeMirror `history()` | `Editor.tsx:794` | Markdown typing, plus every outside write that reaches the editor while it is mounted (`Editor.tsx:1046`/`:1048` dispatch the value sync with no `addToHistory: false`) | No | 100-120 events (`minDepth: 100`, trimmed past 120) |
| 2 | Module-scoped carry of #1 | `Editor.tsx:125-180` | Keeps #1 across a switch to Compose and back, guarded on deck id **and** document bytes | No | One deck |
| 3 | ProseMirror `history()` | `ComposeView.tsx:1943-1944` | Compose typing and Compose structural ops; also the pane-pick toast (`undoPane`, `:2224`) | No | 100 events |
| 4 | Settings toast | `StudioShell.tsx:1561-1602` | The **last** deck-settings write only, withdrawn the moment the source moves | No | One step |
| 5 | Checkpoints | `studio-store.ts:628` (`SNAP_CAP = 25`) | "Saved version", plus the safety net under AI applies, fix-all and restores (`saveCheckpoint` at `StudioShell.tsx:3549, 3774, 3817, 4755, 4823, 4978`) | Yes (localStorage) | 25 **full copies** per deck |
| 6 | `CodeField`'s own CodeMirror `history()` | `CodeField.tsx:79-80` | Code fields in Fabricate, FinishStudio, LayoutStudio, CraftLab | No | 100-120 events |
| 7 | Local one-shots | `Fabricate.tsx:295` (draft stash), `asset-history.js` (`VERSION_CAP = 20`, IndexedDB) | A component draft's last overwrite; a saved Library asset's versions | Asset versions only | One step / 20 versions |

Live sessions replace #1 with Yjs's `Y.UndoManager` (`live/live-controller.ts:1075`), so undo
there is per-person (`2026-10-06-studio-live-collaboration.md` §6.1).

### What breaks, concretely

1. **⌘Z has no owner outside the editors.** Nothing at the Studio root handles it; the only
   bindings are inside CodeMirror (#1, #6) and Compose (`ComposeView.tsx:1944`). Change a theme
   in the settings panel and press ⌘Z without clicking into an editor: nothing happens.
2. **Two deck stacks that cannot see each other.** A Compose edit is not in CodeMirror's history,
   so the carry (#2) is discarded on any Compose edit. That guard is correct; it also proves the
   design cannot answer "undo the last thing I did".
3. **Compose forgets everything on an outside change.** `resyncFrom` (`ComposeView.tsx:2504`)
   rebuilds the state with `EditorState.create`, which re-runs `prosemirror-history`'s `init` and
   starts empty. (While Compose has focus the outside change is parked and the wipe happens on
   blur, `:2726-2730`.) One settings write, rail move or AI apply, and every Compose edit before
   it is out of ⌘Z's reach.
4. **The toasts promise a ⌘Z that depends on the open pane.** "applied — ⌘Z or restore from
   History to undo" (`StudioShell.tsx:3551`, `:3778`, `:4981`) is true in Markdown, where the
   value sync lands on CodeMirror's stack, and false in Compose, where #3 just reset.
5. **Settings undo is one step, and it dies on the next keystroke.** `settingsWrite` takes no
   checkpoint, so after two theme changes the first is reachable only by ⌘Z from inside the
   Markdown editor, and not at all from Compose.
6. **Version history is full copies, and a failed save is silent.** `write()`
   (`studio-store.ts:37-44`) swallows a quota error. Measured by the checker in real engines
   (Playwright, an empty origin, the checkpoint array as stored):

   | Deck | Size | Checkpoints that fit: Chromium · Firefox · WebKit |
   |---|---|---|
   | `gallery.md` | 60 KB | 60+ · 60+ · 42 |
   | `system-design-foundations.md` | 134 KB | 37 · 37 · **18** |

   Chromium and Firefox count about 5.2 M characters; WebKit counts bytes, 2 per character once
   a string holds any non-Latin-1 character (an em dash is enough), so it holds half as much. In
   Safari and in the coming Tauri app's WebKit webview, a large deck's 19th checkpoint fails
   without a word, while every deck, chat and setting shares the same quota.
   A scattered three-slide rewrite plus one front-matter edit of the 134 KB deck is a 4.0 K
   character line diff: **about 33x** smaller than the 134 K character copy, in the same units.
7. **Code fields have an undo that the root does not know about.** #6 works inside a focused code
   field and nowhere else.

## 2. What Filo tracks

**The unit is the document, and the record is a patch.** One history per document id (a deck, a
Library asset, a draft). An entry is:

```ts
interface Entry<P = unknown> {
  id: number;                  // monotonic per document
  patch: Patch;                // invertible: retains, inserts, deletes WITH the deleted text
  label: string;               // "Typing", "Theme → Cuoio", "Fix all (4)", "AI: tighten slide 3"
  origin: string;              // 'markdown' | 'compose' | 'settings' | 'preview' | 'rail' | 'ai' | 'lint' | 'restore' | …
  before: number; after: number;// caret OFFSETS around the change, mapped through later entries
  meta?: P;                    // opaque to Filo; the host's own extra
  ts: number;
}
```

**Locations are offsets, never slide ids or indexes.** Fuoco's `Place.unit` is an index into the
outline (`fuoco/place.ts:68-74`) and its `UnitId` is a page-global counter that restarts on reload
(`fuoco/outline.ts:77-80`), so either one stored in history points at the wrong slide after a rail
move or a reload. An offset maps exactly through every later patch, and the Studio resolves it to
a slide with `placeAt(outline, offset)` at the moment of the undo.

**What goes in:** every change to the deck source. Front matter is source, so every deck setting
takes the same path as typing: AI edits, lint fixes, rail moves, pane picks, imports into an open
deck, and checkpoint restores (a restore is a patch like any other, so it can be undone).

**What stays out**, and why:

| Not tracked | Why |
|---|---|
| Loading a deck, switching decks, the demo's blank canvas, a practice deck in a live tour | A load is not an edit. It goes through `load(docId, text)`, never `commit` (§3) |
| Palette preview, light/dark toggle | Runtime view state, instant to reverse, not in the source |
| Folds, scroll, caret, open panels | View state; Filo keeps only offsets to show where a change was |
| Chat threads | A conversation, with its own regenerate and compact flow |
| Remote collaborators' edits | Undo is "undo **my** edits" (§6.2) |

### Grouping, so one ⌘Z is one intention

- **Typing coalesces**: same origin, adjacent offset, under 500 ms apart (both editors' own
  `newGroupDelay`), never across a slide boundary.
- **A command is one step**: `batch(label, fn)` wraps the tag-every-slide and reader-view
  removals (`StudioShell.tsx:1732`, `:1747`, which already promise "ONE undo step") and fix-all.
  `fn` must be synchronous; `batch` throws if it returns a Promise, because fix-all awaits inside
  its loop (`:3800`) and an open async group would swallow whatever the author types meanwhile. An
  async command collects its result first and commits once.
- **A slider drag is one step**: the gesture opens a group on pointer-down and closes it on
  pointer-up, `pointercancel`, `lostpointercapture`, blur, a commit from another origin, or 2 s of
  quiet, whichever comes first. iOS cancels a pointer when a scroll takes over; a group that never
  closes would fold minutes of later typing into one "Theme" step.

### Version history becomes marks on the thread

"Saved version" stops storing a copy. It names a point on the history (`mark(label)`), and
restoring it walks the patches. Filo keeps a **keyframe** (a full copy) at the oldest retained
point. When the oldest patches are trimmed they fold into that keyframe, so marks older than the
window still restore. That **floor keyframe is exempt from the byte cap**; without the exemption a
large deck could never keep any history at all.

Today a restore that renames a photo rewrites every checkpoint's source
(`mapCheckpointSources`, `studio-store.ts:650`). Patches cannot be rewritten that way, so a rename
becomes an ordinary entry: the history records the rename, and restoring an older mark replays it.

### Redo is not a trap door

Typing after an undo drops the redo branch in a linear history. Filo keeps **one** automatic mark
at the dropped branch's tip ("Before you undid 6 changes"), replacing the previous automatic mark,
so "I undid too far and then typed" becomes a restore instead of a loss, and automatic marks never
pile up.

## 3. How the parts of the Studio talk to it

```
 Markdown ─┐                              ┌─ apply(patch) → the mounted editor, at once
 Compose  ─┤  commit({ doc, base, … })    │
 Settings ─┼────────────► FILO ───────────┤
 Preview  ─┤   (after React settles)      └─ offset ──► Studio glue ──► Fuoco hub.go ──► every pane reveals it
 Rail, AI ─┘
```

### Writers commit, and every writer is listed

`StudioShell` has three write paths, not one, and all of them must reach Filo:

| Path | Who uses it | Today |
|---|---|---|
| `setSourceFromEditor` (= `setSourceRaw`, `StudioShell.tsx:480`) | Both editors' typing, live remote edits (`:4044`), shared-text binds (`:4100`), and `:3021`, `:4266`, `:6103` | Skips the epoch bump on purpose |
| `setSource` (19 call sites) | Deck loads, restores, AI applies, fix applies, practice start and end, the demo | Bumps the epoch |
| `settingsWrite` (56 call sites in the shell, plus children's `onWrite`: `PluginsSettings`, `CodePackagesNotice`, `ShareSheet`) | Every settings row | Functional updater, then `setSource` |
| `onRetire → saveSourceGuarded` (`:6096`) | Compose's final emit for the deck being left | Writes another deck's source directly |

The rules:

1. **Commits happen after React settles, never inside an updater.** `settingsWrite` and
   `setDebug` (`:1594`, `:2410`) pass functional updaters, and StrictMode runs updaters twice. A
   writer stamps its intent (`{ label, origin }`) into a ref; one effect keyed on `source` diffs
   Filo's head against the new text and commits once, with that intent, or with "Typing" from the
   editor's origin.
2. **Every commit names its document and its base.** `commit({ doc: deckId, base: headRevision,
   … })`. Filo refuses a commit whose base is not its head, and the shell re-diffs. This is what
   stops a deck switch from filing deck B's text under deck A, since `setDeck` and `setSource` are
   separate state updates.
3. **Loads are not commits.** Deck switches, practice decks in a live tour and the demo canvas
   call `load(doc, text)`. A practice deck gets a memory-only history that is discarded when the
   tour ends, so the tour can never reach the real deck's stack.
4. **The shell keeps a revision counter.** Any change to `source` that did not arrive through a
   commit or a load marks the stack stale. The next undo first records a gap entry for it,
   computed synchronously, so an old patch is never applied to text it was not recorded against.
   This covers a live session ending without a reload.
5. **A gate keeps it that way.** A `check-ownership` rule fails on a write to deck source outside
   the funnel, and on `history()` from `@codemirror/commands` or `prosemirror-history`, or a
   `Mod-z` binding, outside the Filo glue. The live `Y.UndoManager` path is the one sanctioned
   entry. Without it, the next modal ships its own stack and ⌘Z is dead there a year from now.

### Surfaces apply, at once

An undo produces a patch, and the shell applies it as a source change tagged `origin: 'history'`
so nothing records it twice.

- **CodeMirror** applies it as a precise dispatch with `addToHistory: false`; it already maps the
  caret through a `ChangeSet`.
- **Compose** needs four changes, each named by the red team:
  1. **A history patch bypasses the focus park.** Today an outside change that arrives while
     Compose has focus is parked (`ComposeView.tsx:2726-2730`), and the next keystroke emits from
     the stale document (`:2604-2615`). Under Filo that would make ⌘Z in Compose look like it does
     nothing, and the next keystroke would silently put back everything just undone. A history
     patch is applied immediately and sets `lastEmittedRef`. It waits only while IME composition
     is running (`view.composing`) and flushes on `compositionend`.
  2. **One meta flag replaces `isHistoryTransaction`.** The structural guard (`:156`), the pane
     marker guard (`lib/compose/pane-model.ts:377`) and the inline-object `afterHistory` flag
     (`lib/compose/inline-objects.ts:918`) all wave history transactions through. Drop
     `prosemirror-history` without replacing that test and the guard refuses the undo of a slide
     deletion (the red team ran it: the slide count stayed at 1), which brings back the deck-wipe
     the comment at `:145-151` records as fixed. Filo's apply sets `filoHistory`, and all three
     guards test it. `undoPane` (`:2224`) is re-pointed at Filo.
  3. **Compose emits per-slide patches, not whole strings.** `emitDeck` returns the whole deck
     (`:2612`), and the serializer normalizes neighboring text (the red team ran one keystroke and
     got `* one` rewritten to `- one`). Compose already knows which slides changed, so it diffs
     those slides locally on the main thread and commits a narrow patch. A whole-document
     provisional patch per keystroke would hit the byte cap in about eight keystrokes on the
     134 KB deck.
  4. **Resync touches only the slides a patch covers**, keeping the byte-exact emit baseline for
     every other slide. This is the hardest step and is unproven, so it is a spike with a written
     go/no-go before anything else is built (§9, slice 1). If the spike fails, the fallback is
     still one stack: Compose applies an undo with a full resync, costing folds and caret on undo
     only, never the history.

### The location becomes a reveal

Filo returns the entry's `after` offset. The Studio glue (about twenty lines) resolves it with
`placeAt(hub.outline(), offset)` and calls `hub.go('history', { unitIndex, part }, { after: text
})`, so the rail, the preview and the open editor all land on the slide that changed, and
Compose's `change-flash` marks it. An undo of a settings write also flashes the row it came from.
**An undo you cannot see is a bug**: it is how people press ⌘Z three times looking for a change
that already went back.

**Filo knows nothing about Fuoco.** It stores offsets and an opaque `meta`, and it takes a
`scheduler` for its idle work the same way Fuoco does. Both stay zero-dependency.

### Undo from any focus and any input method

One keymap at the Studio root decides who gets the key:

| Focus is in… | ⌘Z / ⌘⇧Z / Ctrl+Y does |
|---|---|
| A native `<input>` or `<textarea>` whose value differs from the value it was given (a settings field mid-edit, the chat composer, a pill popup's field) | The browser's own field undo, until the field commits |
| Either deck editor, a code field Filo owns, the preview, the rail, a settings panel, the page body | Filo undo/redo on the active document |
| A modal that edits its own document (theme editor, Fabricate, Motion Studio) | Filo on **that** document's history |
| Present mode | Nothing. Presenting never edits the deck behind the overlay |
| An IME composition (`e.isComposing`) | Nothing; the composition owns the keys |

"Active document" is a stack of scopes: opening a modal editor pushes its document, closing pops
it. `CodeField` drops its own `history()` wherever Filo owns its document; otherwise CodeMirror
undoes first and, once its stack is empty, the key falls through and Filo undoes the same typing
again against text already reverted.

**Keys are not the only way to ask for undo.** The browser's Edit menu on macOS, iOS shake and
three-finger swipe, the iPad shortcut bar and Android keyboard keys arrive as `beforeinput` events
with `inputType` `historyUndo` / `historyRedo`. Both history plugins handle those today
(`@codemirror/commands` and `prosemirror-history` each register the handler), so dropping them
without a replacement would let the browser change the editor's DOM behind its model, which the
editor would then read as typing. The Filo glue installs the same handler on both editors, sends
it to Filo and calls `preventDefault`. On a phone the shell also shows Undo and Redo buttons for
every pane. The future Tauri app sends its Edit menu's two items to the same calls.

The preview iframe takes no keys today (the Studio box is `pointer-events: none`). When the pill
editor opens inside the frame, forwarding its keys to the parent is a runtime markup sink under
HARD RULE #22 and goes through that review.

## 4. The library

```ts
import { createHistory } from '@laticent/filo';

const h = createHistory({
  doc: 'deck:abc123',
  store: idbStore('lattice-filo'),          // or memoryStore(); persistence is optional
  limits: { entries: 100 },                 // default 100; clamped to the hard maximum of 500
  scheduler,                                // where idle work runs; the browser's idle callback by default
});
await h.open(currentText);                  // the editors stay read-only until this resolves
h.commit({ base: h.head, patch, label: 'Typing', origin: 'markdown', before, after });
h.commit({ base: h.head, next: aiText, label: 'AI: tighten slide 3', origin: 'ai' });
h.batch('Fix all (4)', () => { /* synchronous commits, one step */ });
h.undo();  h.redo();  h.mark('Saved version');  h.restore(markId);
h.subscribe((s) => s.canUndo, (canUndo) => (button.disabled = !canUndo));
```

**Text first; generic later.** v1 ships one document shape, text: patches as retain / insert /
delete with the deleted text, composable, invertible, and able to map an offset through each other.
Every Studio document is text, including Library assets (their CSS and markdown). The adapter
interface (`apply`, `invert`, `compose`, `map`, `size`, `diff`) stays internal until a second shape
has a real user; a `json` adapter (RFC 6902 JSON Patch with stored inverses) is the expected
second.

### Undo is synchronous, always

**An undo must land in the same frame as the key press.** A worker round trip or an IndexedDB read
would make ⌘Z asynchronous and racy against typing. So Filo holds **the whole capped stack in
memory**, up to the 500-entry maximum, and persistence only ever writes. Paging old entries in
from storage is not a mode Filo has. The cost is small: a typing entry is tens of bytes and the
byte cap bounds the rest.

### "Off the main thread" is a budget with a test

The owner's requirement is that history work never makes the Studio janky. The measurement says
most of it is cheap, so the requirement is written as a budget, and a worker is used only where the
budget is missed:

| Work | Measured (134 KB deck, Node 22) | Where it runs |
|---|---|---|
| Line diff of a wholesale replace (AI apply, import, restore) | 2.7-4.3 ms warm; 12-22 ms on the first call in a fresh process | Main thread, unless the long-task test fails on a real deck; then a worker, with a provisional patch committed at once and narrowed before it is persisted |
| SHA-256 of the document | 0.49 ms | Main thread, synchronously, so the hash is known at undo time |
| Gzip of a keyframe (134 KB to 46 KB) | 6.6 ms | Idle callback; a worker if the test fails |
| IndexedDB writes, trimming, LRU eviction | Async I/O | Idle callback |

**The acceptance test**: a `PerformanceObserver('longtask')` e2e on the 134 KB deck records no
main-thread task over 16 ms that history caused, during typing, an undo, a settings write and an AI
apply. The worker is built if and only if that test needs it. Filo falls back to an in-thread
scheduler where there is no `Worker` (Node, tests, a strict CSP).

### Bounds: the entry cap and the LRU

- **Per document: an entry cap**, default **100**, configurable up to a hard maximum of **500**
  (owner's call 2026-10-27; a value above 500 is clamped, and a test pins that). Past the cap the
  oldest patches fold into the floor keyframe, first in, first out.
- **Per document: a patch byte cap** (default 2 MB). Counted on the stored entry, which includes
  the deleted text its inverse needs; the floor keyframe is exempt. An entry larger than the whole
  cap (a 3 MB paste over a 1 MB deck) is still recorded, the older entries fold into the keyframe,
  and the state before the paste stays recoverable because the keyframe holds it.
- **Across documents: an LRU** over every document's stored history, by total bytes (default
  50 MB of IndexedDB, shared with the Studio's media store). "Recent" means last **written**, not
  last opened, so a deck edited all day in one tab is never evicted by browsing in another. On
  overflow, the least recently written deck's history is trimmed to its keyframe and marks first,
  then dropped. A named mark is never dropped silently: its eviction is reported.

## 5. Survives reload, safely

Filo writes to IndexedDB on the idle lane and on `visibilitychange` to hidden. The Studio already
writes the deck source synchronously to localStorage at those moments (`StudioShell.tsx:2083-2101`),
so the two land on different clocks. To make a mismatch mean what it says, **the history's head
hash is written beside the source**, in the same synchronous localStorage write. On open:

- **Head matches the source:** the stack is live. ⌘Z after a reload undoes the edit before it.
- **The source is ahead of the stored stack** (an iOS tab kill after the source saved and before
  IndexedDB caught up; the head hash beside the source says so): Filo records the difference as one
  "Unsaved typing" entry, so nothing is lost and the chain stays continuous. The loss window is the
  typing since the last idle write, at most about one second.
- **Anything else** (another tab, an older build, a restored backup, the desktop app's file changed
  on disk): Filo never applies the stack to text it was not recorded against. It records the gap as
  one "Changed outside the Studio" entry whose patch is the diff.

**Acceptance test**: a real-browser e2e that edits, reloads, presses ⌘Z, and checks the text; and
one that kills the page between the source write and the IndexedDB write.

## 6. Things easy to miss

1. **Two tabs, one deck: one writer.** The Studio never syncs source between tabs (StudioShell has
   no `storage` listener), so each tab holds its own text and their entries cannot chain. The
   first tab to open a deck holds a Web Lock on its history for the session. A second tab gets a
   memory-only stack for that deck and a one-line notice that its undo will not survive reload.
   Persisted entries carry their base hash, and `open` verifies the chain.
2. **Live collaboration** (owner's call: wrap `Y.UndoManager`). During a session Filo delegates to
   the session's `Y.UndoManager` behind an adapter, so the keys, buttons and `beforeinput` go
   through one path and undo stays per-person. Every source writer must reach the shared `Y.Text`
   during a session. The Studio's own writes use the null origin (`live-controller.ts:1769`),
   which `Y.UndoManager` tracks by default, so settings writes, AI applies and rail moves are
   undoable in a session. An e2e pins that. When the session ends, the revision counter (§3 rule
   4) marks Filo's stack stale.
3. **History never crosses decks.** It is keyed by deck id, never by content, for the reason
   `carryApplies` records (`Editor.tsx:138-180`): every new deck starts from the same template bytes.
4. **Deleting, clearing, renaming and importing decks** are workspace operations, not document
   edits. "Delete deck" deletes its history. "Clear all" (`DECKS_CLEARED_EVENT`) writes a
   per-document generation tombstone, and Filo refuses any later write from an older generation,
   including the flush the reload's `pagehide` would otherwise send. Without the tombstone the
   built-in decks, whose ids are fixed, would reopen with a gap entry, and ⌘Z would bring back the
   content the author just deleted. A separate workspace history (soft delete plus restore) is
   out of scope for v1.
5. **Selection is part of the undo.** After ⌘Z the caret goes to where the change was.
6. **Accessibility.** Each undo announces its label through the Studio's `Announce` live region
   ("Undid: Theme → Cuoio"). A silent undo is invisible to a screen-reader user.
7. **Privacy and backup.** History holds text the author deleted. Delete and Clear all remove it,
   the workspace backup states explicitly whether it carries it (proposed: no), and share and
   export never include it.
8. **The preview pill editor (future)** is one more writer through `commit` with
   `origin: 'preview'`. Nothing in Filo changes for it.

## 7. Where else it helps

Inside Lattice: the Library asset editors (themes, components, finishes), Motion Studio,
Fabricate's drafts and code fields, the Lexicon and Acronym editors, and the Tauri app (file-backed
decks, the Edit menu, and a file changing on disk, which is the gap path of §5). Outside it, any app
with one document and more than one way to change it: notes and Markdown apps, config editors,
form and survey builders, and, once the `json` adapter exists, diagram and canvas editors and design
tools where a panel and a canvas edit the same model. Filo and Fuoco make a small kit for "many
views, one document": one knows where you are, the other knows how you got there.

## 8. The library bar

Filo follows its siblings' shape (`2026-07-08-library-shape-cadenza-vetrina.md`): `docs/src/lib/filo`,
`@laticent/filo`, zero runtime dependencies, an optional `./react` adapter (`useHistory`), CJS +
ESM + `.d.ts` in `dist/`, an ownership-boundary gate, a README with a sixty-second start, a
`/libraries/filo/` demo and a `/libraries/filo/learn/` guide, and a mark in the sibling brand
system (`2026-07-18-sibling-brand-system.md`): a thread that loops back on itself into the
family's ringed hub, in a palette none of the siblings uses.

**The package is not published until the Studio has proved the API** (slices 3 and 4 merged and in
use), so fixing what Compose teaches us never becomes a breaking change.

### Every requirement has a mechanism and a test

| Requirement (owner, 2026-10-27) | Mechanism | Acceptance test |
|---|---|---|
| ⌘Z and ⌘Y work at all times | Root keymap, `beforeinput`, Compose bypassing the park, scope stack | An e2e that presses ⌘Z, ⌘⇧Z and Ctrl+Y with focus on each Studio surface in turn, including Compose with focus, a code field, the preview and the page body; the gate in §3 rule 5 |
| Survives reload | IndexedDB, head hash beside the source (§5) | Edit, reload, ⌘Z; and a kill between the two writes |
| Off the main thread | The long-task budget (§4) | The `longtask` e2e on the 134 KB deck |
| A cap on changes with an LRU | Entry cap default 100, max 500; cross-document LRU by bytes | Unit tests: 501 clamps to 500; the 101st entry folds; eviction order by last write |
| Diff / patch, not copies | The text patch algebra; marks instead of copies | Property tests (apply then invert is identity; compose agrees with sequential apply; map is consistent); 25 marks on the 134 KB deck stored in under 5% of today's 3.5 M characters |
| Used wherever undo is needed | The funnel (§3) and the gate | The gate; this list: deck source (both editors, settings, rail, AI, lint, restores, pane picks), Library asset editors, Fabricate, Motion Studio, Lexicon, Acronyms |
| A docs site and a logo | §8 | The site builds and the screenshot check passes at three widths |

`npm run bench` gains a scenario for commit, undo and the wholesale diff on the 134 KB deck
(HARD RULE #19).

## 9. Build order

Each slice builds and tests against `main` alone (HARD RULE #17) and is worth having if the next one
stalls. The order puts the riskiest unknown first, so a half-migration is never worse than today.

0. **Stop the silent loss now.** Report checkpoint write failures instead of swallowing them, and
   move checkpoints to IndexedDB. A small standalone PR that removes today's worst harm before Filo
   exists.
1. **Compose spike, with a written go/no-go.** Prove that Compose can apply a patch to only the
   slides it covers while keeping the byte-exact baseline, apply a history patch while focused,
   and emit per-slide patches, with a measured cost on the 134 KB deck. On no-go, the fallback
   (§3) is written into this note before slice 2.
2. **Filo core, in memory**: the text patch algebra, history, grouping, limits, marks; property
   tests. No Studio change.
3. **The Studio funnel with Markdown**: every writer through `commit`/`load`; CodeMirror and
   `CodeField` drop `history()`; the root keymap and `beforeinput`; shell Undo/Redo buttons; the
   reveal; the gate. **Until slice 4 merges, Compose keeps its own history and owns ⌘Z while it
   has focus; the root keymap yields to it, and Compose's edits are committed to Filo as
   `origin: 'compose'`. The toasts drop "⌘Z" from their text in Compose until then.** Retires
   #1, #2, #4 and #6.
4. **Compose on Filo**: the four Compose changes of §3. Retires #3.
5. **Persistence**: IndexedDB store, reload path, head hash beside the source, tombstones, the
   two-tab lock, the LRU; a worker only if the long-task test calls for one.
6. **Checkpoints become marks**: migrate existing `SNAP_PREFIX` lists into keyframes. Retires #5.
7. **Other documents**: Library assets, Fabricate, Motion Studio, Lexicon, Acronyms. Retires #7.
8. **Docs site, mark and package** (starts after slice 4 is merged).

## 10. Decisions

Settled by the owner on 2026-10-27:

| Question | Decision |
|---|---|
| Who owns undo | **Filo.** The editors drop their own `history()` |
| Entry cap | **Default 100 steps per document, hard maximum 500** |
| Live sessions | **Wrap `Y.UndoManager`** behind a Filo adapter |
| Name | **Filo** |

Open, with the default that applies if nobody objects:

| Question | Default |
|---|---|
| Build order: persistence after the in-memory funnel, a Compose spike first, the checkpoint fix as slice 0 | As in §9 |
| Cross-document LRU byte budget | 50 MB of IndexedDB |
| Per-document patch byte cap | 2 MB |
| Workspace backup carries history | No |

## 11. What the adversarial trio changed

A red team, a Munger inversion and an independent checker reviewed the first draft
(2026-10-27). The checker re-derived the measurements in real browser engines; the red team ran two
of its findings as throwaway tests. What changed:

- **Facts corrected.** Seven mechanisms, not six (`CodeField`). The localStorage overflow is
  WebKit's (Safari, Tauri), not universal, and Chromium and Firefox swallow the failure past about
  37 checkpoints. The patch is about 33x smaller than a copy, not 69x (the first figure divided
  bytes by characters). The diff is 2-4 ms warm, not 14-22 ms (those were cold first calls).
  Settings writes take no checkpoint. Fuoco's `Place.unit` is an index, not an id. Line numbers
  fixed (`resyncFrom` 2504, `SNAP_CAP` 628).
- **Compose.** History patches bypass the focus park, a `filoHistory` flag replaces
  `isHistoryTransaction` in the three guards, `undoPane` moves to Filo, Compose emits per-slide
  patches, and its patch-scoped resync becomes a spike with a go/no-go before anything is built.
- **The funnel.** All three write paths and the child `onWrite` consumers listed; commits after
  React settles; `load` separate from `commit`; a base revision on every commit; a revision counter
  for changes outside the funnel; a gate against new local stacks.
- **Undo is always synchronous.** The whole capped stack stays in memory; no page-in.
- **Off the main thread** is a measured budget with a long-task test, not a worker by default.
- **Input methods.** `beforeinput` history events are routed, IME composition and present mode are
  excluded, and the preview iframe's future keys are flagged under HARD RULE #22.
- **Reload, tabs, clearing.** The head hash is written beside the source; one writer per deck
  across tabs; Clear all writes a tombstone.
- **Scope.** The `json` adapter waits for a second user; the package is not published until the
  Studio proves the API; persistence moves after the in-memory funnel.
