---
status: shipped
summary: "The crash sentinel's boot toast fired on returning to any Studio tab the browser had unloaded while it sat in the background — which is not a crash, and is the ordinary end of most sessions. From inside a page an ordinary unload and a dead renderer are the same observation: the record just stops. So the alarm was wrong most of the times it fired, and a false alarm on a schedule is how the one true alarm gets ignored. Fix, three parts. (1) The toast is REMOVED; recording stays unconditional and the report becomes a place the author goes — Workspace → General → Crash reports — with `markReported`/`unreportedCrashReports`, the interruption-rationing API, deleted with it. (2) `console.error` is now CAPTURED (patched, always passing through, re-entrancy guarded, restored on stop only if still ours, writes throttled to 1/s): `window.onerror` sees only what nobody caught, while the diagnostic failures here are caught, logged and degraded around — so a session that printed a stack trace seconds before it died used to report no errors at all. (3) The report is reordered and re-worded to be actionable: what FAILED leads (errors, missing files) with the ambient measurements behind it, a new `hidden` field records whether anyone was looking so a background unload gets the headline 'The Studio stopped while the tab was in the background' and 'nothing to do' rather than 'stopped unexpectedly', and a frozen-and-never-resumed record is classified `reclaimed` instead of `stopped`."
---

# Retiring the crash toast, and making the report worth opening

**Date:** 2026-08-18 · **Status:** shipped

Amends `2026-08-10-studio-crash-sentinel.md`, which shipped the recorder and the
toast. The recorder was right. The toast was not.

## The report

> this keeps showing up even when there is no crash. the browser unloads the page
> after time, come back and you see this crash toast. horrible. we should continue
> collecting but this toast is not useful, remove it. also, for crashes we don't
> capture critical errors that are logged in the console. today, the crash report
> is not actionable either.

A phone, a Studio tab left in the background, a return to it — and *"The Studio
stopped unexpectedly · Your decks are safe. See what the Studio recorded."*

## Why the toast was wrong, and why it could not be tuned

Browsers unload backgrounded tabs on their own schedule. **From inside the page,
that is the same observation as a renderer death:** the session record stops.
There is no signal that separates them — `document.wasDiscarded` covers one
Chromium case and nothing else, and the browser's own crash report goes to a
server endpoint this site deliberately does not have (measured, and recorded in
the 08-10 note).

So the toast was not miscalibrated; it was announcing a class of event it could
not distinguish from the boring member of that class. The boring member is also
the *common* one. Every mechanism that made it politer — announce once per record
(`markReported`), a 12s life, a non-blocking shape — reduced the annoyance
without touching the fact that the notice was usually a false alarm.

An alarm that is usually wrong spends the credibility the true alarm needs. The
honest move is to stop interrupting and keep recording.

## What changed

**1 · No interruption.** `StudioShell` still collects on mount; nothing announces.
`markReported` and `unreportedCrashReports` are deleted — they existed only to
ration an interruption that no longer happens — along with the `reported` field
they wrote and the prune tier that read it. **Workspace → General → Crash reports
is now the only way in**, which it was already built to be: the row is always
present, and at zero it says the recorder is armed (that empty state was
deliberate, and it is now load-bearing).

**2 · The console is a source.** `window.onerror` fires only for an exception
nobody caught, and the failures worth diagnosing in this app are *caught* — a
`catch` that logs and degrades, React logging what a boundary absorbed, a library
refusing bad input. All of them print to the console; the reload after a crash
wipes it. The report therefore said "no errors recorded" about a session that
printed a stack trace seconds before it ended.

`console.error` is patched in `startCrashSentinel`. Four properties keep that
honest:

- the original is **always** called, so devtools shows exactly what it showed;
- the capture is **re-entrancy guarded** — anything below it that logs would
  otherwise recurse forever (a getter that throws and logs is the real shape);
- `stop()` restores it **only if `console.error` is still ours**, so a later
  patcher is never torn out from under;
- writes are **throttled to one per second** (`CONSOLE_PERSIST_MS`); the 5s
  heartbeat carries the rest. `console.error` is cheap to call and libraries call
  it in loops — persisting 4-8KB of JSON per call would make the recorder the
  stall it exists to observe.

