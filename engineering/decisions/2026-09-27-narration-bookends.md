---
status: in-progress
summary: A narrated deck can open with a spoken greeting and end with a spoken closing, set by two front-matter keys, `greeting:` and `closing:`. Each takes `true` or custom text with a `{greeting}` placeholder. The viewer's local clock picks "Good morning", "Good afternoon" or "Good evening". Each plays at most once per page load, in the Studio's Present view and in the exported Player. The Player cannot synthesize speech, so the Studio export records four greetings (three periods plus a neutral "Hello") and the Player picks one at playback, with video always taking the neutral one. The timing track carries a new top-level `bookends` section outside its one-segment-per-slide table, and the track stays at version 1.0. Lattice is pre-GA, so no older player needs to keep working.
---

# Narration bookends: a spoken greeting and closing (2026-09-27)

**Status: proposed.** The owner set the direction and answered four design questions
on 2026-09-27. A fact-check the same day confirmed every mechanism the note cites, and
added the scope for video, packing and a silent last slide in §6–§7. Nothing is built
yet. This note is the plan the build follows.

## 1. What the owner asked for

When a deck plays with narration on, in the Player or the Studio, the narrator opens
with a greeting and ends with closing remarks. Both are optional. Politeness means the
greeting is time-of-day aware ("Good morning", "Good afternoon", "Good evening"), which
needs the viewer's time zone. The greeting and closing must not repeat during one
playback.

## 2. Decisions (owner, 2026-09-27)

| Question | Decision |
|---|---|
| Key shape | **Two keys.** `greeting:` and `closing:` each take `true` or custom text. There is no third key. |
| Whose clock | **The viewer's local clock**, read in the browser. There is no `timezone:` override. |
| "Don't repeat" | **Once per page load.** A reload or a reopened file greets again. |
| Video export | **A neutral greeting.** Video bakes "Hello." because a video has no viewer clock. |

## 3. Authoring

```yaml
greeting: true                                   # speaks "Good morning."
closing: true                                    # speaks "Thank you."
```

```yaml
greeting: "{greeting}, and welcome to the Q3 review."
closing: "Thank you. Questions are welcome."
```

- Both keys are off when absent, so no existing deck changes.
- `{greeting}` is the only placeholder. It expands to `Good morning`, `Good afternoon`
  or `Good evening`, or to `Hello` in video. With `greeting: true` the whole line is
  `{greeting}.`.
- `closing: true` speaks `Thank you.`. The closing has no placeholders, because a
  time-of-day goodbye ("good evening" as a farewell) is ambiguous.
