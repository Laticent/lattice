---
status: proposed
summary: >
  Audit of what the Studio publishes through Fuoco and what it does not. Fuoco today is a FOCUS
  hub: one record of where the reader is, delivered through selectors. Images, video, diagrams,
  renders, exports and AI edits publish nothing, and the preview frame, where most of them happen,
  has no outward channel at all: the export polls the frame every 120 ms for diagrams, seven places
  each hold their own idea of "is the preview stale", and eleven files pass ad-hoc `window` events.
  Proposed: a typed EVENT channel beside the focus record, in the same hub, sharing its origin,
  revision and no-re-entry guarantees; a bridge that carries the preview runtime's facts out of the
  frame; lifecycle events (`started` / `settled` / `failed`) as the "pre and post" pair, notify-only;
  and a catalog of about sixty-five events, a list of what is not worth publishing, in four slices ordered by the code each one deletes.
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
| A diagram drew, or gave up | Plugin host, markup `data-lattice-settle` | The export POLLS for it every 120 ms, for up to 4 s, then 12 s (`deck-export.js:647` `waitForDiagrams`); `waitForMeasuring` polls the same way |
| A plugin's library loaded or failed | `ensurePayload` injects a `<script>` and settles it `loaded` or `failed` (`lib/plugins/host-browser.mjs:157`) | The plugin host only, which then hydrates or releases its figures |
| A plugin reported a diagnostic | `ctx.report(id, detail)` pushes onto `env.pluginDiagnostics` during the render (`lib/plugins/host.js:110`) | Whoever reads that render's `env` afterwards. Nothing is told when one appears |
| A plugin renderer threw, or a hydrate ran past its budget | The host degrades it to `degradesTo`, or settles it `final` (`2026-09-27-plugin-system.md` §4.6) | Nobody: the author sees the fallback without a reason |
| The Markdown editor gained or lost the keyboard, took a paste, accepted a completion, folded a slide | CodeMirror (`docs/src/components/studio/Editor.tsx`: `autocompletion` at :491, the paste filter at :105, `lintGutter` at :867) | The editor itself. The hub hears the caret (`report`) and the text (`update`), nothing else |
| Compose inserted a block, opened a node view, parked or applied an outside change | ProseMirror (`ComposeView.tsx`; the image, raw and code node views; `resyncFrom` at :226) | Compose itself, through about 22 refs (`followups.d/2884-p1`) |
| A panel, sheet, drawer or menu opened or closed | About 25 `useState` flags in `StudioShell.tsx` (`historyOpen`, `shareOpen`, `workspaceOpen`, `cmdOpen`, `insertOpen`, `iconsOpen`, `presentOpen`, `deckTab`, `settingsView`, `mobilePane`, `chromeCollapsed`, …) | Only the shell. The tour library (Vetrina) learns that a panel opened by polling the DOM (`lib/vetrina/recipes.ts` `waitFor`, "the one public poll-wait"); focus return after a drawer child closes is its own flag (`drawerPendingReturn`, `StudioShell.tsx:951`) |
| An author saved or deleted a Studio plugin | `saveStudioPlugin` / `deleteStudioPlugin` (`docs/src/components/studio/plugin-library.ts`) | The caller's own promise |
| A chart drew, or fell back | Engine-drawn SVG for most of the 31 kinds; the runtime lays out `state-chart` and `flowchart` with dagre (`index.js:52-80`) | Nobody. When dagre is missing, the chart falls back to the reading-order grid and the only signal is a `console.warn` (`index.js:197`) |
| A slide's orientation changed | `stampOrientation` writes `data-orientation` from the slide's measured aspect (`index.js:2710`); the fluid-view toggle flips it (`index.js:3838`) | CSS and the chart transforms, through markup. The host is never told |
| The view resized | `window` `resize` (`index.js:2798`, `3687`) and a `ResizeObserver` on the slide box (`index.js:284`) | In-frame re-measure and the fit sweep only |
| Fonts finished loading | `document.fonts` `loadingdone` (`index.js:455`) | In-frame re-measure only |
| A slide overflowed / fit resolved | Fit sweep, `fitGeneration` (`index.js:3456`) | Markup classes only |
| An image loaded or failed | The browser | Nobody: the runtime listens to no `load` / `error` on media |
| A video played, paused, ended | The browser (`imagery/video`) | Nobody |
| An export started, progressed, failed | `deck-export.js`, `share-export.ts` | The calling component's own promise |
| An AI reply arrived, an edit was applied, spend changed | `ArchitectChat.tsx`, `chat-agent.ts` | `window` event `lattice-spend-changed` |
| The model or voice setting changed | `architect-model.js`, TTS settings | `window` events `db-model-changed`, `db-voice-changed` |
| A speaker note was committed or left | Notes editor | `window` events `cs-note-commit`, `cs-note-left` |
| The Stage window opened, showed a slide | `present/stage-window.js` | `postMessage` to the opener, read in one place |

