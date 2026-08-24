---
status: shipped
summary: Present covered the viewport but never the SCREEN — no way to shed the tab strip, URL bar and OS dock for a deck in a room, on a desktop or an iPad. A fullscreen toggle joins the overlay's staging cluster (Slides · Rehearse · Presenter screen), bound to `f`, requesting on `documentElement`. The capability is DETECTED, never inferred from the device — iPhone Safari ships no Fullscreen API for arbitrary elements and iPad does (caniuse note 5, still true at iOS 26.x), and a UA sniff would be actively wrong because iPadOS reports itself as macOS. `document.fullscreenEnabled` is the exact bit: false on iPhone, false in a frame without `allow="fullscreen"` (which a method-existence check passes while the call rejects), true elsewhere. Two things the real browser taught that jsdom could not — pressed state must be driven by `fullscreenchange`, not by our own boolean, because Escape/F11/traffic lights/iPad's own exit chip never touch the button; and the overlay must exit fullscreen ITSELF on Escape rather than deferring, since headless Chromium neither swallows the key nor acts on it, which would trap the reader. The exported HTML player keeps its own older copy — aligning it changes export bytes and needs sign-off.
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

## Amendment (same day): a refusal must be said out loud

Reported from the outside, hours after this shipped to review: *"in firefox the
fullscreen button seems like a no-op."*

The first version of `toggleFullscreen` ended with this:

```js
} catch {
    return isFullscreen(doc);   // swallow
}
```

with a docblock arguing that a refusal is "not usefully reportable" because the
caller cannot fix it. That reasoning is wrong, and wrong in the exact way this
note spends three sections warning about: **it reintroduces the dead affordance.**
A hidden button and a button that silently declines are the same experience — a
control that does nothing and does not say why — and the second is worse, because
the reader can see it and keeps pressing it. The rule this module already states
for iPhone ("hidden, not disabled, because a greyed-out control makes a promise
the device cannot keep") applies with equal force to a *refused* request, and the
first draft applied it in one place and violated it in the other.

`toggleFullscreen` now returns `{ ok, reason }` and the overlay surfaces a refusal
through `notify` — the same channel the presenter-popup blocker already uses. The
`reason` is the browser's own message, which matters: Firefox rejects with a
`TypeError` that names the actual cause (*"...not called from inside a short
running user-generated event handler"*, *"...fullscreen is not enabled"*), so the
report a user can now give has a cause in it instead of a shrug.

**The Firefox report itself did not reproduce here.** Firefox 142 on Linux was
driven headless, headed under Xvfb at 900×700 (fullscreen crossing three
breakpoints) and at 1200×800, through repeated button toggles, the `f` key, and a
click after the pointer-idle timer: every one entered and left fullscreen
correctly, with `document.fullscreenElement` set to `HTML` and the viewport
growing as expected. So the cause is environmental to the reporter's browser —
a permissions or enterprise setting, a hardened profile, an extension — which is
precisely the class the swallowed `catch` made undiagnosable, and precisely the
class the new message names.

The durable fix for the coverage gap is the **`gecko` Playwright project**
(`playwright.config.ts`): the fullscreen specs now carry `@gecko` and run on
Chromium AND Firefox at the same viewport. The Fullscreen API is granted or
refused by the browser, against its own permissions model and its own rule for
what counts as a user gesture — none of which Blink's answer predicts, so a
Chromium-only suite could certify this feature green forever while it was broken
on a third of the web. Same argument the `webkit-*` projects were added under,
one engine later. The nightly workflow provisions Firefox alongside Chromium and
WebKit.

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