- `false` and an empty string both mean off.
- Lint (`lib/authoring/lint-core.js`, HARD RULE #7) warns in three cases, and never
  blocks:
  - `greeting-hardcoded-period`: a custom greeting that contains a literal "good
    morning", "good afternoon" or "good evening", because it is wrong for about
    two-thirds of viewers. Suggest `{greeting}`.
  - `unknown-greeting-placeholder`: a `{…}` other than `{greeting}`.
  - `bookend-without-narration`: fires only where the linter can tell a deck is
    captions-only. Otherwise it is omitted.

## 4. Time of day

One pure function, `greetingPeriod` in `lib/core/resolve-bookends.mjs` (HARD RULE #1), takes an hour from 0 to 23
and returns `morning`, `afternoon` or `evening`:

| Local hour | Period |
|---|---|
| 04:00–11:59 | morning |
| 12:00–16:59 | afternoon |
| 17:00–03:59 | evening |

It never says "good night", which in English is a farewell. The Studio calls the kernel
with `new Date().getHours()`. The Player's script is self-contained under its
Content-Security-Policy (CSP) hash, so it inlines the kernel. It does that the way it
already inlines its other kernels, by `.toString()` (`player-core.mjs` ~:2130-2138),
which `test/unit/export/inlinable-kernels.test.js` pins. It does not hand-copy the
function.

## 5. The constraint that shapes the design: the Player cannot speak

Narration runs differently on each surface:

- **Studio (`PresentOverlay.tsx`, `read-aloud.ts`).** It synthesizes speech live, through
  the user's OpenRouter key and then in-browser Kokoro. It can resolve the greeting's
  period when Play is pressed and synthesize only that one line. `PresentOverlay` is
  the Studio's only narration transport. `ReadAloudOverlay.tsx` is a debug panel
  rendered inside it, and it plays nothing.
- **Player (`lib/export/player-core.mjs`).** It replays MP3 clips and a timing track
  (the Lattice Timing Track, LTT) that the Studio baked at export (`narration-bake.ts`
  `bakeNarration`, called from `share-export.ts`, and then `narrationPayload`). Its CSP
  is `default-src 'none'` with `media-src data:`, so it has no network and no
  text-to-speech (TTS). It cannot produce "Good afternoon" on the viewer's machine.
  **The Studio bake therefore records four greeting clips, one per period plus a
  neutral `Hello`, and the Player picks one at playback.** The cost is four short
  clips, about 2–4 seconds each.
- **Video (`lib/export/video.mjs`).** It records nothing. It opens an existing narrated
  HTML export in headless Chromium with `window.__lpRender` set, and muxes that
  export's own clips. **Rule: when `__lpRender` is set, the Player picks the `neutral`
  variant.** That is how video gets "Hello" without a clock.
- **The command-line interface (CLI) records no audio.** `--player` calls
  `buildPlayerHtml` without narration (`lattice-emulator.js` ~:4991), and
  `video-cli.mjs` says the CLI "has no speech engine". Only the Studio produces
  narration audio. The CLI's `--captions` `.vtt` output is the one CLI surface this
  touches.

## 6. Timing-track format

`validateLtt` (`docs/src/lib/ltt/validate.ts` ~:303-307) and `deckLtt`
(`lib/core/ltt-deck.mjs` ~:86-125) require exactly one segment per slide, in order,
with slide 0 at hold 0. Bookends are not slides, and making them fake segments would
break that rule and every consumer that indexes `segments[i]` by slide number.

So the track gains an optional top-level `bookends` object next to `segments`:

```jsonc
{
  "version": "1.0",
  "segments": [ /* unchanged: one per slide */ ],
  "bookends": {
    "greeting": {
      "variants": {
        "morning":   { /* cues, same cue shape as a segment */ },
        "afternoon": { /* … */ },
        "evening":   { /* … */ },
        "neutral":   { /* … */ }
      },
      "gapMs": 600
    },
    "closing": { /* cues */, "gapMs": 600 }
  }
}
```

**No backward compatibility is needed.** Lattice has not reached general availability
(GA), so no exported file in the wild has to keep playing. The owner confirmed this on
2026-09-27. `bookends` is a first-class part of the track, not an optional add-on an
old reader skips: `types.ts` declares it, `validateLtt` checks its cues, and every
reader in this change learns it. `version` stays `"1.0"` (the schema pins it as a
constant, ~:228), because a bump would buy nothing without old readers to protect.

**Where it sits under `ltt.md` G4 (§Layers).** G4 says a new *layer* changes what
`positionAt` returns and needs its own record and owner sign-off, and that anything
else is metadata. `bookends` is neither a layer nor metadata. It is a separate timing
section outside `segments`, and it changes the *deck* timeline (`timeline()`), not any
segment's `positionAt`. This note is its record, and the owner approved the design on
2026-09-27. `ltt.md` gains a §Bookends section that says this.

Files this touches:
- `docs/src/lib/ltt/types.ts`. The schema is **generated** from it
  (`npm run ltt-schema:build`, which `build:check` enforces), so the schema is never
  hand-edited.
- `validate.ts`, which validates the section's cues.
- `encode.ts` `pack`/`unpack` (~:98-116). Today they pass `...rest` through, so without
  a change `bookends` survives but its cues are not packed.
- `position.ts` `timeline()` (~:143), which gains a lead-in for the greeting and a
  tail for the closing.
- The `@laticent/ltt` package's built output.

**Audio blocks.** Bookend clips ride in the existing `AUDIO_BLOCK_MIME` blocks under
the non-numeric keys `greeting-morning`, `greeting-afternoon`, `greeting-evening`,
`greeting-neutral` and `closing`. Two readers accept numeric keys only today, and both
would silently drop these clips:
- The Player's `clipUri` matches only `#lp-audio/(\d+)/(\d+)` and plays only its own
  slide's block (~:1880-1881).
- `video.mjs` ~:60 and :70 accept only `/^\d+$/` block keys.

Both regexes widen to the closed set of bookend keys.

## 7. Playback rules (both surfaces)

- **Greeting.** It plays when narration starts on slide 1 and nothing has been spoken
  yet this page load. It plays before slide 1's own narration, followed by a `gapMs`
  pause.
  - Starting narration on any other slide skips it for good. A viewer who jumped in
    mid-deck is not greeted later.
  - Pause and resume, seeking back to slide 1, and Play again do not repeat it.
- **Closing.** It plays when narration reaches the end of the deck, whether the last
  slide was narrated or silent, and the closing has not played yet this page load.
  - A silent last slide, such as the common "Thank you" slide, is exactly where a
    closing belongs, so autoplay arriving on it plays the closing.
  - Arriving on the last slide by manual navigation does not trigger it.
  - Pausing during the greeting or the closing pauses that clip. Navigating away
    cancels it and marks it as played.
- **State.** Two flags per page load, `greeted` and `closed`, in memory only, with no
  `sessionStorage`. The Studio has no equivalent of the Player's `spokeSlide`, so it
  also keeps a `spokeAny` flag for "nothing spoken yet". It needs that because
  `readerRef.current.play()` handles both a fresh start and a resume.
- **Autoplay policy.** Not a problem. The greeting starts inside the Play click, and
  the Player reuses the one `<audio>` element that click unlocks (~:1852-1857). Slide 1
  then chains from `onended`, as slide-to-slide playback does today. A
  `NotAllowedError` stops narration there too (~:2038-2039).
- **Captions.** The greeting and closing show in the caption band like any other
  line. The four `.vtt` producers emit a cue for them, using the neutral line, because
  a file has no viewer clock:
  - `read-along-vtt.js`;
  - `cadenza/vtt.ts`;
  - `share-export.ts` `shareCaptions`;
  - `video.mjs` `toVtt`.

Hook points, checked against the code on 2026-09-27:

- **Player (`narrationJs`).**
  - Greeting: `toggleNarration`'s start branch (~:2057-2059). It is
    `setPlaying(true);speakSlide(t.index)` today, and gains the guard
    `t.index===0&&spokeSlide===-1&&!greeted`, where `spokeSlide` starts at -1 (~:1851).
  - Closing: `endSlide`'s last-slide branch (~:2042-2044), which silent slides already
    route through during autoplay.
  - `onSlideShown` (~:2076), which ends narration on a silent last slide reached by
    navigation, stays as it is, per the navigation rule above.
- **Studio (`PresentOverlay.tsx`).**
  - Greeting: `togglePresentation`'s start branch (~:1391-1393).
  - Closing, in two places. `onFinish`'s end-of-deck branch (~:626) is the first.
    **The second is the empty-slide auto-skip (~:733-744)**, which ends autoplay on a
    silent last slide without calling `onFinish`.
- **Video (`video.mjs`). This is the largest change, and without it video export
  breaks.** `video.mjs` builds its own timeline from `ltt.segments` only (~:84-98). It
  then throws in three cases (~:474-490):
  - the render log's length differs from the number of voiced clips;
  - a logged cue start drifts from `timeline()` by more than half a frame;
  - a slide arrives outside the layout.

  A greeting adds a log entry and shifts every start after it, so every narrated deck
  with a greeting would fail to export. The fix spans three pieces:
  - `timeline()` and `cueTimes` learn the bookends;
  - the `RENDER.log` entry shape `{slide,cue}` gains `{bookend,cue}`;
  - the `silentFirst` lead-in logic (~:372) accounts for a greeting before a silent
    slide 1.

## 8. Resolution kernel

`lib/core/resolve-bookends.mjs` is modeled on `resolve-pace.mjs` and
`resolve-delivery.mjs`. It reads the two keys and returns
`{ greeting: { template } | null, closing: { text } | null }`. It also returns a pure
`greetingText(template, period)` expander. Three callers use it: the Studio's live
reader, the export bake, and the CLI captions path. That gives one reading of the keys
(HARD RULE #1).

## 9. Scope and gates

| Area | Files |
|---|---|
| Kernels | `lib/core/resolve-bookends.mjs` (the parse and `greetingPeriod`) + unit tests |
| Timing track | `lib/core/ltt-deck.mjs`, `docs/src/lib/ltt/{types,validate,encode,position}.ts`, the generated schema (`npm run ltt-schema:build`), the `@laticent/ltt` built output, `engineering/ltt.md` §Bookends |
| Studio | `PresentOverlay.tsx` (both end-of-deck paths), `read-aloud.ts`, `narration-bake.ts` (four greeting clips + closing), `share-export.ts` |
| Player | `player-core.mjs`: `narrationPayload` (keyed bookend blocks), `narrationJs` (hooks, `clipUri`, neutral under `__lpRender`), the kernel inlined by `.toString()`; rerun `tools/build-player-core.js`, since its `--check` is a freshness gate. The CSP hash needs no step, because `caps.sha256(js)` computes it at every export (~:2857) |
| Video | `video.mjs`: block-key regexes, `timeline()`/`cueTimes`, the `RENDER.log` shape, the `silentFirst` lead-in, `toVtt` |
| Captions | `read-along-vtt.js`, `cadenza/vtt.ts`, `shareCaptions` |
| Authoring | `lint-core.js` rules, `lib/base/base.registers.docs.md` section, `design/skills/speaker-notes.md` |
| Record | `changelog.d/narration-bookends.feature.md`, a demo deck `examples/narration-bookends.md` (HARD RULE #9) |

- **Export gate.** This changes the bytes of exported files, so under the CLAUDE.md
  QUALITY BAR the owner signs off on a narrated demo export in dark and light mode
  before merge.
- **Verification.** The code touches `lib/core` and the export pipeline, so it gets a
  maker-checker review. Each surface is verified on the real surface (HARD RULE #23):
  - A Player export played in Chromium with the clock stubbed to each period.
  - A video export of the demo deck that succeeds and opens with "Hello".
  - The Studio Present view driven in the built docs site, including a deck that
    ends on a silent slide.

## 10. Not decided / deliberately out

- A per-deck `timezone:` override. The owner declined it. Revisit only if presenting
  to a room in another zone becomes a real request.
- Localized greetings. `lang:` today only makes a non-English deck bypass the English
  say-as rules (`read-along-build.js` ~:91). A non-English deck with `greeting: true`
  still says "Good morning". The lint should suggest custom text when `lang:` is not
  English.
- An `{audience}` or `{title}` placeholder. Custom text already covers it.

## 11. What the build changed (2026-09-27)

The build followed this plan, with five adjustments found while writing it:

- **One kernel file, not two.** `greetingPeriod` lives in `lib/core/resolve-bookends.mjs`
  beside the parse. It is self-contained, so the player still inlines it by `.toString()`.
- **A bookend carries `holdMs` as well as `tailMs`**, exactly like a slide. The greeting's
  hold is 0 and its tail is the gap before slide 1. The closing's hold is the gap after the
  last slide and its tail is 0. Without a hold, the pause before the closing had no place in
  `timeline()`, and video export would have disagreed with the player about when the
  closing starts.
- **"Once" in the Studio means once per Present session.** The Studio stays loaded for
  hours of editing, so "once per page load" would greet an author only on the first
  rehearsal. Opening Present starts a new delivery and greets again. The exported player
  keeps "once per page load".
- **Pause during a bookend differs by surface, as Pause already does.** The exported player
  restarts the current slide on Play (transport rule 5), so a paused greeting is used up. The
  Studio's reader resumes where it paused, so a paused greeting finishes. Neither repeats.
- **The Studio needed no `spokeAny` flag** (§7 planned one). `greetedRef` is set by the first
  Play wherever it starts, which already answers "has anything been spoken yet". It did need a
  `bookendGap` state: over a silent title slide, the empty-slide skip must wait for the
  greeting's gap to end before it advances, or slide 2 starts before its own arrival beat. A
  maker-checker pass found this; `studio.present-bookends.test.tsx` pins it.
- **An apostrophe needs double quotes.** The shared front-matter scalar rule ends a
  single-quoted value at its first `'`, and YAML's `''` escape is not honored anywhere in
  front matter. The docs say to use double quotes.

`.vtt` downloads (CLI `--captions` and the Studio's Captions download) carry the neutral
greeting and the closing. `cadenza/vtt.ts` needed no change, because both producers shape the
deck-level file in `lib/core/read-along-vtt.js`.

## 12. Owner ruling: a bookend the slides already say is skipped (2026-09-27)

The owner tested the build and heard the closing repeat a "Thank you" slide ("Thank you." then
"Thank you for listening."). A title slide that says "Welcome to…" repeats a greeting the same
way. The owner chose to **skip the bookend automatically** over a lint warning (coaching only) or
both.

- `alreadyGreets(text)`: slide 1's narration opens with "good morning / afternoon / evening /
  day", "hello", "hi", "hey", "greetings" or "welcome".
- `alreadyThanks(text)`: the last slide's narration says "thank you" or "thanks" anywhere.
- `withoutRedundantBookends(ends, slideTexts)` applies both, in `lib/core/resolve-bookends.mjs`.
  The export bake, Studio Present, the CLI `--captions` sidecar and the Studio's Captions download
  all call it, so every surface skips the same lines. The exported player needs no change: the
  bake leaves a skipped bookend out of the file.
- The slide's own words win because they are on screen, and the captions must match them.
- No lint rule was added. A warning would cost about 0.25 KB of the Studio's eager JavaScript
  (the lint core loads eagerly), against about 0.35 KB of budget headroom.
