---
status: shipped
summary: "The Studio had zero visibility into the one failure users actually report — 'it crashed and the page refreshed'. Every reporting mechanism the site owns (ErrorBoundary, the chunk-load card, console.error) is a SURVIVOR'S mechanism: it needs the page to still be running. A renderer death (out of memory, a GPU fault, an OS kill) and a browser tab DISCARD kill the JS before any of them can fire, and the reload that follows wipes the console. Fix — a local flight recorder (docs/src/lib/crash-sentinel.ts): a session record in localStorage, rewritten on a 5s heartbeat with a 60-entry breadcrumb ring, a coarse heap trajectory, main-thread stalls and the last error; stamped `closed` on pagehide. A record that was never closed is the report, surfaced on the NEXT boot as a non-blocking toast → a panel → a pre-filled GitHub issue the user submits themselves. Two signals sharpen 'ended unexpectedly' into a cause: a sessionStorage TAB mirror (proves the same tab reloaded itself, not a force-quit) and the Page Lifecycle discard signals (`document.wasDiscarded` where the browser confirms it, `freeze` where it can only be inferred). No library fits: the SaaS agents (Sentry, Bugsnag, Rollbar) compute the equivalent 'abnormal session' SERVER-side and cannot run without their backend — Sentry's own #5280 says browsers expose no hard-tab-crash API — and the one relevant micro-lib, GoogleChromeLabs' page-lifecycle, was archived in June 2024. Nothing leaves the browser; the verdict says `unknown` when the trail is quiet rather than inventing a cause."
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

**The discard signals.** Two, one weak and one authoritative. `freeze` fires when a
backgrounded tab becomes discard-*eligible*; the record is deliberately left **open**
on freeze (and `frozen: true` set), so a tab the browser then discards reports as a
discard rather than vanishing silently, and `resume` clears it. Better still,
`document.wasDiscarded` is the browser stating on the NEXT load that this tab was
actually discarded — read at start-up, alongside the tab mirror, and it supersedes
the inference (see §"Why not a library").

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

`classifySession` ranks by **actionability**, not by severity:

1. `discarded`, CONFIRMED — `document.wasDiscarded` on a tab-continuous load. It
   outranks even heap pressure, and not because it is worse: the two are not
   rivals (the browser discards a background tab precisely *because* memory is
   tight), but they point at different fixes. Telling an author "you ran out of
   memory" — go split your deck — when the browser has said it reclaimed a tab they
   left in the background sends them the wrong way.
2. `memory` — heap ≥85% of the limit at the last reading. The one cause an author
   can act on, and the one that explains a silent process death.
3. `discarded`, INFERRED — the tab was frozen and never resumed. The signal line
   says "not confirmed", because that is the weaker claim.
4. `error` — an uncaught error within 15s of the end.
5. `stall` — a main-thread block within 15s of the end.
6. `unknown`.

A verdict changing never discards evidence: the heap reading, the error and the
stall count all stay in `signals[]` whichever one leads.

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
- **Workspace → General → Crash reports** is the standing way back in after the
  toast has gone, plus a two-tap clear (the shared `DeleteBtn`). Its own group,
  deliberately NOT inside Diagnostics — that whole block sits behind
  `PERF_OVERLAY_AVAILABLE`, a GA gate expected to go false, and a crash report has
  to outlive it. The group is **always present, including at zero**. The first cut
  hid it when there was nothing to report, on the tidy-looking reasoning that a
  permanently-empty row is noise; that was wrong for a diagnostic and was reported
  from a real phone as "I don't see it". A hidden row is indistinguishable from a
  feature that never shipped or has silently broken, so the empty state is the
  useful state: it says the recorder is armed, and a later silence then reads as
  "nothing crashed" rather than "nothing is watching". Only the destructive
  control is conditional.

## Why not a library (HARD RULE #15 asks, and the answer is "there isn't one")

"Don't reinvent" is the standing rule, so this was checked before and again after
building. The category splits in two, and neither half fits.