**The privacy cost, stated.** A breadcrumb is written by a caller who chose a
label. A `console.error` argument is written by whoever called it — including a
third-party library that might print the input it choked on — so this is the one
channel the module does not control. It is bounded rather than eliminated: 300
characters per message and 1200 per stack (`noteError`), nothing transmitted, and
the panel shows the recorded error above the "Report on GitHub" button so the
only path off the device runs through a human reading it. Audited when this
landed: all eleven `console.error` calls in `docs/src` log a label plus an Error
object; none passes deck text. That is a convention to keep, and the module's
PRIVACY docblock now says so.

`console.warn` is deliberately NOT captured: it is where libraries put things
that are working as intended, and burying the errors in them helps nobody.

`formatConsoleError` folds the arguments the way a console does — printf
specifiers substituted (`'%s failed', 'export'` → `export failed`, `%c` consumed),
an `Error` anywhere in the arguments contributing its **stack**, duck-typed as
well as `instanceof` so an error thrown across the preview iframe's realm
boundary still gives up its stack, and every serialization failure (circular,
throwing getter) absorbed. It is exported and unit-tested because it is the part
with a wrong answer available.

**3 · The report leads with what failed.** Three changes, all in
`describeSession`:

- **Order.** Errors and failed loads first; memory, freezes and tab identity
  after. The old order opened with a memory paragraph *every* report carries and
  pushed the one line naming a broken function below it.
- **`hidden`** — a new optional field on the record, latched from
  `document.visibilityState` at boot and on every visibility change, resume and
  bfcache restore. A session whose last known state was hidden did not stop while
  anyone was using it. It gets the headline **"The Studio stopped while the tab
  was in the background"** and a step that says *nothing to do* — and it is
  deliberately still `ending: 'stopped'`, because "nobody was looking" is weaker
  evidence than the browser saying it reclaimed the tab. The wording carries the
  inference; the classification does not overclaim.
- **`frozen` is a reclaim.** A record left frozen means the browser announced the
  tab had become discard-eligible and it never came back. That is the browser
  unloading it, so `ending` is now `reclaimed` (still `confirmed: false`, so the
  panel keeps its caveat), and the headline reads "The browser unloaded this tab
  in the background" rather than "The Studio stopped unexpectedly".

An error taken off the console is also *labeled* as one — "logged to the console;
the page kept running" — because a caught-and-logged warning must not read as the
thing that killed the tab. That is what the new `ErrorGroup.source` field carries.

## What did NOT change

The recorder, the storage discipline, the privacy posture, the guard
(`isSessionRecord`), the wipe machinery, the GitHub hand-off. Both new optional
fields (`hidden`, `ErrorGroup.source`) are validated by the guard on the same
reasoning as every field before them — a present-but-wrong-shaped optional field
is exactly what that guard exists for — and neither moves `RECORD_VERSION`, since
a bump would discard every record already sitting in a user's browser and older
code simply ignores a field it does not know.

## Verification

- Unit: `docs/src/lib/crash-sentinel.test.ts` — console capture (record contents,
  pass-through, restore, later-patcher, no recursion), `formatConsoleError`
  (specifiers, stacks, unserializable arguments), the background headline and its
  absent chore, error-first ordering, console labeling, visibility tracking, and
  the guard's two new fields. 84 passing.
- E2E (`docs/e2e/crash-sentinel.spec.ts`, real browser — HARD RULE #23): the
  report is offered in Workspace and reads well on desktop AND WebKit-at-phone
  (clipping on both axes per text layer, contrast composited from the deepest
  opaque layer up, no sideways overflow); **a boot that finds a crash record
  raises no toast at all**, latched from before first paint so a toast cannot be
  raised and gone before the assertion; a console error lands in the live record
  with its stack and substituted format string; a clean session still reports
  nothing.

The toast's own presentation contract — radius, per-layer contrast, per-axis
clipping, the auto-dismiss skip and its latch — is retired with the toast. What
was portable moved onto the panel a human now reads.
