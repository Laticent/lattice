---
status: shipped
summary: How tight should read-along word-highlight sync be, and how do we get there? Today's model is HYBRID — each sentence's onset + duration is MEASURED from the TTS audio and Cadenza's estimate is re-anchored to that span; words WITHIN a sentence stay estimated (char-length weighted + punctuation-pause folded) and scaled to the measured duration. Sentence boundaries are exact; sub-sentence word positions are a good scaled estimate that reads as word-sync on short lines. DECISION — this hybrid is the shipped baseline and is at a good practical ceiling for a timestamp-less TTS; there is NO cheap headroom left (the estimator already length-weights and folds pauses), and the only paths to truly-exact word timing are heavy or device-unreliable, so we DEFER them until a concrete trigger. Records the axes, the five candidate moves with tradeoffs, and the per-surface path we'd take IF a trigger fires. Companion to 2026-07-07-cadenza-caption-timeline.md.
companion:
  - ./2026-07-07-cadenza-caption-timeline.md
---

# Word-level read-along sync — how tight, and how (2026-07-08)

> **TL;DR.** The read-along already syncs the highlight to real audio at the **sentence**
> level (measured onset + duration, re-anchored) and estimates **word** positions within
> each sentence. That hybrid reads as word-sync on short boardroom lines and the human
> reviewer was satisfied with it. Truly-exact per-word karaoke would need word timestamps
> the TTS doesn't give us — reachable only via heavy or device-unreliable machinery.
> **Decision: ship the hybrid as the baseline; DEFER the exact-timing options until a
> concrete trigger justifies the cost.** This doc records the model so we don't
> re-litigate it.

## Where sync stands today

Cadenza's timing is a **deterministic estimate** (`cadence.ts` / `track.ts`) re-anchored by
**measured TTS spans** (`cursor.align`, driven by `voice-model`'s `onSentenceTiming`):

- **Sentence boundaries are MEASURED** — each sentence's real onset (when its clip starts on
  the WebAudio clock) and its decoded duration re-anchor that cue. Tight.
- **Words within a sentence are ESTIMATED**, then scaled to the measured sentence duration.
  The estimate is already reasonable: `estimateWordMs` weights each spoken sub-word by its
  character length (`cadence.ts:47`), and `buildTrack` folds each token's punctuation pause
  into the gap before the next word (`track.ts:81`). So "revenue" dwells longer than "up",
  and there's a beat after a comma.

The residual: within a long sentence, word positions can lead/lag and then snap back at the
next sentence boundary. On short lines it's imperceptible.

## The two axes

1. **Where timing comes from** — *derive it from the audio* (forced alignment, ASR, silence
   detection) · *get it from the source* (browser `onboundary`, a timestamp-returning TTS) ·
   *just estimate better*.
2. **Where it runs** — *pure browser* (the Playground/Studio: no server, bring-your-own-key)
   · *build-time / desktop* (the Tauri app has a backend) · *a new cloud provider*.

## Candidate moves

| Move | Accuracy | Cost | Runs where | Verdict |
|---|---|---|---|---|
| Better estimator (syllable/pause weighting) | Better, not exact | Free | Everywhere | **Already done** — char-length weighted + pause-folded; no cheap headroom left. |
| Snap word boundaries to audio silence gaps | Marginal for words | Free (we already decode the buffer) | Browser | **Low ROI** — TTS speaks continuously; reliable silences fall at punctuation, which are *already* our sentence boundaries. Catches phrases, not words. |
| Browser `speechSynthesis.onboundary` | Exact | Free | Browser-voice rung only | **Deferred** — exact word events, but support is **unreliable on iOS Safari** (our primary test device) and it only helps the keyless *fallback* voice, not the cloud voice users pick. |
| In-browser Whisper (transformers.js), `return_timestamps:'word'` | Near-exact | ~tens of MB model download + per-play CPU; imperfect at pauses | Browser | **Deferred** — the only browser path to exact timing on the *cloud* voice, but disproportionate for a sync users already like. Fits an opt-in "precise" toggle. |
| Forced alignment (echogarden) | Exact | Node-only, heavy (espeak/ONNX) | Desktop/Tauri or a build step | **Deferred** — can't run in the browser Playground; the right tool for a `.vtt` **export** or the desktop app. |
| Timestamp-returning TTS (ElevenLabs / Azure), called directly | Exact | New provider + key + per-word $ (~8× OpenRouter/word) | Browser | **Deferred** — exact and free of extra compute, but a new provider + key and OpenRouter's `/audio/speech` strips timestamps, so it can't come through our current path. |

## Decision

1. **Ship the hybrid as the read-along baseline.** It's exact at the sentence level and a good
   scaled estimate within — the practical ceiling for a TTS that returns audio only.
2. **Do NOT invest in the exact-timing options now.** The cheap tier is already implemented,
   the free-and-exact option (`onboundary`) is iOS-unreliable and only helps the fallback
   voice, and the heavy options (Whisper, a timestamp TTS, echogarden) are disproportionate to
   a sync the reviewer already finds good.
3. **Keep the seam ready.** `cursor.align` already accepts per-*cue* measured spans; nothing
   about the hybrid blocks a future per-*word* timing source from feeding finer-grained
   anchors. When a trigger fires we extend, not rewrite.

## Triggers that would justify revisiting (and the path each implies)

- **A `.vtt` / captions EXPORT with exact word times** (a real customer ask, or the desktop
  app) → **echogarden** forced alignment at build-time / in Tauri. Highest accuracy, offline,
  no per-play cost.
- **An accessibility mandate for karaoke-exact highlighting in the live web read-along** →
  **in-browser Whisper** as an opt-in "precise sync" toggle (accept the download), or a
  **timestamp-returning TTS** if the org will fund a second provider + key.
- **We move the read-along off the browser onto a backend** → the server calls a
  timestamp-returning TTS or runs alignment; the whole "derive vs source" axis reopens in our
  favor.

Until then, the hybrid stands. This is a *defer*, not a *no* — the analysis is banked here so
the next person picks the right tool for the trigger instead of re-deriving the map.
