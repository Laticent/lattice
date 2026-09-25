---
origin: 2372
priority: P3
recorded: 2026-09-25
source: https://github.com/Laticent/lattice/pull/2372
---

# Captions light up about 0.3 s before a Kokoro voice speaks: trim the voice's own lead

why now   — measured on 2026-09-25 with tools/spike-video-export.mjs --voice=kokoro (the Studio's
            own Kokoro-82M, af_heart, encoded by the Studio's own narration-encode.js): Kokoro puts
            290–390 ms of silence (median 324 ms) before every sentence. The bake declares only the
            MP3 encoder's delay as `leadMs` (encoderLeadMs, 46 ms at 24 kHz), so the exported
            player's caption crawl, and any video made from the export, start each sentence about
            a third of a second before the voice does. Present likely shows the same lag: Suono's
            onset is when a clip starts playing, not when its speech starts.
where     — docs/src/components/studio/narration-bake.ts (where `leadMs` is set, ~line 743);
            docs/src/playground/narration-encode.js `compressClip` (has the PCM in hand before
            encoding); engineering/ltt.md §The transport rule 7 (lead trim).
done when — the bake measures each clip's speech onset from the PCM (the same 2%-of-full-scale
            rule the spike uses, or a better one) and records encoder delay plus voice lead as
            `leadMs`, and a narrated export of test/fixtures/q3-board-review.md starts each
            caption within one video frame of its speech (the spike's check, with voiceLeadMs 0).
evidence  — the spike's report before and after, and a screen recording or the verifier's
            timing of one voiced sentence in the exported player. It changes export bytes, so it
            stops for the owner's sign-off in dark and light.
verify    — tier 1 checker, because it changes what every narrated export ships.
