---
status: in-progress
summary: The owner ruled on 2026-09-27 (video note §6, fork 8) that the Guide goes into the exported player, so a narrated HTML export and the video captured from it gesture where Present does. This note fixes the boundary. The Guide's rules move out of PresentOverlay's React effect into a framework-free conductor (`guide-conductor.ts`) that Present and the player both drive; the resolver, the conductor and Vetrina's hand are bundled from their sources into one generated string (`GUIDE_PLAYER_JS`, 85 KB, 30 KB gzipped) that `player-core.mjs` inlines into a narrated export whose deck declares `delivery:` (the owner's fork 3a of the delivery-presets record, so every other export is byte-identical); the transport feeds it beats at sentence start, slide change, pause and word; the preset is baked in as data; and a Guide switch sits beside Play, on by default.
---

# The Guide in the exported player

> **Asked by** the owner, 2026-09-27, as fork 8 of
> [`2026-09-25-video-export.md`](2026-09-25-video-export.md) §6: *"the video should gesture as
> Present does."* Only Present's Studio view carried the Guide, so neither the HTML export nor a
> capture of it (`lattice video`) could gesture. This note is the record that ruling asked for:
> where the kernel's boundary sits and what it costs.

## 1. The answer

**The player runs the same Guide Present runs, not a port of it.** Three modules make up the
Guide, and all three are reused unchanged:

| Module | What it decides | Where it lived | Where it lives now |
|---|---|---|---|
| `present-guide.ts` | which element a sentence names, which gesture fits it, where the hand rests | `docs/src/components/studio/` | unchanged, plus `guideAimInRoot` / `guideCueInRoot` for a host that knows its shown slide |
| the per-sentence rules | the plan (which moments earn a gesture), the rest, the hold, the walk, the focus, the ink, the pause | inside `PresentOverlay.tsx`'s React effect | **`guide-conductor.ts`**, framework-free; Present and the player both drive it |
| Vetrina's stage | the hand, its motion and its ink | `docs/src/lib/vetrina/` | unchanged |

`guide-player.ts` is the player's entry: it builds the stage the way Present's Stage window does
and tells the conductor where the player's shown slide is (`.lp-frame.lp-active section`). It adds
no rule. `tools/build-guide-player.js` bundles it into
`lib/export/guide-player-bundle.generated.mjs` (`GUIDE_PLAYER_JS`), the shape the Anima bundle
already has, because the player's script is one CSP-hashed inline block that cannot `import`.

**The transport feeds it beats; it owns no clock.** The player's narration code calls the Guide
at four points and nowhere else:

- a sentence starts (`nextCue`): `beat(slide, k, track, playing)`;
- the caption clears, which is every slide change and every stop (`clearCaption`): `beat(slide, -1, …)`;
- narration pauses (`setPlaying(false)`): `beat(…, playing = false)`, so the focus lifts and comes
  back on Play, as in Present;
- the word being said changes (`tickCrawl`): `word(track, cue, k)`, for the read-along inside the
  focused text when captions are off. The crawl clock now runs for the Guide too when there is no
  caption band.

Present's rule "one conductor" holds on both surfaces: when narration stalls, the hand holds.

## 2. The boundary

