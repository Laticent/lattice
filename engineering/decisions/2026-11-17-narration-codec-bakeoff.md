---
status: proposed
summary: Codec bake-off for streaming narration audio, run because Present with a Gemini voice reloads an iPhone tab and the owner asked for compressed audio in browser storage instead of WAV in memory. Opus wins on every axis measured, including on a real iOS Simulator. At 24 kbps it scores PESQ 4.35 against MP3 64 kbps at 4.30, at about a third of the size and a sixteenth of today's WAV. It is BSD-licensed and royalty-free. It decodes from Ogg and WebM with 0 ms added lead-in in Chromium, Linux WebKit, Firefox and iPhone Safari 26.5, and WebCodecs encodes and decodes it in the page on all four. MP3 adds 64 ms of silence per clip on iPhone even with LAME's gapless tag. AAC is patent-encumbered and adds 48 ms. Vorbis does not decode on iPhone. FLAC is lossless but 9x Opus's size. The bitrate (24 or 32 kbps) is the owner's call.
---

# Narration codec bake-off: Opus

**Date:** 2026-11-17 · **Status:** proposed; the owner picks the bitrate · **Scope:** the codec narration audio is stored and
streamed in on the Studio's playback path (the streaming redesign that follows PR #3289). It does not change the export's
MP3 (`lib/core/narration-encode.mjs`); a later note can revisit that.

## 1. Why a bake-off

Present with narration reloads the owner's iPhone tab when the voice is Gemini 3.1 Flash TTS over OpenRouter, and not
with Kokoro. On the iOS Simulator, memory climbs steadily as narration moves through a deck (PR #3289, about +160 MB by
slide 20). Every audio holder keeps what it has until a count runs out: Suono's decoded cache (64 clips, 256 MiB, never
released in a session), Suono's per-play byte cache (200 entries, no byte cap) and the voice model's cache. Gemini arrives
as uncompressed PCM, about 48 KB per second, and is stored as WAV in IndexedDB and in memory.

The owner's direction (2026-11-17): stream instead. Keep audio compressed in browser storage, compress as it arrives, keep
only the current sentence and the next two decoded, and release what has played. Before choosing a codec: a bake-off
favoring open source, wide support, efficiency and quality.

Constraints already established:

- **No provider sends compressed audio we can use.** OpenRouter's speech route accepts only `mp3` and `pcm`, and Gemini
  through it refuses `mp3`. Gemini's own API has no format option (`2026-11-11-voice-synthesis-spine.md` §9.7). So the
  page compresses.
- **MP3 on the playback path was tried and reverted** because lamejs writes no gapless header, so every clip came back
  56 to 70 ms longer (`2026-08-04-shared-deck-narration-audio.md` §9). A streaming player that decodes clips itself can skip
  a codec's known lead-in, so lead-in is measured below rather than assumed fatal.

## 2. Method

- **Speech:** four sentences from the owner's kind of deck, 7 to 10 s each, read by Kokoro (`af_heart`, `am_michael`) at
  24 kHz and kept lossless. Kokoro is the Studio's own TTS model, so this is the kind of audio narration carries.
- **Offline:** each candidate encoded with ffmpeg's reference encoders (libopus, libmp3lame, the native AAC encoder,
  libvorbis, flac), decoded back, and scored with PESQ wideband (ITU-T P.862.2, 16 kHz; the source scores 4.64).
- **Browsers:** Chromium 141, Linux WebKit 26 and Firefox 142 through Playwright, and iPhone Safari 26.5 in the iOS
  Simulator (`ios-safari-codec-support`, run 44080077888). Each decodes every file in
  `docs/scripts/ios-safari/codec-fixtures/` with `decodeAudioData` at 48 kHz (the length added over the source is the
  lead-in a player would hear), reports WebCodecs `AudioEncoder` / `AudioDecoder` support, and round-trips the source
  through `AudioEncoder` and `AudioDecoder`.

## 3. Results

### Size and quality (offline)

