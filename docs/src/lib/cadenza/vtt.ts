// Cadenza — WebVTT (with karaoke word timings) + SRT serialization.
//
// WebVTT lines are universally consumed by <track>/AT/players; the inline cue
// timestamps (<00:00:01.234>) carry the word-level highlight for a JS consumer
// driving `cuechange` (native players ignore them — see the ADR). Captions render
// the DISPLAY glyphs; timings ride the (spoken-derived) word clock underneath.

import type { CaptionTrack } from './track';

function pad(n: number, width = 2): string {
  return String(n).padStart(width, '0');
}

/**
 * Escape a cue's TEXT payload for WebVTT/SRT: `&`, `<`, `>` become entities. Per
 * the WebVTT spec the cue payload must escape `&`/`<` (an unescaped `<` opens a cue
 * span) and must not contain the substring `-->` (escaping `>` → `--&gt;` neutralizes
 * it). Applied ONLY to the word/display text — never to the serializer's own
 * `<timestamp>` karaoke tags, which are structural markup, not payload. Matters
 * because the projected narration now routes arbitrary deck headings/prose
 * ("R&D", "5<10") into this sink.
 */
function escapeCueText(s: string): string {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/** ms → "HH:MM:SS.mmm" (VTT) or "HH:MM:SS,mmm" (SRT, comma decimal). */
export function formatTimestamp(ms: number, comma = false): string {
  const clamped = Math.max(0, Math.round(ms));
  const h = Math.floor(clamped / 3600000);
  const m = Math.floor((clamped % 3600000) / 60000);
  const s = Math.floor((clamped % 60000) / 1000);
  const millis = clamped % 1000;
  return `${pad(h)}:${pad(m)}:${pad(s)}${comma ? ',' : '.'}${pad(millis, 3)}`;
}

/**
 * Serialize a track to WebVTT. Each cue is one caption line; word timings are
 * inline `<timestamp>` tags before each word after the first (karaoke).
 */
export function toVtt(track: CaptionTrack): string {
  const out = ['WEBVTT', ''];
  for (const cue of track.cues) {
    if (!cue.words.length) continue;
    out.push(`${formatTimestamp(cue.startMs)} --> ${formatTimestamp(cue.endMs)}`);
    let line = escapeCueText(cue.words[0].display);
    for (let i = 1; i < cue.words.length; i++) {
      line += ` <${formatTimestamp(cue.words[i].startMs)}>${escapeCueText(cue.words[i].display)}`;
    }
    out.push(line, '');
  }
  return out.join('\n');
}

/** Serialize a track to SRT (line-level only — no word timing). */
export function toSrt(track: CaptionTrack): string {
  const blocks: string[] = [];
  track.cues.forEach((cue, i) => {
    if (!cue.words.length) return;
    blocks.push(
      `${i + 1}\n${formatTimestamp(cue.startMs, true)} --> ${formatTimestamp(cue.endMs, true)}\n${escapeCueText(cue.display)}\n`,
    );
  });
  return blocks.join('\n');
}
