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
  and a catalog of about thirty events in four slices ordered by the code each one deletes.
---

# Fuoco as the Studio's event channel

**Asked.** The owner sees Fuoco under-used: an image loading, a video playing and a Mermaid diagram
drawing publish nothing. The ask is a true event system that every part of the Studio talks
through, with critical events published even before they have a consumer, and possibly pre and
post events. This note audits what is published today, names the axes, proposes a catalog and
recommends an order. Nothing in the code changes until the owner picks.

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
| `figure.started` | `plugin` (`mermaid`, `plot`, …), `unit`, `id` | 2 | — |
| `figure.drawn` | `plugin`, `unit`, `id`, `ms` | 2 | Export: replaces `waitForDiagrams`'s 120 ms poll with an await |
| `figure.unavailable` | `plugin`, `unit`, `id`, `reason` | 2 | Export; an author-facing "this diagram did not draw" |
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

About thirty names. Image `load` and video `play` are in slice 3 because nothing reads them yet;
they are cheap to add once the bridge in slice 2 exists, and expensive before it.

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
   `figure.*`, `fonts.settled`, `fit.*`. Deletes the export's two polling loops and gives design A
   of `2026-10-23` its ledger. Needs the export sign-off (§4.3).
3. **Assets, media, presenting, export progress.** The events the owner named, ahead of their
   consumers.
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