**What is shared (HARD RULE #1).** Every decision about what to point at, how and when. Present's
effect is now a few lines that set where the slide is and call `guide.beat`; the rules it used to
hold are the conductor's, verbatim, with the same comments.

**What is the player's own.** Only what the DOM around the slide differs in:

- *the shown slide*: `frames[t.index]`'s section, where Present's Stage asks for the unhidden
  `.lattice > section`;
- *the frame the rest is clamped inside*: the same section, whose client rect is the painted slide
  because it carries the fit transform, where the Stage asks for `#latt-fit`;
- *the switch*: a `#lp-guide` button beside Play, scoped to the bar as `#lp-play` is, so a deck
  element with the same id cannot stand in for it.

**What is baked in as data.** The deck's `delivery:` preset (`resolve-delivery.mjs`), read off the
source at export time for `pace:`'s reason: the exported file keeps no front matter. Only the
fields the conductor and the stage read ship (`guideDeliveryOf`).

**What is not in the kernel.** Present's rehearsal mode, its Stage-window plumbing and its chart
hover hand-off stay in Present, because the player has none of them.

## 3. What it costs

| | Measured |
|---|---|
| `GUIDE_PLAYER_JS` | 84,970 bytes minified, 30,011 gzipped |
| of which | Vetrina 37.3 KB, `present-guide.ts` 29.8 KB, Cadenza 11.1 KB, the conductor 2.3 KB, `chart-values.js` 1.8 KB, the handles table 1.6 KB |
| A narrated export | the fixture deck's (17 slides, Kokoro) grows by the bundle and the switch; see §5 |
| Any export without the Guide | byte-identical: the bundle, the switch, its CSS and every transport hook ship only when the deck is narrated and declares `delivery:` (checked against `main`: the narrated player script without `delivery:` is the same bytes) |

**One substitution keeps it small.** `present-guide.ts` imports `spokenValue` from the docs site's
`read-along-core.generated.js`, which is 120 KB of the whole narration kernel. The build resolves
that import to `lib/core/chart-values.js`, the dependency-free module the generated core itself
inlines, so the function is the same and the bundle is 85 KB instead of 204 KB.

**Sources, not dists.** Vetrina, Cadenza and `@laticent/ltt` resolve to their TypeScript sources in
this build, not to the `dist/` folders the docs site uses. `tools/build.js` builds those dists in
the background, and this step runs ahead of the emulator, which inlines its output through
`player-core.mjs`; reading a dist would race the process writing it.

**The CSS prune keeps the focus rules.** The export prunes CSS no static element uses, and the
Guide's rules (`section[data-guide] .lat-guide-dim`, `base.focus.css`) match nothing until Play.
`[data-guide]` joins `PLAYER_PRUNE_SAFELIST` beside `.anima-live`, which is there for the same
reason.

## 4. Defaults, and why

- **Only when the deck declares `delivery:`.** The owner ruled this on 2026-09-25, before fork 8
  (`2026-09-25-vetrina-delivery-presets.md` §9, fork 3a: "embed the kernel when a deck sets
  `delivery:`; today's exports unchanged"). Fork 8 brought the Guide into the player and did not
  revisit the condition, so both hold: the register is the author's opt-in. The fixture deck
  (`test/fixtures/q3-board-review.md`) declares `delivery: restrained`, the preset Present already
  plays it under. **For the owner to confirm:** if fork 8 meant every narrated export, the
  condition is one line in `assemblePlayer`.
- **On by default, once shipped.** The owner's expectation is that the export and its video gesture; a switch
  a viewer has to find first would make the default export the one without it. Present's own
  toggle defaults off because Present is where an author rehearses; an export is a delivery.
- **The preset decides the look.** Under the default `restrained` delivery the Guide FOCUSES the
  named bullet, row or mark (its peers recede). It draws the hand and its ink only where nothing
  can be focused, a figure, an image or a diagram with nothing beside it to recede
  (`guide-conductor.ts`, `inks`). `expressive` also inks each slide's top moment. That is
  Present's behavior; the export draws nothing Present would not.
- **The stage is built on first Play**, so a viewer who never presses Play gets no layer.
- **Every call is guarded.** A Guide that throws must never stop the narration beside it, so each
  call from the transport is wrapped, and the API is taken once and checked to be a function (a
  deck element named `__lpGuide` cannot clobber it, the same guard as render mode's).

## 5. Verified, and not

**Same targets as Present, measured.** The shipping resolver (`present-guide.ts`, bundled as the
sweep bundles it) run over every cue of the fixture deck (`test/fixtures/q3-board-review.md`, 17
slides, 62 cues) in the render Present's sweep uses and in the exported player's DOM resolves 62 of
62 to the same element, 55 of them to a target on both surfaces. The 7 that resolve to nothing on
both are the asides #2371 hides and one frame sentence ("Two serious options are on the table.").

**In the export (Chromium, real playback, the tone-voiced fixture).** The focus lands on the title
headline (slide 1), the kpi hero (slide 4) and the waterfall's `New logos` step (slide 5), each
with its group receded, and no page error.

**In the video (`lattice video`, the Kokoro-voiced fixture, dark).** Every self-check passes:
305.8 s, 1920×1080, 62 captions. Frames read back through FFmpeg 7.0.2 show the focus: the
`Q3 FY26` headline lit through "…fiscal twenty-six", the `Why not fix it` card lit through "We did
look hard at the fix". `lattice video deck.md` (the CLI's own Kokoro voice) records the same focus.

**What the capture could not see, and now does.** The capture re-shot a frame only when something
changed inside the slides' container. The Guide's hand lives on a layer on `<body>`, and its
read-along is a CSS Custom Highlight, which no MutationObserver reports, so both would have frozen
in the MP4 (found by the inversion pass). The capture now watches the whole page except the
player's own chrome, and compares the page's highlight ranges step to step
(`lib/export/video.mjs`, `installFrameClock`).

## 5a. What the adversarial trio found, and what changed

**The red team** (seven breaks, each reproduced in Chromium unless marked):

- **The video froze the hand and ink** (blocker): the capture watched only the slides' container,
  and the Guide's layer is on `<body>`. Fixed with the capture change above; on the same export the
  re-captured MP4 passes every self-check (305.8 s, 62 captions, 15.1 MB against 14.7 MB, the
  added bytes being the frames that now show the hand and the read-along).
- **The arrow flashed at the slide's center on first Play** (Present had it too): a new stage hid
  its never-shown cursor with a 1→0 fade. Vetrina now skips that fade before the cursor's first
  paint (`stage.ts`, `painted`).
- **A Guide that cannot load killed the player** (UNVERIFIED on a real engine; shown with Chromium's
  `RegExp` made to reject lookbehind, as Safari before 16.4 does): the bundle ran unguarded ahead of
  the player in one script. It is now wrapped in its own `try`, so such an engine loses the Guide
  and keeps the player.
- **`[data-guide]` in the prune's safelist changed every export** (+546 bytes of kept rules). It is
  now kept only when the caller says the player carries the Guide (`keepGuide`, set from the page's
  `#lp-guide` switch by the CLI and by the Studio's browser prune).
- **Jumping slides mid-narration left the hand up**, and `guideStillShown` read a hidden player
  slide as shown (its section is `display: flex` inside a `display: none` frame). Manual navigation
  now sends the Guide a clearing beat, and `guideStillShown` asks `checkVisibility()`.
- **The switch overflowed a phone's bar** (400 px of controls at 390). The bar tightens at 420 px
  and down, and under 370 px the switch goes and the Guide keeps its default; measured to fit at
  430, 390, 375, 360 and 320.
- **The switch stayed in the Read views**; it now hides with Play.

Nits taken: the conductor's `reset()` cleared the paused focus, which Present's teardown did not
(fixed, and pinned with the conductor's own tests, which fail on a removed rest guard, a removed
resume path and that `reset`); a deck value spliced into a selector in the chart-text tier (now
compared, not spliced). **Recorded, not gated:** the bundle writes constant markup into the
exported page (Vetrina's cursor SVG through `innerHTML`, and two `<style>` elements, one an
`@layer vetrina-defaults` block). Every string is a constant, and no deck value reaches them; HARD
RULE #22's `checkRuntimeMarkupSinks` census scans `lib/runtime`, not the generated export bundles,
the same position the Anima bundle is in.

**The inversion pass**: the capture defect above (it found it first); the `delivery:` condition put
to the owner as a fork on the pre-merge card, with `--narrate` now saying whether the Guide is on;
the stale lines in `base.registers.docs.md` and `ltt.md` corrected; one `guideStageTheme()` for
Present and the player; and the parity measurement in §5.

**Not verified.** Safari and iOS playback of the export's Guide; PowerPoint and Keynote playback of
the MP4 (the video note's standing gap).

## 6. Not decided here

- **A Studio export option to ship without the Guide.** The viewer's switch covers a recipient
  who finds it distracting; an author who wants no Guide at all can ask for the option.
- **A keyboard shortcut for the switch.** The shared keymap (`present-transport.mjs`) has no key
  for it, and adding one is a change to every surface that reads that map.
