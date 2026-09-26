---
status: in-progress
summary: How a narrated deck becomes an MP4 plus a .vtt (LTT step 3). The owner's rule, 2026-09-25 - video is an export path over the Studio's own spine, like the HTML player, never a second renderer. So the video is the narrated HTML export itself, played by its own transport on a clock the capture owns and captured frame by frame, with the audio muxed from the same clips at the times that transport logged; captions ride as a track a viewer's player can switch on. WebCodecs encodes H.264, FFmpeg's AAC encoder compiled to WebAssembly encodes the audio the owner's audience needs, mediabunny muxes, 30 fps. Built 2026-09-26 as `lattice video`: the 17-slide fixture deck, voiced by the Studio's Kokoro, renders 5:06 of video in about a minute, with all 62 captions within a frame of the voice and every slide on time.
---

# Video export — a narrated deck to MP4 plus `.vtt` (LTT step 3)

> **Built** (2026-09-26): `lib/export/video.mjs`, run by `lattice video` (§9). The
> measuring spike, `tools/spike-video-export.mjs`, stays committed so its numbers can be
> re-run. This is step 3 of
> [`2026-09-24-lattice-timing-track.md`](2026-09-24-lattice-timing-track.md) §8, which
> left the encoder, the muxer and the frame rate to this note (its §11). §6 puts the forks
> to the owner, and §8 records what the adversarial trio found.

**What the spike is, and is not.** It is the experiment ahead of the build slice: it exists
to pick the encoder, muxer and frame rate and to prove the audio, captions and slides stay in
step. It is not the video feature (`followups.d/2372-p1-ltt-video-export-build.md`), and no MP4
it writes is committed: they go to `.scratch/`, which git ignores.

## 0. The rule: video is an export of the same spine, not a renderer of its own

The owner, 2026-09-25: *"We should be using the same spine the Studio uses for narration,
gestures, captions if someone enables it. Video generation should not result in us rolling our
own. The expectation is we will use the Studio or CLI to export video and its behavior and spine
is exactly like the Studio would generate based on configuration. It is an export path similar
to the player."*

