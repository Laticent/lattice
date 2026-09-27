---
status: proposed
summary: A narrated deck can open with a spoken greeting and end with a spoken closing, set by two front-matter keys, `greeting:` and `closing:`. Each takes `true` or custom text with a `{greeting}` placeholder. The viewer's local clock picks "Good morning", "Good afternoon" or "Good evening". Each plays at most once per page load, in the Studio's Present view and in the exported Player. The Player cannot synthesize speech, so an export bakes all three greetings and picks one at playback, and video export bakes a neutral "Hello". The timing track carries the two clips outside its one-segment-per-slide table.
---

# Narration bookends: a spoken greeting and closing (2026-09-27)

**Status: proposed.** The owner set the direction and answered four design questions
on 2026-09-27. Nothing is built yet. This note is the plan the build follows.

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

One pure kernel, `lib/core/greeting-period.js` (HARD RULE #1), takes an hour from 0 to 23
and returns `morning`, `afternoon` or `evening`:

| Local hour | Period |
|---|---|
| 04:00–11:59 | morning |
| 12:00–16:59 | afternoon |
| 17:00–03:59 | evening |

It never says "good night", which in English is a farewell. The Studio calls the kernel
with `new Date().getHours()`. The Player carries a copy of the function inline, since
the Player's script is self-contained under its Content-Security-Policy (CSP) hash. A
unit test pins the inline copy to the kernel so the two cannot drift.

## 5. The constraint that shapes the design: the Player cannot speak

Narration runs differently on each surface:

- **Studio (`PresentOverlay.tsx`, `read-aloud.ts`).** It synthesizes speech live, through
  the user's OpenRouter key and then in-browser Kokoro. It can resolve the greeting's
  period when Play is pressed and synthesize only that one line.
- **Player (`lib/export/player-core.mjs`).** It replays MP3 clips and a timing track
  (the Lattice Timing Track, LTT) that the Studio baked at export (`narration-bake.ts`,
  `narrationPayload`). Its CSP is `default-src 'none'` with `media-src data:`, so it
  has no network and no text-to-speech (TTS). It cannot produce "Good afternoon" on
  the viewer's machine. **An export therefore bakes three greeting clips, one per
  period, and the Player picks one from the viewer's clock.** The cost is three short
  clips, about 2–4 seconds each.
- **Video (`lib/export/video.mjs`).** It muxes the Player's clips in headless Chromium,
  so it has no meaningful viewer clock. It bakes and plays a fourth variant, `Hello`.

## 6. Timing-track format

`validateLtt` (`docs/src/lib/ltt/validate.ts`) and `deckLtt` (`lib/core/ltt-deck.mjs`)
require exactly one segment per slide, in order, with slide 0 at hold 0. Bookends are
not slides, and making them fake segments would break that rule and every consumer
that indexes `segments[i]` by slide number.

So the track gains an optional `bookends` object next to `segments`:

```jsonc
{
  "segments": [ /* unchanged: one per slide */ ],
  "bookends": {
    "greeting": {
      "variants": {
        "morning":   { /* cues + clip ref, same cue shape as a segment */ },
        "afternoon": { /* … */ },
        "evening":   { /* … */ },
        "neutral":   { /* … */ }
      },
      "gapMs": 600
    },
    "closing": { /* cues + clip ref */, "gapMs": 600 }
  }
}
```

- A track without `bookends` validates and plays exactly as it does today.
- The schema (`ltt.schema.json`), the types (`types.ts`), `validateLtt` and
  `engineering/ltt.md` §Segments all gain the section in the same change.
- The clips ride in the existing audio block mechanism (`AUDIO_BLOCK_MIME`), under keys
  that cannot collide with a slide index.

## 7. Playback rules (both surfaces)

- **Greeting.** It plays when narration starts on slide 1 and nothing has been spoken
  yet this page load. It plays before slide 1's own narration, followed by a `gapMs`
  pause.
  - Starting narration on any other slide skips it for good. A viewer who jumped in
    mid-deck is not greeted later.
  - Pause and resume, seeking back to slide 1, and Play again do not repeat it.
- **Closing.** It plays when narration finishes the last slide's cues and the closing
  has not played yet this page load.
  - Arriving on the last slide by navigation, without narrating to its end, does not
    trigger it.
  - Pausing during the greeting or the closing pauses that clip. Navigating away
    cancels it and marks it as played.
- **State.** Two flags per page load, `greeted` and `closed`, in memory only, with no
  `sessionStorage`.
- **Captions.** The greeting and closing show in the caption band like any other
  line. The `.vtt` producers (`read-along-vtt.js`, `vtt.ts`, `share-export.ts`
  `shareCaptions`, `video.mjs`) emit a cue for them. The track itself carries all four
  greeting variants, so a downloaded `.vtt` uses the neutral line.

Hook points found by a code map on 2026-09-27:

- **Player (`narrationJs`).** The greeting goes in `toggleNarration`'s start branch when
  `t.index===0` and nothing has been spoken yet (`spokeSlide===-1`). The closing goes in
  `endSlide`'s last-slide branch.
- **Studio.** The greeting goes in `PresentOverlay.tsx`'s `togglePresentation` start
  branch, and the closing in `onFinish`'s end-of-deck branch.

## 8. Resolution kernel

`lib/core/resolve-bookends.mjs` is modeled on `resolve-pace.mjs` and
`resolve-delivery.mjs`. It reads the two keys and returns
`{ greeting: { template } | null, closing: { text } | null }`. It also returns a pure
`greetingText(template, period)` expander. The Studio's live reader, the export bake
and the command-line interface (CLI) captions path all call it, so there is one reading
of the keys (HARD RULE #1).

## 9. Scope and gates

| Area | Files |
|---|---|
| Kernels | `lib/core/greeting-period.js`, `lib/core/resolve-bookends.mjs` + unit tests |
| Timing track | `lib/core/ltt-deck.mjs`, `docs/src/lib/ltt/{validate,types}.ts`, `ltt.schema.json`, `engineering/ltt.md` |
| Studio | `PresentOverlay.tsx`, `read-aloud.ts`, `narration-bake.ts`, `share-export.ts` |
| Player | `player-core.mjs` (`narrationPayload`, `narrationJs`, the CSP hash is regenerated) |
| Video + captions | `video.mjs`, `read-along-vtt.js`, `cadenza/vtt.ts` |
| Authoring | `lint-core.js` rules, `lib/base/base.registers.docs.md` section, `design/skills/speaker-notes.md` |
| Record | `changelog.d/narration-bookends.feature.md`, a demo deck `examples/narration-bookends.md` (HARD RULE #9) |

- **Export gate.** This changes the bytes of exported files, so under the CLAUDE.md
  QUALITY BAR the owner signs off on a narrated demo export in dark and light mode
  before merge.
- **Verification.** The code touches `lib/core` and the export pipeline, so it gets a
  maker-checker review. Each surface is verified on the real surface (HARD RULE #23): a
  Player export played in Chromium at a stubbed clock for each period, and the Studio
  Present view driven in the built docs site.

## 10. Not decided / deliberately out

- A per-deck `timezone:` override. The owner declined it. Revisit only if presenting
  to a room in another zone becomes a real request.
- Localized greetings. `lang:` today only switches off English pronunciation rules.
  A non-English deck with `greeting: true` still says "Good morning". The lint should
  suggest custom text when `lang:` is not English.
- An `{audience}` or `{title}` placeholder. Custom text already covers it.
