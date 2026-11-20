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
and a tap is read from the `click` the browser sends only for a tap (never for a swipe or a pinch). The first version
read pointer-up instead; real WebKit (Playwright's `webkit-phone`, once this sandbox could install it) sends a tap as a
`click` with no pointer events at all, so faded chrome never came back there. Whether the chrome was shown is still
read at the gesture's start where the engine reports one, because the gesture controller reveals it on touchstart.

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

### The wake lock needs a gesture in WebKit (iOS Simulator suite, first run)

The first `ios-safari-present-keepalive` run (on `efb3797`) passed everything but the lock: real Mobile Safari reported
`navigator.wakeLock` and did not grant it. WebKit grants the screen lock only inside a user gesture, and the probe had
opened Present with a scripted `click()`. On the owner's phone a real tap opened it, which is why the screen stayed on.
It still exposed a product gap: the re-request when the page comes back to the front has no gesture behind it, so
Safari refuses it. Now any tap or key press inside Present while the lock is not held asks again from inside that
gesture, at the event that GRANTS activation (pointerup/click for a touch, keydown for a key; a later run showed a re-ask
on pointerdown is refused, because a touch grants activation when the finger lifts) (unit test with a lock that refuses outside a gesture, mutated red), and the probe opens Present with a real
WebDriver touch.

### Two caption modes (owner, iPhone, 2026-11-20)

The owner set the two caption surfaces apart:

- **Docked (portrait, desktop, the Stage): a carried crawl, "the Star Wars opening text".** The crawl kept only the
  current slide's sentences, so it jumped back to its top at every slide. `PresentCaption`'s `carry` now keeps the
  sentences of the slide just left above as read lines (the last 12), at the offsets they had, so the transform that
  centered the last line still points at it and the re-center glides on up to the new slide's first line, the spoken
  word still highlighted. A new track also restarts the cursor, so a cue index latched on the slide just left never
  points into the new one (`PresentCaption.carry.test.tsx`; both halves were mutated red).
- **Over the slide (landscape, immersive): closed captions.** The sentence being spoken shows whole, with no scroll and no
  per-word highlight; the only motion is a fade (the band, and each new sentence). The plate is on brand: the app
  palette's `--surface-inverse` at 86%, white type, a faint accent edge so it separates from a dark slide too, drawn per
  visual line so it hugs the words. Reduced motion drops the fade.

### Tap timing, the caption plate, and an iOS Simulator suite (owner, iPhone, 2026-11-20)

- **A tap flashed the chrome and hid it again.** The tap rule compared `event.timeStamp`s across the touch and the click,
  and WebKit can stamp those on different clocks (wall clock vs time since load): every tap fell outside the window, the
  rule fell back to "shown now" (true, because touchstart had just revealed it), and the tap hid it. It now measures with
  its own `performance.now()`, keeps the first start of a gesture, and reads the state from a ref. The unit test sends the
  click on the other clock and went red before the fix.
- **The caption plate hugs the words and lets the slide through.** It is drawn per visual line on an inline box
  (`box-decoration-break: clone`) instead of around the whole sentence, so a short last line no longer sits in a
  slide-wide bar, and it is `rgb(0 0 0 / .55)` over a 6 px blur. One visual line shows at a time.
- **`ios-safari-present-keepalive`** (nightly and dispatch, like every iOS suite; the owner's choice of option A) runs
  `docs/scripts/ios-safari/present-keepalive-probe.js` in Mobile Safari on an iPhone simulator: the wake lock is held
  (Present publishes it as `data-wake`), Fullscreen falls back to immersive and the chrome fades, a real WebDriver touch
  brings it back, the captions sit in the slide with a moving highlight, Next while playing plays on, closing stops the
  voice. Its self-test (`PROBE=present-keepalive node scripts/ios-safari/probe.selftest.mjs`) passes on Playwright
  WebKit, and with the lock, Next and the tap broken on purpose it fails exactly those checks.

### Caption treatment and toggle states — design round (owner, 2026-11-20)

The owner found the light-mode captions odd: a flat slab in the app's own `--bg` across the slide. The root: a caption
sits on the SLIDE, whose colors belong to the deck, while the band took the app's light/dark mode, so light chrome over
a dark slide went muddy and the type lost contrast. Three treatments, all mode-independent (white type, as video
captions are), tried per showing with a `?cc-style=` switch:
**broadcast** (the line being read, alone, on a dark rounded plate), **glass** (the three-line crawl on dark frosted
glass that fades into the slide) and **clean** (the line being read, alone, white with a dark glyph edge, no plate).

**The owner picked broadcast** on the device; it is now the only treatment and the switch is gone.

**Turning the phone no longer shows the relayout.** The owner's screen recording showed three sizes in about half a
second on a turn: the docked layout at the new size (React swaps in immersive a frame after the resize), then an
oversized slide cut off at the bottom (iOS settles the viewport height over its rotation animation), then the final
frame. Present now does what a video player does: on an orientation change the stage fades out and comes back once
the window and visual-viewport sizes have held still for 6 animation frames, never later than 1.2 s. The fade is an opaque
display-sized COVER faded over the stage, never opacity on a layer that holds the slide frame: on WebKit that can
promote a compositing layer at the frame's own 4K box, the memory the 4K Present crash fix (#3304) removes.

Toggle states were also hard to read: on was a tinted outline, close to off. On is now a solid accent pill with
`--on-accent` type (`ON_PILL`), off stays an outline, for every on/off control in Present.

## Verification

- Unit (jsdom, fake time): `studio.present-keepalive.test.tsx` — Next carries play to the end of
  the deck; Pause then Next stays paused; Previous onto a silent slide holds it; close stops the
  voice; the wake lock is requested on open and released on close; the media keys move and play
  the deck and are unbound on close. Each was mutated red and restored.
  `studio.present-fullscreen.test.tsx` covers the immersive fallback, the synchronous-throw case
  and Escape. `studio.present-pace.test.tsx`'s leave-beat case now asserts the hand-off to slide 2.
- Browser, Chromium first: `e2e/present-immersive.spec.ts` (`@webkit-phone`) ran on Chromium at an 852x393 touch
  viewport while this sandbox's network policy blocked Playwright's browser downloads. Its first run went red on a real
  defect (the gesture controller's own reveal on touchstart made every tap hide the chrome), fixed.
- Browser, real WebKit and Gecko, once the owner allowed the download hosts: the Present specs (`present-immersive`,
  `present`, `present-beat`, `present-steps`, `present-bookends`) on `webkit-phone`, `webkit-tablet`, `gecko`,
  `desktop`, `mobile` and `mobile-touch`: 36 passed, 3 skipped by design (two touch-only cases on `desktop`, the Stage
  case on `mobile`). The first `webkit-phone` run FAILED on a second real defect — WebKit sends a tap as a `click` with
  no pointer events, so faded chrome never came back — fixed by reading the tap from `click`. After the fix the
  immersive spec on `webkit-phone` passed 10/10 repeated and 5/5 at four workers.
- iOS Safari Simulator (`platform-suites.yml`, suite `ios-safari-present-memory`, macOS 26) passed on the commit before
  the click fix. That probe measures memory while stepping a photo deck; it does not exercise the wake lock, the
  immersive layout, the tap or the media keys, so it is no evidence for those.
- **UNVERIFIED on a real iPhone:** the wake lock keeping the screen on, the lock-screen and headset controls, the
  audio-session category, the notch safe-area padding, and whether the rotation fade fully covers iOS's relayout. They
  are OS behavior that jsdom and Playwright's WebKit do not exercise.

## Open

- **Playing with the screen off.** The narration plays through Web Audio (the Suono stage). iOS
  suspends a page's audio context and timers when the phone locks, and the Audio Session category
  set here is necessary but probably not sufficient. The known route is to send the stage's output
  through a `MediaStreamAudioDestinationNode` into an `<audio>` element, which iOS treats as media
  and keeps alive, and to drive slide advance from the audio's own end rather than `setTimeout`.
  That is a change to `read-aloud.ts`'s playback path, and it can only be verified on a device.
- **An author-declared autoplay** (front matter, Deck settings, the HTML player). Needs a design
  round before code: see the decision card on the PR.
- **Real full screen on an iPhone.** `docs/src/lib/fullscreen.ts` says iPhone Safari never grants
  element full screen. The iOS Simulator suite saw the opposite: in Safari 26.5 on an iPhone 17 Pro
  simulator, `fullscreenEnabled` was true and a request that inherited a recent tap was granted
  (run 44804692039). Present handles both outcomes: granted gives real full screen with the docked
  controls, refused gives the immersive layout. Whether a real iPhone grants it too, and whether a
  phone in real full screen should also hide its controls, still needs a check on a device. The
  keep-alive probe now waits for the tap's activation to lapse, so it always tests the refused path.