So the video is the narrated HTML export, captured. Whatever the export does, the video shows:
the same narration resolved by the same ladder (inline caption, front-matter caption, the
slide's content projected to speech), the same transport (engineering/ltt.md §The transport),
the same caption crawl when the author turned captions on, and the same gestures once the
player carries the Guide (fork 8). The video adds exactly three things the export does not
have: a clock it controls, a frame grabber, and an encoder and muxer. **Nothing in the video
path decides what is on screen.** The spike's own frame loop and audio mix (§2) were built to
measure encoding, muxing and sync, and do not survive into the build.

Measured the same day: under the Chrome DevTools Protocol's virtual time
(`Emulation.setVirtualTimePolicy`), the real exported player plays itself frame by frame. Its
caption crawl lit words, it advanced, it held on the arriving slide, and 15 s of deck took
127 ms of wall time. Timers, `requestAnimationFrame`, `Date.now` and `performance.now` all
follow that clock. Media playback does not, which is the one hook §3 adds. **The build does
not use virtual time after all** (§9): with the caption crawl running, Chromium stopped producing
frames on the virtual clock and every screenshot hung. The capture owns the page's clock instead.

## 1. The answer

| Question | Proposal | Why, in one line |
|---|---|---|
| Encoder | **Headless Chromium's WebCodecs**: H.264 video, Opus audio | the export path already launches this Chromium, so nothing new is installed |
| Muxer | **mediabunny** 1.60 (pure JS, MPL-2.0, 685 KB minified) | writes MP4 with a WebVTT track, and reads MP4 back for the checks |
| Frame rate | **30 fps**, constant | slides are still between changes, and 30 is what players and editors expect |
| Size | **1920×1080**: the 1280×720 canvas at device scale 1.5 | the canvas the player and the PDF already use, sharp on a 1080p screen |
| Clip lengths | **decode every clip and fill `measuredMs`** before laying out the timeline | the export records none, and without them the video drifts from its own audio |
| Input | **a narrated HTML export**: its embedded LTT, its audio blocks, its slides and its own player | the export is the spine; the video is a capture of it (§0) |
| Frames | **the export's own player, on a virtual clock**, one capture per frame | nothing in the video path decides what is on screen (§3) |
| Captions | **a caption track** a viewer's player switches on, plus the `.vtt` sidecar; the player's own crawl appears in the frames only when the author exported with captions on | the owner: "captions if someone enables it" (fork 3) |

**The first question is not technical: where will the audience play the file?** Forks 1
and 2 depend on it (§6). If the answer is a browser, the table stands. If it is
PowerPoint, Keynote or QuickTime, Opus audio is a risk that no one has checked (§7).

> **The owner answered on 2026-09-25: slide software too.** So the audio must be **AAC**,
> and the Encoder row above changes: WebCodecs still encodes the H.264 video, and the audio
> needs an AAC encoder the measured Chromium does not have (fork 1b, 1c or 1d). The next
> step is to measure 1d (an LGPL ffmpeg build, or a WebAssembly AAC encoder, for audio only)
> against 1b (`ffmpeg-static`, measured in §2), then pick. The other forks stay open.

## 2. The spike, measured

`tools/spike-video-export.mjs` builds a narrated HTML export of
`test/fixtures/q3-board-review.md` in dark mode. The deck has 17 slides, and the 8 with an
inline `caption:` are narrated: 36 sentences, 313 words. The spike then reads the LTT and
the clips back **out of that exported file**, renders the MP4 and the `.vtt`, decodes the
MP4 again, checks it, and exits non-zero when a check fails. The sandbox has no TTS voice,
so each clip is a 330 Hz tone lasting 0.8 to 1.25 times its sentence's estimate
(deterministic), with 40 ms of leading silence declared as `leadMs`. That makes both
`measuredMs` and lead trim matter.

One run on the cloud sandbox (4 cores, Chrome for Testing 131 on Linux, 2026-09-25):

| | Result |
|---|---|
| Output | 1920×1080 on every slide (asserted), 30 fps, `avc1.640c28` + `opus`, 8.0 MB |
| Timeline (`timeline()`, clips measured) | 173,864 ms |
| MP4 duration, read back | 173,880 ms: 5,216 frames, the expected count |
| Caption start vs. the tone's onset in the decoded MP4 audio | 36 of 36 within 2 ms |
| Caption end vs. the tone's end | 36 of 36 within 1 ms |
| Slide change vs. `timeline()` | 16 of 16 within one frame (max 32.3 ms: a change lands on the first frame at or after its time) |
| The slide shown in the middle of each segment | 17 of 17 are the right slide |
| The same file with clip lengths left as estimates | 168,135 ms: **5.7 s short**, so the video would drift from its own audio |
| Wall time: decode 36 clips / capture 17 slides / mix, encode and mux | 1.2 s / 4.2 s / 22.8 s, about **6× faster than real time**. This leaves out the 8.1 s HTML export. The checker's run measured 5.5×. |

**What these checks prove, and what they do not.** They prove that the MP4 matches the
layout: the audio sits where the layout put it, the captions say the same, and each
segment shows its own slide. Two deliberately broken copies of the spike confirm the checks
can fail: drawing the next slide on every frame fails the slide check, and dropping the
lead trim fails both caption checks. **The checks cannot prove that the layout itself is
right**, because the audio, the captions and the frames all come from one `positionAt`
layout. If `positionAt` got a rule wrong, all three would move together and pass. The
layout is pinned elsewhere: the conformance fixtures, and
`test/unit/export/ltt-player-transport.test.js`, which runs the real exported player on a
fake clock and finds every slide arriving when `timeline()` says, to the millisecond. So
the video is correct to the extent that those two already hold.

**The comparison arm, run once by hand and not part of the committed spike:**
`ffmpeg-static` 5.3, fed the same 17 stills and the same audio (libx264
`-preset medium -crf 20`, AAC 96 kb/s), took 27.3 s and wrote 3.9 MB. Its binary is 80 MB.

**Three things the spike found that the design did not predict.**

- **Lead trim can start before zero.** Slide 1 has no arrival hold (rule 1), so its first
  cue starts at 0 ms, and its clip, placed `leadMs` early, would start at −40 ms. Web Audio
  refuses a negative start time. The mixer has to start that clip `leadMs` into its audio
  instead, which is what the player does (rule 7): `start(max(0, at), max(0, −at))`.
- **The player re-fits its stage on every navigation.** It shrinks the slide to 96% to make
  room for its navigation row. A capture that pins the scale once gets 16 of 17 frames at
  1226×690 and upscales them. The spike now pins the scale on every slide and asserts that
  every capture is the same size.
- **A silent first slide lasts 0 ms** (found by the red team). The LTT gives the first
  slide no hold, which is right for a live player, where the viewer sees slide 1 before
  pressing Play. A video has no "before Play", so a deck whose title slide has no
  narration would open on slide 2. The last slide ends `tailMs` (165 ms here) after its
  last word. Fork 7.

**A real voice, second run.** The owner heard the tone run as "beeps and scratches". The
beeps were the placeholder tones, and the scratches were a spike defect: each tone started and
stopped at full swing, which clicks, and they now fade over 5 ms. `--voice=espeak` speaks each
cue with espeak-ng (en-us, 165 wpm) from the SPOKEN form Cadenza timed, and measures each clip's
leading silence as its `leadMs`. Against where the speech really starts and stops in the decoded
MP4: **36 of 36 caption starts within 3 ms, 36 of 36 ends within 11 ms**, 16 of 16 slide
changes within a frame, and the timeline is 174,448 ms. The first voiced run reported 6 starts
50–83 ms late, and every one was late, never early. The detector was hearing quiet opening
consonants ("s", "f", "h") later than the 2% threshold `leadMs` was measured with, so it now uses
the same threshold. A check whose threshold differs from the producer's measures the mismatch
between the two thresholds, not the sync.

**The Studio's own voice, third run.** `--voice=kokoro` runs the Studio's on-device model
(onnx-community/Kokoro-82M-v1.0-ONNX, q8, voice af_heart) locally through kokoro-js, and encodes each
clip with the Studio bake's own `encodeMp3` at 64 kb/s, declaring `encoderLeadMs` (46 ms) as
`leadMs`, exactly as a real bake does. So the MP3 path is exercised on the bytes a narrated export
ships. **Every slide narrated, as the Studio narrates it:** the first three runs read only the
inline `caption:` comments, so 9 of the 17 slides (those narrated from their own content) went
silent and flashed past on their hold, and the owner caught it. The spike now renders with
`--captions` and reads each slide's merged narration (inline caption, then front-matter caption,
then the slide's content projected to speech), built with the deck's acronyms, lexicon and
language. Emphasis spans are not carried, so a bolded phrase times as ordinary. Timeline 325,580
ms (5:26); 63 of 63 sentences within 11 ms of their expected point, 63 of 63 ends within 25 ms,
16 of 16 slide changes within a frame, 17 of 17 slides right. **It found a
product defect:** Kokoro puts 290–390 ms of its own silence (median 324 ms) before each sentence,
and the bake trims only the encoder's 46 ms, so every export's caption, and any video made from
it, runs about a third of a second ahead of the voice. That predates this note and is off its path
(`followups.d/2372-p3-trim-the-voices-own-leading-silence.md`). The video can trim it for itself
as long as the clip's measured `leadMs` is the one the player uses; fixing it at the bake fixes
both. OpenRouter was not needed: the hosted engine is the same model, and spending our key needs a
sanctioned tool (HARD RULE #24).

What the spike did not exercise: a cue without a clip beside
voiced ones (rule 4), a clip that fails to decode (the code path is there, and no corrupt
clip was fed to it), Anima motion (out of scope, G5), and playback anywhere but Chromium.
See §7.

## 3. The capture: the export's own player, on a virtual clock

1. **Build the narrated HTML export**, exactly as the Studio or the CLI would with the same
   configuration: the narration ladder, the voice, captions on or off, the theme and mode.
2. **Open it in headless Chromium, render mode on** (built as `window.__lpRender`; the clock is
   the capture's own, §9). One hook in the player, and only one:
   in render mode a voiced cue lasts its clip's measured length (`measuredMs − leadMs`, from
   the LTT) instead of waiting for the audio element's `ended`, because media does not play
   on a virtual clock. It is the same `silentCue` timer path the player already uses for a
   clip that fails to decode, timed by the same `positionAt` layout, so no transport rule is
   restated. The player's chrome (toolbar, navigation row) is hidden and the stage fit is
   pinned to 1 for the capture.
3. **Fill `measuredMs` first.** The export records none today, so the capture decodes every
   clip and writes its length into the LTT before pressing Play (fork 4: the bake could
   record it instead). A clip that fails to decode is dropped from its segment, as the live
   player does.
4. **Press Play, then step the clock one frame at a time** (1/30 s), capturing the stage
   after each step. Everything the player draws is in the frame: the slide, the caption
   crawl when captions are on, Anima motion, and the Guide's gestures once the player carries
   them. A still stretch costs little: identical frames encode to almost nothing.
5. **Mux the audio from the same clips at the same times.** The player's `timeline()` is the
   schedule its render-mode timers follow, so placing each clip at its segment start plus
   `onsets[k] − leadMs` puts the sound where the player showed its words. This is not a
   second model: it is the LTT the player itself read.
6. **Write the caption track** from the same LTT: a `.vtt` sidecar, and the same cues muxed
   into the MP4 as a subtitle track a viewer's player can switch on (fork 3).

This is the first production caller of `timeline()`, which closes guardrail G2 for it.

## 4. What the video guarantees, and where it differs from a live viewing

It shows what the export shows (§0). In 1.0 that is narration, captions, slide and hold
timing and Anima motion; the Guide's gestures come with fork 8. **G5 changes with this
note:** G5 excluded Anima motion because the first design rendered stills; a capture of the
player includes whatever the player draws, so the spec's G5 paragraph should be amended when
the build lands.

**A live viewing runs about 100 ms per clip behind the video.** The live player advances on
the audio element's `ended`, which Chromium fires 90–110 ms after the sound stops (LTT note
§8); in render mode it advances at the measured length. The video is the timeline
`timeline()` computes. Fork 6 decides whether the live player should also advance at the
measured length when it knows it.

## 5. What the build adds

- **A render mode in `lib/export/player-core.mjs`**: the one hook in §3 step 2, behind a
  flag only the capture sets. It changes export bytes, so it stops for sign-off.
- `lib/export/video.mjs`: open the export, fill `measuredMs`, drive virtual time, grab
  frames, mux the audio and the caption track. It decides nothing about what is on screen.
- **A capability probe before any capture**: `VideoEncoder.isConfigSupported` for H.264 and
  the chosen audio encoder (AAC, fork 1). On failure it stops with an error that names the
  Chromium that works; `lattice-emulator.js` `detectChromeExecutable` may pick a system
  `chromium` with no H.264 encoder.
- A CLI flag, `--video`, writing `<deck>.mp4` and `<deck>.vtt` next to the other exports,
  and the Studio's export panel offering the same (fork 10).
- `mediabunny` as a dependency (fork 1). No new CI job or step: the MP4 check is a
  `test:integration` case beside the PDF page count.
- A test carrying the spike's checks (caption start and end against the speech, slide
  changes against `timeline()`, the right slide in each segment) on the fixture deck voiced
  by Kokoro, plus a silent title slide, a cue with no clip, and a corrupt clip.