Eleven non-test files under `docs/src` pass those ad-hoc `window` events. Each is an untyped,
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
`hub.on(type | type[] | '*', listener, { lane, ignoreOrigin })`. Each event is stamped with the
hub's `seq`, the current outline `rev` and its `origin`, and delivered through the same queue as
focus, so an event emitted inside a focus delivery waits for it, and a listener that emits cannot
recurse. Lanes keep their meaning for WHEN (`sync` now, `frame` at the next frame, `idle` when
idle), but an event lane batches: a `frame` listener gets every event since the last frame, in
order, never only the latest.

Why the same hub and not a sibling: the guarantees are the hub's, and an event is most useful
stamped against the focus and revision it happened in (`render.settled` for `rev` 41 is stale the
moment `rev` 42 exists). `followups.d/2884-p1` already recommends exactly this shape for its change
channel (`hub.subscribeChanges`); this generalizes it rather than building it twice.

The core stays generic: `createFocusHub<Events>()` takes an event map type and knows no names.
Lattice's map lives in the adapter (`docs/src/lib/deck-outline/` or a new `lattice-events.ts`).

**4.2 Pre and post as lifecycle, notify-only.** Each long-running thing gets one id and three
events: `X.started { id }`, `X.settled { id, ms }` or `X.failed { id, reason }`. A consumer that
wants "pre" listens to `started` (show a spinner, mark a pane stale); "post" is `settled`. No
listener can veto or change what happens.

Cancelable events are deliberately left out. A veto means the emitter must wait for every listener,
which makes emitting asynchronous and order-dependent, and breaks the no-re-entry queue the hub is
built on. The few real veto points (leave with unsaved changes, export with lint errors) are
REQUESTS, not events, and stay as explicit calls at the one place that decides. Add a cancelable
form only when a named case cannot be written that way.

