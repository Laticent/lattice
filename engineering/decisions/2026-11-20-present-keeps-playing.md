---
status: shipped
summary: Present keeps a playing deck playing — a screen wake lock and OS media controls while open, navigation that carries continuous play, exit that stops the narration, and an immersive landscape/fallback-fullscreen layout whose chrome fades until a tap.
---

# Present keeps playing

**Asked (2026-11-20).** The owner reported four defects from an iPhone, with screenshots:

1. During Play, the phone's screen timed out and locked, which stopped the deck. The goal: plug the
   phone in and let the deck play to the end — better still, with the screen off.
2. Turned sideways, Present kept its docked chrome above and below the slide and left the slide a
   thumbnail. Expected: the slide fills the screen, the controls float over it and hide after a few
   seconds, and a touch brings them back — the same morph the Studio preview makes in landscape.
3. Previous / Next stopped continuous play. Pressing Play is the choice of continuous play; only
   Pause should take it back.
4. Exiting Present left the narration playing over the editor.

The Fullscreen button also failed on the iPhone with "null is not an object (evaluating
'e.webkitEnterFullscreen')".

## What changed

All of it lives in `docs/src/components/studio/PresentOverlay.tsx` unless named.

| # | Fix | Mechanism |
|---|---|---|
| 1 | The screen stays on while Present is open | A Screen Wake Lock, held from open to close by `WakeKeeper` (`live/live-wake.ts`, the Live room's keeper, reused), re-taken when the page returns to the front |
| 1 | Lock screen, Control Center and headset buttons drive the deck | `present/present-media.ts` binds Media Session `play`/`pause`/`nexttrack`/`previoustrack`/`stop` to the transport (the rehearsal clock in Rehearse) and mirrors the play state; it also sets `navigator.audioSession.type = 'playback'` while open and puts it back on close — never over a Live call's `play-and-record`, which would end the microphone track |
| 3 | A move while playing keeps playing | `carryPlayRef`: when `autoplay` is on, every mover (Next, Previous, a jump, the rail, the overview, a lens pick, the media keys) arms the same hand-off autoplay's own advance uses, so the new slide lands at rest and speaks after its arrival beat. The arrival effect also re-checks `autoplay`, so Pause always wins over a stale hand-off |
| 3 | Previous onto a silent slide is not bounced straight back | A silent slide the presenter moved to mid-play is held for `SILENT_DWELL_MS` (4 s, or the arrival beat if longer) before continuous play moves on. The hold IS the arrival beat, stretched: `holding` stays on and `beatTimerRef` owns it, so the transport reads Pause throughout and Pause cancels it. A silent slide reached by autoplay itself is still skipped at once, as before |
| 3 | Manual and automatic moves are told apart exactly | autoplay's own moves set `selfAdvanceRef` just before they move, and every move consumes it, so a hand-off left armed by a move that changed nothing (Home on slide 1) cannot disguise the next presenter move |
| 3 | A press moves the slide while playing | Previous / Next skip a build's step walk while the deck plays, since a playing slide is shown at rest and narrated whole |
| 4 | Exit silences the deck | Closing stops the reader and drops any pending arrival or leave beat. The component stays mounted while closed, which is why the narration used to play on |
| 2 | Immersive layout | `immersive = useLandscapePhone() \|\| focusMode`. The slide row drops its padding and flank arrows; the top bar and the transport dock float over the slide and fade (`opacity-0` and `pointer-events-none`) when the bloom folds. A tap on the slide shows them; a tap while they show hides them. The caption crawl stays visible, like video subtitles |
| 2 | Fullscreen is offered everywhere | Real fullscreen where the browser grants it; **immersive** (`focusMode`) where it cannot. A refusal of a real request falls back to immersive too. Escape leaves immersive before it closes Present |
| — | The iPhone error | `lib/fullscreen.ts` now treats a request that THROWS synchronously as structural (`fatal`): every engine reports a policy refusal by rejecting the promise, so a throw is the engine failing inside its own API. iPhone Safari reports `fullscreenEnabled` and then throws on every request |

### What this reverses

The Fullscreen control used to be **hidden where the API was absent**, so a reader never met a
button that could not deliver. That rule protected against a dead button. The button is no longer
dead anywhere: on a browser without the API it turns on immersive, which is the nearest thing to
fullscreen that page can do. So the control is shown everywhere. Only a refused ENTRY falls back to
immersive; a failed exit does not.

In immersive the top bar and dock take none of the docked padding: their safe-area padding is the only padding, because a
responsive `sm:px-5` comes later in the stylesheet and would win on every landscape phone, putting the Exit ✕ under the
notch. Taps are read on the slide row as well as the backdrop (a chart's detail layer takes pointer events over its box),
and a second finger makes the touch a pinch, never a tap.

**Captions in immersive ride on the slide.** Docked, the caption crawl sits in the dock under the slide at a fixed
16-18px. Once the dock floats, that left the captions hanging mid-slide over the slide's own text (owner's iPhone
screenshots). In immersive the crawl renders INSIDE the slide frame as a subtitle on its bottom edge
(`.latt-cc-over` in `present/stage-chrome.js`): an inline-size container whose type is `2.5cqw` of the slide's width
(clamped 11-40px), every other length in `em`, so it grows and shrinks with the slide. Its backing is the chrome's own
`--bg`, near-solid behind the lines, because the ink is the chrome's `--text-heading` and the pair must keep its
contrast over any slide. While the controls show, it rises just clear of them (measured: the dock's overlap of the
slide), and drops back when they fade. Docked layouts keep the fixed reading size: there the caption is outside the
slide. The landscape slide also keeps the Studio preview's 12px frame above and below (`py-3`), and its bottom clears
the home indicator.

A touch browser can leave a tapped button focused, and the dock pins the bloom open on focus. In
immersive that pin would hold the chrome on screen for good, so there only keyboard focus
(`:focus-visible`) pins.

### The captions froze on word one (found while testing this PR)

On the owner's iPhone the caption crawl lit its first word and never moved. Reproduced in the built Studio here, in
portrait and landscape and on `main` too, with the voice OFF: `useReadAloud.play()` awaited
`voice.prepareSelectedVoice()` before starting the caption clock, and that promise was still pending after 6 s (the
selected voice was still being made ready — an on-device model download that, on a slow or blocked link, does not
land). Nothing was going to speak, yet the captions waited for the voice.

`read-aloud.ts` now never makes the caption clock wait on a voice that is not coming. Muted, the estimate starts at
once and preparation finishes in the background, so an unmute mid-slide still resumes the clocked voice. Unmuted, the
read waits up to `PREPARE_WAIT_MS` (2.5 s); past that the slide is read on captions alone and the voice joins at the
next slide's play once it is ready. It never joins mid-slide, which would be the race-ahead-then-snap-back the
deferred start exists to prevent (`2026-07-09-cadenza-narration-quality.md`).

## Verification

- Unit (jsdom, fake time): `studio.present-keepalive.test.tsx` — Next carries play to the end of
  the deck; Pause then Next stays paused; Previous onto a silent slide holds it; close stops the
  voice; the wake lock is requested on open and released on close; the media keys move and play
  the deck and are unbound on close. Each was mutated red and restored.
  `studio.present-fullscreen.test.tsx` covers the immersive fallback, the synchronous-throw case
  and Escape. `studio.present-pace.test.tsx`'s leave-beat case now asserts the hand-off to slide 2.
- Browser: `e2e/present-immersive.spec.ts` (`@webkit-phone`) — the slide fills the landscape box,
  the chrome fades, a tap brings it back, Play works over the slide, a second tap hides it,
  portrait restores the docked layout. **Run here on Chromium at an 852x393 touch viewport**, not
  WebKit: this sandbox's network policy blocks Playwright's browser download hosts, so WebKit
  could not be installed. Its first run went red on a real defect (the gesture controller's own
  reveal on touchstart made every tap hide the chrome); green after the fix, 10/10 repeated and
  5/5 at four workers. WebKit runs it in the nightly (`studio-e2e-nightly.yml`, project `webkit-phone`); nothing per-PR does.
  `e2e/present.spec.ts` stays green on `desktop`, `mobile-touch` and `tablet-touch` (swipe and
  pinch share the backdrop with the new tap rule).
- **UNVERIFIED on a real iPhone.** The wake lock, the media keys and the audio session are OS
  behavior that neither jsdom nor Playwright's WebKit exercises. Confirm on the device.

## Open

- **Playing with the screen off.** The narration plays through Web Audio (the Suono stage). iOS
  suspends a page's audio context and timers when the phone locks, and the Audio Session category
  set here is necessary but probably not sufficient. The known route is to send the stage's output
  through a `MediaStreamAudioDestinationNode` into an `<audio>` element, which iOS treats as media
  and keeps alive, and to drive slide advance from the audio's own end rather than `setTimeout`.
  That is a change to `read-aloud.ts`'s playback path, and it can only be verified on a device.
- **An author-declared autoplay** (front matter, Deck settings, the HTML player). Needs a design
  round before code: see the decision card on the PR.