- `engineering/ltt.md`: §What video export guarantees and G5 amended (§4), rule 7's
  negative-start case, and the render-mode hook named beside rule 3.

## 6. Forks for the owner

0. **Where will the audience play the file?** Answer this first. It decides forks 1 and 2.
   **Answered 2026-09-25: slide software too (PowerPoint, Keynote, QuickTime).** AAC audio is
   required, which rules out 1a on its own.
1. **Encoder and muxer.** *(Built on d, 2026-09-26, pending the owner's pick; §9 has the
   measurement. Recommended: d. a alone no longer meets fork 0's answer.)*
   - **a. WebCodecs + mediabunny.** Nothing native to install; 685 KB of MPL-2.0 JS.
     Encode, mix and mux measured 22.8 s for 2:54 of video. Files are about twice
     ffmpeg's size at this bitrate (8.0 MB vs 3.9 MB); a lower quality setting trades that
     back. Needs a Chromium with an H.264 encoder (§5, the probe).
   - **b. `ffmpeg-static`.** Smaller files and AAC audio. Costs an 80 MB binary per
     install and a second process to manage. Its libx264 is GPL, which is compatible with
     Lattice's own AGPL-3.0-only license, so licensing is not the objection.
   - **c. Both.** WebCodecs by default, and ffmpeg when it is on `PATH`. Two paths to
     test.
   - **d. WebCodecs video, AAC audio from a separate encoder** (an LGPL ffmpeg build, or
     a WebAssembly AAC encoder). This keeps the small install and gets AAC. **Measured
     2026-09-26** with `@mediabunny/aac-encoder` 1.60 (§9): FFmpeg's native AAC encoder
     compiled to WebAssembly, 993 KB of minified JS with the module inlined, 4.7 MB unpacked
     on disk. It encoded the fixture deck's 5:06 of audio inside a 7.8 s encode-and-mux step,
     and the MP4 decodes back as `mp4a.40.2` (AAC-LC). Its license needs the owner's eye: the
     package says MPL-2.0, while FFmpeg's AAC encoder is LGPL-2.1-or-later, and the package
     ships no FFmpeg notice. Both are compatible with AGPL-3.0-only; the question is the notice
     we owe when we redistribute it, not whether we may.
   - **Common to all four: H.264 is patent-licensed.** That is a question for whoever owns
     distribution, and no fork avoids it; VP9 in WebM would, but slide software rarely
     plays WebM.
2. **Audio codec.** *(Settled by fork 0: AAC, through 1b, 1c or 1d.)* The measured Chromium (Chrome for Testing 131 on Linux) encodes
   Opus and **cannot encode AAC**: `isConfigSupported` is false for `mp4a.40.2`,
   `mp4a.40.5` and `aac`. Chrome on macOS and Windows uses the platform's encoders and was
   not tested. Opus in MP4 plays in current Chrome, Edge and Firefox. **UNVERIFIED:**
   Safari, iOS, QuickTime, and importing the file into PowerPoint or Keynote.
3. **Captions.** *(Settled by the owner, 2026-09-25: "captions if someone enables it".)* The
   MP4 carries the captions as a track a viewer's player switches on, and the `.vtt` sidecar
   rides beside it. The frames show the player's own caption crawl only when the author
   exported with captions on, as the HTML export does. Which subtitle format the MP4 carries
   (`wvtt`, or `tx3g` for QuickTime) is the build's to measure: §7.
4. **Where `measuredMs` comes from.** *(Recommended: both.)* The video must decode clips
   whatever else happens (§2: 5.7 s of drift otherwise). The question is whether the
   Studio's bake should also record `measuredMs` in the HTML export, so that `timeline()`
   on a voiced export stops being an estimate. That changes export bytes, so it would stop
   for the owner's sign-off on its own.
5. **Frame rate.** *(Recommended: 30.)* The capture includes whatever the player draws:
   the caption crawl, Anima motion and, with fork 8, gestures, so the frame rate is now
   about motion, not stills. 30 carries a word-by-word crawl and a gesture stroke smoothly;
   60 doubles capture time and file size for smoother motion. A slide change lands up to
   one frame late (33 ms at 30 fps); the audio is exact at any frame rate.
6. **Rule 3, the `ended` latency.** *(Recommended: b.)*
   - **a. Keep rule 3 as written**, and record the video as a named exception that runs
     about 100 ms per clip ahead of the player.
   - **b. Make the computed end normative.** When a clip's length is known, the player
     arms its advance at `measuredMs − leadMs` and treats `ended` as a fallback for a clip
     that runs long. The two players then agree. This changes the exported player's bytes,
     so it would stop for sign-off.
7. **Lead-in and outro.** *(Recommended: a fixed lead-in on slide 1 whenever slide 1 has
   no narration, and a fixed outro after the last slide, both in the video only.)* The
   live player needs neither, so the LTT's own holds stay as they are. The lengths are
   the owner's number; one second each is a starting point, not a measurement.
8. **The Guide's gestures.** *(Recommended: bring the Guide into the exported player.)* The
   owner expects the video to gesture as the Studio does (§0). Today only the Studio's Present
   view carries the Guide (`docs/src/components/studio/present-guide.ts` with Vetrina's
   stage); the exported player does not, so neither can a capture of it, and the CLI has no
   Studio to capture. Moving the resolver and the gesture drawing into the player, as a shared
   kernel the player inlines the way it inlines `positionAt`, gives the HTML export the same
   gestures and the video gets them for free. The cost: the player's script grows, it changes
   export bytes, and it needs its own decision record. The alternative, capturing the Studio's
   Present view headless, works only where the Studio runs and never from the CLI.
9. **Filling a phone in landscape** (raised by the owner, 2026-09-25). *(Recommended: b.)*
   The video is 1920×1080, 16:9, because the slides are; a phone in landscape is about
   19.5:9, so a player shows bars at the sides.
   - **a. Keep 16:9.** Right for a laptop, a projector or slide software.
   - **b. Render a second aspect.** Lay the deck out on a wider canvas so nothing is
     cropped. The player already takes its canvas from the document (`resolveCanvas`), but
     no ~19.5:9 preset exists: it needs one, a check that every component holds at that
     aspect, and one more capture pass.
   - **c. Crop to fill.** Loses the slide's edges, where headers and page numbers sit.
10. **Exporting video from the Studio** (the owner expects the Studio or the CLI). A web page
   cannot capture its own DOM without asking the viewer for screen-capture permission, so the
   browser Studio cannot run §3 by itself. The desktop (Tauri) app can run it, and so can a
   service that renders on the author's behalf. *(Recommended: the CLI first, the desktop app
   next through the same code, and a hosted render only if the web Studio needs it.)*

