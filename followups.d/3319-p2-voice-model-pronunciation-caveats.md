---
origin: 3319
priority: P2
recorded: 2026-11-19
area: website
severity: medium
swimlane: engineering/decisions/2026-11-16-terms-registry.md
deferred: large — three pieces (a gotcha, a Studio warning, a listening audit of every curated voice model), and the audit needs paid keys and per-model runs
source: https://github.com/Laticent/lattice/pull/3319
---

# Say which voices misread words, document it, and warn when one is picked

The owner asked, on #3319: document Gemini's position-dependent misreading as a gotcha, warn authors when they
select Gemini in the Studio's workspace settings, and look for the same class of problem in the other value and
curated voice models. Companion to `3319-p1-gemini-tts-misreads-yearn-by-position.md`, which holds the reproduction
and the search for a fix. This item is about telling authors, and about knowing which other voices do the same.

why now   — #3319 makes the text every voice receives deterministic, so what remains is the voice itself. A
            language-model voice (Gemini Flash-Lite TTS) reads the same word differently by its place in the
            sentence ("Our pick is Yearn." heard as "yarn", "Yearn is our pick." garbled), and nothing in the
            Studio or the docs says so. An author blames their `terms:` entry, as the owner did.
where     — 1. a gotcha: engineering/gotchas/ has no voice or TTS topic yet; add one (or a section in
               studio-playground.md) with the symptom, the cause and the one lever today (a `terms:`
               respelling, tested on that voice), and list it in dist/engineering/gotchas.md's index.
            2. the warning: docs/src/components/studio/TtsSettings.tsx (the `gemini` engine) and
               GeminiVoicePanel.tsx; a short, plain note shown when Gemini is selected, reusing the shared
               settings chrome (HARD RULE #15), checked at 1440/820/390.
            3. the audit: every model in docs/src/lib/models.config.json `voiceFeatured` and `voiceValue`
               (today kokoro-82m, gemini-3.8-flash, grok-voice-tts-1.0, gemini-3.1-flash-tts-preview,
               orpheus-3b-0.1-ft, mai-voice-2, csm-1b) plus the Gemini direct default gemini-3.8-flash-lite-tts.
done when — the gotcha is written; the Studio shows the warning for every voice the audit finds misreading, and
            no warning for one it does not; the audit table (model × sentence shape → heard) is committed in a
            decision note, with the shapes reused from the P1 item (word last, word first, word alone, word
            mid-sentence) plus a dotted abbreviation and an acronym.
evidence  — the P1 item's four Gemini clips; the harness: post the Studio's own request for each model, transcribe
            with Whisper small.en, five runs per shape (these voices are not deterministic).
verify    — the audit re-run reproduces the table; the warning appears and disappears with the selected model in
            the real Studio at three widths.
note      — the audit spends money. Our OPEN_ROUTER_KEY may only be spent by a sanctioned, on-demand,
            opt-in tool (HARD RULE #24), so the audit is either such a tool or runs on the owner's own keys.
