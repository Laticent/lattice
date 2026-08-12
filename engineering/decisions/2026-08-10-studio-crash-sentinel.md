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
- any other record → only once `now - lastBeat > 10 minutes` (see `STALE_MS`; the original 90s reasoned from the TICK cadence while `lastBeat` only advances every fifth tick).

This is why detection is instant for the case the user is reporting (a
crash-reload lands within seconds) without ever harvesting a live sibling tab.

### What it says, and what it refuses to say

See §"What the adversarial trio changed" below — the ranked-verdict design described
here previously was removed on 2026-08-11. The module now reports measured facts
and names a cause only where the browser stated one.

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

## What the first REAL report changed (2026-08-11)

The line above — "the first real crash report a user sends is the verification" —
came due within hours of the merge. A user crashed the Studio on **Firefox for
iOS 18.7** (`FxiOS/153.2`, WebKit underneath), on an 18-slide / 8 KB deck, at the
`build` stop. The session died 25.7s in. Their verdict on the report they got:

> "when the page refreshes itself the crash report is not visible. i had to hit
> refresh to see the message… also, the report is not actionable and tells me
> nothing about the errors. what am i supposed to do with this?"

Three defects, all real, none visible from inside the test suite.

### 1. The automatic post-crash reload showed nothing

Immediate reporting required `isSameTab()`, which required
`performance.getEntriesByType('navigation')[0].type === 'reload'`. That
cross-check was added for a good reason — `sessionStorage` is *copied* into a
duplicated tab, so the mirror alone is not proof of continuity. But on this
browser the **browser's own recovery load was not typed `reload`**, so the record
fell through to the 10-minute staleness wait, and the one boot where the user was
actually looking said nothing. Pressing reload by hand produced a `reload`
navigation, which is why the manual refresh "worked" and looked like a fluke.

**This one is NOT fixed. Three designs were built and all three were withdrawn**,
which is worth recording in full because the failures rhyme. Tracked as #1621.

1. **Watch the record for 21s; no heartbeat means dead.** Wrong against a comment
   twenty lines above it in the same file: a throttled tab beats about once every
   **five minutes**, which is why `STALE_MS` is ten minutes and not the 90s already
   found to harvest live tabs. It would have accused a duplicated tab's live
   original and offered a Discard button that deletes its record. A checker
   reproduced it against a session that had beaten 0 ms ago.
2. **Ask over `localStorage`; no reply in 2s means dead.** Wrong against
   `STALL_MS` (2.5s) — this module's own threshold for "the main thread was
   blocked long enough to write down". A red-team pass reproduced it in two real
   Chromium tabs: block the live owner for 2.5s and the duplicate announces it
   crashed. Both attempts picked a deadline against the wrong clock.
3. **Hold a Web Lock for the life of the document.** The *right* primitive — the
   browser releases it on crash, OOM kill and discard, and a frozen or blocked tab
   holds it as well as an idle one, so there is no deadline to pick. It verified
   6/6 in two real tabs. **Withdrawn anyway:** a held lock makes the page
   ineligible for the back/forward cache (measured in Chromium 131,
   `notRestoredReasons: [{reason: "lock"}]`), and the release meant to prevent
   that can never fire — Chromium decides eligibility *before* `pagehide`, so
   `persisted` is always false, which is the condition the release is gated on.
   That silently kills `live.bfcached = !!ev?.persisted` and with it the **entire
   iOS eviction path** — on the platform the original report came from.

The trade is real and is not mine to settle silently: **crash-safe liveness and
bfcache eligibility are mutually exclusive on this page.** Web Locks is the only
primitive that answers "does that document still exist?" without a timeout, and
holding one costs the back/forward cache. Choosing means deciding whether instant
crash reporting is worth more than bfcache on `/studio/` — and on iOS, where
Safari's own backgrounding is what produces the `bfcached` signal, losing it may
make crashes *worse* rather than better. That is unverified and unverifiable from
here.

What ships instead is the staleness wait, unchanged: slow (up to ten minutes for a
record this boot cannot attribute to its own tab), and **never a false accusation**.
Every withdrawn design traded that property away, and none of them was worth it.

