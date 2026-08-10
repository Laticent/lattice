---
status: shipped
summary: "The Studio had zero visibility into the one failure users actually report — 'it crashed and the page refreshed'. Every reporting mechanism the site owns (ErrorBoundary, the chunk-load card, console.error) is a SURVIVOR'S mechanism: it needs the page to still be running. A renderer death (out of memory, a GPU fault, an OS kill) and a browser tab DISCARD kill the JS before any of them can fire, and the reload that follows wipes the console. Fix — a local flight recorder (docs/src/lib/crash-sentinel.ts): a session record in localStorage, rewritten on a 5s heartbeat with a 60-entry breadcrumb ring, a coarse heap trajectory, main-thread stalls and the last error; stamped `closed` on pagehide. A record that was never closed is the report, surfaced on the NEXT boot as a non-blocking toast → a panel → a pre-filled GitHub issue the user submits themselves. Two signals sharpen 'ended unexpectedly' into a cause: a sessionStorage TAB mirror (proves the same tab reloaded itself, not a force-quit) and the Page Lifecycle `freeze` event (proves a browser discard). Nothing leaves the browser; the verdict says `unknown` when the trail is quiet rather than inventing a cause."
---

# The crash sentinel: recording what a dead renderer cannot report

**Date:** 2026-08-10 · **Status:** shipped

## The rule

> A crash that kills the page cannot be reported **by** the page. The only thing
> that survives a renderer death is what was written down **before** it — so the
> Studio writes continuously, and the *next* boot files the report.

## The gap

Reported symptom: *"I am seeing crashes that refresh the page and I never know
the root cause."*

That sentence names a failure class the docs site had no instrument for. Take
stock of what the Studio already had, and what each one requires in order to fire:

| Mechanism | Fires when | Needs the page alive? |
|---|---|---|
| `ErrorBoundary` (`components/ErrorBoundary.tsx`) | a React render/lifecycle throws | **yes** |
| `chunkLoadMessage` (`lib/chunk-load.ts`) | a lazy import rejects | **yes** |
| `window.onerror` / `unhandledrejection` | uncaught JS | **yes** |
| `console.error` | anything logs | **yes**, and the reload wipes the console |
| `FeedbackSheet` | the user types a report | **yes**, and the user must know what happened |

Every one of them is a survivor's mechanism. None of them can observe:

- **A renderer OOM.** Chromium kills the tab's process. No JS runs afterward — not
  `beforeunload`, not `pagehide`, not a boundary. The tab reloads and the console
  is empty.
- **A tab DISCARD.** The browser freezes a backgrounded tab and reclaims it under
  memory pressure. Returning to it reloads the page. To the user this is
  indistinguishable from a crash, and its cause and its fix are different ones.
- **A GPU/compositor fault**, an OS kill, a device sleep that never resumes.

The Studio is exactly the surface where this class dominates: a live engine
preview in an iframe, a second render surface for Present, a presenter popup
window, PDF/PPTX export workers, on-device model workers, and decks that grow
without bound. The heap climbs; the process dies; the author loses the story.

## The mechanism

`docs/src/lib/crash-sentinel.ts` keeps one **session record** in `localStorage`,
rewritten on a 5s heartbeat:

```
lattice-studio-session-<id> → {
  id, startedAt, lastBeat, closed?, frozen?, page, ua, nav,
  context: { Deck, Slides, "Deck size", Stop, Palette },   // labels only
  crumbs: [{ t, k, m }],       // ring of 60
  mem:    [{ t, used, limit }],// coarse trajectory, 24 samples
  peakUsed, memLimit, lastError, errorCount, stallCount, longestStallMs
}
```

On a clean `pagehide` the record is stamped `closed`. **The absence of that stamp
is the entire signal.** On the next boot, `collectCrashReports()` returns every
record that was never closed.

Four things are recorded that a plain error log would not carry:

- **A heap trajectory.** `performance.memory` sampled every 30s — and
  unconditionally on any sample at or above 85% of the limit, so the last reading
  before a death is never 30s stale. Chromium only; the report says so out loud on
  Safari and Firefox rather than implying a healthy heap from missing data.
- **Main-thread stalls.** A 1s watchdog: a tick that arrives >2.5s late means the
  thread was blocked. Gated on the tab having been *visible* across the whole gap,
  because a hidden tab is throttled on purpose and calling that a freeze would
  fill every report with noise.
- **Boundary catches.** `StudioIsland` and the preview boundary now pass
  `onError` → `noteError`. A React fault never reaches `window`, so without this
  hand-off the trail would show the preview going quiet with no reason recorded.
- **Lifecycle transitions**, including `freeze`/`resume` (below).

### Two signals that turn "ended unexpectedly" into a cause

An unclosed record proves only that the session did not close cleanly. A
force-quit, a shutdown and a flat battery produce the same record. Two additions
discriminate:

**Tab continuity.** The live session id is mirrored into `sessionStorage`
(`lattice-studio-tab-session`), which is scoped to the TAB. It survives a
crash-and-restore; it does not survive opening a new tab. A boot that finds the
mirror still pointing at an *unclosed* record is proof that **the same tab
reloaded itself** — the reported symptom exactly, and not something a force-quit
produces.