## 7. Not decided here, and not verified

- **Playback beyond Chromium.** The MP4 was decoded back only by Chromium, through
  mediabunny. Safari, iOS, Firefox, QuickTime, PowerPoint, Keynote: **UNVERIFIED**.
- **The muxed WebVTT track.** mediabunny writes a `wvtt` track, and reading the file back
  with the same library lists only the video and audio tracks, so nothing has read the
  track back. Many players ignore `wvtt`; QuickTime expects `tx3g`. **UNVERIFIED**, and
  the `.vtt` sidecar is the caption path that is known to work.
- **Other voices and encoders.** The third run used the Studio's Kokoro through its own
  constant-bitrate MP3 encoder. A hosted voice returning variable-bitrate MP3 can decode to
  different lengths in different decoders (the LTT note §5), and each voice has its own leading
  silence (Kokoro's is 290–390 ms). Only Kokoro and espeak-ng were measured.
- **Memory on a long deck.** The spike holds the whole MP4 in memory and hands it to Node
  as base64. On a one-hour deck the 48 kHz mono float mix alone is about 690 MB, and every
  decoded clip and every slide PNG are held besides. The build mixes in chunks and streams
  the MP4 to disk.
- **Anima motion and burned-in captions.** Each would be a new capture mode with its own
  frame count, and Anima would be a new LTT layer under G4.
- **Tours.** A tour becomes a video once step 4 writes a seekable recording; the same
  renderer then plays the actions layer.

## 8. What the adversarial trio found

The red team, the inversion pass and the checker ran on the first draft (2026-09-25).
What each found, and what changed:

- **Red team.**
  - 16 of 17 frames were captured at 96% and upscaled. Fixed: the scale is pinned per
    slide, and the capture size is asserted.
  - A silent slide 1 lasts 0 ms. Recorded, and put to the owner as fork 7.
  - The slide-change check was circular. Answered by the identity check and by stating
    what the checks prove (§2).
  - A clip that failed to decode aborted the spike and would have skipped rule 4's floor.
    Fixed in the spike, and specified in §3.
  - Other gaps recorded: rule 4 was never exercised, the `wvtt` track is unverified, the
    memory figures, font loading (now awaited), and the licensing framing (corrected in
    fork 1).
- **Inversion.**
  - Opus-only audio may be silent where boardroom decks are played. The audience question
    now leads §6, as fork 0.
  - "Cannot disagree" was true by construction, so it proved nothing. §2 now says what the
    checks prove, and §5 requires the MP3 test to measure where real speech starts.
  - The video contradicts rule 3. Recorded as fork 6.
  - The build needs a probe for the H.264 encoder. Added to §5.
  - There is an AAC option without GPL. Added as fork 1d, marked not measured.
- **Checker.**
  - The spike failed `build:check`, `capabilities:check` and lint. Fixed.
  - A copy drawing the wrong slide passed every check. Fixed by the identity check,
    confirmed by that mutant and a lead-trim mutant, and the spike now exits non-zero.
  - The AAC claim was scoped to the build that was measured.
  - The track claim was softened.
  - The 672 KB and 7× figures were corrected.
  - The ffmpeg arm is labeled as a one-off.

## 9. The build, measured (2026-09-26)

`lib/export/video.mjs`, run as `lattice video <narrated-export.html> [out.mp4]`
(`engineering/pipeline.md` §6). It follows §3 with one change of mechanism and one of input.

**The input is the narrated HTML export, not the deck.** The CLI has no speech engine, so it
cannot narrate a deck as the Studio does; a `--video` flag on a deck render would have made a
silent, captions-only video. So the command takes the export the Studio writes, which is §1's
"Input" row, and the Studio route is: export the narrated webpage, then run `lattice video` on it.
A CLI that voices a deck itself is fork 10's question, recorded in the followup.

**The clock is the capture's own, not Chromium's virtual time.** With the caption crawl running,
Chromium stopped producing compositor frames on the virtual clock and every screenshot hung, in
new headless and in chrome-headless-shell alike (Chrome for Testing 131). So `installFrameClock`
replaces the page's `setTimeout`, `setInterval`, `requestAnimationFrame`, `Date.now` and
`performance.now` before the export's script runs, holds every CSS and Web Animations animation
paused and seeks it to that clock, and the compositor keeps real time, so a screenshot always has
a frame to read. The transport test's fake clock is the same idea, and the player cannot tell the
difference.

**Self-checks refuse to write a file.** The stage must not move under the fixed clip (the player
re-fits on every navigation, and did, until the capture pinned it after every step); every slide
must become active on the first frame at or after the time `timeline()` gives it; every cue start
the player logs must match `timeline()` within half a frame; the player must have finished and
voiced every clip that decoded; no clip may lose more of its head than its own declared silence;
and an export none of whose clips decode is refused rather than written silent.

**The frame follows the deck's canvas.** Its long side is 1920 px: a 1280×720 deck renders at
device scale 1.5 (1920×1080), a 9:16 deck at 1080×1920, a 4K deck at 1920×1080. The H.264 level
follows the frame size (4.0 up to 1920×1088, 5.1 above).

**Two defects the independent MP4 check found, and their fixes.** Checking the file itself (decode
the MP4 back, find each sentence's sound and each slide change, compare with the layout) found
both, after every internal check had passed:

- **AAC priming.** The encoder puts 1024 samples (21.3 ms at 48 kHz) ahead of the audio, and the
  MP4 carries no edit list, so every sentence sounded 21 ms late. The capture now measures the
  delay at run time, by encoding a click through the same encoder, muxer and decoder, and places
  the audio that much earlier (Apple's encoder primes 2112 samples, so the figure is measured,
  not assumed). A voiced first slide gets a one-frame lead-in, because its first word cannot be
  placed before zero.
- **Every slide one frame late.** A MutationObserver delivers its records after the step that
  caused them, so a changed frame was noticed one frame later. The capture drains the observer
  with `takeRecords()` inside each step.

**The fixture deck, measured.** `test/fixtures/q3-board-review.md`, 17 slides, narrated by the
Studio's Kokoro (af_heart, q8) through the bake's own MP3 encoder and trimmed of the voice's own
leading silence, exported by the spike, then captured by `lattice video`, dark and light alike:

| | Result |
|---|---|
| Output | 1920×1080, 30 fps, `avc1.640c28` + `mp4a.40.2` (AAC-LC), 305.8 s, 14.1 MB (dark) and 13.9 MB (light) |
| Frames | 9,174 of 9,174, one of them the lead-in; 18 captured, the rest re-encode the unchanged frame |
| Wall time (4-core sandbox) | 58–76 s, about 4–5× real time; of the 58 s run, decode 0.8 s, capture 48.6 s, audio and mux 7.8 s |
| Caption start vs. the voice in the decoded MP4 | 62 of 62 within one frame (max 22 ms); mean 10 ms, the pre-roll |
| Slide change vs. `timeline()` | 16 of 16 on the first frame at or after its time (3–33 ms) |
| Cue start the player logged vs. `timeline()` | within 4 ms, every cue: the browser's nested-timer clamp, which the frame clock applies too |
| AAC delay measured by the probe | 21.3 ms |

`test/integration/export/video-export.test.js` runs the same checks on two four-slide decks, in
about 30 s: one with a silent title, a silent divider, a corrupt clip and a cue with no clip, and
one that speaks on its first slide. Removing the priming correction, the observer drain or the
voiced-first lead-in each fails it.

**What the adversarial trio found, and what changed.** The checker found a deck could turn a
viewer's player into render mode by DOM clobbering (`id="__lpRender"` plus `name="log"`), which
silenced its narration: the flag now requires a real array, and a unit test pins it. It also found a
voiced first slide lost its first 21 ms (the priming fix above), a timer-id collision between real
and fake timers, and half-sample steps at mix-window seams, all fixed. The red team found that
`lattice video x.html x.html` deleted the export on failure (the output must now be a new `.mp4`,
written as `.partial` and renamed), that portrait, 4:5 and 4K decks failed with a misleading error
(the scale now follows the canvas), that a crafted export could draw a local file into the video
(the capture page now loads only its own file and `data:` URLs), that a chain of zero-delay timers
hung the capture (nested timers now clamp to 4 ms, as in a browser, with a per-step cap), that an
all-silent export wrote a silent video with exit 0, that Ctrl-C left files behind (signals now clean
up), and that a newline in a caption could write cues of its own. The inversion pass asked for the
two encoder packages pinned to exact versions, so an unattended minor bump cannot change the output,
and for the unverified claims to stay marked so.

**Not verified.** Playback anywhere but Chromium: QuickTime, PowerPoint, Keynote, Safari and iOS
are **UNVERIFIED**. The muxed WebVTT track reads back as no track at all through mediabunny, and
QuickTime expects `tx3g`, so the `.vtt` sidecar is the caption path known to work. A Chromium
without an H.264 encoder was not available, so the probe's refusal is unexercised. Anima motion
decks were not captured end to end.