The pattern is the lesson. Two of the three failures were the same mistake —
picking a number against a clock that governs something else — and the third was
a correct mechanism with an invisible cost in a distant subsystem. All three
passed their unit tests. Only real browsers, and reviewers looking for the
catastrophic case rather than the happy one, found them.

### 2. Six identical errors, none of them ours

The trail showed `window.onerror: Script error.` six times and summarized it as
"6 error(s) recorded", which reads as six distinct Studio faults. It was one
message repeating — and, more importantly, **an empty husk**. `"Script error."`
with no filename, no line and no stack is the exact signature a browser produces
when it refuses to let a page read a cross-origin script's exception.

That signature is diagnostic, and checking it was worth the five minutes:
`curl`ing the deployed `/studio/` shows every `<script>` on the page is
same-origin `/_astro/*.js`. A same-origin throw would have carried a real message
and a stack. So an opaque error there is *almost certainly not Studio code* — an
extension, a content blocker, an injected script. Reporting it as one of "your"
errors sends the reader hunting through code that never ran, which is precisely
what happened.

So errors are now:
- **folded by message** (`ErrorGroup`), with the repeat count and the span, and
  only the first of a repeating message spends a breadcrumb — six copies used to
  evict the boot and nav crumbs that give the trail its context;
- **split by whether the browser let us see them**, with the opaque ones reported
  as a visibility fact and a calibrated (*"most likely"*, not *"is"*) attribution;
- **captured with `filename`/`lineno`** where the browser supplies them.

### 3. Resource load failures were invisible

While fixing the above: a script/style/image that fails to **load** fires an
`error` event *at the element*, which does not bubble, so `window.onerror` never
saw it. The single most diagnosable Studio failure — a code-split chunk that
vanished when the site redeployed under an open tab — recorded nothing at all
while the page fell apart. A capture-phase listener now records the failing URL
(`noteFailedLoad`), and unlike a sanitized `Script error.` it names the file.

### 4. "What am I supposed to do with this?"

A fair question, and a defect in the report rather than in the reader. Facts
without a next step hand the work of interpretation to the one person in the loop
who cannot do it. `describeSession` now also returns `steps`, every line derived
from *this* record: report it when an error is attributable, reload when a file
failed to load, try Chrome once when the browser reports no memory at all (the
iOS case — the single thing the report cannot know there), try without extensions
when every error was opaque. When nothing can be narrowed, it says exactly that
rather than inventing a chore.

The panel was also reordered. "What gets shared" — consent material, not a
finding — used to sit above the findings, and on a 390px phone the user-agent
string alone runs four lines, pushing everything worth reading off the first
screen. Now: what happened, what to try, then what gets sent.

### 5. The toast was a stretched lozenge

Reported as "not styled and on brand". Measured on the built site at 390px: a
358×110 box with `border-radius: 9999px` — the pill idiom, which is right for
"Deck saved", wrapped around a title, a description and an action until its own
curve **clipped the last line of its text**.

Fixed in the shared primitive rather than at the call site
(`components/ui/sonner.tsx`): the radius follows the content, keyed on Sonner's
own `[data-description]`, so any future multi-line toast is correct by default.

