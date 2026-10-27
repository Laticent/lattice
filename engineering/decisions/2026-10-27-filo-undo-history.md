---
status: proposed
summary: >
  The Studio has seven separate undo mechanisms and no global one: CodeMirror and Compose keep
  stacks that cannot see each other, Compose loses its stack on any outside change, deck settings
  get a one-step toast, version history stores full copies in localStorage (and a failed save is
  silent), and ⌘Z does nothing when focus is outside an editor. Proposed: Filo, a framework-free
  history library. It records every change to a document as an invertible patch, keeps one stack
  per document whoever made the change, holds the whole capped stack in memory so undo is always
  synchronous, survives reload in IndexedDB, and caps each document at 100 steps by default (500 at
  most) under a cross-document byte budget. The Studio routes every source write through one
  commit path; one keymap at the Studio root plus `beforeinput` makes undo work from any focus and
  any input method; Fuoco reveals the slide each undo changed. Measured in three real browser
  engines: a few-slide diff costs 1.5-4 ms and a whole-deck diff 260-721 ms, so broad changes are
  committed without a diff on the main thread. Reviewed by the adversarial trio and two further
  checker passes (section 12).
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

**The answer.** Undo should track **the document, not the editor**. Every way a deck changes
(typing in Markdown, typing in Compose, a deck-settings row, a preview pill, a rail move, an AI
edit, a lint fix, a restore) ends as a new deck source string in `StudioShell`. Filo sits at that
point, which this note calls **the commit path**, and records each change as a small invertible
patch with a label, an origin and a caret offset. The editors stop keeping their own stacks and
ask Filo instead. The Studio turns the offset into a slide through Fuoco, so every undo shows you
what it undid.

**Terms used below.** A **patch** is a list of retain / insert / delete steps that stores the
deleted text, so it can be reversed. A **keyframe** is one full copy of a document. The **epoch**
is `StudioShell`'s counter that marks a source change as a replacement rather than an edit
(`StudioShell.tsx:470-478`). **LRU** (least recently used) is the eviction order across documents.
A **broad change** is one that rewrites much of the deck (§4.3).

## 1. The audit: how undo works today

Seven mechanisms, each written for one surface, none aware of the others.

| # | Mechanism | Where | What it covers | Survives reload | Bound |
|---|---|---|---|---|---|
| 1 | CodeMirror `history()` | `Editor.tsx:794` | Markdown typing, plus every outside write that reaches the editor while it is mounted (`Editor.tsx:1046`/`:1048` dispatch the value sync with no `addToHistory: false`) | No | 100-120 events |
| 2 | Module-scoped carry of #1 | `Editor.tsx:125-180` | Keeps #1 across a switch to Compose and back, guarded on deck id **and** document bytes | No | One deck |
| 3 | ProseMirror `history()` | `ComposeView.tsx:1943-1944` | Compose typing and structural ops; also the pane-pick toast (`undoPane`, `:2224`) | No | 100-120 events |
| 4 | Settings toast | `StudioShell.tsx:1561-1602` | The **last** deck-settings write only, withdrawn the moment the source moves | No | One step |
| 5 | Checkpoints | `studio-store.ts:628` (`SNAP_CAP = 25`) | "Saved version" (`StudioShell.tsx:4751`) and the safety net under AI applies, fixes, restores and a profile change (`saveCheckpoint` at `:3549, 3774, 3817, 4755, 4823, 4978`) | Yes (localStorage) | 25 **full copies** per deck |
| 6 | `CodeField`'s own CodeMirror `history()` | `CodeField.tsx:79-80` | Code fields in Fabricate, FinishStudio, LayoutStudio, CraftLab | No | 100-120 events |
| 7 | Local one-shots | `Fabricate.tsx:295` (draft stash), `asset-history.js` (`VERSION_CAP = 20`, IndexedDB) | A component draft's last overwrite; a saved Library asset's versions | Asset versions only | One step / 20 versions |

Live sessions replace #1 with Yjs's `Y.UndoManager` (`live/live-controller.ts:1075`), so undo
there is per-person (`2026-10-06-studio-live-collaboration.md` §6.1).

### What breaks, concretely

