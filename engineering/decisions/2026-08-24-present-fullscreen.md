---
status: shipped
summary: Present covered the viewport but never the SCREEN — no way to shed the tab strip, URL bar and OS dock for a deck in a room. A fullscreen toggle joins the overlay's staging cluster, bound to `f`, requesting on `documentElement` (the root is exempt from the UA rules that restyle a non-root fullscreen element). The capability is DETECTED, never inferred from the device — iPhone Safari ships no Fullscreen API for arbitrary elements and iPad Safari does, and a UA sniff would be actively wrong since iPadOS reports itself as macOS. Then a user reported it as a no-op in Firefox ON IPAD, which is the root cause and a correction to this note: iOS requires every browser to be a WKWebView, and Apple gates the API behind isElementFullscreenEnabled, DEFAULT FALSE for third-party apps — so `fullscreenEnabled` can answer yes for a capability the host app will never deliver. Two defects, both mine: the refusal was swallowed by a bare catch (a silent decline IS the dead affordance this feature exists to avoid), and the promise was trusted as proof (it resolves without proving the screen changed, the legacy -webkit- calls return undefined, and a request that never settles hung an await forever — no screen AND no message). toggleFullscreen now fires the call, listens for a rejection on the side, and waits on the OUTCOME via fullscreenchange against a 2s ceiling; it returns {ok,reason,fatal}, reporting the browser's own words and retiring the control when the refusal is structural. The durable rule: DETECT to decide whether to offer, VERIFY THE OUTCOME to decide whether it worked. A gecko Playwright project now runs the fullscreen specs on Chromium and Firefox. Real iPad remains unverified; the exported HTML player keeps its own older copy, since aligning it changes export bytes and needs sign-off.
---

# Full screen in Present: detect the capability, never the device

**Date:** 2026-08-24 · **Status:** shipped

## The symptom

Present already covers the viewport — a `fixed inset-0` overlay over a themed
backdrop, with the slide sized to the largest 16:9 box its row allows. What it
never covered was the **screen**. Around that overlay, on every device, sat the
browser: a tab strip, a URL bar, bookmarks, and below them the OS dock or the
iPad home indicator. That is the difference between a deck on a laptop and a
deck in a room, and it was the one thing the overlay could not do for itself.

The exported HTML player has had a fullscreen button since it shipped
(`lib/export/player-core.mjs`, `#lp-full`). The Studio — the surface people
actually present *from* — did not.

## What was added

A toggle in the overlay's **top bar**, beside Slides · Rehearse · Presenter
screen, plus the `f` key. Not the bottom dock, and the reasoning is worth
keeping: the dock is the *delivery* cluster (Play · CC · Voice · Guide), it dims
at rest and hides with the pointer, and it is capped at 760px — tightest on
exactly the device where this button never appears. Fullscreen is a thing you do
**once, before you start talking**, which makes it a sibling of the other
"put this on the right surface" verbs. It also mirrors the Exit ✕ at the far
left, the bar's other window verb.

`f` is not a new convention: the shared transport kernel's docblock has reserved
it since it was written — "UI-specific keys (fullscreen `f`, notes `n`,
presenter `s`, overview `g`, `Escape`) stay with each consumer".

## Why the capability is detected and the device is not

This is the one place in the Studio where a capability genuinely is **absent on
a shipping device**, so it needs care not to become the thing
[`2026-08-10-input-verb-parity.md`](./2026-08-10-input-verb-parity.md) banned.

That note's rule — never gate a verb on device class — is about *input*: a
"desktop" may be a touchscreen laptop, a tablet takes a keyboard case and a
mouse within one sentence, so a capability probe can only answer "what is
attached", never "what is the reader about to use". Fullscreen is a different
question. It does not ask what hardware is attached; it asks whether an API
exists. Parity says never ask *what kind of machine is this*. It does not say
never ask *does this API exist here*.

And the answer is genuinely split:

| | Fullscreen API for arbitrary elements |
|---|---|
| iPad Safari | **Yes** — since iOS 12 (prefixed), unprefixed since 16.4 |
| iPhone Safari | **No** — native video only, still true at iOS 26.x |
| Every desktop engine | Yes |

Source: caniuse `fullscreen`, note 5 — *"Partial support refers to supporting
only iPad, not iPhone. Shows an overlay button which can not be disabled."*
Checked against the `caniuse-lite` copy in `docs/node_modules` (1.0.30001799),
which carries `a #5` for every `ios_saf` row from 12.0 through 26.5.

