/**
 * Legacy → LTT: turn the narration a deck ALREADY exported carries into a Lattice Timing Track
 * (engineering/decisions/2026-09-24-lattice-timing-track.md §8 step 1; spec: engineering/ltt.md
 * §Legacy files).
 *
 * WHY FROM THE EXPORT, NOT FROM SOURCE. An exported HTML deck carries one packed block per
 * narrated slide (`lib/export/player-core.mjs` `narrationBlocks`): each cue's text, its estimated
 * length, the breath after it, and its words as `[display, startMs, endMs]` triples. Its manifest
 * (`readAlong` 1.1) carries no text, no track and no pace, and running today's Cadenza over the
 * source could draw cue boundaries that no longer match the clips baked into the file. So the
 * blocks are the only honest record of what that deck plays, and this reads them — the same way
 * the player's own `expandTrack` does, so the times here are the times the player crawls on.
 *
 * WHAT IS RECONSTRUCTED. The blocks drop `spoken`, `charOffset` and `weight`, and the LTT core
 * requires the first two, so this FILLS them: `spoken` is `display`, and `charOffset` comes from a
 * forward scan of each word through the slide's cue text (the same best-effort scan `buildTrack`
 * uses), where the slide's text is its cues' texts joined by single spaces. `weight` stays absent,
 * which the core already reads as "ordinary". Every segment is marked `basis: "legacy"`, which is
 * what tells a reader these were reconstructed rather than computed.
 *
 * WHAT IS NOT CARRIED. The blocks hold one audio clip PER CUE; the LTT 1.0 audio layer holds one
 * clip per segment. So the clips are not carried, and the count is returned as `clipsNotCarried`
 * rather than dropped silently. The breath after a slide's LAST cue is not a core field either.
 *
 * Root CJS, Node only (it hashes with `node:crypto`).
 */

const { createHash } = require('node:crypto');
const { validateLtt, LTT_VERSION } = require('@laticent/ltt');
const { PACE_PRESETS } = require('@laticent/cadenza');

/** The export's MIME for a narration block — `AUDIO_BLOCK_MIME` in lib/export/player-core.mjs. */
const LEGACY_BLOCK_MIME = 'application/lattice+audio';

/** The hold on arriving at a slide when the file carries no `NAR_BEAT` — Cadenza's natural preset,
 *  which is what an export without a `pace:` register bakes in. Read from Cadenza, not copied. */
const DEFAULT_BEATS = Object.freeze({ ...PACE_PRESETS.natural });

/** `sha256:` + hex of a UTF-8 string. */
function sha256(s) {
  return `sha256:${createHash('sha256').update(String(s), 'utf8').digest('hex')}`;
}

/**
 * A segment's hash, as engineering/ltt.md §Staleness defines it: SHA-256 over
 * `JSON.stringify([text, inputs])`, with `inputs`' keys sorted so two producers that build the
 * same object in a different order agree.
 */
function segmentHash(text, inputs) {
  const sorted = Object.fromEntries(Object.keys(inputs).sort().map((k) => [k, inputs[k]]));
  return sha256(JSON.stringify([String(text), sorted]));
}

/**
 * Pull the narration blocks and the arrival holds out of an exported HTML deck.
 *
 * @param {string} html  the exported file's text
 * @returns {{ slides: Array<object[]|null>, beats: {slide:number, section:number} | null }}
 *   `slides[i]` is slide i's parsed block (0-based), or null for a slide without one;
 *   `beats` is the player's baked-in `NAR_BEAT`, or null when the file has none.
 */
function readLegacyBlocks(html) {
  const src = String(html ?? '');
  const slides = [];
  const re = new RegExp(`<script type="${LEGACY_BLOCK_MIME.replace(/[+.]/g, '\\$&')}" data-lp-audio="(\\d+)">([\\s\\S]*?)</script>`, 'g');
  for (const m of src.matchAll(re)) {
    const i = Number(m[1]);
    // The export escapes every `<` as <; JSON.parse decodes it back.
    slides[i] = JSON.parse(m[2]);
  }
  for (let i = 0; i < slides.length; i++) if (!slides[i]) slides[i] = null;
  const beat = src.match(/var NAR_BEAT=(\{"slide":\d+,"section":\d+\});/);
  return { slides, beats: beat ? JSON.parse(beat[1]) : null };
}

