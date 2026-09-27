---
origin: 2372
priority: P3
recorded: 2026-09-26
source: https://github.com/Laticent/lattice/pull/2436
---

# Time Present's caption against Kokoro's voice in the Present UI itself

why now   — the fix landed with the video-export continuation (#2436), and it is measured on the real
            audio path: the production `useReadAloud` hook, real Suono and a real AudioContext in
            Chromium, voiced by four real Kokoro clips, timing the audible voice against the caption
            on one clock (3 runs each). Sentences 2–4 light 0–17 ms after the voice (main: 300–333 ms
            before it); the first sentence's second word lights 217–234 ms after the voice starts
            (main: 33–50 ms before any sound); no caption flickers back. What is still missing is the
            same number through the Present UI, which gates its clocked voice behind an OpenRouter
            connection or a baked Studio store, so the measurement mounted the hook directly.
where     — docs/src/components/studio/read-aloud.ts (`onItemStart` → `reader.align`); Present's voice
            source (voice-model.js) and the narration store.
done when — one voiced sentence in the Present dialog (docs site, Chromium, a Kokoro-baked deck) shows
            its caption start within one frame of the voice's first word.
evidence  — the timing of that sentence, with how it was measured.
verify    — tier 0; the fix itself had its checker and the hook-level live measurement.