**A user-agent test would be actively wrong here.** iPadOS Safari reports itself
as macOS by default (desktop-class browsing), so the one mobile device that
*does* support fullscreen is precisely the one a UA sniff cannot tell from a
Mac. Sniffing would hide the button on the iPad and show it on the iPhone —
backwards in both cells.

So `docs/src/lib/fullscreen.ts` asks the API. It reads **`fullscreenEnabled`**,
not `'requestFullscreen' in el`, and the difference is not academic: the two
disagree inside an embedded frame whose `allow` list omits `fullscreen`, where
the method exists and the call rejects. A method-existence check leaves a dead
button there — which is what the export player's own older copy still does.

The button is **hidden, not disabled**, where the API is absent. A greyed-out
control makes a promise the device cannot keep and sends the reader hunting for
the setting that enables it. The `f` key is silent for the same reason.

## Why `documentElement` and not the dialog

Fullscreening the Present dialog looks more precise and drags in two problems
for no gain. The UA stylesheet gives a **non-root** fullscreen element
`position:fixed !important` and a black `::backdrop`, which fights an overlay
that is already `fixed inset-0` over a themed background. And promoting an
ancestor of the live-preview iframe into the top layer risks a re-layout of the
very surface being presented.

The root element is exempt from those UA rules, the overlay already covers the
viewport, and nothing moves in the DOM — so toasts, popovers portaled to
`<body>`, and the chart-detail layer keep working untouched. It is also what the
export player already does.

## Two things the real browser taught

Both were invisible to jsdom, and both are the reason HARD RULE #23 asks for the
real surface.

**1. The pressed state must come from the event, never from us.** A reader
leaves fullscreen with Escape, F11, the macOS traffic lights, a Space switch, or
— on iPad — WebKit's own non-dismissible exit chip (caniuse note 5 again). None
of those route through the button. Any boolean set at call time is stale the
first time one happens, so `watchFullscreen` subscribes to `fullscreenchange`
and `isFullscreen` reads the document. Nothing caches.

**2. Escape must be handled by us, not deferred to the browser.** The first
draft simply *declined to close* Present while fullscreen, on the theory that
the browser owns that key. Chromium and Firefox swallow the keydown that leaves
fullscreen; Safari delivers it, which is the defect worth guarding — one press
on a Mac would otherwise drop out of fullscreen *and* shut the deck down,
dumping a presenter into the editor mid-sentence.

Driving the real browser found a third case the theory did not have: **headless
Chromium under Playwright neither swallows the synthesized Escape nor acts on
it.** The declining handler therefore left the reader fullscreen with Escape no
longer doing anything — a trap, not a guard. Calling `exitFullscreen` ourselves
is idempotent where the browser already acted and load-bearing where it did not,
and it makes the two-step identical on every engine: **one Escape leaves the
screen, the second exits Present** — the same two-step every video player has
trained people to expect.

That is a small correction with a general shape: a guard written against *two*
known engine behaviors is still a guess about the third. Doing the work
ourselves has no third case.

## Verification

- `docs/src/lib/fullscreen.test.ts` — 16 unit tests over the absence cases: no
  API at all, the API present but not permitted, a refused request, SSR with no
  document, and a state change the button did not make.
- `docs/src/components/studio/studio.present-fullscreen.test.tsx` — 8 tests:
  hidden where unsupported, requests on the root, tracks an external change,
  `f`, the Escape handoff, and exit-on-close.
- `docs/e2e/present.spec.ts` — **4 tests on real Chromium**, which is the only
  place the browser actually grants fullscreen: the button state round-trips,
  `f` toggles, Escape leaves the screen while Present survives, and closing
  Present hands the window back. 10/10 passed on `--project=desktop`.
- Screenshots at 1440 / 820 / 390 confirm the button fits every width without
  crowding the bar, and the pressed state at 1440.

**UNVERIFIED: the iPad and the iPhone themselves.** Neither is reachable from
the sandbox. The capability claim rests on caniuse's data (cited above) and the
detection is the API's own bit, so a wrong claim degrades to the button simply
not appearing rather than to a broken control — but "the iPad shows it and the
iPhone does not" has not been observed on the hardware. Two iPad specifics also
remain unseen: WebKit's non-dismissible exit chip may overlap the top bar's
Exit ✕ at the far left, and Stage Manager's window model is untested.

## Amendment (same day): the capability bit can lie

Reported from the outside, hours after this shipped to review: *"in firefox the
fullscreen button seems like a no-op."* Then, crucially: *"it's firefox on iPad
iOS."*