**1. The SaaS error agents — Sentry, Bugsnag, Rollbar, TrackJS, LogRocket,
Highlight.** All actively maintained, all irrelevant here, for two independent
reasons:

- *Architecture.* Their value IS the backend: the agent ships events to an ingest
  endpoint that does the inference. This site is a static bundle with no server in
  the request path — the whole reason `lib/feedback-issue.ts` deep-links into
  GitHub instead of POSTing anywhere is that there is no credential we can ship
  (the same class of leak HARD RULE #24 blocks). A DSN in the bundle plus a paid
  ingest is precisely the thing the site is built not to have. `@sentry/browser`
  is also ~2.7 MB unpacked against a ~15 KB owned module.
- *Capability — they do not solve it.* Sentry's own tracker carries
  [#5280 "Page crash monitoring, such as page memory overflow"](https://github.com/getsentry/sentry-javascript/issues/5280),
  and the answer is that browsers expose no API for a hard tab crash. Sentry
  *does* have the same core idea under Release Health — an **abnormal session** is
  one with no clean termination, which is exactly the unclosed record here — but it
  is computed SERVER-SIDE from heartbeats posted to their ingest. You cannot buy
  that conclusion without buying the backend. Every competitor is the same shape.

**2. The lifecycle micro-library — `page-lifecycle` (GoogleChromeLabs).** The one
genuinely relevant package: ~1.3 KB, normalizes the `pagehide`/`freeze`/`resume`/
`visibilitychange` mess across browsers, which is the fiddliest part of what is
hand-rolled here. It was **archived in June 2024** and last published in 2022.
Taking an archived dependency to save ~40 lines of listener wiring is the worse
trade, and the two behaviors it papers over (Safari's missing `pagehide`, the
freeze/resume pair) are both handled directly.

There is no maintained "record locally, no backend" crash library. The technique —
a `sessionStorage` tab flag plus a `localStorage` record, read on the next load —
is the documented approach and is what this module is.

**What the search DID buy: `document.wasDiscarded`.** A native flag (Chromium; the
Page Lifecycle spec) set on the load that follows a browser discard. It replaces an
inference with the browser's own answer: `frozen` only means "was discard-*eligible*",
while `wasDiscarded` means it actually happened. A confirmed discard now outranks
even heap pressure in the verdict — not because it is more severe, but because the
two point at DIFFERENT fixes, and telling an author "you ran out of memory" (go
split your deck) when the real answer is "the browser reclaimed a tab you left in
the background" sends them the wrong way. The heap reading stays in the signals
either way. Zero bytes, one fewer guess.

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

**Privacy & Data must reach these records, and a scrub alone does not.** They
carry deck titles, page URLs, the user agent and error stacks — "your data" by
any reading — so `clearEverything` calls `clearAllSessions`, or `governance.ts`'s
own promise ("must not leave that behind, or the privacy promise is false") is
false for a store it does not know about. Deleting the keys turned out to be
insufficient, and this was **measured, not reasoned**: "Delete Everything"
reloads the page ~1.1s later, and inside that window the shell's own React
effects legitimately re-populate the live record (clearing decks changes deck
state, so the `setCrashContext` effect re-runs) and `pagehide` persists it on the
way out — a fully-populated record reappearing under a key just erased. Racing
those effects is unwinnable; refusing to write is not. `clearAllSessions` SEALS
the recorder: every write path is a no-op until the next load lifts it. The keys
are also counted by `crashReportStats` and folded into the Decks line of the
storage panel — an unaccounted writer is exactly how the next accumulation bug
would hide from the panel built to show it.

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

## What the adversarial trio changed (2026-08-11)

All three lenses ran against the shipping diff. They agreed the MECHANISM is
right and no library provides it — and that the layer which NAMED A CAUSE was
wrong in the way that matters: it sounded certain. That layer is gone. Five
verdicts collapsed to two endings, only one of which is ever asserted
(`reclaimed`, when `document.wasDiscarded` says so); everything else is reported
as a measured fact. `describeSession` replaced `classifySession`.

Why the guess could not be recalibrated: `MEM_PRESSURE` tested the JS heap
against `jsHeapSizeLimit` (~4 GB on desktop) while a Studio tab dies from
renderer memory that number cannot see — so a real leak printed "There is no
clear cause" above its own 9x-growth evidence. And the cause is not knowable
from in here: verified that after a real renderer crash the next load sees no
`ReportingObserver` crash report (that goes only to a server endpoint this site
deliberately lacks), and `measureUserAgentSpecificMemory` needs cross-origin
isolation the preview iframes would not survive.

Defects the trio found and this branch fixed:

- **A malformed record bricked the Studio** — the guard checked four fields,
  `RECORD_VERSION` was written and never read, and the throw landed in a mount
  effect, so the island boundary replaced the whole app on every load for seven
  days. Reproduced independently by two lenses.
- **`STALE_MS` was off by 5x** — the justifying comment reasoned from the TICK
  cadence while `lastBeat` only advances every fifth tick, so a healthy
  background tab was harvested as a crash.
- **The OAuth `?code=` reached the report** — captured from `location.search` by
  the hoisted script before the island scrubs it. Now a presence flag only.
- **Tab continuity was false** — `sessionStorage` is COPIED into a window opened
  by another, so duplicating a tab reported a live session as crashed. Now
  cross-checked against the navigation type.
- **"Report on GitHub" 414'd** above ~8 KB, worst on the richest reports.
- **The panel showed less than it posted**, under a footer inviting review.
- **A closed laptop lid** was reported as an 8-hour main-thread freeze.
- **Delete Everything did not hold with two tabs** — `sealed` is per-document; a
  cross-tab `storage` broadcast now seals the others.
- **The toast repeated** on every boot until explicitly discarded.
- **Workspace → View was dead** for any report that became eligible after mount.
- **A vacuous test**: the heap cap was asserted in jsdom, which exposes no
  `performance.memory`, so it passed with the cap deleted. The watchdog had no
  timer coverage at all.

Also closed: the **iOS blind spot**. Safari fires `pagehide` on backgrounding, so
an evicted tab looked like a clean exit and reported nothing — the commonest
"it reloaded itself" on an iPhone. A `pagehide` with `persisted` now records
`bfcached`, and a record left in that state for the SAME tab is reported as a
reclaim. Still UNVERIFIED on real iOS hardware.

## What this does NOT do, and how to tell

Honest boundaries, per HARD RULE #23:

- It cannot record anything about the crash **itself** — only the state up to the
  last heartbeat before it. A cause that manifests within 5s of a clean-looking
  record will read as `unknown`.
- `performance.memory` is Chromium-only. On Safari and Firefox the memory verdict
  is unavailable, and the report says so rather than defaulting to "heap was fine".
- It cannot distinguish a renderer crash from a force-quit **except** through the
  tab-continuity signal, which is stated per report rather than assumed.
- **UNVERIFIED: a real browser tab DISCARD**, and so the `wasDiscarded` verdict
  end-to-end. It cannot be induced from this sandbox and the attempts are worth
  recording so nobody repeats them: CDP has no discard command (`Page.discardTarget`
  does not exist — discarding is a browser-level feature, not a protocol one),
  `Memory.simulatePressureNotification` at `critical` does not discard an
  automation-driven tab, and `chrome://discards` renders an empty tab list under
  Playwright. What IS verified: `document.wasDiscarded` exists on the real Chromium
  this repo renders with (probed, Chrome 131), and the classification either side of
  it is unit-tested. The verdict itself waits on a real device.
- **UNVERIFIED:** end-to-end behavior against a *real* renderer crash on a real
  device. The classification, the storage lifecycle, the tab-continuity rule and
  the freeze path are covered by unit tests (`crash-sentinel.test.ts`), and the
  recorder was driven in a real browser — but deliberately inducing an OOM kill on
  a physical phone was not done here. Per HARD RULE #23 that is stated, not
  papered over: the first real crash report a user sends is the verification.