The `!` on those utilities is load-bearing and is **the same cascade trap this
repo already documents** (HARD RULE #26; it also produced the invisible button
label in #1584): Sonner ships an unlayered `[data-sonner-toast]` rule, and an
unlayered rule beats a layered Tailwind utility regardless of specificity. Without
`!` the class lands on the element, matches, and silently loses — confirmed by
measuring `border-radius: 9999px` on an element whose `class` contained
`rounded-2xl`.

### What is still true, and what it cost

The record version was **not** bumped. Every new field is optional and every
reader falls back, so records already sitting in users' browsers survive — a bump
would have discarded the very report that prompted all of this. Bump only when
new code would *misread* an old record; adding a field it can ignore is not that.

### Verified on WebKit (2026-08-11)

Playwright ships **WebKit**, Safari's engine — which this session had wrongly
written off as unreachable. It is not iOS (no device, no Safari chrome, no real
touch stack), but it IS the engine underneath both Safari and the Firefox for iOS
build the original report came from, and every visual claim here had been measured
on Chromium only. Re-run against it, at 390px, on a record shaped like the
reported one — against the local build AND against the **deployed Cloudflare
preview**, which is the artifact a user actually loads (Playwright accepts proxy
config directly, which is what made the preview reachable from the sandbox after
a raw Chromium launch could not get through):

```
PASS  the crash toast appears on WebKit at all       358x87, radius 16px
PASS  it is a card, not a stretched pill
PASS  its description sits inside the box            (the reported clipping)
PASS  its description is not near-black on near-black
PASS  the panel opens and renders the steps
PASS  it names the memory-blind next step
PASS  it attributes the opaque errors instead of listing blanks
PASS  it says there are no memory readings on this engine
PASS  no horizontal page overflow at 390px
```

Two facts previously listed here as unverified are now measured rather than
assumed:

- **`performance.memory` does not exist on WebKit** (`hasMemory: false`), which is
  what the report's "No memory readings — this browser does not expose them"
  line asserts, and what makes the "open it once in Chrome" step the right
  advice on this engine.
- **`navigator.locks` DOES exist on WebKit** (`hasLocks: true`). That removes one
  unknown from #1621: the primitive is available on Safari's engine, so the open
  question there is narrowed to its bfcache cost.

**Still not answered: whether WebKit refuses to bfcache a page holding a Web
Lock.** Three harness attempts failed to produce a working CONTROL — bfcache never
engaged for the no-lock case either, in WebKit or Chromium — so the measurement is
vacuous in both directions and is reported as such rather than dressed up. The
Chromium half of that question was answered by a review pass with a working
control (`notRestoredReasons: [{reason: "lock"}]`); the WebKit half is open, and
it is the measurement #1621 turns on.

Real iOS remains **UNVERIFIED** (HARD RULE #23) — none of this was driven on a
physical iPhone, and the premise behind defect 1 (that Firefox for iOS does not
type its own recovery load as `reload`) is still unconfirmed. What ships here
touches neither: the errors, the next steps, the guards and the toast are all
independent of it.

## The wipe a sleeping tab slept through (#1616, 2026-08-11)

A tab that is **frozen** — parked in the back/forward cache, or suspended by the
Page Lifecycle API as a phone does to a backgrounded tab — is not running tasks.
So it never received `WIPE_SIGNAL_KEY`, the `storage` event that tells every other
Studio tab a privacy wipe happened. It thawed believing all was well, and its next
5-second heartbeat wrote its session back into storage. The user asked for their
data to be deleted and a crash record reappeared.

A live event cannot fix this: the failure mode *is* "the recipient was not
running". Only something the tab can READ on waking can. So `clearAllSessions`
now also leaves `WIPE_MARK_KEY`, a durable timestamp, and `catchUpOnWipe()`
compares it against the value this document last saw.

It is wired into three places, deliberately overlapping:

- `resume` — the Page Lifecycle wake-up.
- `pageshow` with `persisted` — the back/forward-cache wake-up.
- **`tick`, the heartbeat itself** — the belt to those braces. Whatever path a
  document wakes by, including one nobody has thought of, the heartbeat is the
  thing that would resurrect the data, so it re-reads the mark before it can.

`WIPE_MARK_KEY` **survives the wipe on purpose.** A wipe that erased its own
evidence could not defend against the next sleeping tab. It holds one epoch
millisecond — no deck content, no identifiers, nothing about what was deleted —
and that is a considered exception to "erase everything", not an oversight.

### CORRECTION: that freeze was never real (2026-08-11)

**The claim below is false and is left standing so the mistake is legible.** A
checker instrumented the page and found that CDP
`Page.setWebLifecycleState('frozen')` is a **no-op** in this environment: the
command resolves without error, no `freeze` event fires, and the document's own
interval never misses a beat. Independently reproduced — 6 ticks of a 500ms timer
during a 3s "frozen" window, `events: []`.

So the check below exercised the pre-existing live `storage` listener, not
`catchUpOnWipe`. Removing `catchUpOnWipe()` from `onResume` — the dedicated wake
path #1625 added — left it green. And its red against the un-fixed build came
from the wrong tab: the assertion read origin-wide storage, and the record that
returned belonged to the WIPING tab, which the hand-rolled wipe left unsealed;
the real `clearAllSessions` seals it, so that failure mode does not exist in the
product.

**#1616's fix therefore stands on reasoning, not on evidence.** The reasoning is
sound and spec-level — a frozen document is not running tasks, so it cannot
receive a `storage` event, and only something it can READ on waking can inform it
— but the empirical claim was wrong and I made it three times (PR body, commit
message, and the paragraph below). Marked **UNVERIFIED** until a browser that
honors the freeze, or a real device, is available.

The e2e spec now stops the page with a primitive that actually works —
`Emulation.setScriptExecutionDisabled` — and SKIPS with a reason if the page turns
out to have kept running (measured directly: did it receive the wipe broadcast?).
A skip is a true statement; a silent pass is not.

**A correction to the paragraph above, which stood here for one commit.** It said
the spec "verifies the freeze happened". It does not, and cannot: the stop
primitive fires no Page Lifecycle `freeze`/`resume` at all, so there is no freeze
to verify — the spec measures the *precondition* (the broadcast was dropped)
rather than the lifecycle transition. What it exercises is the heartbeat catch-up
path; `onResume`'s remains uncovered.

### The check as originally described (see the correction above)

`.scratch/wipe-frozen-tab.mjs` freezes tab A through CDP
`Page.setWebLifecycleState('frozen')` — the browser genuinely stops running its
tasks, which is the whole reason it misses the broadcast — wipes from tab B, then
wakes A and lets it beat.

```
PASS  tab A has a live session record
PASS  everything is deleted while tab A sleeps
PASS  the woken tab did NOT write its session back
PASS  still nothing several heartbeats later
```

**And the check discriminates**, which matters more than it passing: re-run
against a build without the fix, the same harness reports
`FAIL … lattice-studio-session-264d71dd…` — the bug reproduced, then closed.

### Scope: is anything else exposed?

Asked, because a shared wipe path suggests a general hole. **No** — the crash
recorder was uniquely vulnerable because it writes on an unconditional timer.
Decks save on a 400ms debounce *triggered by editing* (`StudioShell`), so a woken
tab does not spontaneously rewrite them.

One residual, logged rather than fixed here because this change neither caused
nor worsens it: a woken tab still holds its deck in memory, so if the user
**edits** after a wipe, that deck is saved again. That is arguably correct — they
are actively authoring — but it is worth a deliberate decision rather than an
accident.


## The tests that can actually fail (#1618, 2026-08-11)

Every defect this feature shipped was invisible to the unit tier, and the pattern
is sharp enough to state as a rule: **jsdom can check what the recorder WRITES,
never what a browser DOES.** The toast that clipped its own text, the description
that was near-black on near-black, the two liveness designs that convicted live
tabs, the tab that slept through a wipe — none of them can fail a jsdom test, and
two of them shipped *because* their unit tests passed.

`docs/e2e/crash-sentinel.spec.ts` commits what the throwaway harnesses proved:

| Spec | Project | What it pins |
|---|---|---|
| the report surfaces and says what to try | `desktop` | toast radius asserted as the value it must BE; contrast measured from composited pixels for EVERY text layer (title, description, action), each **composited from the page canvas up** so the toast's own alpha counts; not clipped, by rect, container overflow AND per-layer overflow, **on both axes**; the title actually visible; exactly one toast; the steps section; opaque-error attribution; no sideways overflow. Skips, saying so, if the toast auto-dismissed — but only when a latch observed it on screen first. |
| the same, at phone size | `webkit-phone` | the two defects were a rendered SHAPE and a computed COLOR — the class a Chromium project cannot stand in for |
| a clean session is never reported | `desktop` | the feature rests on "unclosed means crashed"; if an ordinary visit produced one, every boot would cry crash |
| a wipe survives a frozen tab | `desktop` (Chromium) | #1625 — **runs**, and is falsifiable: verified RED against a build with `catchUpOnWipe` removed entirely. Stops the page with `Emulation.setScriptExecutionDisabled` (the Page Lifecycle call is a silent no-op here) and skips only if the page turns out to have heard the wipe. Covers the heartbeat catch-up path; `onResume`'s is still uncovered. |

The contract is shared by two `test()` calls rather than one tagged spec, because
the project tags are exclusive: a `@webkit-phone` test does **not** run on
`desktop`. Both matter — desktop is the broad net, WebKit is the engine that
reported the bug.

**Each spec was verified to FAIL against the code before its fix**, not merely to
pass after it. Re-breaking the toast to its shipped state (`rounded-full`, Sonner's
own description color) fails the spec on the radius assertion. That check is the
whole point: a passing test that cannot fail is exactly what let two bad liveness
designs through this month.


## What a second checker pass found (2026-08-11)

The commit that answered the first review introduced three defects of its own, and
one of them is the same mistake the correction above was written about:

- **It deleted the clipping assertion and left the doc claiming it.** Reproduced by
  clipping the toast (`max-h` + `overflow-hidden`) with the radius left correct:
  every assertion green over text cut off mid-word. A coverage claim without
  coverage, three lines below a section about exactly that.
- **Only the description's contrast was measured.** Painting the TITLE `#2a2a2a` on
  the near-black pill made the line that says the Studio crashed invisible, with
  the suite green — #1622's defect relocated one element over. Every text layer is
  measured now, and the failure names which one.
- **The false RED survived.** Moving the "did it report" oracle onto the persisted
  flag fixed the false green; the visual half still demanded a toast that lives 12s
  inside a budget of 45s for first paint. It now skips, with a reason, when the
  toast has already gone — the report itself is proven separately.

Two more, quieter:

- **The freeze counters were read while the page was still frozen.** `page.evaluate`
  has no timeout of its own and a stopped document never answers, so on a browser
  that HONORS the freeze the honest-skip would have hung until the slot expired —
  failing closed in the one environment it was built for. The page latches its own
  count in the `freeze` handler now, and everything is read after the thaw.
- **The seed guard's recorded reason was wrong.** It blamed repeated navigation;
  `gotoStudio` navigates once. The real cause is that `addInitScript` runs in every
  FRAME, and the live preview is a same-origin iframe sharing this `localStorage` —
  3 init-script runs for 1 navigation. The guard was right, the explanation next to
  it would have sent the next reader to the wrong file.

The through-line across both passes is worth keeping: **every one of these was a
test that passed while proving nothing**, and none was visible from reading the
code — each took a mutation and a rebuild to expose. The verification claims in
this document are only as good as the last adversarial pass over them.


## Third pass: a regression introduced while fixing the second (2026-08-11)

The commit answering the second review introduced one defect worse than three of
the five it closed, which is worth recording as a pattern and not just an entry.

**Fixing "the counters were read while frozen" by moving the THAW above the wipe
made the test vacuous everywhere.** The page was then awake when the other tab
wiped, took the broadcast live through the pre-existing listener, and passed
against a build containing no `catchUpOnWipe` at all. That converts *unverifiable
here* into *unfalsifiable anywhere* — strictly worse, and it was the third
consecutive commit in which this one test failed to test its subject. The fix was
to keep the freeze across the wipe and move only the READ after the thaw:
`page.waitForTimeout` is runner-side and safe against a stopped document,
`page.evaluate` is not, and that distinction is the whole constraint.

Two narrower ones, both the same shape as the defects they sat beside:

- **The restored clipping checks were both properties of the TOAST**, so clipping
  the description element itself evaded both — measured, a toast reading "Your
  decks are safe. See what the" with the suite green. Clipping is now checked on
  every text layer.
- **Every layer's contrast was measured against the TOAST's background**, which
  flatters any layer painting its own. The action chip is `bg-white/15`: scored
  5.78:1 against the toast, 3.67:1 against the pixels it is actually drawn on —
  under AA, and passing. Each layer is now composited over its own backdrop.

**Known residual, stated rather than fixed:** above roughly 20s of first paint the
visual contract skips, and a skip reports as green. The nightly alarm greps for
failures, so a permanently-skipping visual contract would be invisible. Measured
thresholds: runs at every rate up to ~20s paint, skips at ~28s and ~36s. Worth a
guard before this rides a heavily loaded runner.


## Fourth pass: the test finally works, and what made the difference

`Page.setWebLifecycleState('frozen')` is inert here, and four consecutive commits
tried to work around that without noticing it was the problem. The checker found
the primitive that does stop a page in this environment —
**`Emulation.setScriptExecutionDisabled`** — and, with it, demonstrated the test's
own logic discriminating correctly with no change to its ordering, scoping or
assertion. What had been failing was never the reasoning; it was one CDP call that
silently did nothing.

Two changes made it real:

- **The stop primitive.** `setScriptExecutionDisabled` genuinely stops the
  document, and the `storage` broadcast is demonstrably DROPPED rather than
  queued — which is the precondition #1616 depends on.
- **The skip predicate now tests that precondition instead of a proxy for it.**
  It used to ask "did a `freeze` event fire and did ticks stop"; it now asks *did
  the page hear the wipe?* — recorded by the page itself. A predicate about the
  thing the fix depends on cannot drift away from it the way a proxy did.

**Verified falsifiable:** against `9b1f45b~1` (`grep -c catchUpOnWipe` → **0**) the
test goes RED; against `HEAD` it passes. That is the first time in five commits
this test has been shown able to fail for its actual subject.

One trap worth recording, hit while making the swap: the first attempt polled the
live record's own `lastBeat` as the drive signal. The wipe deletes that record, so
the poll waited forever for exactly the write the test asserts must never
happen — **the drive signal and the assertion cannot be the same observable.** A
tick counter in the page, independent of the record, is the right signal.

Two evasions closed alongside:

- **A title that does not render passed everything.** `toContainText` reads
  `textContent`, which includes `display:none`; a zero-height box overflows
  nothing and keeps its color. The toast rendered with no headline at all, suite
  green. Now `toBeVisible()`.
- **Contrast composited only ONE level.** A background on `[data-content]` — the
  wrapper around title and description — was scored 17.3:1 and 11.4:1 against a
  true 3.9 and 3.1. The measurement now walks the whole ancestor chain, and agrees
  with rasterized ground truth to four decimals.

### Still open

- **`onResume`'s catch-up is uncovered.** `setScriptExecutionDisabled` fires no
  `resume` event, so only the heartbeat path is exercised; deleting
  `catchUpOnWipe()` from `onResume` would still go unnoticed. A real
  Page-Lifecycle freeze is what covers it.
- **Whether a genuine freeze DROPS or QUEUES the `storage` event.** If it queues
  and delivers on resume, the live listener seals the tab and the test would prove
  nothing on a freeze-honoring runner. Two stop-proxies disagree here, and neither
  is a real freeze.
- **Above ~20s of first paint the visual contract skips, and a skip reports as
  green.** The nightly alarm greps for failures, so a permanently-skipping contract
  would be invisible. *(Scoped too narrowly — see the fifth pass below: it was
  every presentation regression, not only a slow paint. Closed.)*


## Fifth pass: the skip was the hole, and clipping had a second axis

Three findings that would have shipped, all of the same family as the ones before
them — an oracle that cannot fail for the reason it names.

- **The skip excused a toast that never existed.** The predicate was "is the toast
  on screen now?", and everything absent read as *auto-dismissed*. A checker made
  `Toaster` return `null` — no crash toast at all, a total regression in the
  component this spec is about — and the suite reported **2 passed, 2 skipped,
  exit 0**. The nightly files its tracking issue only on a FAILURE, so this would
  have raised nothing, ever. The residual recorded above scoped this to ">20s of
  first paint"; the real scope was any presentation regression whatsoever, plus a
  strict-mode violation from a second toast, which the probe's `catch` swallowed
  into the same silent skip. A latch (`MutationObserver`, installed before first
  paint) now records whether a crash toast was ever on screen, and the skip
  asserts that latch before excusing itself. Absence is now only forgivable if the
  test watched it arrive. *(The first version of this latch read `textContent`,
  i.e. DOM presence — see the sixth pass below, which walked through it.)*
- **Clipping was checked on one axis.** Every oracle read `scrollHeight`. A title
  held to 120px with `nowrap` + `overflow:hidden` at 390px renders **"The Studio
  stoppe"** — cut off mid-word — with the rect test, the container test, the
  per-layer test, the radius, the contrast and `toBeVisible` all green. This is the
  same evasion closed three times already, on the axis nobody had checked, on the
  surface whose original bug report was "an unstyled black blob". Both axes now.
- **Contrast painted the toast's declared color onto an opaque canvas**, throwing
  away the toast's own alpha. `--normal-bg: rgba(0,0,0,0.12)` gives white text on a
  near-white pill — rasterized at **1.147:1**, worse than #1622 — and the
  measurement scored it **21.000** and passed. Latent, not live (`--surface-inverse`
  is opaque today), but it is the exact door #1622 came through. The walk now starts
  at the document over the white the browser paints under everything, so every
  layer *including the toast* composites with its alpha intact. This also retires
  the "agrees with rasterized ground truth to four decimals" claim above as
  conditional: it was true only while the toast root was opaque.

Two smaller corrections: the frozen-tab test had **no headroom against its own
timeout** — two Studio boots, each budgeted 45s by the fixture, against a 60s
default, with no skip escape, so a loaded runner reds a healthy app (now
`setTimeout(180_000)`); and its non-Chromium skip still named
`Page.setWebLifecycleState`, the primitive the fourth pass removed.


## Sixth pass: the latch tested the DOM, not the screen

The fifth pass's headline fix was half a fix, and the missing half had the same
exit code as the bug it closed.

- **The latch read `textContent`** — presence in the DOM. `display:none` on the
  toast root gives the user *nothing at all*, satisfies a text-only latch, and
  reproduces the exact `2 passed, 2 skipped, exit 0` that the fifth pass cites as
  the hole it closed. The class is broad: anything that leaves the text in the DOM
  while making the box unrenderable. It now requires a laid-out box —
  `getBoundingClientRect()` non-zero, `visibility` and `display` honest. **Opacity
  is deliberately excluded from the latch**: Sonner fades toasts in, a
  `MutationObserver` never fires for a CSS transition, and latching on opacity
  would read mid-fade and turn the benign auto-dismiss case into a hard red. A
  100ms interval backs the observer up for the same reason.
- **`opacity: 0` passed the ENTIRE contract** — `toBeVisible()` (Playwright counts
  a fully transparent element as visible), all three contrast ratios, the clipping
  tests, and the `See report` click. A crash toast no human could see: `4 passed`.
  Now checked live, multiplied through the ancestors, and polled so the fade-in
  does not red it.
- **The walk assumed the browser paints white under the page.** Under
  `color-scheme: dark` it does not: measured, the walk returned `[224,224,224]`
  where the real pixel was `[15,15,15]`. Masked only because `body` is opaque in
  both modes here — and the same shape as the alpha bug one pass earlier: an
  assumption about a surface, one CSS change from being wrong, and wrong in *both*
  directions. The walk now starts at the deepest genuinely-opaque layer, decided by
  compositing over black and over white and checking whether the result moved
  (format-agnostic, so `oklab(… / .5)` and `color-mix()` read correctly). With no
  opaque layer anywhere it returns `null` and the assertion fails, rather than
  inventing a backdrop.

**What held, and it is worth recording**, because this is the first pass where the
central claim survived: the contrast rebase agrees with rasterized ground truth
*exactly* — computed backdrop equals the sampled screenshot pixel in light and
dark, opaque and translucent (`[219,217,212]` and `[18,14,11]`), where the old
formula returned `[0,0,0]` — and **no shipping measurement changed value**
(description 11.346, title 17.301, action 10.978). `--repeat-each=4` on both
projects: 16/16, no flake from the new `toHaveCount(1)`, right-edge or
`scrollWidth` assertions. Geometry headroom is wide, not knife-edge: every text
layer measures `scrollWidth == clientWidth` exactly at devicePixelRatio 1 and 3.

**Known and accepted:** `toHaveCount(1)` couples this spec to "nothing else toasts
at boot". The only other call site needs a user settings write, so it is
unreachable here — but a future boot-time toast would red this spec for an
unrelated reason.

**Logged as #1634, not fixed** (pre-existing, off this diff's path, HARD RULE #18):
`onVisibility` calls `persist()` with no `catchUpOnWipe()` guard, unlike `tick`,
`onResume` and `onPageShow` — so a tab returning to visibility after a wipe could
rewrite the deleted record. It is self-healing: `catchUpOnWipe()` both seals the
tab and removes its own record, and the heartbeat runs every second, so the window
is about a tick rather than a durable resurrection — which is exactly the backstop
#1616's changelog fragment describes, so the shipped claim stands. Driving the real
path produced no resurrection, most likely because headless Chromium never marked
the tab hidden, so this is a reading of the source rather than a reproduction.
