---
status: proposed
summary: >
  How the Cadenza read-along rides into an exported deck — a `readAlong` section on the Lattice
  document manifest (2026-06-16-lattice-export-format.md §3b), the one JSON envelope both the .html
  player and the .lattice zip carry. The narration TEXT is NOT duplicated (it already lives in the
  manifest's `source` LFM and is re-derivable via Cadenza); the section carries only the voice CONFIG
  (model, voice, speed, pace), an optional pre-rendered measured CaptionTrack per narrated slide (so
  caption sync is exact + offline), and — only under an opt-in `audioMode:"embedded"` flag — the audio
  clips (data: URIs in HTML, assets/ files in the zip). DECISION: default `audioMode:"regenerate"`
  (bake captions, synthesize audio on play — lean, needs a key only to HEAR it); `"embedded"` is the
  self-contained/key-free/offline artifact for when someone needs it. The universal `.vtt` is a DERIVED
  sidecar (toVtt(track)), not duplicated in the manifest. Round-trip must stay byte-exact. Design only —
  nothing built; `lattice-doc.js` has no readAlong section yet. Companion to the export-format,
  cadenza-caption-timeline, and word-level-sync docs.
companion:
  - ./2026-06-16-lattice-export-format.md
  - ./2026-07-07-cadenza-caption-timeline.md
  - ./2026-07-08-word-level-sync.md
---

# Read-along in the export manifest — the `readAlong` contract (2026-07-08)

> **What this is.** The spec for how a deck's read-along (Cadenza captions + narration + optional
> audio) travels inside an exported deck. It extends the **Lattice document manifest**
> (`lib/core/lattice-doc.js`, `2026-06-16-lattice-export-format.md` §3b) with one new section.
> **Design only — nothing built.** The manifest has no `readAlong` today.

## Context

The manifest is the single JSON envelope both export containers carry (§3b): `source` (base64 LFM),
`theme`, `components`, `assets`, `config`, `notes`. The Cadenza ADR promised the read-along ships in
exports (accessibility captions, a `.vtt` edition "next to PDF/HTML"). To do that, the read-along
needs a home in the manifest — but naively dumping captions + audio in would bloat the envelope and
duplicate the narration text. This spec is the lean contract.

## The decision that shapes the schema: embed vs regenerate

- **`regenerate` (DEFAULT).** The manifest carries only *how* to make the read-along; the audio is
  synthesized client-side at play time by the viewer's voice ladder. Tiny. Captions are exact if a
  measured `track` is baked in, or an estimate if not. Needs a TTS key only to *hear* audio — the
  captions and highlight work with no key.
- **`embedded` (OPT-IN).** The manifest/zip also carries the pre-rendered audio. Plays offline, exact,
  no key — at the cost of megabytes. Honors the export format's "inline what's cheap, warn-and-degrade
  what's heavy" stance and its size ceiling.

**Default `regenerate`, offer an `embed audio` export flag.** Bake the captions (cheap, exact, offline,
accessible); synthesize the audio on play; let someone opt into a fully self-contained artifact.

## The schema

A new top-level `readAlong` object on the manifest. Present only if the deck has narration; absent
otherwise (a deck with no read-along is unchanged).

```jsonc
{
  // …existing manifest: format, lfm, engine, build, deck, source, theme, components, assets, config, notes…
  "readAlong": {
    "version": "1.0",                 // section version → forward-compat / migration
    "audioMode": "regenerate",        // "regenerate" (default) | "embedded"
    "voice": {
      "model": "hexgrad/kokoro-82m",  // TTS model slug the author used
      "voice": "af_heart",            // voice id (model-specific)
      "speed": 1.0                    // pace multiplier
    },
    "pace": "moderate",               // Cadenza estimate pace (slow|moderate|fast) — drives the
                                      // offline caption timeline when no measured track is present
    "slides": [                       // SPARSE — only narrated slides, keyed by index
      {
        "index": 0,                   // slide this narration belongs to
        "track": { /* measured CaptionTrack, or OMITTED → re-derive from source */ },
        "audio": null                 // audioMode:"embedded" → "data:audio/mp3;base64,…" (HTML)
                                      //                        | "assets/read-along/slide-0.mp3" (zip)
                                      // audioMode:"regenerate" → null
      }
    ]
  }
}
```

`track` is Cadenza's `CaptionTrack` verbatim (`{ durationMs, cues: [{ display, startMs, endMs, words:
[{ display, spoken, startMs, endMs, charOffset }] }] }`) — measured (re-anchored to real TTS spans) when
pre-rendered, so word/sentence sync is exact and offline.

### What is deliberately NOT stored (single source of truth, HARD RULE #1)

- **The narration text.** It already lives in `source` (the LFM's speaker notes / prose) and, when a
  `track` is present, in `track.cues[].words[].display`. The consumer re-derives narration via the same
  Cadenza path the live read-along uses. No third copy.
- **The `.vtt`.** It is a **derived** artifact — `toVtt(track)` — emitted as a sidecar file next to the
  PDF/HTML for universal `<track>` / assistive-tech consumption, not duplicated inside the manifest.
  (One source, `track`; the `.vtt` falls out of it.)

## Consumption

- **Lattice player (Present / Read views):** reads `readAlong`, uses `track` for the word-level
  highlight and, per `audioMode`, either plays the embedded `audio` or drives the voice ladder to
  synthesize (viewer's key) using `voice`.
- **Any player / assistive tech:** consumes the derived `.vtt` sidecar — zero Lattice code.
- **Re-import / round-trip:** `readAlong` rides the envelope through `hydrate()` unchanged.

## Invariants

1. **Byte-exact round-trip (§3c).** `parseManifest(buildManifest(deck))` reproduces the deck —
   `readAlong` included — byte-for-byte. Golden test extends the existing one.
2. **Additive + forward-compatible.** A manifest with no `readAlong` is valid (unchanged decks). An
   older importer ignores an unknown `readAlong`. `readAlong.version` gates future migration.
3. **No text duplication.** The gate/test asserts the narration is not stored outside `source` +
   `track`.
4. **Size honesty.** `audioMode:"embedded"` obeys the export format's size ceiling / warn-and-degrade;
   an oversized embed warns, and the default stays `regenerate`.

## Non-goals / deferred

- **Exact per-word timing** is out of scope — the `track`'s within-sentence word times are the shipped
  hybrid (measured sentence span + scaled estimate), per `2026-07-08-word-level-sync.md`. If that
  decision is later revisited, a finer `track` simply carries finer numbers; the schema is unchanged.
- **The self-delivering / AI-narrative bet** (`2026-07-07-self-delivering-presentation.md`) is
  separate and gated; this contract carries whatever narration exists, AI-authored or not.

## Build order (when we implement)

1. This spec + a golden round-trip fixture (a deck with narration → manifest → back, byte-exact).
2. `lib/core/lattice-doc.js` — write/read the `readAlong` section (exporter + importer), `regenerate`
   path first (config + measured `track`, no audio).
3. The `.vtt` sidecar emission (`toVtt(track)`) in the export pipeline.
4. The player consumption (highlight from `track`; voice-ladder synth).
5. `audioMode:"embedded"` + the export flag + the size-ceiling guard, last.
