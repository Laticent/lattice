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
 * rather than dropped silently. The breath after a slide's LAST cue rides as the segment's
 * `tailMs`.
 *
 * Root CJS, Node only (it hashes with `node:crypto`).
 */

const { createHash } = require('node:crypto');
const { validateLtt, segmentHashInput, LTT_VERSION } = require('@laticent/ltt');
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

/** A segment's hash (engineering/ltt.md §Staleness): SHA-256 over `segmentHashInput`, which
 *  `@laticent/ltt` defines once for every producer. Only the digest is Node's. */
function segmentHash(text, inputs) {
  return sha256(segmentHashInput(text, inputs));
}

/** No real deck has more slides than this. A block index past it is refused rather than honored,
 *  because the index sizes an array: a 110-byte file claiming slide 50,000,000 once allocated a
 *  50-million-entry array and ran Node out of memory. */
const MAX_LEGACY_SLIDES = 10000;

const BLOCK_OPEN = '<script type="application/lattice+audio" data-lp-audio="';

/**
 * Pull the narration blocks, the slide list and the arrival holds out of an exported HTML deck.
 *
 * One LINEAR pass: each block's end is found with `indexOf` from its own start, so a file with an
 * unclosed block tag costs one scan, not one scan per tag (the lazy-regex version took two seconds
 * on 1.2 MB). The block MIME is written out literally, as the export writes it; the unit tests pin
 * LEGACY_BLOCK_MIME to the export's AUDIO_BLOCK_MIME and run this over a real export.
 *
 * @param {string} html  the exported file's text
 * @returns {{ slides: Array<object[]|null>, slideCount: number, sections: number[],
 *             beats: {slide:number, section:number} | null, ignored: number }}
 *   `slides[i]` is slide i's parsed block (0-based), or null for a slide without one (or with a
 *   block that does not parse, which the player also treats as silent). `slideCount` and
 *   `sections` (0-based indices of `divider` slides, which the player holds longer) come from the
 *   file's own `<section data-lattice-slide>` elements. `beats` is the player's baked-in `NAR_BEAT`,
 *   or null. `ignored` counts blocks whose index is past the last slide, which are refused.
 */
function readLegacyBlocks(html) {
  const src = String(html ?? '');

  // The slides, as the player sees them: every <section data-lattice-slide>, in document order.
  const sections = [];
  let slideCount = 0;
  for (const m of src.matchAll(/<section\b[^>]*\bdata-lattice-slide="\d+"[^>]*>/g)) {
    // `\sclass=`, not `\bclass=`: the boundary inside `data-class` is a word boundary, and that
    // attribute holds the raw `_class` payload, not the resolved classes the player reads (#1358).
    if (/\sclass="[^"]*\bdivider\b/.test(m[0])) sections.push(slideCount);
    slideCount++;
  }
  const limit = Math.min(slideCount || MAX_LEGACY_SLIDES, MAX_LEGACY_SLIDES);

  const slides = [];
  let ignored = 0;
  for (let at = src.indexOf(BLOCK_OPEN); at >= 0; ) {
    const idxEnd = src.indexOf('">', at + BLOCK_OPEN.length);
    if (idxEnd < 0) break;
    const close = src.indexOf('</script>', idxEnd);
    if (close < 0) break; // an unclosed block ends the scan — nothing after it can be a whole block
    const raw = src.slice(at + BLOCK_OPEN.length, idxEnd);
    const i = /^\d{1,9}$/.test(raw) ? Number(raw) : -1;
    if (i < 0 || i >= limit) ignored++;
    else {
      // The export escapes every `<` as a JSON escape; JSON.parse decodes it back. A block that
      // does not parse is a SILENT slide, as the player's `loadCues` reads it.
      try {
        slides[i] = JSON.parse(src.slice(idxEnd + 2, close));
      } catch {
        slides[i] = null;
      }
    }
    at = src.indexOf(BLOCK_OPEN, close);
  }
  for (let i = 0; i < slides.length; i++) if (!slides[i]) slides[i] = null;

  // The LAST match: the player's own script follows the slides, so an author's text that happened
  // to read `var NAR_BEAT=…` can only come earlier.
  let beats = null;
  for (const m of src.matchAll(/var NAR_BEAT=(\{"slide":\d{1,6},"section":\d{1,6}\});/g)) beats = JSON.parse(m[1]);
  return { slides, slideCount, sections, beats, ignored };
}

/**
 * One slide's block → the core track, laid out as the player's `expandTrack` lays it out.
 *
 * Every well-formed block converts exactly. A DAMAGED word is repaired rather than refused, because
 * the player plays such a deck anyway and one bad word must not lose the whole deck: an entry that
 * is not a `[display, start, end]` triple is skipped, and a word's times are clamped into its cue
 * and made to run forward. `repairs` counts each repair so the caller can report it.
 */
