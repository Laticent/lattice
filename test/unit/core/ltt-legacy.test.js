// Legacy → LTT (lib/core/ltt-legacy.js), driven from a REAL narrated player export: the blocks it
// reads are the ones `buildPlayerHtml` writes, not a hand-made imitation of them.

const { describe, test } = require('node:test');
const assert = require('node:assert/strict');
const { buildTrack, PACE_PRESETS } = require('@laticent/cadenza');
const { validateLtt } = require('@laticent/ltt');
const { buildPlayerHtml } = require('../../../lib/export/html-player.js');
const { lttFromLegacy, lttFromLegacyHtml, readLegacyBlocks, segmentHash, LEGACY_BLOCK_MIME, DEFAULT_BEATS, MAX_LEGACY_SLIDES } = require('../../../lib/core/ltt-legacy.js');
const { segmentHashInput } = require('@laticent/ltt');

const docHtml = `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><title>Board</title></head><body>
<section data-lattice-slide="1" id="1" class="title"><h1>Q3</h1></section>
<section data-lattice-slide="2" id="2" class="divider"><h2>Outlook</h2></section>
<section data-lattice-slide="3" id="3" class="content"><h2>Ask</h2></section></body></html>`;

// Plain, single-spaced text, so the cue texts joined by spaces ARE the source text and the
// reconstructed char offsets can be checked against the ones buildTrack computed.
const TEXTS = ['Revenue grew 18% to $4.2M this quarter. Churn fell again.', '', 'The board is asked to approve the hiring plan.'];
const LAST_GAP = 620;
const tracks = TEXTS.map((t) => (t ? buildTrack(t, { pace: 'moderate' }) : null));