That second sentence is the whole root cause, and it invalidates a claim made
above. **Firefox on iPad is not Gecko.** iOS and iPadOS require every browser to
render with WebKit, so Firefox, Chrome and Edge there are WKWebView shells — and
WKWebView gates the element Fullscreen API behind
[`WKPreferences.isElementFullscreenEnabled`](https://developer.apple.com/documentation/webkit/wkpreferences/iselementfullscreenenabled),
**which defaults to `false` for third-party apps.**

So the table in "Why the capability is detected" is true and incomplete. It reads
"iPad Safari: Yes", which is correct, and it was silently taken to mean *iPad:
yes*. The honest row is:

| | Element Fullscreen API |
|---|---|
| Safari on iPad | **Yes** |
| **Any other browser on iPad** | **Only if that app opted in** — default off |
| Safari on iPhone | No |
| Every desktop engine | Yes |

**The engine answers for the engine; the embedding app decides whether the
capability is actually delivered.** `document.fullscreenEnabled` is computed by
WebKit, and it does not necessarily know what the host app has refused. That is
the mechanism behind the report: the button appears because the bit says yes, the
request goes quiet, and the reader gets exactly the dead affordance this note
spends three sections claiming to have prevented.

### Two defects, both mine

**1. The refusal was swallowed.** The first `toggleFullscreen` ended in a bare
`catch` with a docblock arguing a refusal is "not usefully reportable" because the
caller cannot fix it. Wrong, and wrong in the way this note warns about
everywhere else: a hidden button and a button that silently declines are the same
experience, and the second is worse, because the reader can see it and keeps
pressing. The iPhone rule — *hidden, not disabled, because a greyed-out control
makes a promise the device cannot keep* — was applied in one place and violated in
the other.

**2. The promise was trusted as proof.** The fix for (1) still returned `{ok:true}`
whenever the request resolved. But resolving is a claim about the call, not about
the screen, and three real behaviors break the equivalence: the legacy `-webkit-`
entry points return `undefined` and there is no promise at all; a request can
resolve while nothing happens; and a request can **never settle**, which made an
`await` on it hang forever — no screen and no message, strictly worse than the
reported bug. Writing the never-settles test is what surfaced that one.

`toggleFullscreen` now fires the call, listens for a rejection on the side, and
waits on the **outcome** — `settled()` watches `fullscreenchange` (both spellings)
against a 2s ceiling — racing that against the rejection. The result is
`{ ok, reason, fatal }`:

- a **rejection** carries the browser's own message (Firefox names the actual
  cause) and is NOT fatal, since an untrusted gesture is a common transient one;
- **accepted-and-nothing-happened** is fatal: an app that will not grant fullscreen
  now will not grant it next time, so the overlay reports it and **retires the
  control** for the session. It returns on reload, the right cadence for a
  browser-level setting.

### What this changes about the original design

The "detect the capability, never the device" principle survives — a UA sniff
would still be wrong, and is now wrong in a *second* way, since Firefox on iPad
also reports as macOS. What does not survive is the assumption that a capability
bit is trustworthy. **The durable version of the rule is: detect to decide whether
to OFFER, verify the outcome to decide whether it WORKED.** A capability check
answers a question the browser is willing to answer; only the outcome answers the
question the reader actually asked.

### Coverage

Firefox 142 on Linux was driven headless, headed under Xvfb at 900×700 (fullscreen
crossing three breakpoints) and 1200×800, through repeated toggles, the `f` key,
and a click after the pointer-idle timer — all correct, which is why the first
investigation found nothing: **it was the wrong engine on the wrong OS.** A
`gecko` Playwright project now runs the fullscreen specs on Chromium AND Firefox
at the same viewport (deliberately not `grepInvert`ed out of `desktop` — the value
is in the two engines disagreeing), and the nightly provisions Firefox alongside
WebKit. The WKWebView case is covered at the unit and component level by
simulating the three silent shapes, since no runner here embeds a WKWebView.

**Still UNVERIFIED: a real iPad.** The mechanism is documented by Apple and the
handling is tested against a simulation of it, but neither the failure nor the new
message has been observed on the device that reported it.

## What this does NOT cover

The exported HTML player keeps its own, older fullscreen implementation. It
detects on method existence rather than `fullscreenEnabled` (so it shows a dead
button in a frame without `allow="fullscreen"`) and it has no `f` key. Folding
both onto one helper is the obvious cleanup and it is deliberately not done
here: a change in `lib/export/player-core.mjs` alters the bytes of an exported
artifact and needs sign-off before it ships (CLAUDE.md § Quality Bar). Same
carve-out, same reason, as the wheel verb in
[`2026-08-10-input-verb-parity.md`](./2026-08-10-input-verb-parity.md)
§"What this does NOT cover".
