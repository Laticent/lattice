---
status: accepted
summary: >
  The Studio has six separate undo mechanisms and no global one. CodeMirror and Compose each keep
  their own stack and neither sees the other's edits; Compose loses its whole stack whenever the
  source changes outside it; deck settings get a one-shot toast; AI edits, fixes and restores
  point at a version list that stores 25 full copies of the deck in localStorage; ⌘Z does
  nothing at all when focus is on the preview, the rail, a settings panel or the page. Measured:
  25 checkpoints of a 134 KB deck fill about 6.7 MB of localStorage (the quota is about 5 MB), and a
  three-slide AI rewrite of that deck is a 3.9 KB line diff against a 269 KB snapshot. Proposed:
  Filo, a framework-free history library that records every change to a document as an
  invertible patch, keeps ONE stack per document whoever made the change, survives reload in
  IndexedDB, does diffing, hashing, compression and persistence in a worker, bounds itself with a
  per-document entry cap (default 100, maximum 500) and a cross-document LRU byte budget, and says WHERE each change landed
  through Fuoco so an undo is always visible. The Studio routes every source write through it,
  and one keymap at the Studio root makes ⌘Z / ⌘⇧Z / Ctrl+Y work from any focus.
companion:
  - ./2026-10-15-fuoco-focus-sync.md
  - ./2026-10-06-studio-live-collaboration.md
  - ./2026-07-08-library-shape-cadenza-vetrina.md
  - ./2026-07-18-sibling-brand-system.md
---

# Filo: one undo history for every way a deck changes (2026-10-27)

*Filo* is Italian for **thread**: the thread Ariadne gave Theseus so he could walk back out of
the labyrinth the way he came in. That is the job. Every change leaves a length of thread, and
⌘Z walks back along it, whichever room you are standing in.

**The answer in one paragraph.** Undo should track **the document, not the editor**. Every way a
deck changes (typing in Markdown, typing in Compose, a deck-settings row, a preview pill, a rail
move, an AI edit, a lint fix, a restore) already ends as a new deck source string in
`StudioShell`. So Filo sits at that one funnel and records each change as a small invertible
patch with a label, an origin and a location. The editors stop keeping their own stacks and ask
Filo instead. Fuoco carries the location, so an undo moves every pane to the slide it changed.

## 1. The audit: how undo works today

Six mechanisms, each written for one surface, none aware of the others.

| # | Mechanism | Where | What it covers | Survives reload | Bound |
|---|---|---|---|---|---|
| 1 | CodeMirror `history()` | `Editor.tsx:794` | Markdown typing, plus every outside write that reaches the editor while it is mounted (`Editor.tsx:1046` dispatches the value sync without `addToHistory: false`) | No | CodeMirror default (100 events) |
| 2 | Module-scoped carry of #1 | `Editor.tsx:125-180` | Keeps #1 across a switch to Compose and back, guarded on deck id **and** document bytes | No | One deck |
| 3 | ProseMirror `history()` | `ComposeView.tsx:1943` | Compose typing and Compose structural ops | No | prosemirror default |
| 4 | Settings toast | `StudioShell.tsx:1561-1602` | The **last** deck-settings write only, withdrawn the moment the source moves | No | One step |
| 5 | Checkpoints | `studio-store.ts:626` (`SNAP_CAP = 25`) | "Saved version", plus the safety net under AI applies, fix-all and restores | Yes (localStorage) | 25 **full copies** per deck |
| 6 | Local one-shots | `Fabricate.tsx:295`, `ComposeView` `undoPane`, `asset-history.js` | A component draft, a pane pick, a saved Library asset | Only #6c (IndexedDB) | One step / per-asset versions |

Live sessions replace #1 with Yjs's `Y.UndoManager` through `y-codemirror.next`, so undo there
is per-person (`2026-10-06-studio-live-collaboration.md` §6.1).

### What breaks, concretely