**4.3 A frame bridge, installed by the host.** The runtime already reads a host-installed object
through `window.parent` on every pass (`__latticeDrawHost`, `index.js` `getPluginHost`). The same
pattern carries events: the host installs `__latticeEvents.emit(type, payload)` on the frame's
parent; the runtime calls it when present and does nothing when absent. The CLI export, the
player and marp-vscode install nothing, so they behave exactly as now. The Stage window and the
draw host keep `postMessage` (separate realms) and their host-side receivers re-emit onto the hub.

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
| `doc.changed` | `prevRev`, `spans[]` (the hub's own checked spans) | 1 | Compose change flash (`2884-p1`), deletes its diff |
| `doc.loaded` | `source: 'file' \| 'share' \| 'history' \| 'new'` | 1 | — |
| `doc.saved` / `doc.save-failed` | `bytes` / `reason` | 1 | The silent failed save Filo's note found (`2026-10-27-filo-undo-history.md`) |
| `history.undo` / `history.redo` | `steps` | 1 | — |
| `render.started` | `view`, `id` | 2 | Staleness ledger (`2026-10-23` design A) |
| `render.painted` | `view`, `id`, `ms` | 2 | Ledger; the flash bench reads it instead of a mutation observer |
| `render.settled` | `view`, `id`, `ms`, `generation` | 2 | Ledger; replaces `playground-sync`'s `renderedSource` |
| `render.failed` | `view`, `id`, `reason` | 2 | Crash report sheet |
| `figure.started` (`figure.*` follows the plugin host's one state machine, `ctx.settle`: `pending → rendered \| error \| unavailable → final`) | `plugin` (`mermaid`, `plot`, …), `unit`, `id` | 2 | — |
| `figure.drawn` | `plugin`, `unit`, `id`, `ms` | 2 | Export: replaces `waitForDiagrams`'s 120 ms poll with an await |
| `figure.unavailable` | `plugin`, `unit`, `id`, `reason` | 2 | Export; an author-facing "this diagram did not draw" |
| `figure.failed` | `plugin`, `unit`, `id`, `reason` (the `error` state) | 2 | Crash report sheet |
| `figure.reclaimed` | `plugin`, `unit`, `id` (a late library took an `unavailable` figure back) | 2 | — |
| `plugin.library-loading` / `plugin.library-loaded` / `plugin.library-failed` | `plugin`, `file`, `ms`, `reason` | 2 | Export: await the library instead of polling its figures; an "offline, Mermaid could not load" cue |
| `plugin.diagnostic` | `plugin`, `id`, `message`, `detail`, `unit` | 2 | The lint panel, live instead of after the render |
| `plugin.degraded` | `plugin`, `unit`, `fence`, `reason: 'threw' \| 'timed-out' \| 'non-string'` | 2 | An author-facing "this block fell back, and why" |
| `plugin.used` | `plugins[]` (the set the deck now uses), `added[]`, `removed[]` | 2 | Library "in use" badges; warming a library before its first figure (§4.8 of the plugin note) |
| `plugin.saved` / `plugin.deleted` | `id`, `name`, `fence` | 3 | The fence catalog and Compose's insert menu, which today re-list on mount |
| `chart.started` | `kind` (`funnel`, `state-chart`, …), `unit`, `id`, `path: 'engine' \| 'runtime'` | 2 | — |
| `chart.drawn` | `kind`, `unit`, `id`, `path`, `ms`, `orientation` | 2 | Export: one more thing to await instead of poll |
| `chart.fallback` | `kind`, `unit`, `id`, `reason` (`layout-engine-missing`, …) | 2 | Replaces the `console.warn` with an author-facing cue |
| `view.resize-started` / `view.resized` | `view`, `width`, `height`, `canvasScale` | 2 | Fit sweep and chart re-layout, in the host instead of each pane |
| `view.orientation-changed` | `view`, `unit` (null for the whole view), `from`, `to` (`landscape` \| `square` \| `portrait`), `cause: 'resize' \| 'fluid-toggle' \| 'device'` | 2 | Rail thumbnails and the Stage, which re-fit on a turn |
| `view.mode-changed` | `view`, `mode: 'fixed' \| 'fluid'` | 2 | — |
| `fonts.settled` | `families[]`, `ms` | 2 | Export: replaces part of `waitForMeasuring` |
| `fit.overflow` / `fit.resolved` | `unit`, `part` | 2 | Rail pill warning |
| `asset.loaded` | `kind: 'image' \| 'video' \| 'audio'`, `src`, `unit`, `ms`, `bytes?` | 3 | — |
| `asset.failed` | `kind`, `src`, `unit`, `reason` | 3 | — (an author-facing broken-image cue) |
| `media.played` / `media.paused` / `media.ended` | `src`, `unit`, `at` (seconds) | 3 | — (auto-advance, narration sync, presenter timer) |
| `present.started` / `present.ended` | `surface: 'stage' \| 'present' \| 'player'` | 3 | — |
| `stage.shown` | `flat` (what the audience sees) | 3 | — (presenter view) |
| `export.started` / `export.progress` / `export.settled` / `export.failed` | `format`, `id`, `done/total`, `bytes`, `reason` | 3 | — (one progress UI instead of one per format) |
| `lint.changed` | `errors`, `warnings` | 3 | — |
| `ai.requested` / `ai.replied` / `ai.applied` | `id`, `model`, `tokens`, `units[]` | 4 | Change flash attribution (`2884-p1` axis 4) |
| `spend.changed` | `usd` | 4 | Replaces `window` `lattice-spend-changed` |
| `settings.changed` | `key` (`model`, `voice`, …) | 4 | Replaces `db-model-changed`, `db-voice-changed` |
| `note.committed` / `note.left` | `unit` | 4 | Replaces `cs-note-commit`, `cs-note-left` |

About sixty-five names. Image `load` and video `play` are in slice 3 because nothing reads them yet;
they are cheap to add once the bridge in slice 2 exists, and expensive before it.

**The editors.** "Code" is the Markdown source editor (CodeMirror); "prose" is Compose, the rich
editor (ProseMirror). The hub already hears each one's caret and text, so these events cover what
that leaves out:

| Event | Payload | Slice | Consumer on day one |
|---|---|---|---|
| `editor.focused` / `editor.blurred` | `editor: 'markdown' \| 'compose' \| 'notes'` | 3 | Which editor owns the keyboard, for the global undo keymap (`2026-10-27-filo-undo-history.md`) and the shortcut sheet |
| `editor.mode-changed` | `from`, `to` (`markdown` \| `compose` \| `split`) | 3 | — |
| `editor.pasted` | `editor`, `bytes`, `lines`, `kind: 'text' \| 'html' \| 'image'`, `stripped` (what the paste filter removed) | 3 | — (a "pasted from a model?" check; ingest telemetry) |
| `editor.completed` | `editor`, `kind: 'component' \| 'modifier' \| 'asset' \| …`, `label` | 3 | — (ranking completions by what authors pick) |
| `editor.folded` / `editor.unfolded` | `editor`, `unit` | 3 | The rail could dim a folded slide |
| `compose.block-inserted` | `kind` (`image`, `table`, `code`, `raw`, a component), `unit` | 3 | — |
| `compose.resync-parked` / `compose.resync-applied` | `rev`, `waitedMs` | 3 | The change flash, and an "outside change waiting" cue while the caret is in a note |

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
on the `sync` lane is the one way to make it expensive; the `idle` lane is the documented home for
logging and analytics.

## 6. Order

Ordered by what each slice deletes or unblocks:

1. **The channel and the document events.** `emit` / `on` in the core with a failing-arm test in
   `hub.test.ts`'s style (every event delivered exactly once, in order, never to its own origin,
   never re-entrant; a broken hub must go red), plus `doc.*`. Closes `followups.d/2884-p1`. No
   frame, no runtime, no export bytes.
2. **The frame bridge, renders and figures.** `__latticeEvents` in the runtime, `render.*`,
   `figure.*`, `plugin.*` (library, diagnostic, degraded, used), `chart.*`, `view.*` (resize, orientation, mode), `fonts.settled`, `fit.*`. Deletes the export's two polling loops and gives design A
   of `2026-10-23` its ledger. Needs the export sign-off (§4.3).
3. **Assets, media, presenting, export progress, editors and panels.** The events the owner named,
   ahead of their consumers. The editor and panel events need only slice 1's channel, not the
   frame bridge, so they can move ahead of slice 2 if a consumer turns up.
4. **Fold the ad-hoc `window` events.** One file at a time; each deletion is its own commit.

## 7. What this does not do

- It does not move render scheduling into the hub (`2026-10-23` design B, not recommended there).
- It does not move the deck text into Fuoco (`followups.d/2822-p1`).
- It adds no cancelable events (§4.2).
- It is not a cross-tab or cross-device bus. Presence and collaboration would ride on it later,
  through the `idle` lane, but a transport between browsers is its own design.

## 8. What was measured and what was not

Measured: nothing timed. Read from the code: the hub's API and guarantees, the runtime's internal
signals, the export's poll intervals and budgets (120 ms, 4 s, 12 s), and the count of files that
pass ad-hoc `window` events (11, `grep`, tests excluded). Not measured: the time slice 2 would save
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
urgent reads them. Charts are one plugin (`2026-11-01-charts-one-plugin.md`), so `chart.*` is a
plugin family's events under its own name, because a chart also draws through the engine with no
plugin host involved.

**Added 2026-11-05, third.** The owner asked about the editors, panels, and which events are not
worth having. The editors and panels go in slice 3 (§5, The editors; Panels), and the facts left
out, with the reason for each, are §5 Not worth publishing.
