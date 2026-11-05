---
status: proposed
summary: >
  Audit of what the Studio publishes through Fuoco and what it does not. Fuoco today is a FOCUS
  hub: one record of where the reader is, delivered through selectors. Images, video, diagrams,
  renders, exports and AI edits publish nothing, and the preview frame, where most of them happen,
  has no outward channel at all: the export polls the frame every 120 ms for diagrams, seven places
  each hold their own idea of "is the preview stale", and 17 Studio files pass ad-hoc `window` events.
  Decided (§9), not built: a typed channel beside the focus record, in the same hub, in two parts:
  OCCURRENCES (a stream, every one delivered) and FACTS (state that changes, with its last value
  kept, so a late listener is never stranded). A per-frame bridge carries the preview runtime's
  facts out; lifecycle events (`started` / `settled` / `failed`) are the notify-only "pre and
  post"; a catalog of about one hundred and twenty events, built in four slices. The adversarial
  trio's findings (§10) set the integrity rules the first slice must ship with.
---

# Fuoco as the Studio's event channel

**Asked.** The owner sees Fuoco under-used: an image loading, a video playing and a Mermaid diagram
drawing publish nothing. The ask is a true event system that every part of the Studio talks
through, with critical events published even before they have a consumer, and possibly pre and
post events. This note audits what is published today, names the axes, proposes a catalog and
recommends an order. The owner picked on 2026-11-05 (§9); nothing is built yet.

## 1. What Fuoco is today

Fuoco (`docs/src/lib/fuoco/hub.ts`) holds ONE record, `Focus`: the focused unit, part, page, caret
and picked element, stamped with `seq`, `rev`, `origin` and `cause`. Views `report` facts and
`go` / `step` to request moves; subscribers pick fields with a selector and hear only when those
fields change, on a `sync`, `frame` or `idle` lane. Its guarantees (README §The guarantees) are the
reason it exists: a view never hears its own move, a late report never moves anyone, nothing
re-enters.

That is a STATE store, not an event stream. The difference matters for this ask:

| | A state record (Fuoco today) | An event stream (asked for) |
|---|---|---|
| Shape | The latest value | Every fact, in order |
| A missed delivery | Harmless: the next one carries the current state | A lost fact |
| `frame` lane | Delivers the latest value, drops the ones in between (by design) | Must batch, never drop |
| A subscriber joining late | Reads `get()` | Has missed the past |

So "image loaded" cannot become a field on `Focus`. Every focus subscriber's selector would run on
every image load, and the `frame` lane would drop two of three loads that arrive in one frame.
Events need a second channel. The hub already has most of what that channel needs: origins, an
outline revision to stamp each event with, and a delivery queue that cannot re-enter.

## 2. The audit: what happens and who hears it

Read from the code on `9dc7f3ed`.