1. **⌘Z has no owner outside the editors.** Nothing at the Studio root handles it; the only
   bindings are inside CodeMirror (#1, #6) and Compose (`ComposeView.tsx:1944`). Change a theme
   and press ⌘Z without clicking into an editor: nothing happens.
2. **Two deck stacks that cannot see each other.** A Compose edit is not in CodeMirror's history,
   so the carry (#2) is discarded on any Compose edit. The guard is correct; it also proves this
   design cannot answer "undo the last thing I did".
3. **Compose forgets everything on an outside change.** `resyncFrom` (`ComposeView.tsx:2504`)
   rebuilds the state with `EditorState.create`, which re-runs `prosemirror-history`'s `init`.
   (While Compose has focus the outside change is parked and the wipe happens on blur,
   `:2726-2730`.) One settings write, rail move or AI apply, and every earlier Compose edit is out
   of ⌘Z's reach.
4. **The toasts promise a ⌘Z that depends on the open pane.** "applied — ⌘Z or restore from
   History to undo" (`StudioShell.tsx:3551`, `:3778`, `:4981`) is true in Markdown and false in
   Compose.
5. **Settings undo is one step, and it dies on the next keystroke.** `settingsWrite` takes no
   checkpoint, so after two theme changes the first is reachable only by ⌘Z inside the Markdown
   editor.
6. **Version history is full copies, and a failed save is silent.** `write()`
   (`studio-store.ts:37-44`) swallows quota errors. Measured in real engines (Playwright, an empty
   origin, the checkpoint array as stored):

   | Deck | Size | Checkpoints that fit: Chromium · Firefox · WebKit |
   |---|---|---|
   | `gallery.md` | 60 KB | 60+ · 60+ · 42 |
   | `system-design-foundations.md` | 134 KB | 37 · 37 · **18** |

   Chromium and Firefox allow about 5.2 M characters. WebKit counts 2 bytes per character once a
   string holds any non-Latin-1 character (an em dash is enough), so it holds half as much. In
   Safari and in the Tauri app's WebKit webview a large deck's 19th checkpoint fails without a
   word, and in every engine it fails once other decks, chats and settings fill the shared quota.
   A scattered three-slide rewrite plus one front-matter edit of the 134 KB deck is a 4.0 K
   character patch, **about 33x** smaller than the 134 K character copy.
7. **Code fields have an undo the root does not know about.** #6 works only inside a focused code
   field.

## 2. What Filo tracks

**One history per document, and the record is a patch.** A document is a deck, a Library asset or
a draft, named by a stable id. An entry is:

```ts
interface Entry<M = unknown> {
  id: number;                    // monotonic per document
  patch: Patch;                  // invertible: stores the deleted text
  hash: number;                  // hash of the document AFTER this entry; chains the history
  label: string;                 // "Typing", "Theme → Cuoio", "Fix all (4)", "AI: tighten slide 3"
  origin: string;                // 'markdown' | 'compose' | 'settings' | 'preview' | 'rail' | 'ai' | 'lint' | 'restore' | 'import' | 'gap'
  group?: number;                // entries sharing a group undo as one step
  before: number; after: number; // caret offsets around the change, mapped through later entries
  meta?: M;                      // opaque to Filo; the host's own extra
  ts: number;
}
```

Marks live beside the entries, not in them (§2.3).

**Locations are offsets, never slide ids or indexes.** Fuoco's `Place.unit` is an index into the
outline (`fuoco/place.ts:68-74`) and its `UnitId` is a page-global counter that restarts on reload
(`fuoco/outline.ts:77-80`). Either one, stored, points at the wrong slide after a rail move or a
reload. An offset maps exactly through every later patch, and the Studio resolves it to a slide
with `placeAt(outline, offset)` when the undo happens.

**What goes in:** every change to the deck source. Front matter is source, so every deck setting
takes the same path as typing, as do AI edits, lint fixes, rail moves, pane picks, imports into an
open deck and restores. A restore is a patch like any other, so it can be undone.

**What stays out:**

| Not tracked | Why |
|---|---|
| Loading or switching decks, the demo's blank canvas | A load is not an edit; it goes through `load`, never `commit` (§3.2 rule 3) |
| Palette preview, light/dark toggle | Runtime view state, instant to reverse, not in the source |
| Folds, scroll, caret, open panels | View state; Filo keeps only offsets |
| Chat threads | A conversation, with its own regenerate and compact flow |
| Remote collaborators' edits | Undo is "undo **my** edits" (§6.2) |

### 2.1 Grouping, so one ⌘Z is one intention

- **Typing coalesces**: same origin, adjacent offset, under 500 ms apart (both editors' own
  `newGroupDelay`), and never across a boundary the host names. The Studio passes a
  `boundary(offset)` callback that answers from Fuoco's outline, so typing never merges across
  slides while Filo itself knows nothing about slides.
- **A command is one step**: `batch(label, fn)` wraps the tag-every-slide and reader-view
  removals (`StudioShell.tsx:1732`, `:1747`, which already promise "ONE undo step") and fix-all's
  apply. `fn` must be synchronous; `batch` throws if it returns a Promise, because an open async
  group would swallow whatever the author types meanwhile. An async command (fix-all drafts in an
  awaited loop, `:3800`) collects its result first and commits once.
- **A slider drag is one step**: the gesture opens a group on pointer-down and closes it on
  pointer-up, `pointercancel`, `lostpointercapture`, blur, a commit from another origin, or 2 s of
  quiet. iOS cancels a pointer when a scroll takes over, and a group that never closed would fold
  later typing into one "Theme" step.

### 2.2 Redo is not a trap door

Typing after an undo drops the redo branch. Filo keeps **one** automatic mark for it, "Before you
undid 6 changes", which stores an anchor: the composed patch from the fork point to the dropped
tip. A newer automatic mark replaces it, and its anchor counts against the byte cap. "I undid too
far and then typed" becomes a restore instead of a loss.

### 2.3 Version history becomes marks

"Saved version" stops storing a copy. `mark(label)` names a point on the history, and `restore`
walks the patches to it. Filo keeps a **floor keyframe** at the oldest retained point. When the
oldest entries are trimmed (by the entry cap or the byte cap) they fold into it, which moves it
forward. A mark that falls out of the window therefore keeps its own **anchor**: the composed
patch from the mark to the next retained mark, or to the floor keyframe. Restoring an old mark
walks those anchors back. The floor keyframe is exempt from the byte cap; anchors are not.

**Photo renames.** Today a restore that renames a photo rewrites every stored checkpoint so it
keeps the new name (`mapCheckpointSources`, `studio-store.ts:652`, called from
`workspace-backup.ts:549`). Patches cannot be rewritten that way, and walking back through a rename
would restore the old name. So the Studio maps the **restored text** through the renames made
since the mark, with the same function, once, at restore time, and commits the result.

## 3. How the parts of the Studio talk to it

```
 Markdown ─┐                                   ┌─ patch → the open editor, at once
 Compose  ─┤  intent (+ patch)                 │
 Settings ─┼──────────► commit path ──► FILO ──┤
 Preview  ─┤  (one effect, after React settles)└─ offset → Studio glue → Fuoco hub.go → every pane reveals it
 Rail, AI ─┘
```

### 3.1 Every writer, listed

`StudioShell` has four write paths, and all of them must reach the commit path:

| Path | Who uses it | Today |
|---|---|---|
| `setSourceFromEditor` (= `setSourceRaw`, `StudioShell.tsx:480`) | Both editors' typing, live remote edits (`:4044`), the shared-text bind (`:4100`), and `:3021`, `:4266`, `:6103` | Skips the epoch bump on purpose |
| `setSource` (19 call sites) | Deck loads, restores, AI and fix applies, structural slide ops (`:4672`), Library rename, `setDebug` (`:2410`), the settings toast's undo (`:1577`), practice start and end, the demo (`:3118`) | Bumps the epoch |
| `settingsWrite` (56 call sites, plus children's `onWrite`: `PluginsSettings`, `CodePackagesNotice`, `ShareSheet` and the panels it hosts) | Every settings row | Functional updater, then `setSource` |
| `onRetire → saveSourceGuarded` (`:6096`) | Compose's final emit for the deck being left | Writes another deck's source directly |

### 3.2 The rules

1. **One effect commits, after React settles.** `settingsWrite` and `setDebug` pass functional
   updaters, and StrictMode runs updaters twice, so nothing commits inside one. A writer stamps an
   **intent** into a ref: `{ label, origin }`, plus the precise `patch` when it has one (CodeMirror
   has a `ChangeSet`; Compose diffs its changed slides). One effect keyed on `source` then commits
   once: the attached patch if there is one, otherwise a patch it computes (§4.3). A write that
   turns out to be a no-op clears its intent, so the next keystroke never inherits a stale label.
2. **Every commit names its base.** `h.commit({ base: h.head, … })`. Filo refuses a commit whose
   base is not its head, and the effect recomputes. This catches two writers racing inside one
   document.
3. **A load switches documents; it is never a commit.** Every deck change calls
   `filo.load(doc, text)` before or with its text, including the shared-text bind at `:4100`
   (`setDeck(d); setSourceFromEditor(shared)`), which would otherwise reach the effect as typing.
   The effect skips any source whose deck id differs from the active history's document, because
   `setDeck` and `setSource` are separate state updates. The demo canvas also calls `load`. A
   practice deck in a live tour gets a memory-only history, discarded when the tour ends, so the
   tour never touches the real deck's stack.
4. **Changes that bypass the commit path become one gap entry.** The shell keeps a revision
   counter; any change to `source` that arrived through neither a commit nor a load marks the
   stack stale (a live session that ended, a write the gate missed). The next ⌘Z records the gap
   as one entry, origin `gap`, using the no-diff broad patch of §4.3, **and stops there**. The
   Studio announces "Changed outside this history. ⌘Z again to undo it." A second ⌘Z undoes it.
   An old patch is never applied to text it was not recorded against.
5. **Live sessions: the shared deck delegates.** During a session the effect does not commit for
   the shared deck: remote edits arrive through `setSourceFromEditor` (`:4044`) and would
   otherwise be recorded as the author's own typing. Undo goes to the session's `Y.UndoManager`
   (§6.2). A practice deck still commits to its own memory-only history, because the practice
   editor runs without the binding (`collab={null}`, `:6103`).
6. **A gate keeps it that way.** A `check-ownership` rule fails on a write to deck source outside
   the commit path, and on `history()` from `@codemirror/commands` or `prosemirror-history`,
   `closeHistory`, or a `Mod-z` binding outside the Filo glue. Its sanctioned list starts with
   the live `Y.UndoManager` path plus the code that has not moved yet (`ComposeView.tsx` and
   `lib/compose/*` until slice 4, `CodeField.tsx` until slice 7). Each later slice removes its
   entries, and the gate fails on a stale entry. Without it, the next modal ships its own stack.

### 3.3 Surfaces apply an undo at once

An undo produces a patch. The shell applies it as a source change tagged `origin: 'history'`, so
nothing records it twice.

- **CodeMirror** applies it as one dispatch with `addToHistory: false` and maps the caret through
  it.
- **Compose** needs five changes:
  1. **A history patch bypasses the focus park.** Today an outside change that arrives while
     Compose has focus is parked (`ComposeView.tsx:2726-2730`), and the next keystroke emits from
     the stale document (`:2604-2615`). Under Filo that would make ⌘Z in Compose look like it does
     nothing, and the next keystroke would silently put back everything just undone. A history
     patch is applied immediately and sets `lastEmittedRef`. It waits only while an IME
     composition runs (`view.composing`) and applies on `compositionend`.
  2. **One meta flag replaces `isHistoryTransaction`.** The structural guard (`:156`), the pane
     marker guard (`lib/compose/pane-model.ts:377`) and the inline-object `afterHistory` flag
     (`lib/compose/inline-objects.ts:918`) all wave history transactions through. Without a
     replacement, the guard refuses the undo of a slide deletion (the red team ran it: the slide
     count stayed at 1), which brings back the deck wipe the comment at `:145-151` records as
     fixed. Filo's apply sets `filoHistory`, all three guards test it, and `undoPane` (`:2224`)
     moves to Filo.
  3. **Compose commits per-slide patches, not whole strings.** `emitDeck` returns the whole deck
     (`:2612`), and its serializer normalizes neighboring text (one keystroke rewrote `* one` to
     `- one`). Compose knows which slides changed, so it diffs those slides locally and attaches
     the narrow patch to its intent.
  4. **Resync touches only the slides a patch covers**, keeping the byte-exact emit baseline for
     every other slide. This is the hardest change and is unproven, so it is slice 1's spike. If
     the spike fails, the fallback keeps one stack: Compose applies an undo with a full resync,
     which costs folds and caret on undo only, never the history.
  5. **The rest of Compose's history API moves to Filo.** The five `closeHistory` callers
     (`lib/compose/raw-objects.ts:66,97`, `image-objects.ts:127,142`, `pane-model.ts:325`,
     `inline-objects.ts:650`) become `h.closeGroup()`, and the Undo/Redo pill's enabled state
     (`undoDepth`/`redoDepth`, `ComposeView.tsx:661-662`) reads `canUndo`/`canRedo` from Filo.

### 3.4 The location becomes a reveal

Filo returns the entry's `after` offset. The Studio glue (about twenty lines) resolves it with
`placeAt(hub.outline(), offset)` and calls `hub.go('history', { unitIndex, part }, { after: text })`.
The rail, the preview and the open editor all land on the slide that changed, and Compose's
`change-flash` marks it; an undone settings write also flashes its row. An `Announce` live region
(`lib/announce.tsx:80`, which the Studio mounts for this) reads the label: "Undid: Theme → Cuoio".
**An undo you cannot see is a bug**: it is how people press ⌘Z three times looking for a change
that already went back.

**Filo knows nothing about Fuoco.** It stores offsets and an opaque `meta`, asks the host for
`boundary`, and takes a `scheduler` for idle work, as Fuoco does. Both stay zero-dependency.

### 3.5 Undo from any focus and any input method

One keymap at the Studio root decides who gets ⌘Z / Ctrl+Z (undo) and ⌘⇧Z / Ctrl+Shift+Z /
Ctrl+Y (redo):

| Focus is in… | The keys do |
|---|---|
| A native `<input>` or `<textarea>` whose value differs from the value it was given (a settings field mid-edit, the chat composer, a pill popup's field) | The browser's own field undo, until the field commits |
| Either deck editor, a code field Filo owns, the preview, the rail, a settings panel, the page body | Filo undo/redo on the active document |
| A modal that edits its own document (theme editor, Fabricate, Motion Studio) | Filo on **that** document's history |
| Present mode | Nothing; presenting never edits the deck behind the overlay |
| An IME composition (`e.isComposing`) | Nothing; the composition owns the keys |

The active document is a stack of scopes: opening a modal editor pushes its document, and closing
it pops. A code field Filo does not own yet keeps its own `history()` and the root keymap ignores
key events from inside it, so the same typing is never undone twice.

**Keys are not the only way to ask for undo.** The macOS Edit menu, iOS shake and three-finger
swipe, the iPad shortcut bar and Android keyboard keys arrive as `beforeinput` with `inputType`
`historyUndo` / `historyRedo`. Both history plugins handle those today, so dropping them without a
replacement would let the browser change the editor's DOM behind its model. The Filo glue installs
the same handler on both editors, sends it to Filo and calls `preventDefault`. On a phone the shell
shows Undo and Redo buttons for every pane. The Tauri app sends its Edit menu's two items to the
same calls.

The preview iframe takes no keys today (the Studio box is `pointer-events: none`). When the pill
editor opens inside the frame, forwarding its keys to the parent is a runtime markup sink under
HARD RULE #22 and goes through that review.

## 4. The library

### 4.1 API

```ts
import { createFilo, idbStore } from '@laticent/filo';

const filo = createFilo({
  store: idbStore('lattice-filo'),       // or memoryStore(); persistence is optional
  limits: { entries: 100, bytes: 2e6 },  // entries: default 100, clamped to the hard maximum of 500
  scheduler,                             // where idle work runs; requestIdleCallback by default
  boundary,                              // optional: offsets typing must not merge across
});
const h = filo.load('deck:abc123', text); // one history per document; this one becomes active
// Editing is live at once. ⌘Z waits for h.ready: synchronous with memoryStore(),
// one IndexedDB read with idbStore().
h.commit({ base: h.head, patch, label: 'Typing', origin: 'markdown', before, after });
h.batch('Fix all (4)', () => { /* synchronous commits, one step */ });
h.closeGroup();
h.undo();  h.redo();  h.mark('Saved version');  h.restore(markId);
h.subscribe((s) => s.canUndo, (canUndo) => (button.disabled = !canUndo));
```

`h.head` is the id of the newest entry (0 for none). The one patch-making helper the host needs,
`broadPatch(before, after)`, is exported for the commit effect (§4.3).

**Text first; generic later.** v1 ships one document shape: text. Every Studio document is text,
including Library assets (their CSS and Markdown). The adapter interface (`apply`, `invert`,
`compose`, `map`, `size`, `diff`) stays internal until a second shape has a real user; a `json`
adapter (RFC 6902 JSON Patch with stored inverses) is the expected second. This narrows the
owner's "generic" requirement and is listed in §11.

### 4.2 Undo is synchronous, always

**An undo lands in the same frame as the key press.** A worker round trip or an IndexedDB read
would make ⌘Z asynchronous and racy against typing. So Filo holds **the whole capped stack in
memory**, up to the 500-entry maximum, and reads storage once, at `load`. It never pages entries in
later. The cost is small: a typing entry is tens of bytes, and the byte cap bounds the rest.

### 4.3 Main-thread budget, and broad changes

The owner asked for work off the main thread. The measurements say most history work is cheap, so
the requirement is written as a budget, **no history step over 16 ms on the main thread**, and the
one step that cannot meet it, diffing a broad change, never runs there.

Measured on the 134 KB deck, median of 7, in Playwright's Chromium, Firefox and WebKit:

| Work | Measured | Where it runs |
|---|---|---|
| Line diff of a **local** change (a few slides) | Chromium 1.5 ms, Firefox 4 ms, WebKit 2 ms | Main thread |
| Line diff of a **broad** change (every third line edited; an unrelated deck) | Chromium 260-265 ms, Firefox 590-721 ms, WebKit 650-688 ms | Never on the main thread (below) |
| Prefix/suffix trim (what `Editor.tsx:1025` already does) | One linear scan | Main thread |
| Hash of the document (cyrb53, a 53-bit zero-dependency JS hash) | Chromium 0.3 ms; Firefox and WebKit under 1 ms (their timers are coarse). Web Crypto's `digest` is async-only, so it cannot serve | Main thread, so the hash is known at undo time |
| Gzip of a keyframe (134 KB to 46 KB) | 4-7 ms in Node; `CompressionStream` is async in a browser | Idle callback |
| IndexedDB writes, trimming, LRU eviction | Async I/O | Idle callback |

**Local or broad.** The commit effect calls a change **broad** when its origin is `ai`, `import`,
`restore` or `gap`, or when the span left after the prefix/suffix trim covers more than a quarter
of the document. A broad change is committed at once as `broadPatch`: one replace of the trimmed
span, which needs no diff. In slice 5 a worker narrows stored broad patches into line diffs before
they are persisted. Until then a broad entry stays a trimmed replace; it is larger, and the byte
cap counts it as it is.

**The acceptance test.** A Playwright e2e on the 134 KB deck wraps Filo's main-thread entry points
in `performance.mark` / `measure` and asserts every measure is under 16 ms, in Chromium, Firefox
and WebKit, across typing, an undo, a settings write, an AI apply and an import. In Chromium a
`PerformanceObserver('longtask')` also asserts no task of 50 ms or more during the same run (the
Long Tasks API reports only tasks of 50 ms or more, and only Chromium supports it). Work other than
the broad diff moves to the worker only if this test fails. Filo falls back to an in-thread
scheduler where there is no `Worker` (Node, tests, a strict CSP).

### 4.4 Bounds

- **Entry cap, per document:** default **100**, configurable up to a hard maximum of **500**
  (owner's call; a larger value is clamped, and a test pins that). Past it, the oldest entries fold
  into the floor keyframe, first in, first out.
- **Byte cap, per document:** default 2 MB, counted on stored entries and anchors, each including
  the deleted text its inverse needs. The floor keyframe is exempt, and so is the newest entry: an
  oversized paste stays one ⌘Z away until the next change, then folds into the keyframe and remains
  reachable as a restore.
- **LRU, across documents:** by total stored bytes (default 50 MB of IndexedDB, shared with the
  Studio's media store). "Recent" means last **written**, not last opened, so a deck edited all
  day in one tab is never evicted by browsing in another. On overflow, the least recently written
  deck's history is trimmed to its keyframe and marks first, then dropped. A named mark is never
  dropped silently; its eviction is reported.

The owner asked for "an LRU cache with a max-changes limit". This note reads that as two bounds: the
per-document entry cap is the max-changes limit, and the LRU is the cross-document byte budget. §11
lists the reading for confirmation.

## 5. Survives reload, safely

Filo writes to IndexedDB on the idle callback and when the page hides. The Studio already writes
the deck source synchronously to localStorage on `pagehide` and on a hide `visibilitychange`
(`StudioShell.tsx:2083-2101`), after a 400 ms debounce otherwise. The two stores land on different
clocks, so beside the source, in the same synchronous localStorage write, the Studio stores a
**sidecar**: the hash of the source it just wrote. On `load`, Filo compares three hashes: the
source's, the sidecar's and its stored head's.

| Case | How it is recognized | What Filo does |
|---|---|---|
| In step | source = stored head | The stack is live; ⌘Z after a reload undoes the edit before it |
| The Studio wrote ahead of IndexedDB (an iOS tab kill between the two writes) | source = sidecar ≠ stored head | One entry, "Unsaved changes", as a broad patch. Nothing is lost; only the step-by-step grouping of the last idle interval (about a second) collapses into that one entry |
| Changed outside the Studio (another tab, an older build, a restored backup, the desktop app's file changed on disk) | source ≠ sidecar | One gap entry, "Changed outside the Studio", as a broad patch; the stack is never applied to text it was not recorded against |

**Acceptance test.** A real-browser e2e that edits, reloads, presses ⌘Z and checks the text; one
that kills the page between the source write and the IndexedDB write; and one that edits the
stored source behind the Studio's back.

## 6. Things easy to miss

1. **Two tabs, one deck: one writer.** The Studio never syncs source between tabs (StudioShell has
   no `storage` listener), so each tab holds its own text and their entries cannot chain. The
   first tab to open a deck holds a Web Lock on its history for the session. A second tab gets a
   memory-only stack and a one-line notice that its undo will not survive reload. `load`
   verifies the entry hash chain.
2. **Live collaboration** (owner's call: wrap `Y.UndoManager`). During a session the keys, buttons
   and `beforeinput` go through Filo's adapter to the session's `Y.UndoManager`, so undo stays
   per-person. The Studio's own writes to the shared text use the null origin
   (`live-controller.ts:1769`), which `Y.UndoManager` tracks by default, so settings writes, AI
   applies and rail moves are undoable in a session; an e2e pins it. When the session ends, rule 4
   turns the session's changes into one gap entry.
3. **History never crosses decks.** It is keyed by deck id, never by content, for the reason
   `carryApplies` records (`Editor.tsx:138-180`): every new deck starts from the same template
   bytes.
4. **Deleting and clearing.** "Delete deck" deletes its history. "Clear all"
   (`DECKS_CLEARED_EVENT`) writes a per-document generation tombstone, and Filo refuses any later
   write from an older generation, including the flush the reload's `pagehide` and
   `visibilitychange` would otherwise send. Without it the built-in decks, whose ids are fixed,
   would reopen with a gap entry, and ⌘Z would bring back what the author just deleted. Deck
   delete, rename and import as undoable workspace operations are out of scope for v1.
5. **Privacy and backup.** History holds text the author deleted. Delete and Clear all remove it,
   the workspace backup does not carry it (§11), and share and export never include it.
6. **The preview pill editor (future)** is one more writer through the commit path with
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
family's ringed hub, in a palette none of the siblings uses. The package is published only after
slices 3 and 4 are merged and in use, so what Compose teaches us never becomes a breaking change.

## 9. Every requirement has a mechanism, a test and a slice

| Requirement (owner, 2026-10-27) | Mechanism | Acceptance test | Slice |
|---|---|---|---|
| ⌘Z / Ctrl+Z and ⌘⇧Z / Ctrl+Y work at all times | Root keymap, `beforeinput`, Compose bypassing the park, scope stack (exceptions in §3.5, listed in §11) | An e2e that presses each chord with focus on each Studio surface in turn, including Compose with focus, a code field, the preview and the page body; the gate (§3.2 rule 6) | 3, 4 |
| Survives reload | IndexedDB, sidecar hash (§5) | The three reload e2es of §5 | 5 |
| Off the main thread | The 16 ms budget; broad diffs never on the main thread (§4.3) | The `performance.measure` e2e in three engines, plus Chromium `longtask` | 3, 5 |
| A max-changes limit with an LRU | Entry cap default 100, max 500; cross-document LRU by bytes (§4.4) | Unit tests: 501 clamps to 500; the 101st entry folds; eviction by last write | 2, 5 |
| Diff/patch, not copies | Patches; marks with anchors instead of copies | Property tests (apply then invert is identity; compose agrees with sequential apply; map is consistent); a scripted trace on the 134 KB deck (300 edits: typing bursts, 10 settings writes, 5 AI applies, 25 marks spread evenly) stores at least 10x less than 25 copies | 2, 6 |
| Used wherever undo is needed | The commit path and the gate | The gate; this list: deck source (both editors, settings, rail, AI, lint, restores, pane picks), Library asset editors, Fabricate, Motion Studio, Lexicon, Acronyms | 3, 4, 7 |
| A docs site and a logo | §8 | The site builds; `tools/screenshot.js` at three widths | 8 |

`npm run bench` gains a scenario for commit, undo and the broad diff on the 134 KB deck
(HARD RULE #19).

## 10. Build order

Each slice builds and tests against `main` alone (HARD RULE #17). The order puts the riskiest
unknown first, and each slice leaves the Studio no worse than today if the next one stalls.

**0. Stop the silent loss (a standalone PR, before any Filo code).**
- Report a failed checkpoint write: a toast, "Couldn't save this version: storage is full", with
  a link to the storage overlay.
- Move checkpoints to IndexedDB; migrate existing `SNAP_PREFIX` localStorage keys on first boot
  and delete them after.
- `saveCheckpoint` becomes async; its six call sites stop using its return value and read the list
  from the store's subscription.
- The workspace backup's export and import (`studio-store.ts:1190-1236`) move to the async store.
- Done when: an e2e fills the quota in WebKit and sees the toast, an e2e restores a backup that
  holds checkpoints, and no `SNAP_PREFIX` key remains after migration.

**1. Compose spike (throwaway code on a branch; the deliverable is a go/no-go section in this
note).**
- Inputs: a minimal patch format (`{ from, to, insert }` triples in source offsets), and a map
  from Compose slide nodes to source offsets taken from the emit baseline.
- It proves, or fails to prove: (a) applying a patch to only the slides it covers keeps the emit
  byte-identical for every untouched slide, on every deck in `test/integration/baseline-decks/`;
  (b) folds and caret survive; (c) a patch applies while Compose has focus without parking;
  (d) per-slide patches can be emitted from a ProseMirror transaction.
- **Go** when (a) through (d) hold and an apply costs 5 ms or less on the 134 KB deck in all three
  engines. **No-go** writes the full-resync fallback (§3.3, change 4) into this note before slice 2.

**Slice 0 as built (#2929).** One deviation from the plan above, for a smaller and safer change:
`saveCheckpoint` stayed synchronous. `checkpoint-store.ts` keeps an in-memory cache in front of
IndexedDB, so the call sites and the backup code did not change. Each checkpoint is its own record,
every change is one read-modify-write transaction, other tabs re-read over a `BroadcastChannel`, and
each change returns a promise that settles once it is durable (the Library's rename awaits it). An
independent checker found that the first cut's whole-list writes let two tabs erase each other's
versions; the per-record design is the fix. The quota e2e fakes the failure by making `put` throw
(in Chromium, Firefox and WebKit); a real full quota was not reached.

**Slice 1 result: GO** (2026-10-27; evidence on branch `claude/filo-slice1-compose-spike`,
`docs/src/lib/compose/scoped-resync.ts` and its `.spike.test.ts`, never to be merged).

| Criterion | Result |
|---|---|
| (a) Untouched slides stay byte-identical | Every deck in `examples/` plus the gallery (326 decks; the baseline folder holds only one). Edit, delete, insert and front-matter changes around the first, middle and last slide: **3,890 cases, 0 failures, 0 fallbacks**. Each emit equals the target exactly, every untouched slide keeps its node identity, and the undo back to the original text is exact too |
| (b) Folds and caret survive | The caret on an untouched slide keeps its text and offset, and a fold (the collapse plugin's node decoration) maps through the transaction onto the same slide, in all 3,890 cases |
| (c) Applies while focused, without parking | A real `EditorView`, focused, with a character typed before and after the apply: focus, caret and both keystrokes intact in Chromium, Firefox and WebKit |
| (d) Per-slide patches from a transaction | `emitPatch` trims two emits (both built from cached per-slide bytes) to `{ from, to, insert }`; applying it reproduces the emit in every case |
| Cost: 5 ms or less on the 134 KB deck in all three engines | **Patch-driven** apply, median of 7: Chromium 1.5 ms, Firefox 2 ms, WebKit 3 ms (max 3.5 / 4 / 10 ms). Node: 0.18 ms, against 9.25 ms for today's full rebuild |

What the spike changed in the design: re-parsing the whole new source cost 4-7 ms in the browsers,
so the apply is **driven by the patch**. It splits and parses only the slides the patch overlaps
(`scopedResyncPatch`), takes the whole-source path for a front-matter change, and checks that the
edited run still ends at the next slide's separator. That check is load-bearing: an edit that opens
an unclosed code fence swallows the slides after it, and removing the check fails the test that
compares the patch path with the whole-source path. On all 3,890 cases the two paths produce
identical slides.

Not proven by the spike, so slice 4 carries it: IME composition during an apply (the design waits
for `compositionend`), the real `ComposeView` with its guards and plugins (the spike used a plain
`EditorView` and the deck schema), and the `filoHistory` flag that replaces `isHistoryTransaction`.

**2. Filo core, in memory.** The text patch algebra, history, grouping, marks and anchors, limits;
property tests; the trace of §9. No Studio change.

**3. The commit path, with Markdown.**
- Every writer through the intent and the effect; `load` on every deck change.
- The deck editor's CodeMirror drops `history()`. The root keymap, `beforeinput`, shell Undo/Redo
  buttons, the reveal, the `Announce` region, the gate with its sanctioned list, the budget e2e.
- **Compose keeps its own history until slice 4.** While Compose has focus it owns the keys and the
  root keymap yields; its edits are committed to Filo as `origin: 'compose'`, and an emit produced
  by its own undo is committed as an entry labeled "Compose undo". The residual: in the Markdown
  pane, ⌘Z steps back through that entry, which re-applies the edit Compose undid. That step is
  labeled and revealed, so nothing is lost or hidden, and slice 4 removes it. The toasts drop "⌘Z"
  from their text while Compose is the open pane.
- Retires #1, #2 and #4. Slices 3 and 4 should land close together.

**4. Compose on Filo.** The five Compose changes of §3.3, with the spike's answer for change 4;
remove Compose's gate entries. Retires #3.

**5. Persistence.** The IndexedDB store, the sidecar and the reload path, tombstones, the two-tab
lock, the LRU, and the worker that narrows broad patches.

**6. Checkpoints become marks.** Migrate the slice-0 checkpoint store into marks; restores use the
rename mapping of §2.3. Retires #5.

**7. Other documents.** Library assets, Fabricate, Motion Studio, Lexicon, Acronyms; `CodeField`
drops its `history()` and its gate entry. Retires #6 and #7.

**8. Docs site, mark and package**, after slice 4 is merged.

## 11. Decisions

Settled by the owner on 2026-10-27:

| Question | Decision |
|---|---|
| Who owns undo | **Filo.** The editors drop their own `history()` |
| Entry cap | **Default 100 steps per document, hard maximum 500** |
| Live sessions | **Wrap `Y.UndoManager`** behind a Filo adapter |
| Name | **Filo** |
| Build order (D1) | **Risk first, as in §10**: the checkpoint fix, then the Compose spike, then the core |

Open, with the default that applies if nobody objects. The first five narrow or interpret a stated
requirement, so they are the owner's to confirm:

| Question | Default |
|---|---|
| "Off the main thread" | A measured budget: no history step over 16 ms on the main thread, and broad diffs never on it (§4.3) |
| "Generic" | v1 handles text only; the `json` adapter waits for a second user (§4.1) |
| "At all times" | Except inside a native field mid-edit, during IME composition and in present mode; and, if the Compose spike fails, an undo in Compose costs folds and caret (§3.5, §3.3) |
| "LRU with a max-changes limit" | Two bounds: a per-document entry cap and a cross-document LRU by bytes (§4.4) |
| Docs site, logo and package timing | After slice 4 is merged (§8) |
| Cross-document byte budget | 50 MB of IndexedDB |
| Per-document byte cap | 2 MB |
| Workspace backup carries history | No |

## 12. Review record

Three review rounds shaped this note (2026-10-27):

- **The adversarial trio** (red team, Munger inversion, independent checker) reviewed the first
  draft. The checker re-measured the localStorage quota in three engines; the red team ran two
  findings as throwaway tests. They corrected the facts (seven mechanisms, a WebKit-specific
  overflow, a 33x not 69x ratio, `Place.unit` as an index) and found the Compose hazards (the focus
  park, the `isHistoryTransaction` guards, lossy emits), the four write paths, the async-undo trap,
  and the two-tab and Clear-all holes. They also reordered the build to put the Compose spike first.
- **A second checker pass** re-read the revision. It measured broad diffs at 150-375 ms in Node
  (later 260-721 ms in browsers), showed that old marks could not restore, that the slice-3
  interim could double-undo, that `CodeField` lost its undo too early, and that a deck switch
  needs `load` rather than the base check.
- **A holistic checker pass** read the result end to end against the owner's requirements. It
  found the contradictions this rewrite removes: when the worker is built, an acceptance test the
  Long Tasks API cannot run, who commits a patch, a gate that would fail on code the build order
  keeps, a restore that would undo photo renames, an unreachable redo-branch mark, practice decks
  losing undo, reload cases that could not be told apart, and requirements narrowed without
  saying so. This version is a rewrite rather than a patch on the previous one, and slices 0 and 1
  now carry exit criteria.
