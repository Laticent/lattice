---
origin: 3319
priority: P1
recorded: 2026-11-19
area: engine
severity: high
swimlane: engineering/decisions/2026-11-16-terms-registry.md
deferred: blocked — no machine judge is reliable on Gemini's voice (Whisper hears "yarn" in clips the owner hears as "yearn"), so a fix can only be scored by a human ear, on the owner's own deck in the Studio; Flash-Lite is direct-Gemini only (OpenRouter does not serve it) on a free tier of 10 requests a day; the Studio warns when it is chosen (#3319)
source: https://github.com/Laticent/lattice/pull/3319
---

# Gemini Flash-Lite TTS (direct) says "Yearn" wrong depending on where it sits

The owner hears "Yearn" misread with Gemini Flash TTS, "if a sentence or a paragraph" puts it as "Yearn.".
Reproduced on 2026-11-19 with the Studio's own request shape (`geminiSpeechBody`, one sentence per request)
and its default model `gemini-3.8-flash-lite-tts`, transcribed with Whisper `small.en`:

| Text sent | Heard |
|---|---|
| This is why I love Yearn. | This is why I love yearn. |
| Yearn. | Yern. |
| Our pick is Yearn. It wins. | Our pick is yarn. It wins. |
| Yearn is our pick. | Uranus arpic |

Narrowed 2026-11-19, same day: the misreading is the DIRECT Gemini Flash-Lite model only. Through OpenRouter,
`google/gemini-3.1-flash-tts-preview` (voice Kore, the Studio's `/audio/speech` request) said "Yearn" as "yearn"
in all 24 clips: the four shapes above, two runs each, for `Yearn`, `Yern` and `Yurn`. Judged by Whisper's
log-likelihood of "…Yearn…" against "…yarn…", calibrated per shape on Kokoro clips of known truth, because
Whisper's free transcript says "yarn" for a correctly spoken "yearn" (verified: Kokoro says "yearn", and in a verb
context, "I yearn for summer", Whisper writes it right). A free transcription of the four shapes showed no garbling.
So the owner's working voice (Gemini Flash TTS via OpenRouter) needs no respelling; Flash-Lite direct does.

Corrected 2026-11-20: the evidence above is weaker than it reads. The harness and the judge treated
Gemini's answer as raw PCM, but it is a RIFF WAV with a trailing signed C2PA chunk, so every clip carried a
header click and about 90 ms of noise. Re-scored on clean audio, the judge put "This is why I love Yearn." and
"Yearn." closer to "yarn" (two runs each), while the owner listened to the four clean clips and said they "say
yearn well". Whisper also writes "Yarn" for two OpenRouter clips the earlier judge scored as correct. So machine
listening does not settle this voice either way. What stands: the owner first heard the misreading in the
Studio with Gemini Flash TTS, and heard these four clips as correct, which fits a voice that varies run to run.
The Studio's warning says exactly that, so it stays.

why now   — this is the defect the owner reported. #3319 makes the text sent to the voice deterministic and
            correct ("Yearn" reaches Gemini exactly as written, or as the deck's `terms:` respelling), but
            the misreading happens inside Gemini, which reads the same text differently by position.
            The on-device voice (Kokoro) says "yearn" correctly in every position tested.
where     — docs/src/playground/voice-model.js (`geminiSpeechBody`: one sentence, no context, no
            pronunciation hint); the deck's `terms:` respelling is the one lever today.
done when — a measured way to make Gemini Flash-Lite (direct) say a term the same in every position, chosen from: a `terms:`
            respelling that holds across the four shapes above; sending a paragraph instead of a sentence
            (changes the clip-equals-cue contract, so the owner decides); or a pronunciation hint Gemini
            honors without reading it aloud. Each candidate transcribed, five runs per shape (the voice is
            not deterministic).
evidence  — the four WAVs sent on #3319 (`.scratch/signoff/gemini/`); the harness is a short script that
            posts `geminiSpeechBody(text)` and transcribes the PCM with Whisper.
verify    — the owner's deck in the Studio, on the model it picks, heard as "yearn" in every sentence across five plays; a machine judge only once one is shown to agree with a human ear on this voice.
