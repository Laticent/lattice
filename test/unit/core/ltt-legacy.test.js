// Legacy → LTT (lib/core/ltt-legacy.js), driven from a REAL narrated player export: the blocks it
// reads are the ones `buildPlayerHtml` writes, not a hand-made imitation of them.

const { describe, test } = require('node:test');
const assert = require('node:assert/strict');
const { buildTrack, PACE_PRESETS } = require('@laticent/cadenza');
const { validateLtt } = require('@laticent/ltt');
const { buildPlayerHtml } = require('../../../lib/export/html-player.js');
const { lttFromLegacy, readLegacyBlocks, segmentHash, LEGACY_BLOCK_MIME, DEFAULT_BEATS } = require('../../../lib/core/ltt-legacy.js');

const docHtml = `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><title>Board</title></head><body>
<section data-lattice-slide="1" id="1" class="title"><h1>Q3</h1></section>
<section data-lattice-slide="2" id="2" class="divider"><h2>Outlook</h2></section>
<section data-lattice-slide="3" id="3" class="content"><h2>Ask</h2></section></body></html>`;

// Plain, single-spaced text, so the cue texts joined by spaces ARE the source text and the
// reconstructed char offsets can be checked against the ones buildTrack computed.
const TEXTS = ['Revenue grew 18% to $4.2M this quarter. Churn fell again.', '', 'The board is asked to approve the hiring plan.'];
const tracks = TEXTS.map((t) => (t ? buildTrack(t, { pace: 'moderate' }) : null));

/** The cue payload the Studio hands the export (share-export.ts), from a real track. */
const cuesOf = (t) =>
  t
    ? t.cues.map((c, i) => ({
        text: c.display,
        estimateMs: c.endMs - c.startMs,
        gapMs: (t.cues[i + 1]?.startMs ?? c.endMs) - c.endMs,
        audio: i === 0 ? 'data:audio/wav;base64,UklGRg==' : null,
        words: c.words.map((w) => ({ display: w.display, startMs: w.startMs, endMs: w.endMs })),
      }))
    : [];

let html;
async function exported() {
  if (!html) ({ html } = await buildPlayerHtml({ docHtml, source: '---\npace: brisk\n---\n\n# Q3\n', title: 'Board', now: 0, narration: tracks.map(cuesOf) }));
  return html;
}

describe('legacy exported deck → LTT', () => {
  test('the MIME it looks for is the one the export writes', async () => {
    const { AUDIO_BLOCK_MIME } = await import('../../../lib/export/player-core.mjs');
    assert.equal(LEGACY_BLOCK_MIME, AUDIO_BLOCK_MIME);
  });

  test('reads the blocks and the baked-in holds out of a real export', async () => {
    const { slides, beats } = readLegacyBlocks(await exported());
    assert.equal(slides.length, 3);
    assert.equal(slides[1], null, 'the silent slide has no block');
    assert.equal(slides[0].length, 2);
    assert.deepEqual(beats, PACE_PRESETS.brisk, 'NAR_BEAT is the deck pace the export resolved');
  });

  test('converts to a valid LTT whose times are the times the deck was built with', async () => {
    const { slides, beats } = readLegacyBlocks(await exported());
    const { ltt, clipsNotCarried } = lttFromLegacy({ id: 'board.html', slides, beats, sections: [1] });
    assert.deepEqual(validateLtt(ltt), []);
    assert.equal(clipsNotCarried, 2, 'one clip per narrated slide was in the file, and neither fits the 1.0 audio layer');
    assert.deepEqual(ltt.segments.map((s) => [s.kind, s.holdMs]), [['slide', 0], ['hold', PACE_PRESETS.brisk.section], ['slide', PACE_PRESETS.brisk.slide]]);

    for (const i of [0, 2]) {
      const seg = ltt.segments[i];
      assert.equal(seg.basis, 'legacy');
      assert.equal(seg.hash, segmentHash(TEXTS[i], ltt.inputs));
      // Every time the player crawls on, and every char offset, equals the track the deck was
      // built from; only the fields the blocks never carried were reconstructed.
      const strip = (t) => ({ ...t, cues: t.cues.map(({ weight, endsParagraph, ...c }) => ({ ...c, words: c.words.map(({ weight: _w, ...w }) => ({ ...w, spoken: w.display })) })) });
      assert.deepEqual(seg.track, strip(tracks[i]));
    }
  });

  test('without a NAR_BEAT or section list, it falls back to the natural slide hold everywhere', async () => {
    const { slides } = readLegacyBlocks(await exported());
    const { ltt } = lttFromLegacy({ id: 'x', slides });
    assert.deepEqual(DEFAULT_BEATS, PACE_PRESETS.natural);
    assert.deepEqual(ltt.segments.map((s) => s.holdMs), [0, PACE_PRESETS.natural.slide, PACE_PRESETS.natural.slide]);
  });

  test('a cue with no word timings still gets a span, as the player gives it one', () => {
    const { ltt } = lttFromLegacy({ id: 'x', slides: [[{ t: 'Hello there.', d: 900, g: 0, a: null, w: [] }]] });
    assert.deepEqual(validateLtt(ltt), []);
    assert.deepEqual(ltt.segments[0].track.cues[0].words, [{ display: 'Hello there.', spoken: 'Hello there.', startMs: 0, endMs: 900, charOffset: 0 }]);
  });

  test('the engine hash moves when the deck does', () => {
    const block = [{ t: 'One.', d: 300, g: 0, a: null, w: [['One.', 0, 300]] }];
    const a = lttFromLegacy({ id: 'x', slides: [block] }).ltt.inputs.engine;
    const b = lttFromLegacy({ id: 'x', slides: [[{ ...block[0], d: 301 }]] }).ltt.inputs.engine;
    assert.notEqual(a, b);
  });
});