/** One slide's block → the core track, exactly as the player's `expandTrack` lays it out. */
function trackFromBlock(cues) {
  const text = cues.map((c) => String(c?.t ?? '')).join(' ');
  const out = [];
  let at = 0;
  let cueOffset = 0;
  for (const c of cues) {
    const display = String(c?.t ?? '');
    const dur = Math.max(1, Math.round(c?.d || 0));
    const triples = Array.isArray(c?.w) ? c.w : [];
    const words = [];
    let scan = cueOffset;
    for (const [d, s, e] of triples) {
      const w = String(d ?? '');
      const found = text.indexOf(w, scan);
      const charOffset = found >= 0 ? found : scan;
      if (found >= 0) scan = found + w.length;
      words.push({ display: w, spoken: w, startMs: at + Math.max(0, Math.round(s)), endMs: at + Math.max(0, Math.round(e)), charOffset });
    }
    // A cue with no word timings still needs a span — the player gives it one word, the whole line.
    if (!words.length) words.push({ display, spoken: display, startMs: at, endMs: at + dur, charOffset: cueOffset });
    out.push({ display, words, startMs: at, endMs: at + dur, charOffset: cueOffset });
    at += dur + Math.max(0, Math.round(c?.g || 0));
    cueOffset += display.length + 1;
  }
  return { cues: out, durationMs: out.length ? out[out.length - 1].endMs : 0 };
}

/**
 * Convert an exported deck's narration blocks to a canonical LTT.
 *
 * @param {object} opts
 * @param {string} opts.id                        the deck's identity (its file name)
 * @param {Array<object[]|null>} opts.slides      per-slide blocks, 0-based (see readLegacyBlocks)
 * @param {number} [opts.slideCount]              slides in the deck; default: through the last narrated one
 * @param {Iterable<number>} [opts.sections]      0-based indices of section dividers, which hold longer.
 *   The blocks do not record which slides are dividers (the player reads it from the live DOM), so
 *   without this every slide takes the slide hold.
 * @param {{slide:number, section:number}} [opts.beats]  the export's `NAR_BEAT`; default Cadenza's natural preset
 * @param {'slow'|'moderate'|'fast'} [opts.pace]  the reading rate the deck was timed at — the blocks do
 *   not record it, so the default is the export's own default, `moderate`
 * @returns {{ ltt: object, clipsNotCarried: number }}
 */
function lttFromLegacy(opts) {
  const blocks = Array.isArray(opts?.slides) ? opts.slides : [];
  let last = -1;
  blocks.forEach((b, i) => { if (Array.isArray(b) && b.length) last = i; });
  const slideCount = Number.isInteger(opts?.slideCount) ? opts.slideCount : last + 1;
  const sections = new Set(opts?.sections ?? []);
  const beats = opts?.beats ?? DEFAULT_BEATS;
  // A legacy file cannot know the engine build that timed it; its engine hash is the hash of the
  // blocks it read, so the file still changes identity whenever the deck does.
  const inputs = { engine: sha256(JSON.stringify(blocks)), pace: opts?.pace ?? 'moderate' };

  const segments = [];
  let clipsNotCarried = 0;
  for (let i = 0; i < slideCount; i++) {
    const holdMs = segments.length === 0 ? 0 : Math.round(sections.has(i) ? beats.section : beats.slide);
    const at = { slide: i + 1 };
    const cues = Array.isArray(blocks[i]) ? blocks[i] : [];
    if (!cues.length) {
      segments.push({ id: `d${i + 1}`, kind: 'hold', at, holdMs });
      continue;
    }
    clipsNotCarried += cues.filter((c) => typeof c?.a === 'string').length;
    const text = cues.map((c) => String(c?.t ?? '')).join(' ');
    segments.push({ id: `d${i + 1}`, kind: 'slide', at, hash: segmentHash(text, inputs), basis: 'legacy', holdMs, track: trackFromBlock(cues) });
  }

  const ltt = { format: 'ltt', version: LTT_VERSION, source: { kind: 'deck', id: String(opts?.id ?? '') }, inputs, seekable: true, segments };
  const problems = validateLtt(ltt);
  if (problems.length) {
    throw new Error(`lttFromLegacy: the blocks did not convert to a valid LTT:\n  ${problems.join('\n  ')}`);
  }
  return { ltt, clipsNotCarried };
}

module.exports = { lttFromLegacy, readLegacyBlocks, segmentHash, LEGACY_BLOCK_MIME, DEFAULT_BEATS };