function trackFromBlock(cues, repairs) {
  const text = cues.map((c) => String(c?.t ?? '')).join(' ');
  const out = [];
  let at = 0;
  let cueOffset = 0;
  const ms = (v) => (Number.isFinite(Number(v)) ? Math.round(Number(v)) : 0);
  for (const c of cues) {
    const display = String(c?.t ?? '');
    const dur = Math.max(1, ms(c?.d));
    const triples = Array.isArray(c?.w) ? c.w : [];
    const words = [];
    let scan = cueOffset;
    let prev = 0;
    for (const t of triples) {
      if (!Array.isArray(t) || t.length < 3) {
        repairs.n++;
        continue;
      }
      const w = String(t[0] ?? '');
      const rawS = ms(t[1]);
      const rawE = ms(t[2]);
      const s = Math.min(Math.max(rawS, prev, 0), dur);
      const e = Math.min(Math.max(rawE, s), dur);
      if (s !== rawS || e !== rawE) repairs.n++;
      prev = s;
      const found = text.indexOf(w, scan);
      const charOffset = found >= 0 ? found : scan;
      if (found >= 0) scan = found + w.length;
      words.push({ display: w, spoken: w, startMs: at + s, endMs: at + e, charOffset });
    }
    // A cue with no word timings still needs a span — the player gives it one word, the whole line.
    if (!words.length) words.push({ display, spoken: display, startMs: at, endMs: at + dur, charOffset: cueOffset });
    out.push({ display, words, startMs: at, endMs: at + dur, charOffset: cueOffset });
    at += dur + Math.max(0, ms(c?.g));
    cueOffset += display.length + 1;
  }
  return { cues: out, durationMs: out.length ? out[out.length - 1].endMs : 0 };
}

/**
 * Convert an exported deck's narration blocks to a canonical LTT. Pass it `readLegacyBlocks`'s
 * result spread in — `slides`, `slideCount`, `sections` and `beats` all come from the file — or
 * call `lttFromLegacyHtml`, which does exactly that.
 *
 * @param {object} opts
 * @param {string} opts.id                        the deck's identity (its file name)
 * @param {Array<object[]|null>} opts.slides      per-slide blocks, 0-based
 * @param {number} [opts.slideCount]              slides in the deck. Without it the deck is assumed to
 *   end at its last NARRATED slide, which drops the holds of any silent slides after it — so pass
 *   the file's count, as `readLegacyBlocks` returns it.
 * @param {Iterable<number>} [opts.sections]      0-based indices of section dividers, which hold longer;
 *   without them every slide takes the slide hold
 * @param {{slide:number, section:number}} [opts.beats]  the export's `NAR_BEAT`; default Cadenza's natural preset
 * @param {'slow'|'moderate'|'fast'} [opts.pace]  the reading rate the deck was timed at — the blocks do
 *   not record it, so the default is the export's own default, `moderate`
 * @returns {{ ltt: object, clipsNotCarried: number, wordsRepaired: number }}
 */
function lttFromLegacy(opts) {
  const blocks = Array.isArray(opts?.slides) ? opts.slides : [];
  let last = -1;
  blocks.forEach((b, i) => { if (Array.isArray(b) && b.length) last = i; });
  // Never below the last narrated slide: a count that undershoots would drop narration silently.
  const slideCount = Math.max(Number.isInteger(opts?.slideCount) ? opts.slideCount : 0, last + 1);
  const sections = new Set(opts?.sections ?? []);
  const beats = opts?.beats ?? DEFAULT_BEATS;
  // A legacy file cannot know the engine build that timed it; its engine hash is the hash of the
  // blocks it read, so the file still changes identity whenever the deck does.
  const inputs = { engine: sha256(JSON.stringify(blocks)), pace: opts?.pace ?? 'moderate' };

  const segments = [];
  let clipsNotCarried = 0;
  const repairs = { n: 0 };
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
    // The breath after the LAST cue: the player holds it before advancing (`nextCue`), and the
    // track, which ends at the last cue's end, cannot say it.
    const tailMs = Math.max(0, Math.round(Number(cues[cues.length - 1]?.g) || 0));
    segments.push({ id: `d${i + 1}`, kind: 'slide', at, hash: segmentHash(text, inputs), basis: 'legacy', holdMs, track: trackFromBlock(cues, repairs), tailMs });
  }

  const ltt = { format: 'ltt', version: LTT_VERSION, source: { kind: 'deck', id: String(opts?.id ?? '') }, inputs, seekable: true, segments };
  const problems = validateLtt(ltt);
  if (problems.length) {
    throw new Error(`lttFromLegacy: the blocks did not convert to a valid LTT:\n  ${problems.join('\n  ')}`);
  }
  return { ltt, clipsNotCarried, wordsRepaired: repairs.n };
}

/** An exported HTML deck → its LTT, in one call: `lttFromLegacy` over `readLegacyBlocks`. */
function lttFromLegacyHtml(html, { id, pace } = {}) {
  const { slides, slideCount, sections, beats } = readLegacyBlocks(html);
  return lttFromLegacy({ id, pace, slides, slideCount: slideCount || undefined, sections, beats: beats || undefined });
}

module.exports = { lttFromLegacy, lttFromLegacyHtml, readLegacyBlocks, segmentHash, LEGACY_BLOCK_MIME, DEFAULT_BEATS, MAX_LEGACY_SLIDES };