| Fact | Where it happens | Who hears it today |
|---|---|---|
| The text changed, where, by whom | `hub.update` computes the span and origin (`hub.ts`) | Nobody: the hub publishes only focus. Compose re-diffs by hand (`change-flash.ts`, `followups.d/2884-p1`) |
| A render started / painted / settled | `DeckPreview`, `single-slide-render.ts`, `lib/runtime/index.js` | Nobody outside: seven holders keep their own staleness (`2026-10-23-fuoco-owns-preview-state.md` §How an edit travels) |
| The runtime's content pass finished | `onContentSettled` (`lib/runtime/index.js:558`) | In-frame listeners only (the overflow sweep) |
| A diagram drew, or gave up | Plugin host, markup `data-lattice-settle` | The export POLLS for it every 120 ms, for up to 4 s, then 12 s (`deck-export.js:647` `waitForDiagrams`). That is the export's one polling loop: `waitForMeasuring` (`:843`) already awaits a callback (`lib/core/measure-kit.js` `idle`) |
| A plugin's library loaded or failed | `ensurePayload` injects a `<script>` and settles it `loaded` or `failed` (`lib/plugins/host-browser.mjs:157`) | The plugin host only, which then hydrates or releases its figures |
| A plugin reported a diagnostic | `ctx.report(id, detail)` pushes onto `env.pluginDiagnostics` during the render (`lib/plugins/host.js:110`) | Whoever reads that render's `env` afterwards. Nothing is told when one appears |
| A plugin renderer threw, or a hydrate ran past its budget | The host degrades it to `degradesTo`, or settles it `final` (`2026-09-27-plugin-system.md` §4.6) | Nobody: the author sees the fallback without a reason |
| The Markdown editor gained or lost the keyboard, took a paste, accepted a completion | CodeMirror (`docs/src/components/studio/Editor.tsx`: `autocompletion` at :491, the paste filter at :105, `lintGutter` at :867) | The editor itself. The hub hears the caret (`report`) and the text (`update`), nothing else |
| Compose inserted a block, opened a node view, parked or applied an outside change | ProseMirror (`ComposeView.tsx`; the image, raw and code node views; `resyncFrom` at :2747) | Compose itself, through about 22 refs (`followups.d/2884-p1`) |
| A command ran | The Studio's action list, 26 `StudioCommandId` verbs (`studio-commands.ts`). Only lessons call `runCommand` (`use-studio-lesson.ts:129`); the palette calls each row's `run` directly (`CommandPalette.tsx:193`), and shortcuts call `setState` themselves (⌘K at `StudioShell.tsx:4113`) | The caller only. Nothing records what ran or how |
| A keyboard shortcut fired | `addEventListener('keydown'` in 6 Studio files, plus keymaps registered as arrays (`live-controller.ts`, `use-studio-lesson.ts`); `StudioShell.tsx` alone has five, :566 to :5053, CodeMirror's keymaps, the present keymap (`lib/core/present-transport.mjs` `PRESENT_KEYMAP`) | Each listener only |
| Text was copied or cut | At least nine clipboard writers: the code block's copy button (`window.__latticeCodeCopy`, in the preview runtime; the Studio host already calls it, `code-copy-host.js:28`), the chat's code block (`ChatCodeBlock.tsx:70`), the icon name (`StudioShell.tsx:8319`), the crash report, Finish Studio's CSS, the read-aloud trace, Live's log and its link (`live-controller.ts:2814`, `:2834`), and the editors' own ⌘C / ⌘X | Each writer, which shows its own "Copied" notice or none |
| Present started, a slide was shown, the Stage window opened or closed, notes toggled, a rehearsal ran | `PresentOverlay.tsx` (notes :182, rehearsal clock :264, auto-advance :550-576, presenter view :626); `present/stage-window.js` (the `ready` / `nav` / `closed` handshake over `postMessage`, :792-813); `present/rehearsal.js` (the dwell plan and its coaching beats); the keys, swipes and wheel through `lib/core/present-transport.mjs` | The overlay's own state. The Stage's messages reach one handler in `stage-window.js` |
| Something was dragged or dropped | Six owners, each with its own wiring: a deck file dropped anywhere opens it (`deck-drop.ts`, which REFUSES a drop in the editors, a dialog or Present); the slide strips reorder by press-and-drag (`strip-actions/drag.ts`, plain DOM); the Library splits a dropped set of files (`Library.tsx:82`); the motion drawing well (`MotionStudio.tsx:449`); Compose and the Markdown editor place dropped text or images at a caret (ProseMirror's own drop handling, `ComposeView.tsx:199`); the Architect chat takes dropped photos (`ChatAttach.tsx`, `ChatPhotos.tsx`) | Each owner. A refused drop shows its own toast; no other zone knows a drag is in progress |
| A panel, sheet, drawer or menu opened or closed | About 25 `useState` flags in `StudioShell.tsx` (`historyOpen`, `shareOpen`, `workspaceOpen`, `cmdOpen`, `insertOpen`, `iconsOpen`, `presentOpen`, `deckTab`, `settingsView`, `mobilePane`, `chromeCollapsed`, …) | Only the shell. The tour library (Vetrina) learns that a panel opened by polling the DOM (`lib/vetrina/recipes.ts` `waitFor`, "the one public poll-wait"); focus return after a drawer child closes is its own flag (`drawerPendingReturn`, `StudioShell.tsx:951`) |
| An author saved or deleted a Studio plugin | `saveStudioPlugin` / `deleteStudioPlugin` (`docs/src/components/studio/plugin-library.ts`) | The caller's own promise |
| A Live session started, someone knocked, joined, left, reconnected, or a remote edit arrived | Tavola (`docs/src/lib/tavola/session.ts`: `onPeerJoin` :923, `onPeerLeave` :947, `onMessage` :983) and the Studio's controller (`live/live-controller.ts`, 3,103 lines); Follow has its own small seam (`live/follow-bus.ts`, `useViewKey` / `useAppliedKey`) | The Live panel and pill, through the controller's own React state. A remote edit reaches the hub as an ordinary `update` from the shell, so the change flash cannot tell a collaborator's edit from the Architect's |
| The Architect was asked, used a tool, streamed, replied, was stopped, failed or compacted | `ArchitectChat.tsx` (Stop through its `AbortController`, :391), `chat-agent.ts`, `chat-activity.ts`, `chat-compact-run.ts`; the in-browser model's worker posts `progress` / `loaded` / `token` / `done` (`ai/architect-model.js` :617-628) | The chat panel's own state, plus `window` `lattice-spend-changed` (5 senders) and `lattice-chat-agent-ready` |
| The Coach assessed the deck, a finding was opened or fixed, the deck profile changed | `coach/coach-core.ts` (`assessDeck` :54, `applyProfileToSource` :116), `coach/FindingCard.tsx`, `coach/photo-contrast-watch.ts` | The Coach panel only. It re-runs its assessment on its own schedule; the rail cannot mark a slide the Coach has a finding on |
| The Library changed: an asset saved, deleted, restored to a version, imported or refused | One IndexedDB store, `library/asset-store.js` (`putAsset` :188, `deleteAsset` :379, `restoreAssetVersion` :360), holding seven kinds: `theme`, `component`, `finish`, `plugin`, `scene` and `refdoc`, and media, which writes to the same object store through its own module (`media-store.ts`: `saveMedia`, `deleteMedia`, `setMediaScope`, `setMediaCaption`). Imports go through `importParsedBundle` (`library/import-parsed.ts`), refusals through `refuseGallery` and the name guards (`save-guard.ts`, `reserved-names.ts`) | Nobody. Twelve call sites read the store with `listAssets` (eleven outside `asset-store.js`, mostly the per-kind `list*` loaders), and their callers re-ask after their own write, so a theme saved in Finish Studio reaches an open Library panel only when it is re-opened. Another tab's save is never seen |
| A chart drew, or fell back | Engine-drawn SVG for most of the 28 kinds; the runtime lays out `state-chart` and `flowchart` with dagre (`index.js:52-80`) | Nobody. When dagre is missing, the chart falls back to the reading-order grid and the only signal is a `console.warn` (`index.js:197`) |
| A slide's orientation changed | `stampOrientation` writes `data-orientation` from the slide's measured aspect (`index.js:2710`); the fluid-view toggle flips it (`index.js:3838`) | CSS and the chart transforms, through markup. The host is never told |
| The view resized | `window` `resize` (`index.js:2798`, `3687`) and a `ResizeObserver` on the slide box (`index.js:284`) | In-frame re-measure and the fit sweep only |
| Fonts finished loading | `document.fonts` `loadingdone` (`index.js:455`) | In-frame re-measure only |
| A slide overflowed / fit resolved | Fit sweep, `fitGeneration` (`index.js:3456`) | Markup classes only |
| An image loaded or failed | The browser | Nobody: the runtime listens to no `load` / `error` on media |
| A video played, paused, ended | The browser (`imagery/video`) | Nobody |
| An export started, moved through its stages, met an unreachable image, finished, failed | `export/deck-export.js` (`onProgress(done, total, phase)` with `photo` and `write` phases, :2212; `recordUnreachableImages` :1498; the PDF, PPTX and picture workers), `share-export.ts` (`onProgress` :799) | The status line of the sheet that started it, through an `onStatus` callback. An export started from the palette and one from the Share sheet each draw their own |
| An AI reply arrived, an edit was applied, spend changed | `ArchitectChat.tsx`, `chat-agent.ts` | `window` event `lattice-spend-changed` |
| The model or voice setting changed | `architect-model.js`, TTS settings | `window` events `db-model-changed`, `db-voice-changed` |
| A speaker note was committed or left | Notes editor | `window` events `cs-note-commit`, `cs-note-left` |
| The Stage window opened, showed a slide | `present/stage-window.js` | `postMessage` to the opener, read in one place |

Twenty non-test files under `docs/src` dispatch ad-hoc `window` events
(`grep -rlE "dispatchEvent\??\.?\(new (Custom)?Event\(" docs/src`, with test, spec, `dist/` and
generated files excluded): 17 in the Studio, the Playground and their shared libraries (one of them
`lib/site-chrome.ts`), and three site `.astro` pages
(`components/site/PwaHead.astro` and the Fuoco and Filo library demo pages), which are the
docs site's own chrome and stay out of scope. Beside the five named in the table there are about ten more, each a constant:
`SETTINGS_EVENT` (`lattice:settings`), `lattice:notify-action` / `-dismiss`, `lattice:preview-zoom`,
`COMMENTS_EVENT`, `CHROME_CHANGE_EVENT`, `DECKS_CLEARED_EVENT`, `FLUSH_EVENT`,
`OPEN_CRASH_REPORT_EVENT`, `READY_EVENT`. Each is an untyped,
unordered, originless channel: a listener cannot tell who sent it, cannot ignore its own, and gets
it re-entrantly inside the sender's call.

The pattern under the table: **the facts exist, they are just trapped.** Most are trapped in the
preview frame, which has internal signals (`onContentSettled`, the settle markup, the fit
generation) and no way to tell the host. The rest are trapped in the component that made them.

## 3. The axes

1. **Where events live.** A second channel in the Fuoco hub; a sibling library; or fields on
   `Focus` (ruled out in §1).
2. **Pre and post.** Notify-only lifecycle pairs, or cancelable "before" events that a listener can
   veto or modify.
3. **How a frame's facts reach the host.** The preview frame is a same-origin `srcdoc`; the draw
   host is a sandboxed cross-origin frame; the Stage is a separate window.
4. **Typing and naming.** A typed event map, or free strings.
5. **What the core knows.** Fuoco's core is domain-free and gated (`checkFuocoBoundary`). Event
   names like `figure.drawn` are Lattice's, not Fuoco's.

## 4. Recommendation per axis

**4.1 A second channel in the same hub.** `hub.emit(origin, type, payload)` and
`hub.on(type | type[] | '*', listener, { lane, ignoreOrigin })`. Each event carries an envelope
(its own sequence number, its `origin`, and the `rev` its EMITTER computed it against; §10 says why
none of these may come from the hub's clock) and is delivered through the same queue as focus, so
an event emitted inside a focus delivery waits for it, and a listener that emits cannot recurse.
Lanes keep their meaning for WHEN (`sync` now, `frame` at the next frame, `idle` when idle), but an
event lane batches: a `frame` listener gets every event since the last frame, in order, never only
the latest, up to a cap (§10.4). `on()` has no default lane: the caller names one.

**Two kinds of entry (§10.1).** An OCCURRENCE happened once (`clipboard.copied`, `command.ran`,
`figure.drawn`) and is a stream. A FACT is state that changes (`panel.opened` / `closed`,
`live.joined` / `left`, `fonts.settled`, `coach.assessed`) and is kept: the channel holds each
fact's last value, `facts.get(type)` reads it, and `on(type, fn, { replay: true })` delivers it on
subscribe. The map declares which each entry is. A consumer that WAITS on something uses
`until(check, type, { budgetMs })`, which reads real state first, then subscribes, then reads again
on each wake: the event is the wake-up and the state is the truth.

Why the same hub and not a sibling: the guarantees are the hub's, and an event is most useful
stamped against the revision it happened in (`render.settled` for `rev` 41 is stale the
moment `rev` 42 exists). `followups.d/2884-p1` already recommends exactly this shape for its change
channel (`hub.subscribeChanges`); this generalizes it rather than building it twice.

The core stays generic. The channel is its own module (`docs/src/lib/fuoco/events.ts`) that
`createFocusHub` composes so both share one delivery queue, exposed as `hub.events` on a separate
`FocusHubWithEvents` type, so the published `FocusHub` interface gains no method and nobody who
implements it breaks. It takes an event map type and knows no names. Lattice's map lives in the
adapter (`docs/src/lib/lattice-events.ts`), with its ledger test (§10.2). The hub is passed to every
emitter as an argument, never reached through a global.

**4.2 Pre and post as lifecycle, notify-only.** Each long-running thing gets one id and three
events: `X.started { id }`, `X.settled { id, ms }` or `X.failed { id, reason }`. A consumer that
wants "pre" listens to `started` (show a spinner, mark a pane stale); "post" is `settled`. No
listener can veto or change what happens.

Cancelable events are deliberately left out. A veto means the emitter must wait for every listener,
which makes emitting asynchronous and order-dependent, and breaks the no-re-entry queue the hub is
built on. The few real veto points (leave with unsaved changes, export with lint errors) are
REQUESTS, not events, and stay as explicit calls at the one place that decides. Add a cancelable
form only when a named case cannot be written that way.

**4.3 A frame bridge, installed by the host on the parent, one record per frame.** The host
installs ONE `__latticeEvents` object on the page that embeds the frames, as
`installPreviewDrawHost` installs `__latticeDrawHost` (`preview-draw-host.ts:35`, `defineProperty`,
so nothing can replace it), and the runtime reaches it through `window.parent` inside the same
`try` that guards its other host lookups (`index.js:3779-3790`), because a cross-origin parent
throws on access. It cannot live on the frame's own window: a property defined on
`iframe.contentWindow` does not survive the frame loading its `srcdoc` (a Chromium probe, §8), and
every builder sets `srcdoc` (`deck-export.js:546`, `deck-render.js:584`,
`single-slide-render.ts:2400`, `PrintOptionsPanel.tsx:196`).

The runtime calls `emit(window, type, payload)`, passing its own window. The host keeps a map from
each frame's window to its record `{ frameId, role: 'preview' | 'capture' | 'print' }`, written when
it creates the frame (`role` read from the same `data-lattice-export` marker the draw host keys on),
and drops a call from a window it does not know. It is NOT copied from `__latticeDrawHost` in one
respect: that one returns null in capture frames (`index.js:3783-3785`), and the bridge must answer
there, because the export is its first consumer.

The host side copies each payload (`structuredClone`), checks it against the event's closed schema,
stamps `origin`, `frameId` and `rev` itself (§10.4 says from what), and delivers on a host
microtask, never inside the frame's call, so nothing thrown on the host unwinds into the runtime
mid-pass. The CLI export, the player and marp-vscode install nothing, so they behave exactly as
now. The Stage window and the draw host keep `postMessage` (separate realms); their receivers
re-emit only the types they are allowed, and the draw host's only for job ids the host issued, so
plugin code cannot forge a `figure.drawn`.

This is a `lib/runtime` change, and the runtime is bundled into exports, so the exported bytes
change even though their behavior does not. Per the QUALITY BAR that needs the owner's export
sign-off: a demo deck rendered dark and light, before and after.

**4.4 A typed map with dotted names.** `domain.verb-ed`: `doc.changed`, `figure.drawn`. One
TypeScript map gives every `on` and `emit` its payload type, and a test fails on an emitted name
that is not in the map.

## 5. The catalog

Grouped by domain; the slice column is the build order in §6. **Consumer** names the code that
would read it on day one; a dash means it ships ahead of a consumer, as asked.

| Event | Payload (beyond `seq`, `rev`, `origin`) | Slice | Consumer on day one |
|---|---|---|---|
| `doc.changed` | `prevRev`, `spans[]` (checked by the hub; NEW work: `update` computes a span today only when a unit is focused, `hub.ts:463-473`, so slice 1 makes it compute one on every change) | 1 | Compose change flash (`2884-p1`), deletes its diff |
| `doc.loaded` | `source: 'file' \| 'share' \| 'history' \| 'new'` | 1 | — |
| `doc.saved` / `doc.save-failed` | `bytes` / `reason` | 1 | The silent failed save Filo's note found (`2026-10-27-filo-undo-history.md`) |
| `history.undo` / `history.redo` | `steps` | 1 | — |
| `render.started` | `view`, `id` | 2 | Staleness ledger (`2026-10-23` design A) |
| `render.painted` | `view`, `id`, `ms` | 2 | Ledger; the flash bench reads it instead of a mutation observer |
| `render.settled` | `view`, `id`, `ms`, `generation` | 2 | Ledger; replaces `playground-sync`'s `renderedSource` |
| `render.failed` | `view`, `id`, `reason` | 2 | Crash report sheet |
| `figure.started` (`figure.*` follows the plugin host's one state machine, `ctx.settle`: `pending → rendered \| error \| unavailable → final`; the markup also has a transient `hydrating`, `host-browser.mjs:23`, which is not an event) | `plugin` (`mermaid`, `plot`, …), `unit`, `id` | 2 | — |
| `figure.drawn` | `plugin`, `unit`, `id`, `ms` | 2 | Export: a wake-up for `waitForDiagrams`, which still reads the settle markup first and after (§10.1) |
| `figure.unavailable` | `plugin`, `unit`, `id`, `reason` | 2 | Export; an author-facing "this diagram did not draw" |
| `figure.failed` | `plugin`, `unit`, `id`, `reason` (the `error` state) | 2 | Crash report sheet |
| `figure.reclaimed` | `plugin`, `unit`, `id` (a late library took an `unavailable` figure back) | 2 | — |
| `plugin.library-loading` / `plugin.library-loaded` / `plugin.library-failed` (a FACT) | `plugin`, `file` (our staged file name: a planned `SANCTIONED_EVENT_STRINGS` entry), `ms`, `reason` | 2 | Export: a wake-up for its `until` read of the figures; an "offline, Mermaid could not load" cue |
| `plugin.diagnostic` | `plugin`, `id`, `message` (the plugin's DECLARED text), `detail` (deck-derived: SENSITIVE, and rendered as text only, §10.5), `unit` | 2 | The lint panel, live instead of after the render |
| `plugin.degraded` | `plugin`, `unit`, `fence`, `reason: 'threw' \| 'timed-out' \| 'non-string'` | 2 | An author-facing "this block fell back, and why" |
| `plugin.used` | `plugins[]` (the set the deck now uses), `added[]`, `removed[]` | 2 | Library "in use" badges; warming a library before its first figure (§4.8 of the plugin note) |
| `plugin.saved` / `plugin.deleted` | Folded into `library.saved` / `library.deleted` with `kind: 'plugin'` (below) | — | — |
| `chart.started` | `kind` (`funnel`, `state-chart`, …), `unit`, `id`, `path: 'engine' \| 'runtime'` | 2 | — |
| `chart.drawn` | `kind`, `unit`, `id`, `path`, `ms`, `orientation` | 2 | Export: a wake-up for its `until` read (there is no chart poll today; a runtime-laid-out chart is read the same way as a figure) |
| `chart.fallback` | `kind`, `unit`, `id`, `reason` (`layout-engine-missing`, …) | 2 | Replaces the `console.warn` with an author-facing cue |
| `view.resize-started` / `view.resized` | `view`, `width`, `height`, `canvasScale` | 2 | Fit sweep and chart re-layout, in the host instead of each pane |
| `view.orientation-changed` | `view`, `unit` (null for the whole view), `from`, `to` (`landscape` \| `square` \| `portrait`), `cause: 'resize' \| 'fluid-toggle' \| 'device'` | 2 | Rail thumbnails and the Stage, which re-fit on a turn |
| `view.mode-changed` | `view`, `mode: 'fixed' \| 'fluid'` | 2 | — |
| `fonts.settled` | `families[]` (deck-derived, SENSITIVE), `ms` | 2 | Export: a wake-up for its `doc.fonts.ready` wait (`deck-export.js:556`) |
| `fit.overflow` / `fit.resolved` | `unit`, `part` | 2 | Rail pill warning |
| `asset.loaded` | `kind: 'image' \| 'video' \| 'audio'`, `asset` (a host-issued id, never the URL: a `src` can be a signed URL or a multi-megabyte `data:`), `unit`, `ms`, `bytes?` | 3 | — |
| `asset.failed` | `kind`, `asset`, `unit`, `reason` | 3 | — (an author-facing broken-image cue) |
| `media.played` / `media.paused` / `media.ended` | `asset` (host-issued id), `unit`, `at` (seconds) | 3 | — (auto-advance, narration sync, presenter timer) |
| `present.*`, `stage.*`, `rehearsal.*` | See §5, Present mode | 3 | |
| `export.*` | See §5, Export | 3 | |
| `lint.changed` | `errors`, `warnings` | 3 | — |
| `ai.requested` / `ai.replied` / `ai.applied` | `id`, `model` (a planned `SANCTIONED_EVENT_STRINGS` entry), `surface` (`chat`, `fabricate`, `reshape`, `describe-photo`, …), `tokens`, `usd`, `units[]` | 4 | Change flash attribution (`2884-p1` axis 4). This is the MODEL layer, for every surface that calls one; the conversation is `chat.*` (below) |
| `spend.changed` | `usd` | 4 | Replaces `window` `lattice-spend-changed` |
| `settings.changed` | `key` (`model`, `voice`, …) | 4 | Replaces `db-model-changed`, `db-voice-changed` |
| `note.committed` / `note.left` | `unit` | 4 | Replaces `cs-note-commit`, `cs-note-left` |

About one hundred and twenty names. Image `load` and video `play` are in slice 3 because nothing reads them yet;
they are cheap to add once the bridge in slice 2 exists, and expensive before it.

**The editors.** "Code" is the Markdown source editor (CodeMirror); "prose" is Compose, the rich
editor (ProseMirror). The hub already hears each one's caret and text, so these events cover what
that leaves out:

| Event | Payload | Slice | Consumer on day one |
|---|---|---|---|
| `editor.focused` / `editor.blurred` | `editor: 'markdown' \| 'compose' \| 'notes'` | 3 | Which editor owns the keyboard, for the global undo keymap (`2026-10-27-filo-undo-history.md`) and the shortcut sheet |
| `editor.mode-changed` | `from`, `to` (`markdown` \| `compose`, the shell's `editMode`) | 3 | — |
| `editor.pasted` | Folded into `clipboard.pasted` (below) | — | — |
| `editor.completed` | `editor`, `kind: 'component' \| 'modifier' \| 'asset' \| …`, `label` (SENSITIVE: an asset label is the author's) | 3 | — (ranking completions by what authors pick) |
| `compose.block-inserted` | `kind` (`image`, `table`, `code`, `raw`, a component), `unit` | 3 | — |
| `compose.resync-parked` / `compose.resync-applied` | `rev`, `waitedMs` | 3 | The change flash, and an "outside change waiting" cue while the caret is in a note |

**Commands and shortcuts.** The verbs are defined in one list, but today only lessons run them
through it (`runCommand`, `use-studio-lesson.ts:129`). Slice 3 routes the palette, the menus and
every shortcut that runs a verb through one `runCommand(id, via)`, which emits `command.ran` and
then runs it, so one event covers them all; without that, a shortcut-run verb would never emit
`command.ran`:

| Event | Payload | Slice | Consumer on day one |
|---|---|---|---|
| `command.ran` | `id` (a `StudioCommandId`), `via: 'palette' \| 'shortcut' \| 'lesson' \| 'menu' \| 'tour'`, `ms` (only for a verb that returns a promise) | 3 | — (a "recent commands" group in the palette; lessons check a step happened by hearing it instead of reading the DOM) |
| `command.failed` | `id`, `via`, `reason` (only for a verb that returns a promise) | 3 | Crash report sheet |
| `command.not-found` | `query` (what was typed into the palette when it closed with no match; SENSITIVE, §10.5: never delivered to `*`, never logged, never crosses a tab) | 3 | — (finding the verbs authors look for and we do not have) |
| `shortcut.fired` | `keys` (`Mod+Shift+P`; a planned `SANCTIONED_EVENT_STRINGS` entry, since it is our keymap's text), `scope: 'global' \| 'markdown' \| 'compose' \| 'present' \| 'stage'`, `command` (the `StudioCommandId` it ran, if any) | 3 | The shortcut sheet could highlight the keys an author actually uses |

`shortcut.fired` fires when a MAPPED shortcut ran, never on a plain `keydown`: a keystroke is text,
and `doc.changed` already carries it. A shortcut that runs a command emits `command.ran` and then
`shortcut.fired`, with consecutive event sequence numbers, so a listener that wants "what ran"
hears `command.ran` alone.
The palette opening and closing is `panel.opened` / `panel.closed` with `panel: 'command'`.

**Selection and the clipboard.** A selection changing is the focus (`head` and `anchor`), which the
hub already publishes and coalesces per frame, so it stays off the event channel. What is missing
is the moment a selection is FINISHED, which is the moment anything acts on it:

| Event | Payload | Slice | Consumer on day one |
|---|---|---|---|
| `selection.settled` | `surface` (`markdown`, `compose`, `notes`), `from`, `to`, `length`, `units[]` | 3 | — (a floating format bar; "ask the Architect about this"; restyling a picked range) |
| `selection.cleared` | `surface` | 3 | The same, to hide |
| `clipboard.copied` / `clipboard.cut` | `surface`, `what` (`selection`, `code-block`, `chat-code`, `icon-name`, `crash-report`, `css`, `trace`, `live-log`, `live-link`), `kind: 'text' \| 'html' \| 'image'`, `bytes` | 3 (2 for a code-block copy in the Playground and Present, where the copy runs inside the frame; the Studio host already calls it) | One "Copied" notice instead of nine |
| `clipboard.pasted` | `surface`, `kind`, `bytes`, `lines`, `stripped` (a COUNT of the characters the paste filter removed, never the characters) | 3 | — (replaces `editor.pasted` above) |

`selection.settled` fires once per selection, when the pointer lifts or the shift-arrow key is
released and the range is not empty, never while a drag is in progress. A selection on the
preview is already a `pick` (`Focus.element`). **No clipboard event carries the text.** Events
reach every `*` listener (all but their SENSITIVE fields, §10.5), including logging on the `idle`
lane, and a paste can be a password or a
client's numbers; a listener that needs the text reads it from the editor that holds it.

**The Library.** One store, so one family, keyed by `kind` rather than one name per kind:

| Event | Payload | Slice | Consumer on day one |
|---|---|---|---|
| `library.saved` | `kind`, `id`, `name` (SENSITIVE, §10.5), `created` (new, or an overwrite), `changed[]` (for an edit in place: a photo's `scope` or `caption`), `version` (for the three versioned kinds: theme, component, finish) | 3 | The per-kind `list*` loaders' callers re-read on the event instead of on mount: an open Library panel, the theme picker, the fence catalog and Compose's insert menu (for a plugin) |
| `library.deleted` | `kind`, `id`, `name` (SENSITIVE) | 3 | The same readers; a deck that names the deleted theme can warn |
| `library.restored` | `kind`, `id`, `version` | 3 | The same readers, and the version list |
| `library.imported` | `counts` (per kind), `renamed[]` and `skipped[]` (asset names, SENSITIVE) | 3 | One import summary for the Library's drop, the package zip and an import from a deck |
| `library.refused` | `kind`, `name` (SENSITIVE), `reason: 'name-clash' \| 'reserved' \| 'remote-refs' \| 'quota' \| 'too-large'` | 3 | One refusal notice, the same one `drag.dropped` uses |
| `library.applied` | `kind`, `name` (SENSITIVE), `unit` (null for the whole deck) | 3 | — (which Library items decks actually use) |

`library.*` is emitted by the STORE layer (`asset-store.js`, `media-store.ts`), once per logical
operation, after the first transaction COMMITS (`oncomplete`, the moment `asset-history.js` already
treats as "it is saved"), so a listener that re-reads finds the new record. A restore emits
`library.restored` only, not also the `saved` its inner `putAsset` makes; a delete emits once the
record is gone, whatever happens to the version cleanup after it; the bulk media deletes
(`deleteDeckMedia`, `deleteDeckScopedMedia`) emit one `library.deleted` per record. A `library.*`
listener never writes to the store synchronously in response.

**Other tabs.** The store is shared by every tab on the origin and the hub is not (§7), so another
tab's save is a fact about THIS tab's Library that nothing reports today. An adapter re-emits
`library.*` from a `BroadcastChannel` with `origin: 'other-tab'`. **The owner said yes
(2026-11-05); it ships in slice 3.** It reuses the pattern `checkpoint-store.ts` already runs for
checkpoints (a module singleton channel, `:66`, `:255-275`), so it is the second cross-tab piece in
the Studio, not a new mechanism. Its rules:

- only `library.*` crosses, never focus, selection, clipboard or any SENSITIVE field (§10.5);
- every message carries a per-tab nonce and a schema version; a tab drops its own nonce (a
  `BroadcastChannel` also delivers to a second instance in the same tab) and any version it does
  not know (two tabs can run different deploys);
- a tab never re-broadcasts an event that arrived from another tab, and a `library.*` listener
  never writes in response (above), so a save cannot ping-pong;
- the payload is the metadata, never the asset; the receiving tab re-reads the store.

Finish Studio's `storage` listener (`FinishStudio.tsx:270-279`) is NOT part of this: it syncs the
workspace's drag-handle style, a setting, and stays as it is.

**Live collaboration.** Tavola stays the wire: it carries bytes between browsers, under its own
gate (only admitted members, only editors' edits). **The event channel never sends anything over
it.** What changes is that the LOCAL tab hears about the session, and that a collaborator's edit
says whose it is:

| Event | Payload | Slice | Consumer on day one |
|---|---|---|---|
| `live.started` / `live.ended` | `role: 'host' \| 'guest'`, `reason` on end (`left`, `host-ended`, `denied`, `dropped`) | 3 | The pill and the panel, which read the controller's state today |
| `live.knocked` | `peer` (a session id; the knocker's typed name stays in Tavola, where the admit prompt reads it) | 3 | The host's admit prompt; a sound or a title-bar badge when the Studio is in the background |
| `live.admitted` / `live.denied` | `peer`, `may: 'edit' \| 'view'` | 3 | — |
| `live.joined` / `live.left` | `peer`, `color` (one of the four session colors) | 3 | The rail and map can show who is on which slide without each reading Tavola |
| `live.reconnecting` / `live.reconnected` | `peer` (null for this tab's own link), `waitedMs` | 3 | One "reconnecting" notice |
| `live.path-changed` | `peer`, `path: 'host' \| 'srflx' \| 'prflx' \| 'relay'` | 3 | — (the diagnostics overlay) |
| `live.follow-started` / `live.follow-stopped` | `target` (a peer) | 3 | Every pane that `useAppliedKey`s, so a pane can show "following Ada" without the follow bus knowing about panes |
| `live.message` | `from` (Tavola's transport sender), `bytes` | 3 | The chat badge. Never the text (the clipboard rule, §5) |

**A remote edit is a `doc.changed` with `origin: 'peer:<id>'`.** That is the one change to an
existing event, and it needs one new call: the Live controller feeds the hub ITSELF, once per
applied Yjs transaction, with `by: 'peer:<id>'`, BEFORE it hands the text to React. The shell's
render-time `update` (`StudioShell.tsx:1888`, `by: 'shell'`) then finds equal text and is a no-op.
Without that call the edit reaches the hub only through the shell, which never knows a peer. The
change flash can then paint a collaborator's edit in their session color. A
collaborator's caret is AWARENESS (Tavola's presence state), which is state, not an event: it
stays on Tavola's own channel and the `LivePointers` view, the way the local caret stays on focus.
`follow-bus.ts` stays as it is. It is a registry of "where is this pane" keys, which is the job of
a key-value map, and the events above report around it.

**The Architect chat.** `ai.*` is the model call, whichever surface made it; `chat.*` is the
conversation around it:

| Event | Payload | Slice | Consumer on day one |
|---|---|---|---|
| `chat.sent` | `id`, `attachments` (count by kind), `grounded` (slides the message was grounded on) | 4 | — |
| `chat.tool-used` | `id`, `tool` (the agent's tool name), `ms` | 4 | The activity row (`chat-activity.ts`), which today parses the run |
| `chat.replied` | `id`, `ms`, `tokens`, `usd` | 4 | The cost row; `spend.changed` follows it |
| `chat.stopped` | `id` (the author pressed Stop) | 4 | — |
| `chat.failed` | `id`, `reason: 'offline' \| 'no-key' \| 'rate-limit' \| 'model-error'` | 4 | One error surface instead of the chat's own |
| `chat.compacted` | `before`, `after` (transcript sizes), `usd` | 4 | — |
| `model.loading` / `model.loaded` / `model.failed` | `model`, `file` (our model ids and file names: planned `SANCTIONED_EVENT_STRINGS` entries), `progress` (0-1) | 4 | Replaces `lattice-chat-agent-ready`; one loading bar for the in-browser model |

A streamed token is not an event. It is the same text as the reply, sixty times a second, and only
the bubble drawing it reads it; `chat.replied` fires once it is done. No chat event carries the
message or the reply text.

**The Coach.** The Coach is a reader of the deck, so its events are its verdicts:

| Event | Payload | Slice | Consumer on day one |
|---|---|---|---|
| `coach.assessed` | `rev`, `craft`, `style` (scores), `findings` (count by severity), `profile` | 3 | The rail marks a slide with a finding; the pre-export check reads the last verdict instead of re-running it |
| `coach.finding-opened` | `rule`, `unit` | 3 | The editor reveals the slide (today the card's `jump` field, `coach-core.ts:127`) |
| `coach.fix-applied` | `rule`, `unit`, `via: 'coach' \| 'architect'` | 3 | — (which rules authors accept a fix for) |
| `coach.profile-changed` | `from`, `to` (`applyProfileToSource`) | 3 | — |
| `coach.photo-contrast` | `unit`, `asset` (host-issued id), `ratio`, `passes` | 3 | The photo coach's warning (`photo-contrast-watch.ts`) |

`coach.assessed` carries the `rev` it judged, so a listener can tell a verdict on older text from a
current one: the same rule a stale `render.settled` follows. The Coach itself can stop scheduling
its own re-runs and listen for `doc.changed` on the `idle` lane.

**Export.** One lifecycle per export (§4.2), whatever the format and whichever control started it:

| Event | Payload | Slice | Consumer on day one |
|---|---|---|---|
| `export.started` | `id`, `format: 'pdf' \| 'png' \| 'pptx' \| 'webpage' \| 'print' \| 'lattice' \| 'marp' \| 'markdown'`, `slides`, `via: 'share' \| 'palette' \| 'shortcut'` | 3 | One progress strip for every export, instead of each sheet's `onStatus` line |
| `export.phase` | `id`, `phase: 'capture' \| 'wait-figures' \| 'render' \| 'encode' \| 'write' \| 'assemble'`, `done`, `total` | 3 | The same strip. (An earlier draft called it `export.progress`.) The PDF path already reports `photo` and `write` phases, and the others get named ones |
| `export.asset-missing` | `id`, `asset`, `unit`, `reason` (NEW: today `recordUnreachableImages`, `deck-export.js:1498`, records only the path, when an image is complete with no width; telling cross-origin from 404 from too-large is slice-3 work) | 3 | One "these photos are not in the file" notice, which today is assembled per format (`latticePhotoNote`) |
| `export.settled` | `id`, `bytes`, `pages`, `ms`, `name` (SENSITIVE, §10.5) | 3 | The "export again" row, and a lesson step that checks an export happened |
| `export.failed` | `id`, `phase`, `unit` (the slide that broke it, when known), `reason` | 3 | Crash report sheet |
| `export.cancelled` | `id` | 3 | — |
| `export.delivered` | `id`, `via: 'download' \| 'share-sheet' \| 'clipboard' \| 'link'` | 3 | — |

These are emitted by the HOST code that runs the export, not by the runtime inside the capture
frame, so they change no exported byte: the QUALITY BAR's export sign-off is owed by slice 2's
runtime bridge, never by these. `export.phase` with `wait-figures` is the step slice 2's
`figure.drawn` will shorten, so the two together show how long an export waited on diagrams.

**Present mode.** Presenting has three parts with their own events: the presenter's overlay, the
audience's Stage window, and the rehearsal planner.

| Event | Payload | Slice | Consumer on day one |
|---|---|---|---|
| `present.started` / `present.ended` | `surface: 'present' \| 'player' \| 'rehearsal'`, `flat` (start slide); on end `ms`, `shown` (how many slides were shown) | 3 | — |
| `present.slide-shown` | `flat`, `via: 'key' \| 'swipe' \| 'wheel' \| 'click' \| 'auto' \| 'stage'`, `dwellMs` (time on the slide before it) | 3 | The rehearsal's pace check, which today keeps its own clock. Fires once the slide LANDS, never per key. The EMITTER debounces (a held arrow that crosses three slides is one event): event lanes never drop, so the hub cannot do it. `dwellMs` is the time from the previous landing. `PresentOverlay.tsx` does not use the hub, so its order against focus is not constrained |
| `present.auto-advanced` | `flat`, `afterMs` | 3 | — |
| `stage.opened` / `stage.closed` | `reason` on close (`closed-by-presenter`, `window-closed`, `present-ended`) | 3 | The presenter view, which appears only while a Stage is open (`PresentOverlay.tsx:626`) |
| `stage.shown` | `flat` (what the AUDIENCE sees, which can lag the presenter by a message) | 3 | A presenter-view check that the audience is on the same slide |
| `rehearsal.started` / `rehearsal.ended` | `targetMs`; on end `ms`, `overMs` | 3 | — |
| `rehearsal.beat` | `flat`, `kind: 'eye' \| 'transition' \| 'pause' \| 'breathe' \| 'emphasis'` (the planner's own beat kinds, `rehearsal.js:134-159` `beatsFor`; the planner's `over` state, `:313`, is `rehearsal.pace`) | 3 | A cue a phone could vibrate on, or narration could follow |
| `rehearsal.pace` | `flat`, `overMs` (positive when the speaker is behind the plan) | 3 | — |

The presenter notes opening and closing is `panel.opened` / `panel.closed` with
`panel: 'present-notes'`. `present.slide-shown` and the focus are different facts: focus is
where the AUTHOR is in the document, and in Present the shown slide is where the TALK is, with the
dwell time the focus record does not keep. The Stage's own `postMessage` handshake stays the wire
between the two windows; its handler re-emits `stage.*` on the hub (§4.3).

**Drag and drop.** One lifecycle per drag (§4.2), not one event set per drop zone:

| Event | Payload | Slice | Consumer on day one |
|---|---|---|---|
| `drag.started` | `id`, `source: 'strip' \| 'library' \| 'editor' \| 'external'`, `what: 'slide' \| 'file' \| 'text' \| 'image' \| 'asset'`, `count` | 3 | Every drop zone lights up at once when a file from the desktop enters the window, instead of each finding out on its own `dragenter` |
| `drag.zone-changed` | `id`, `zone` (`shell`, `library`, `markdown`, `compose`, `chat`, `motion`, `strip`, or null) | 3 | — (one "drop here to …" hint that names what the drop will do) |
| `drag.dropped` | `id`, `zone`, `outcome: 'opened' \| 'moved' \| 'inserted' \| 'imported' \| 'attached' \| 'refused'`, `reason` when refused (`present`, `dialog`, `editor-owns-drop`, `too-large`, `unsupported`) | 3 | One refusal notice instead of a toast per zone |
| `drag.cancelled` | `id` (Escape, a pointer that left the window, a strip drag released where it started) | 3 | — |
| `slide.moved` | `unit` (the stable id), `from`, `to`, `via: 'drag' \| 'menu' \| 'key' \| 'ai'` | 3 | The rail and the map animate the move. `doc.changed` says the text changed; this says what the change MEANT, which an animation needs and a span cannot tell it |

`drag.started` for an `external` drag fires on the window's first `dragenter`; the browser does not
say what is inside until the drop, so `what` is `file` and `count` is the number of items it
reports. Dragging a split-pane divider is a resize, and reports as `view.resize-started` /
`view.resized` for the pane, not as a drag. Every drop zone keeps the decision of what to accept:
the events report, they do not route (§4.2).

**Panels.** One pair, not one name per panel: `panel.opened` / `panel.closed` with
`{ panel, via: 'click' | 'key' | 'command' | 'tour' | 'restore', surface: 'desktop' | 'tablet' | 'mobile' }`, where
`panel` is a closed union of the shell's own names (`history`, `share`, `workspace`, `command`,
`insert`, `icons`, `present`, `settings`, `deck-tab:<tab>`, `pane:<mobile pane>`, …). Slice 3.
Two consumers exist today: Vetrina's tours wait on a panel by polling the DOM and could await the
event, and focus return could hear `panel.closed` instead of keeping `drawerPendingReturn`. The
event reports the shell's state; it never sets it. "Opening Share closes the menu" stays a rule in
the shell, because an event cannot refuse (§4.2).

**Not worth publishing.** An event earns its place when a second part of the Studio could act on
it. These fail that test, or are already covered:

| Fact | Why not |
|---|---|
| Every keystroke, every CodeMirror or ProseMirror transaction | `doc.changed` carries the edit with its span and origin, once per text change |
| Every selection change | It is the focus, which the hub already publishes, with lanes that coalesce it |
| Scroll position | Sixty a second; `align.ts` maps scroll between panes directly, and the hub hears the result as `reportUnit` |
| Hover, pointer move, tooltip shown | No second consumer, and the volume would swamp `*` listeners |
| Moving through the completion list | Only the accepted pick (`editor.completed`) means anything |
| Every `keydown`, and every palette keystroke | A keystroke is text (`doc.changed`) or a shortcut (`shortcut.fired`); a palette search is judged when it closes (`command.not-found`) |
| A selection growing during a drag | It is the focus; only the finished range (`selection.settled`) is acted on |
| Clipboard contents | Never on an event (above) |
| A streamed reply token, the in-browser model's per-token `token` message | The reply, sixty times a second; `chat.replied` fires when it is done |
| A collaborator's caret and selection | Awareness: Tavola's presence state, on its own channel |
| Chat and Live message text | Never on an event, like the clipboard |
| `dragover` and the dragged copy's position | Sixty a second, and only the strip that drew the copy reads it; `drag.zone-changed` fires only when the zone changes |
| A React render, a `useMemo` recompute | Implementation, not a fact; it changes whenever the code does |
| Every intermediate resize | `view.resized` once the size holds (below) |
| CodeMirror's viewport (which lines are drawn) | An implementation detail of its virtual rendering |

**Resize is a lifecycle, not a stream.** A window drag fires `resize` dozens of times a second. The
hub publishes `view.resize-started` on the first one and `view.resized` once the size has held for
a frame, with the final size, per §4.2. A listener that needs every intermediate size (a live
ruler) reads the frame's own `ResizeObserver`; nothing on the hub needs it. `view.orientation-changed`
fires only when a slide's measured orientation actually flips, after `stampOrientation` has written
the new stamp, so a listener that reads the slide sees the new geometry. It fires before the chart
transforms rebuild, and those then report `chart.drawn` with the new `orientation`.

**Event volume.** The heaviest stream is `asset.loaded`: one per image per render. The hub's cost
per event is one queue push and one loop over listeners of that type, so a 60-image deck adds 60
pushes per full render, against an engine render measured in tens of milliseconds. A `*` listener
on the `sync` lane would be the one way to make it expensive, so `*` is typed to the `idle` lane
only (§10.3).

## 6. Order

The catalog's **slice** column says what each event NEEDS; this section says the order to build in.
The trio reordered it (§10.6): the cheap slices that delete code go first, and the one that changes
exported bytes waits for its own measurement.

| Build | Slice | What | Needs | Deletes or unblocks |
|---|---|---|---|---|
| 1st | 1 | The channel (`events.ts`), facts and `until`, the integrity rules of §10, the ledger test; `doc.*`, `history.*` | nothing | `followups.d/2884-p1` (Compose's hand diff) |
| 2nd | 4 | Fold the ad-hoc `window` events (§2's list, one commit each), plus `ai.*`, `chat.*`, `model.*` | slice 1 | The Studio's 17 files of untyped channels; the cheapest proof the channel works |
| 3rd | 3 (host side, with a consumer) | `library.*` and the cross-tab adapter; `export.*`; `command.*` with the `runCommand(id, via)` routing; `panel.*` | slice 1 | Stale Library panels across tabs; the per-sheet export status lines |
| 4th | 2 | The per-frame bridge; `render.*`, `figure.*`, `plugin.*` (library, diagnostic, degraded, used), `chart.*`, `view.*`, `fonts.settled`, `fit.*`, and the in-frame code-block copy | slice 1, a trace of what the diagram poll costs (§8), the owner's export sign-off (§4.3) | Turns the export's one poll (`waitForDiagrams`) into a state read woken by an event; the `2026-10-23` design-A ledger |
| 5th | 3 (the rest) | `asset.*` and `media.*` (these need slice 2's bridge), and the remaining host-side families (`editor.*`, `compose.*`, `selection.*`, `clipboard.*`, `shortcut.fired`, `drag.*`, `slide.moved`, `live.*`, `coach.*`, `present.*`, `stage.*`, `rehearsal.*`, `lint.changed`), in small per-domain batches | slices 1 and 2 | Ships ahead of consumers, as the owner asked, each batch under the ledger's ratchet (§10.2) |

Each build has a failing arm in `hub.test.ts`'s style. An event with no consumer is covered by an
emitter-level unit test; real-browser tests on Chromium, WebKit and Firefox are for the events that
cross the frame bridge, because those are the ones a harness cannot stand in for.

## 7. What this does not do

- It does not move render scheduling into the hub (`2026-10-23` design B, not recommended there).
- It does not move the deck text into Fuoco (`followups.d/2822-p1`).
- It adds no cancelable events (§4.2).
- It is not a cross-tab or cross-device bus, apart from the one Library adapter in §5. Presence
  stays on Tavola's own channel (§5, Live collaboration), and nothing on the event channel is ever
  sent over Tavola.

## 8. What was measured and what was not

Measured: nothing timed. Read from the code: the hub's API and guarantees, the runtime's internal
signals, the export's poll intervals and budgets (120 ms, 4 s, 12 s), and the count of files that
dispatch ad-hoc `window` events (20, 17 of them in the Studio, with the `grep` in §2). The trio ran two probes against the
built hub (`docs/src/lib/fuoco/dist/index.mjs`): a sync listener that throws escapes into the
unrelated caller of `go()`, the next subscriber never hears the move, and a call it had queued
replays inside a later `report` (§10.3); and a listener that re-publishes on every delivery ran
100,001 times in 33 ms with a flat stack until the probe's own cap stopped it (§10.3). The re-read of
the fold ran a third, in Playwright Chromium: a property defined on an iframe's `contentWindow`
before its `srcdoc` is set is gone in the document that loads (§4.3). Not measured: the time slice 2 would save
an export (the poll's worst-case slack is 120 ms per wait, the real figure needs a trace), and the
hub's per-event cost under a full gallery render. Both are slice 2's first measurements.

## 9. Decisions (2026-11-05)

The owner answered in one round:

| Question | Answer |
|---|---|
| Where events live | A second channel in the Fuoco hub (§4.1), not a sibling library |
| Pre and post | Lifecycle pairs, notify-only (§4.2); no cancelable events |
| First build | None yet: this note merges as the record, and the four slices of §6 wait |

The slices are tracked in `followups.d/` so the work outlives this session.

**Added 2026-11-05, after the first round.** The owner asked for chart, orientation and resize
events. All three happen inside the preview frame, so they join slice 2: `chart.*`, and
`view.resize-started` / `view.resized` / `view.orientation-changed` / `view.mode-changed` (§2, §5).

**Added 2026-11-05, second.** The owner asked for plugin events. A plugin's life has four places
worth hearing: its library loading, its figures settling, its diagnostics, and an author saving
one in the Studio. `figure.*` already covered the second, and now names the state machine it
mirrors (`ctx.settle`) and adds its two missing states, `failed` and `reclaimed`. The rest are
`plugin.*`: the library, diagnostic, degraded and used events ride the frame bridge in slice 2;
`plugin.saved` / `plugin.deleted` need only slice 1's channel, and sit in slice 3 because nothing
urgent reads them (later folded into `library.*`, sixth addendum). Charts are one plugin (`2026-11-01-charts-one-plugin.md`), so `chart.*` is a
plugin family's events under its own name, because a chart also draws through the engine with no
plugin host involved.

**Added 2026-11-05, third.** The owner asked about the editors, panels, and which events are not
worth having. The editors and panels go in slice 3 (§5, The editors; Panels), and the facts left
out, with the reason for each, are §5 Not worth publishing.

**Added 2026-11-05, fourth.** The owner asked for keyboard shortcut, command palette, clipboard and
selection events. Commands ride the one action list (`command.*`), shortcuts fire only when mapped
(`shortcut.fired`), a selection is published once it is finished (`selection.settled`), and the
clipboard events never carry the text (§5, Commands and shortcuts; Selection and the clipboard).
`editor.pasted` became `clipboard.pasted`.

**Added 2026-11-05, fifth.** The owner asked for drag and drop events. Six owners wire their own
today; the events are one lifecycle per drag (`drag.started` → `drag.zone-changed` →
`drag.dropped` or `drag.cancelled`), plus `slide.moved` for what a strip reorder means
(§5, Drag and drop).

**Added 2026-11-05, sixth.** The owner asked for Library events. The Library is one IndexedDB store
with seven kinds, so it gets one `library.*` family keyed by `kind`; `plugin.saved` /
`plugin.deleted` fold into it. A cross-tab adapter is proposed (§5, The Library); the owner said yes the same day, so it ships in slice 3.

**Added 2026-11-05, seventh.** The owner asked about live collaboration, the chat and the Coach.
Live gets `live.*`, heard locally, and a collaborator's edit becomes a `doc.changed` with a peer
origin; nothing new is sent over Tavola. The chat gets `chat.*` and `model.*` beside the existing
`ai.*`. The Coach gets `coach.*`, its verdicts stamped with the `rev` they judged (§5).

**Added 2026-11-05, eighth.** The owner asked for export and Present mode events. The two
placeholder rows became full sections: `export.*` as one lifecycle with named phases, a missing
asset event and the delivery, all host-side so they change no exported byte; and `present.*`,
`stage.*` and `rehearsal.*` for the overlay, the audience window and the rehearsal planner (§5).

## 10. Adversarial review (2026-11-05)

The owner asked for the adversarial trio (HARD RULE #25): a red team, a Munger inversion and an
independent checker, each on Opus, given the note and the code but not the maker's conclusions.
All three said proceed with changes. The checker found four claims that were false in the code
and several counts that did not reproduce; those are corrected in place above and listed in §10.7.
The red team and the inversion found design defects; each is a rule below that slice 1 ships with,
because every later slice inherits it.

**10.1 Facts are not occurrences.** The note's own §1 says a late subscriber to a stream has missed
the past, and then shipped about a third of the catalog (panels, live membership, the Stage, fonts,
the Coach's verdict, `plugin.used`) as one-off events. A tour that awaits `panel.opened` for a
panel already open hangs; the Playground loads its hub after first paint (`playground-focus.ts`),
so everything emitted before is gone; an export that awaits `figure.drawn` instead of reading the
settle markup misses a figure that drew before it subscribed and stalls to its 4 s or 12 s budget.
**Rule:** each map entry declares `occurrence` or `fact`; a fact's last value is kept and replayed
on request; every wait goes through `until`, which reads real state before and after the event.
The export keeps its DOM read; the event only wakes it. Failing arms: a late subscriber and an
await made after the emit both resolve.

**10.2 The catalog must not rot.** About a hundred of the events ship before anything reads them,
by the owner's choice. An event with no reader has nothing holding it to the truth, so it drifts
(`export.settled` before the write, `library.saved` on the request) and the first reader in a year
builds on the lie. **Rule:** `docs/src/lib/lattice-events.test.ts`, in the style of
`live/follow-keys.test.ts`, holds the map as the single source:
- every entry names its emitter file(s) and a consumer path, or `null` with a reason;
- a source scan finds a literal `emit('x'` in each declared emitter file, and fails on an `emit`
  whose type is not a string literal, so a declared event nothing emits is caught;
- the count of entries with no consumer is a ratchet that may only fall;
- no file in `docs/src/lib/fuoco/` contains a dotted event name, which `checkFuocoBoundary`
  (imports only) cannot see; the core's one reserved shape, `{ missed }` (§10.4), is not dotted.
The human-readable catalog is generated from the map into `dist/`, like `components.pick.md`; once
slice 1 lands, §5 here becomes the record of the design and the generated file the live list.

**10.3 Hub integrity.** Demonstrated on the built hub (§8): a listener that throws escapes into an
unrelated caller, starves the listeners after it, and leaves a queued call to replay later; a
listener that re-publishes loops without bound, because a queue turns recursion into a flat loop
and an event has no `equals` to damp it. **Rules:** every delivery runs in its own `try`, counts the
failure in `stats` and continues; a drain is capped per top-level call and reports when it trips;
`*` listeners are typed to the `idle` lane only. Failing arms for all three.

**10.4 Stamps and lanes.**
- *Sequence.* Events keep their own counter and never write the hub's `lastBy`. Otherwise
  `movedByOther` (`hub.ts:372`) would read an image load as another origin moving the focus, and
  silently drop the editor's caret reports.
- *Revision.* An event carries the `rev` its emitter computed it against, never the hub's current
  one: a render of rev 41 that settles after the author typed rev 42 must say 41, or the staleness
  ledger marks a stale pane fresh. A frame lives across many revisions: the preview keeps one
  iframe and patches `<section>` nodes into it (`preview-virtual.js:11-15`,
  `single-slide-render.ts:274-279`), so a rev bound to the frame goes stale on the next patch.
  **The requirement** is that an event's `rev` is the rev of the content it is about, whichever
  write put that content in the frame. **The mechanism is build 4's to design, not this note's**:
  three drafts of it here were each wrong against the code, so the note fixes the requirement,
  the inventory of writers it must cover, and the tests that prove it.
  - *What exists today.* Only the Playground's full write carries an id (`deck-render.js` bumps
    `st.writeId` at `:566` and stamps `data-lattice-write` on the new `<html>` at `:584`). The
    Studio's full write (`single-slide-render.ts:2400`) stamps none, and neither do the export's
    capture frames (`deck-export.js:546`, written once). The Studio's renderer holds no hub `rev`
    at all (`DeckPreview.tsx`, `playground-engine.ts`), so the render call must be handed the rev
    its source text was read at.
  - *Every writer of slide content, which build 4 must cover.* The full writes above;
    `patchSections` (`deck-render.js:33`, both branches: its count-change branch rebuilds the
    body through one `innerHTML`, so an id goes into the strings); `restyleDocument`
    (`deck-render.js:97-112`, a palette or theme flip); the virtual mount (`applyWindow` and its
    swap, `deck-render.js:213` on, which turns placeholders into sections from the latest patch's
    strings as the reader scrolls); and `patchSlideBody` (`single-slide-render.ts:274`, which
    replaces the whole `.lattice` body).
  - *Carrying it.* `emit` has to carry the id with the event, read when the runtime emits, because
    by the time the host looks the section may be gone; the host drops an id it did not issue to
    that frame. An id written onto a section already in the document fires the runtime's
    attribute observer (`index.js:2796`), so it is written before the node is inserted or inside
    the HTML string.
  - *The proof* (p4's done-when): a figure patched in at one rev that settles after the next patch
    keeps its own rev; a section mounted by scrolling after a patch carries that patch's rev; a
    restyle does not reset it; a frame cannot claim another frame's id.
- *Render time.* The shell feeds the hub inside a React render (`StudioShell.tsx:1888`,
  `duringRender: true`). Events obey the same rule as focus: delivered on the microtask after the
  render, after the focus that edit moved.
- *Bounded batches.* `requestAnimationFrame` stops in a background tab, and the default scheduler
  has no fallback (`hub.ts:200-205`), so a `frame` batch would grow for as long as the tab is hidden
  while Live edits and other-tab saves keep arriving. The event `frame` lane gets a timer fallback
  and a per-listener cap. Past the cap, the listener's batch collapses and the listener is called
  once with `{ missed: count }` in place of the dropped events (a reserved, non-dotted shape the
  core owns, so it is not an event name), after which it re-reads state.

**10.5 What a payload may carry.** The "never the text" rule covered the clipboard, chat and Live,
and the catalog broke it elsewhere: the palette query, a knocker's typed name, asset URLs (signed
URLs carry tokens), deck-derived names and diagnostic detail. **Rule:** a payload field is a union,
a number, an id or a boolean, or an array or record of these (`spans[]`, `units[]`, `counts`). A free string is admitted only through a
`SANCTIONED_EVENT_STRINGS` list in the ledger test, with its justification, failing on a stale
entry, the shape the repo's other `SANCTIONED_*` lists use. A field that must stay text is marked
SENSITIVE: it is never delivered to `*`, never logged, and never crosses a tab. URLs become
host-issued asset ids. Strings that come from the frame (plugin diagnostics, failure reasons) are
untrusted and rendered as text only; HARD RULE #22's gates guard markup going INTO a frame, and
nothing yet guards data coming OUT, so the bridge's closed schema is that guard.

**10.6 The order.** The first draft built the frame bridge second, which front-loaded the riskiest
slice (the only one that changes exported bytes, with a payoff nobody had measured) and parked
host-only slices that delete code today. §6 now builds slice 1, then the `window`-event fold, then
the host-side families that have a consumer, then the bridge once a trace has priced the diagram
poll, then the rest.

**10.7 Corrected in place.** False claims:
- the export has ONE polling loop, not two: `waitForMeasuring` awaits a callback;
- Finish Studio's `storage` listener syncs a workspace setting, not the Library, and is kept;
  deleting it, as the first draft ordered, would have broken that setting across tabs;
- the rehearsal planner's beat kinds are `eye`, `transition`, `pause`, `breathe` and `emphasis`;
- the Markdown editor has no folding, so `editor.folded` / `editor.unfolded` are gone.

Counts that did not reproduce, and the right figures:

| Claim | Was | Now |
|---|---|---|
| Events in the catalog | about 140 | about 120 |
| Chart kinds | 31 | 28 |
| `listAssets` readers | 14 | 12 (11 outside the store) |
| Clipboard writers | 7 | at least 9 |
| Files with ad-hoc `window` events | 11 | 20 (17 in the Studio, 3 site `.astro` pages), with the grep named in §2 |

Mechanisms that were overstated:
- the palette, menus and shortcuts do not go through `runCommand`, so slice 3 routes them;
- `doc.changed` spans are new work, not reuse;
- the bridge must stay installed in capture frames, unlike `__latticeDrawHost`;
- a Live edit needs the controller to feed the hub itself.

Smaller fixes: line references (`resyncFrom`, ProseMirror's drop handling, the Coach's `jump`
field) and §7's presence bullet, which contradicted §5.

**10.8 The re-read of this section.** The card grader asked for one independent read of the fold
itself, and it found the §4.3 bridge as first written could not work (installed on the frame's own
window, it does not survive `srcdoc`; bound to one rev per frame, it goes stale on the preview's
patch path), a reserved `events.missed` name the ledger's own rule forbade, and payload fields
that still broke §10.5. All are corrected above: the bridge is one parent object with a per-frame
record, `rev` is fixed as a requirement with the full inventory of content writers and its tests
(its mechanism is build 4's, after three drafts of it were wrong against the code), overflow is a non-dotted `{ missed }`, and the remaining free
strings are SENSITIVE or planned sanctioned entries.