**The freeze signal.** The Page Lifecycle API's `freeze` fires when a backgrounded
tab becomes discard-eligible. The record is deliberately left **open** on freeze
(and `frozen: true` set), so a tab the browser then discards reports as a
*discard* rather than vanishing silently. `resume` clears it.

### The staleness rule, and the two-tab trap

The first correct-looking design harvests any unclosed record on sight. That
misreports a **second tab that is still running**: background tabs are timer-
throttled to roughly one callback a minute, so a live hidden tab looks dead. The
rule is therefore split:

- record matched by the **tab mirror** → report immediately (no other tab can own it);
- any other record → only once `now - lastBeat > 90s`.

This is why detection is instant for the case the user is reporting (a
crash-reload lands within seconds) without ever harvesting a live sibling tab.

### The verdict, and its honesty

`classifySession` ranks by **actionability**, not by confidence:

1. `memory` — heap ≥85% of the limit at the last reading. It leads whenever
   present: it is the one cause an author can act on (split the deck, close the
   presenter window) and the one that explains a silent process death.
2. `discarded` — the tab was frozen and never resumed.
3. `error` — an uncaught error within 15s of the end.
4. `stall` — a main-thread block within 15s of the end.
5. `unknown`.

**`unknown` is a real answer here, not a failure.** An unclosed record with a
quiet trail is exactly what a force-quit or a flat battery looks like, and
dressing that up as a bug would be the confident falsehood this module exists to
avoid — the same discipline `ChunkLoadFallback` follows in `ErrorBoundary.tsx`
("a 404, a 403, a 500 and being offline are byte-identical at this layer"). Every
report carries a `signals[]` list of what was actually observed, and the panel
prints an explicit caveat whenever the verdict is `unknown` or the tab did not
match.

## The surface

- **On boot**, one non-blocking toast: *"Last session ended unexpectedly — …"*
  with a **See report** action. A page that just came back from a crash owes the
  author their work, not a modal.
- **The report panel** (`CrashReportSheet.tsx`) — verdict, what was observed, the
  heap trajectory, the last error with its stack, and the breadcrumb timeline.
- **Report on GitHub** rides the EXISTING feedback path
  (`lib/feedback-issue.ts` → a pre-filled deep link into GitHub's own new-issue
  form, submitted under the user's own login). HARD RULE #15: no second reporting
  mechanism. The issue body is byte-identical to the markdown the **Copy report**
  button produces, so what the user reads is what they post.
- **Workspace → Crash reports** is the standing way back in after the toast has
  gone, plus a two-tap clear (the shared `DeleteBtn`). Its own group, deliberately
  NOT inside Diagnostics — that whole block sits behind `PERF_OVERLAY_AVAILABLE`,
  a GA gate expected to go false, and a crash report has to outlive it.

## Decisions worth stating

**Always on, not a switch.** Every other entry in the Studio's diagnostics is
opt-in. This one cannot be: a crash you have to have predicted in order to record
is a crash you never catch. What makes always-on acceptable is that it is local,
bounded and cheap (below).

**No server, no beacon.** The docs site is a static bundle with no request path of
its own, and the Playground already runs on the user's own key (HARD RULE #24's
posture). A crash reporter that phones home would be the first telemetry endpoint
this project has ever had, and it is not needed: the user's own GitHub account is
the transport, and they read the report before it goes anywhere.

**Labels, never content.** `setCrashContext` takes the deck's *title*, its slide
*count* and its *size in KB* — never a line of the deck. This text is what a user
is invited to paste into a public issue. Deck size earns its place because a heavy
deck is the leading suspect in an out-of-memory report and is invisible from every
other field.

**It must not become the problem it diagnoses.** A "just log it locally"
diagnostic that grows without bound is the storage-accumulation defect
(`2026-07-21-storage-accumulation-diagnostic.md`) in a new coat. Bounds: a 60-entry
crumb ring, 24 heap samples, at most 5 retained records, a 7-day expiry, a prune on
every boot, and a quota-failure path that sheds the trail and retries rather than
dying. Steady-state cost is one `setInterval(1000)` and a ~4-8KB rewrite every 5s.

**Started from a hoisted page script, not the island.** A renderer death during
boot is the one crash the island can never record, because the island is not there
yet. `CrashSentinel.astro`'s hoisted `<script>` runs before `client:only` islands
hydrate; Vite dedupes the module across the page's chunks, so the island's own
imports get the same instance and the same live record.

## What this does NOT do, and how to tell

Honest boundaries, per HARD RULE #23:

- It cannot record anything about the crash **itself** — only the state up to the
  last heartbeat before it. A cause that manifests within 5s of a clean-looking
  record will read as `unknown`.
- `performance.memory` is Chromium-only. On Safari and Firefox the memory verdict
  is unavailable, and the report says so rather than defaulting to "heap was fine".
- It cannot distinguish a renderer crash from a force-quit **except** through the
  tab-continuity signal, which is stated per report rather than assumed.
- **UNVERIFIED:** end-to-end behavior against a *real* renderer crash on a real
  device. The classification, the storage lifecycle, the tab-continuity rule and
  the freeze path are covered by unit tests (`crash-sentinel.test.ts`), and the
  recorder was driven in a real browser — but deliberately inducing an OOM kill on
  a physical phone was not done here. Per HARD RULE #23 that is stated, not
  papered over: the first real crash report a user sends is the verification.
