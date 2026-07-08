// Read-along BUILDER — turn a deck's per-slide narration into a `readAlong` section
// (2026-07-08-read-along-export-manifest.md). This is the PRODUCER that feeds the
// export manifest field (lib/core/lattice-doc.js) and the .vtt deriver
// (lib/core/read-along-vtt.js); it lives docs-side because it uses Cadenza.
//
// It builds the ESTIMATE track per slide (Cadenza's deterministic baseline) — no
// audio, no key, no async. That's the `regenerate`-mode default: captions are exact
// enough offline and the .vtt is directly derivable, without the player re-deriving
// from source. (A future PRE-RENDER path would synthesize + measure real tracks and
// embed audio; that's slice 5, not here.)
//
// The caller resolves the narration text per slide (via slideToSpeech / notes) and
// splits the deck into slides; this transform just assembles the section.

import { buildTrack, type CaptionTrack, type Pace } from '@/lib/cadenza';

export interface ReadAlongVoice {
  /** TTS model slug the author chose (e.g. "hexgrad/kokoro-82m"). */
  model: string;
  /** Voice id (model-specific, e.g. "af_heart"). */
  voice: string;
  /** Pace multiplier passed to the voice (1 = natural). */
  speed: number;
}

export interface ReadAlongSlide {
  /** Slide index this narration belongs to. */
  index: number;
  /** The estimate CaptionTrack (measured when a pre-render path replaces it later). */
  track: CaptionTrack;
}

export interface ReadAlong {
  version: string;
  audioMode: 'regenerate' | 'embedded';
  voice: ReadAlongVoice;
  pace: Pace;
  slides: ReadAlongSlide[];
}

export interface BuildReadAlongOptions {
  voice: ReadAlongVoice;
  pace?: Pace;
  audioMode?: 'regenerate' | 'embedded';
}

/**
 * Assemble a `readAlong` section from per-slide narration text. `slideTexts[i]` is
 * slide i's readable narration; an empty/blank entry means "no narration" and is
 * skipped (the slides list is SPARSE, keyed by original index). Pure + deterministic.
 */
export function buildReadAlong(slideTexts: readonly string[], opts: BuildReadAlongOptions): ReadAlong {
  const pace: Pace = opts.pace ?? 'moderate';
  const slides: ReadAlongSlide[] = [];
  for (let index = 0; index < slideTexts.length; index++) {
    const text = String(slideTexts[index] ?? '').trim();
    if (!text) continue; // sparse — only narrated slides
    slides.push({ index, track: buildTrack(text, { pace }) });
  }
  return {
    version: '1.0',
    audioMode: opts.audioMode ?? 'regenerate',
    voice: opts.voice,
    pace,
    slides,
  };
}