/** The cue payload the Studio hands the export (share-export.ts), from a real track. */
const cuesOf = (t) =>
  t
    ? t.cues.map((c, i) => ({
        text: c.display,
        estimateMs: c.endMs - c.startMs,
        // The last cue's breath is non-zero, as the Studio bake writes it (interCueGapMs), so the
        // tail the player holds after the slide is really exercised.
        gapMs: (t.cues[i + 1]?.startMs ?? c.endMs + LAST_GAP) - c.endMs,
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
    const read = readLegacyBlocks(await exported());
    assert.equal(read.slideCount, 3, 'the slide count comes from the file');
    assert.deepEqual(read.sections, [1], 'the divider slide comes from the file');
    const { ltt, clipsNotCarried } = lttFromLegacy({ id: 'board.html', ...read });
    assert.deepEqual(validateLtt(ltt), []);
    assert.equal(clipsNotCarried, 2, 'the fixture gives the first cue of each narrated slide a clip; clips are per CUE, and the 1.0 audio layer holds one per segment');
    assert.deepEqual(ltt.segments.map((s) => [s.kind, s.holdMs]), [['slide', 0], ['hold', PACE_PRESETS.brisk.section], ['slide', PACE_PRESETS.brisk.slide]]);

    for (const i of [0, 2]) {
      const seg = ltt.segments[i];
      assert.equal(seg.basis, 'legacy');
      assert.equal(seg.hash, segmentHash(TEXTS[i], ltt.inputs));
      // Every time the player crawls on, and every char offset, equals the track the deck was
      // built from; only the fields the blocks never carried were reconstructed.
      const strip = (t) => ({ ...t, cues: t.cues.map(({ weight, endsParagraph, ...c }) => ({ ...c, words: c.words.map(({ weight: _w, ...w }) => ({ ...w, spoken: w.display })) })) });
      assert.deepEqual(seg.track, strip(tracks[i]));
      assert.equal(seg.tailMs, LAST_GAP, 'the breath after the last cue is carried, not dropped');
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

  test('a block that does not parse is a silent slide, as the player reads it', () => {
    const html = `<script type="${LEGACY_BLOCK_MIME}" data-lp-audio="0">[{"t":"ok","d":300,"g":0,"w":[]}]</script><script type="${LEGACY_BLOCK_MIME}" data-lp-audio="1">[{"t":</script>`;
    const { slides } = readLegacyBlocks(html);
    assert.equal(slides[1], null);
    assert.deepEqual(validateLtt(lttFromLegacy({ id: 'x', slides, slideCount: 2 }).ltt), []);
  });

  test('trailing silent slides keep their holds: the count comes from the file, not the last narrated slide', async () => {
    const { html: two } = await buildPlayerHtml({
      docHtml: docHtml.replace('<section data-lattice-slide="3" id="3" class="content"><h2>Ask</h2></section>', ''),
      source: '# Q3\n',
      title: 'Board',
      now: 0,
      narration: [cuesOf(tracks[0]), []],
    });
    const { ltt } = lttFromLegacyHtml(two, { id: 'two.html' });
    assert.deepEqual(ltt.segments.map((s) => s.kind), ['slide', 'hold'], 'the silent last slide is a hold, not dropped');
  });

  test('a divider is read from the resolved class, never from the raw data-class payload (#1358)', () => {
    const r = readLegacyBlocks('<section data-lattice-slide="1" data-class="divider" class="content"></section><section data-lattice-slide="2" class="divider lead"></section>');
    assert.equal(r.slideCount, 2);
    assert.deepEqual(r.sections, [1]);
  });

  test('a hostile block index is refused, not honored — it sized an array and ran Node out of memory', () => {
    const t = Date.now();
    const r = readLegacyBlocks(`<script type="${LEGACY_BLOCK_MIME}" data-lp-audio="50000000">[{"t":"hi","d":100,"g":0,"w":[]}]</script>`);
    assert.ok(Date.now() - t < 500);
    assert.equal(r.slides.length, 0);
    assert.equal(r.ignored, 1);
    assert.ok(MAX_LEGACY_SLIDES <= 10000);
  });

  test('unclosed block tags cost one scan, not one per tag', () => {
    const t = Date.now();
    readLegacyBlocks(`<script type="${LEGACY_BLOCK_MIME}" data-lp-audio="1">x`.repeat(40000));
    assert.ok(Date.now() - t < 500, `took ${Date.now() - t} ms`);
  });

  test('a damaged word is repaired and counted, never the reason a whole deck is lost', () => {
    const block = [{ t: 'One two three four.', d: 400, g: 0, w: [null, 'x', ['One', 0, 100], ['two', 300, 200], ['three', 150, 250], ['four.', 350, 900]] }];
    const { ltt, wordsRepaired } = lttFromLegacy({ id: 'x', slides: [block] });
    assert.deepEqual(validateLtt(ltt), []);
    assert.equal(wordsRepaired, 5, 'two non-triples skipped, three words clamped');
    assert.deepEqual(ltt.segments[0].track.cues[0].words.map((w) => [w.startMs, w.endMs]), [[0, 100], [300, 300], [300, 300], [350, 400]]);
  });

  test('the engine hash moves when the deck does', () => {
    const block = [{ t: 'One.', d: 300, g: 0, a: null, w: [['One.', 0, 300]] }];
    const a = lttFromLegacy({ id: 'x', slides: [block] }).ltt.inputs.engine;
    const b = lttFromLegacy({ id: 'x', slides: [[{ ...block[0], d: 301 }]] }).ltt.inputs.engine;
    assert.notEqual(a, b);
  });
});

const GOLDEN = 'sha256:fc9a0b2221489e4b3e4ac7e061887e56b0eacfeea22f7f7f9474837ad47639a7'; // = sha256sum of the input string above, computed independently

describe('the staleness hash is one definition for every producer', () => {
  // A GOLDEN vector: the input string and its digest are pinned, so a change to either — in the
  // package (which the browser uses) or in Node's digest — fails here before two producers disagree.
  const inputs = { pace: 'moderate', engine: `sha256:${'0'.repeat(64)}`, viewport: { w: 1440, h: 900 } };
  test('the input is canonical JSON with keys sorted at every depth', () => {
    assert.equal(
      segmentHashInput('Now click Publish.', inputs),
      `["Now click Publish.",{"engine":"sha256:${'0'.repeat(64)}","pace":"moderate","viewport":{"h":900,"w":1440}}]`,
    );
  });
  test('key order at any depth does not move the hash', () => {
    const reordered = { viewport: { h: 900, w: 1440 }, engine: inputs.engine, pace: 'moderate' };
    assert.equal(segmentHash('Now click Publish.', reordered), segmentHash('Now click Publish.', inputs));
  });
  test('the digest is pinned', () => {
    assert.equal(segmentHash('Now click Publish.', inputs), GOLDEN);
  });
});