1. **⌘Z has no owner outside the two editors.** No handler exists at the Studio root (the only
   two `Mod-z` bindings are CodeMirror's keymap and `ComposeView.tsx:1944`). Change a theme in
   the settings panel, press ⌘Z without clicking into the editor: nothing happens.
2. **Two stacks that cannot see each other.** A Compose edit is not in CodeMirror's history, so
   the carry (#2) is discarded on any Compose edit. That guard is correct; it is also the proof
   that the design cannot give one answer to "undo the last thing I did".
3. **Compose forgets everything on an outside change.** `resyncFrom` (`ComposeView.tsx:2503`)
   rebuilds the editor with `EditorState.create`, which starts a fresh history. One deck-settings
   write, one rail move or one AI apply and every Compose edit before it is unreachable by ⌘Z.
4. **The toasts promise a ⌘Z that depends on which pane is open.** "applied — ⌘Z or restore
   from History to undo" (`StudioShell.tsx:3551`, `:3778`, `:4981`) is true in Markdown, where
   the value sync lands on CodeMirror's stack, and false in Compose, where #3 just reset.
5. **Settings undo is one step and dies on the next keystroke.** Two theme changes in a row
   and the first is only reachable through Version history.
6. **Nothing survives a reload except full copies.** Measured (scratch script, `diff@` from the
   docs tree, Node 22):

   | Deck | Size | One full checkpoint (UTF-16 in localStorage) | 25 checkpoints | Line diff of a 3-slide rewrite + one front-matter edit | Diff time |
   |---|---|---|---|---|---|
   | `gallery.md` | 60 KB | 120 KB | 3.0 MB | 2.7 KB | 14 ms |
   | `system-design-foundations.md` | 134 KB | 269 KB | **6.7 MB** | 3.9 KB | 22 ms |

   One large deck's history alone overruns the roughly 5 MB localStorage quota every deck, chat
   and setting shares. A patch is **69× smaller** than the snapshot. The prefix/suffix trim the
   editor uses today (`Editor.tsx:1025`) would keep 48 KB, because a scattered edit spans most
   of the file; a real diff is what makes patches small.
7. **Library asset editors, Motion Studio and Fabricate have no in-session undo**, only a saved
   version or a one-level stash.

## 2. What Filo tracks

**The unit is the document, and the record is a patch.** One history per document id (a deck,
a Library asset, a draft). An entry is:

```ts
interface Entry {
  id: string;                 // monotonic per document
  patch: Patch;               // invertible: retains, inserts, deletes WITH the deleted text
  label: string;              // "Typing", "Theme → Cuoio", "Fix all (4)", "AI: tighten slide 3"
  origin: string;             // 'markdown' | 'compose' | 'settings' | 'preview' | 'rail' | 'ai' | 'lint' | 'restore' | …
  before: Place; after: Place;// where it happened: unit id + offset (Fuoco's vocabulary)
  ts: number;
  hash: string;               // hash of the document AFTER this entry (integrity, see §6)
  group?: string;             // entries sharing a group undo as one step
}
```

**What goes in:** everything that changes the deck source. Front matter is source, so every deck
setting is covered by the same path as typing. That includes AI edits, lint fixes, rail moves,
pane picks, imports into an open deck and checkpoint restores (a restore is a patch like any
other, so it is undoable too).

**What stays out**, and why:

| Not tracked | Why |
|---|---|
| Palette preview, light/dark toggle | Runtime view state, already instant to reverse; not in the source |
| Folds, scroll, caret, open panels | View state; Filo stores the caret only as *where to look* after an undo |
| Chat threads | A conversation, not a document; they have their own regenerate/compact flow |
| Remote collaborators' edits | Undo is "undo **my** edits"; foreign changes rebase the stack instead (§6) |

### Grouping, so one ⌘Z is one intention

- **Typing coalesces**: same origin, adjacent position, under ~500 ms apart (CodeMirror's own
  `newGroupDelay`), and never across a slide boundary.
- **A command is one step**: `filo.batch(label, () => …)` wraps fix-all, apply-a-tag-to-every-
  slide, reader-view removal (all of which already promise "ONE undo step" in comments today).
- **A settings drag or slider is one step**: a gesture opens a group on pointer-down and closes
  it on release.

### The checkpoint list becomes marks on the thread

"Saved version" stops storing a copy. It names a point on the history (`mark(label)`), and
restoring it is a walk along the patches. Filo keeps a **keyframe** (a full, compressed copy)
every N entries or M bytes of patches, so a restore never replays more than one window and so
the oldest marks survive when the oldest patches are trimmed.

### Redo is not a trap door

Standard linear undo drops the redo branch when you type after undoing. Filo keeps the dropped
branch's tip as an automatic mark ("Before you undid 6 changes"). It costs one patch, and it
turns "I undid too far and then typed" from a loss into a restore.

## 3. How the parts of the Studio talk to it

Three roles, and Filo only plays one of them.

```
 Markdown ─┐                         ┌─ apply(patch) → each mounted surface
 Compose  ─┤  commit(patch, meta)    │
 Settings ─┼──────────► FILO ────────┤
 Preview  ─┤   (one funnel)          └─ Place of the change ──► FUOCO ──► every pane reveals it
 Rail, AI ─┘
```

1. **Writers commit.** `StudioShell`'s `setSource` (19 call sites) and `settingsWrite` (56)
   become one `commit(next | patch, { label, origin, before? })`. A writer that has a precise
   patch (CodeMirror's `ChangeSet`, Compose's per-slide emit) hands it over; a writer that only
   has a new string (AI apply, import, restore) hands the string and Filo diffs it in the worker.
2. **Surfaces apply.** CodeMirror and Compose drop their own `history()` plugins and bind their
   keys to Filo. An undo produces a patch; the shell applies it as a source change tagged
   `origin: 'history'`, so no surface records it again. CodeMirror applies it as a precise
   dispatch (it already maps the caret through a `ChangeSet`). **Compose needs one change:** it
   must apply a patch to only the slides it touches instead of rebuilding the whole document
   (`resyncFrom`). Fuoco's outline already knows which units a span covers, so the cost is
   proportional to the edit; it also fixes fold and caret loss on every outside write today.
3. **Fuoco moves the eyes.** Each entry stores `before`/`after` as a Fuoco place. On undo, the
   Studio calls `hub.go('history', { unit }, { after: text })`, so the rail, the preview and
   whichever editor is open all land on the slide that changed, and Compose's existing
   `change-flash` marks it. An undo of a deck-settings change flashes the settings row it came
   from. **An undo you cannot see is a bug**: it is how people undo three times looking for a
   change that already went back.

**Filo knows nothing about Fuoco.** `Place` is an opaque value it stores and returns; the Studio
glue is about twenty lines. That keeps both libraries zero-dependency, the same rule Fuoco
follows.

### ⌘Z at all times

One keymap at the Studio root decides who gets the key:

| Focus is in… | ⌘Z / ⌘⇧Z / Ctrl+Y does |
|---|---|
| A native text field with uncommitted text (a settings input mid-edit, the chat composer, a pill popup's field) | The browser's own field undo, until the field commits |
| Anything else: either editor, the preview, the rail, a settings panel, the page body | Filo undo/redo on the active document |
| A modal that edits its own document (theme editor, Fabricate, Motion Studio) | Filo on **that** document's history |

"Active document" is a stack of scopes: opening a modal editor pushes its document, closing pops
it. Both redo chords work on every platform (CodeMirror already binds `Ctrl-Shift-z` on Linux;
Compose binds `Mod-y` and `Shift-Mod-z`). A phone has no key: the shell, not Compose alone, shows
Undo and Redo buttons for every pane. The future Tauri app routes its Edit menu's Undo/Redo
items to the same two calls.

## 4. The library

```ts
import { createHistory } from '@laticent/filo';

const h = createHistory({
  doc: 'deck:abc123',
  store: idbStore('lattice-filo'),        // or memoryStore(); persistence is optional
  limits: { entries: 100, bytes: 2_000_000 }, // entries: default 100, a host may raise it to 500
  worker: true,                           // diff/hash/compress/persist off the main thread
});
await h.open(currentText);                // loads the stack if its head hash matches the text
h.commit({ patch, label: 'Typing', origin: 'markdown', before, after });
h.commit({ next: aiText, label: 'AI: tighten slide 3', origin: 'ai' }); // diffed in the worker
h.batch('Fix all (4)', () => { /* several commits, one step */ });
h.undo();  h.redo();  h.mark('Saved version');  h.restore(markId);
h.subscribe((s) => s.canUndo, (canUndo) => button.disabled = !canUndo);
```

**Generic by a document adapter.** Filo ships `text` (patches as retain/insert/delete with the
deleted text, composable and invertible, mapping positions through each other) and `json` (RFC
6902 JSON Patch with stored inverses). A host with another shape writes an adapter: `apply`,
`invert`, `compose`, `map`, `size`, `diff`. The text adapter's format is chosen so CodeMirror's
`ChangeSet` and a ProseMirror step map converts in a few lines; both adapters live in the
Studio glue, not in Filo.

### Performance and the main thread

The hot path stays on the main thread on purpose: **an undo must land in the same frame as the
key press**, and a worker round trip would make ⌘Z asynchronous and racy against typing. The
recent entries' patches are already in memory, so `undo()` is an array pop and a patch apply.

What moves to a worker, and why:

| Work | Cost measured or bounded | Why off-main |
|---|---|---|
| Diffing a wholesale replace (AI apply, import, restore) | 14-22 ms for 60-134 KB decks (§1) | Longer than a frame; the commit records a provisional whole-document patch at once and the worker narrows it before persisting |
| Hashing the document after each entry | Proportional to deck size | Runs per change |
| Compressing keyframes (`CompressionStream`) and writing IndexedDB | I/O plus CPU | Never blocks typing |
| Trimming and LRU eviction | Batch work | Idle work |

Filo falls back to an in-thread scheduler when there is no `Worker` (Node, tests, a strict
CSP), the same way Fuoco takes a `scheduler`.

### Bounds: the entry cap and the LRU

- **Per document:** at most `entries` steps (**default 100, configurable up to a hard maximum of 500**, owner's call 2026-10-27) and `bytes` of patches.
  Past either, the oldest patches fold into the oldest keyframe, so marks older than the window
  still restore.
- **Across documents:** one LRU over every document's history, by total bytes (proposed 50 MB
  of IndexedDB). Opening a deck touches it; when the budget overflows, the least recently opened
  deck's history is trimmed to its keyframes first, then dropped. Named marks are the last thing
  to go and are never dropped silently: eviction of a mark is reported.
- **In memory:** at the default cap the whole stack stays hot; above 100, only the most recent 100
  stay in memory and the rest page in from IndexedDB on demand.

## 5. Survives reload, safely

The history is written to IndexedDB on Fuoco's `idle` lane cadence and on `pagehide`. On open,
Filo compares the stored head hash to the deck source it is given:

- **Match:** the stack is live; ⌘Z after a reload undoes the edit before the reload.
- **Mismatch:** something changed the deck outside this history (another tab, an older build, a
  restored backup, the desktop app's file changing on disk). Filo **does not** apply the stack to
  text it was not recorded against, which is the exact defect class the editor carry already hit
  twice (`Editor.tsx:139`). It records the gap as one entry ("Changed outside the Studio") whose
  patch is the diff, so the history stays continuous and undoable through the gap.

## 6. Things easy to miss

1. **Two tabs, one deck.** Both write the same history. Filo takes a Web Lock per document for
   writes and uses a `BroadcastChannel` to tell the other tab its head moved; that tab's next
   ⌘Z sees a hash mismatch and rebases instead of corrupting the stack.
2. **Live collaboration.** Undo must stay "undo my edits". **Decided:** live sessions keep
   `Y.UndoManager` behind a Filo adapter, so ⌘Z and the buttons go through one path and the
   session keeps its proven per-person behavior. Mapping Filo's own entries through remote
   changes (the adapter's `map`) is deferred to the desktop app, which needs it for disk changes.
3. **Undo must not cross decks.** History is keyed by deck id, never by content, for the reason
   `carryApplies` records: every new deck starts from the same template bytes.
4. **Deleting a deck, renaming it, importing a zip** are workspace operations, not document
   edits. They get a separate `workspace` history (soft delete plus restore), not a slot on a
   deck's stack.
5. **Selection is part of the undo.** After ⌘Z the caret goes to where the change was, not to
   where it was before you started looking around. That is `before`/`after`.
6. **Accessibility.** Each undo announces its label through the existing `announce` helper
   ("Undid: Theme → Cuoio"); a silent undo is invisible to a screen-reader user.
7. **Privacy and backup.** History holds text the author deleted. "Delete deck" and "Clear all"
   must delete its history, the workspace backup should decide explicitly whether to carry it,
   and the share/export paths must never include it.
8. **Size of one change.** Pasting a 2 MB deck is one entry of 2 MB. The byte cap must count it,
   and a single entry larger than the per-document cap becomes a keyframe instead of a patch.
9. **The preview pill editor (future).** It is one more writer through `commit` with
   `origin: 'preview'` and its element's source span as the place. Nothing in Filo changes for it.

## 7. Where else it helps

Inside Lattice: the Library asset editors (themes, components, finishes), Motion Studio,
Fabricate's drafts, the Lexicon and Acronym editors, and the coming Tauri app (file-backed decks,
with the Edit menu). Outside it, any app with a document and more than one way to change it:
notes and Markdown apps, form and survey builders, diagram and canvas editors (with the `json`
adapter), spreadsheet-like grids, config editors, and design tools where a panel and a canvas
both edit the same model. Filo plus Fuoco is a small kit for "many views, one document": one
knows where you are, the other knows how you got there.

## 8. The library bar

Filo follows its siblings' shape (`2026-07-08-library-shape-cadenza-vetrina.md`): `docs/src/lib/filo`,
`@laticent/filo`, zero runtime dependencies, an optional `./react` adapter (`useHistory`), CJS +
ESM + `.d.ts` in `dist/`, an ownership-boundary gate, a README with a sixty-second start, a
`/libraries/filo/` demo and a `/libraries/filo/learn/` guide, and a mark in the sibling brand
system (`2026-07-18-sibling-brand-system.md`): a thread that loops back on itself into the
family's ringed hub, in a palette none of the siblings uses. Tests cover the patch algebra by
property (apply then invert is identity; compose agrees with sequential apply; map is
consistent), the reload and hash-mismatch paths, the LRU, and an e2e that presses ⌘Z with focus
on each Studio surface in turn. `npm run bench` gains a scenario for commit, undo and the worker
diff on the 134 KB deck (HARD RULE #19).

## 9. Build order

Each slice builds and tests against `main` alone (HARD RULE #17).

1. **Filo core** — text adapter, history, grouping, limits, memory store, tests. No Studio change.
2. **Persistence and worker** — IndexedDB store, worker diff/hash/compress, LRU, reload path.
3. **The Studio funnel** — `commit` behind `setSource`/`settingsWrite`; CodeMirror drops
   `history()` and binds to Filo; root keymap; shell Undo/Redo buttons; Fuoco reveal. Retires
   #1, #2 and #4.
4. **Compose** — patch-scoped resync, drop prosemirror-history. Retires #3.
5. **Checkpoints as marks** — migrate existing `SNAP_PREFIX` lists into keyframes, retire #5.
6. **Other documents** — Library assets, Fabricate, Motion Studio. Retires #6.
7. **Docs site and mark.**

## 10. Decisions

Settled by the owner on 2026-10-27, in one round:

| Question | Decision |
|---|---|
| Who owns undo | **Filo.** Both editors drop their own `history()`; Compose gains patch-scoped resync |
| Entry cap | **Default 100 steps per document, hard maximum 500** (a host may raise the default up to 500) |
| Live sessions | **Wrap `Y.UndoManager`** behind a Filo adapter |
| Name | **Filo** |

Still open, with the default that applies if nobody objects: the cross-document LRU byte budget
(**50 MB** of IndexedDB) and the per-document patch byte cap (**2 MB**).