| Codec | kbps | KB per minute | PESQ (worst sentence) |
|---|---|---|---|
| WAV, today's Gemini storage | 384 | 2,813 | 4.64 |
| FLAC, lossless | 210 | 1,538 | 4.64 |
| **Opus 24k (voip)** | **23.5** | **172** | **4.35 (4.29)** |
| Opus 32k | 31.1 | 228 | 4.46 (4.41) |
| Opus 48k | 46.4 | 340 | 4.54 (4.52) |
| MP3 64k, today's export rate | 64.6 | 474 | 4.30 (4.28) |
| Vorbis q2 | 41.9 | 307 | 4.06 (4.03) |
| AAC-LC 64k (ffmpeg's encoder) | 71.2 | 522 | 3.92 (3.72) |

ffmpeg's native AAC encoder is weak at low rates; Apple's would score higher, which is why AAC is judged below on
licensing and lead-in, not on this score.

### Lead-in added by `decodeAudioData` at 48 kHz (ms; ✗ = does not decode)

| File | Chromium | WebKit (Linux) | Firefox | **iPhone Safari** |
|---|---|---|---|---|
| Opus / Ogg | 0 | 0 | 0 | **0** |
| Opus / WebM | 0 | 0 | 0 | **0** |
| Opus / CAF | ✗ | ✗ | ✗ | 20 |
| Opus / MP4 | 17 | 0 | 7 | ✗ |
| MP3, LAME with gapless tag | 0 | 64 | 0 | **64** |
| MP3, lamejs (the repo's) | 64 | 64 | 64 | **64** |
| AAC / MP4 | ✗ (Playwright's build) | 0 | 0 | 0 |
| AAC / ADTS | ✗ | 48 | 5 | 48 |
| FLAC | 0 | 0 | 0 | 0 |
| Vorbis / Ogg | 5 | 0 | 0 | **✗** |

### WebCodecs in the page

| | Chromium | WebKit (Linux) | Firefox | **iPhone Safari** |
|---|---|---|---|---|
| Opus encoder / decoder | ✓ / ✓ | ✓ / ✓ | ✓ / ✓ | **✓ / ✓** |
| AAC encoder / decoder | ✗ / ✗ | ✓ / ✓ | ✗ / ✓ | ✓ / ✓ |
| Opus 24k round trip | 23.5 kbps, +14 ms | 23.2 kbps, −20 ms | 23.6 kbps, +14 ms | **22.5 kbps, +14 ms, 11x realtime** |

The round trip's extra length is Opus's pre-skip, which raw packets carry and the decoder does not trim. It is a fixed
value the encoder reports, so a player trims it exactly.

## 4. Decision

**Opus.** It is the only candidate that meets all four of the owner's criteria:

- **Open:** BSD-licensed and royalty-free (IETF RFC 6716). AAC sits in a patent pool. MP3's patents have expired.
- **Supported:** it decodes from Ogg and WebM with no lead-in in every engine tested, iPhone included, and WebCodecs encodes
  and decodes it in the page in every engine. Vorbis fails on iPhone, and AAC's encoder is missing in Chromium and Firefox.
- **Efficient:** 172 KB per minute at 24 kbps, against 474 for MP3 64k and 2,813 for today's WAV.
- **Quality:** it beats MP3 64k at a third of the bitrate on PESQ, and it is close to the source at 48k.

MP3 is ruled out for playback on its own measurement: Safari adds 64 ms of silence per clip even when the gapless tag is
present, which is the defect §9 of the shared-deck note reverted.

**Bitrate, the owner's choice:** 24 kbps (PESQ 4.35, 172 KB/min) or 32 kbps (4.46, 228 KB/min). The listening set
compared both against the source. 32 kbps is the safe default; 24 kbps saves a quarter of the storage.

## 5. What this does not settle

- **The container on the streaming path.** Two shapes work on every engine. One stores WebCodecs' raw Opus packets with a
  small index and decodes them with `AudioDecoder`, trimming the reported pre-skip, so there is no muxer and no
  `decodeAudioData`. The other muxes each clip into Ogg and plays it with `decodeAudioData`, which trims the pre-skip itself.
  The streaming design note picks one.
- **A browser with no Opus `AudioEncoder`.** None was found among the four tested. The fallback keeps today's WAV, so a
  missing encoder costs bytes, never audio.
- **The export's MP3.** Out of scope here. The same numbers argue for Opus in exported webpages as well, but that file
  is opened by others in unknown browsers, which `narration-encode.mjs` cites as its reason for MP3.
- **Whether storage and release alone fix the iPhone reload.** The simulator cannot play narration audio (no WebDriver
  press reaches the page there), so the decoded-audio term is unmeasured. A memory timeline from a real iPhone, or the
  streaming player's own probe, settles it.

## 6. Reproduce

- iPhone: dispatch `platform-suites.yml` with `suites: ios-safari-codec-support`.
- Three engines: `PROBE=codec-support node docs/scripts/ios-safari/probe.selftest.mjs`.
- The offline scores used ffmpeg and PESQ in a scratch environment. They are not yet a committed tool, so committing that
  harness is part of the streaming PR.
