import { describe, expect, it } from 'vitest';
// The CJS export kernel this producer feeds — imported here to prove the whole chain
// (builder → manifest field → .vtt deriver) composes end-to-end.
import { buildEnvelope, parseEnvelope } from '../../../lib/core/lattice-doc.js';
import { readAlongToVtt } from '../../../lib/core/read-along-vtt.js';
import { buildReadAlong } from './read-along-build';

const VOICE = { model: 'hexgrad/kokoro-82m', voice: 'af_heart', speed: 1 };

describe('buildReadAlong', () => {
  it('assembles the section with estimate tracks, skipping blank slides (sparse by index)', () => {
    const ra = buildReadAlong(['Revenue grew to $4.2M this quarter.', '   ', 'We shipped. Margins held.'], {
      voice: VOICE,
      pace: 'moderate',
    });
    expect(ra.version).toBe('1.0');
    expect(ra.audioMode).toBe('regenerate');
    expect(ra.voice).toEqual(VOICE);
    expect(ra.pace).toBe('moderate');
    // Slide 1 was blank → skipped; the surviving slides keep their ORIGINAL indices.
    expect(ra.slides.map((s) => s.index)).toEqual([0, 2]);
    // The track carries Cadenza's spoken expansion (proves buildTrack ran).
    const words = ra.slides[0].track.cues.flatMap((c) => c.words);
    const money = words.find((w) => w.display === '$4.2M');
    expect(money?.spoken).toBe('four point two million dollars');
  });

  it('defaults pace to moderate and audioMode to regenerate', () => {
    const ra = buildReadAlong(['One.'], { voice: VOICE });
    expect(ra.pace).toBe('moderate');
    expect(ra.audioMode).toBe('regenerate');
  });

  it('produces an empty slides list when nothing is narrated', () => {
    expect(buildReadAlong(['', '  '], { voice: VOICE }).slides).toEqual([]);
  });
});

describe('end-to-end: builder → manifest → .vtt', () => {
  it('a built section round-trips through the manifest and derives a deck .vtt', () => {
    const ra = buildReadAlong(['Revenue grew.', '', 'We shipped.'], { voice: VOICE });
    const deck = { source: '# Deck\n\n<!-- Revenue grew. -->\n', title: 'RA', readAlong: ra };

    const m = parseEnvelope(buildEnvelope(deck)) as { readAlong: typeof ra };
    expect(m.readAlong).toEqual(ra); // survives the envelope byte-exact (#825)

    const vtt = readAlongToVtt(m.readAlong); // derives from the carried section (#828)
    expect(vtt.startsWith('WEBVTT')).toBe(true);
    expect((vtt.match(/WEBVTT/g) || []).length).toBe(1); // one deck-level file
    // Slide 2 (index 2) is offset past slide 0's duration, so it starts after 0.
    const cueTimes = [...vtt.matchAll(/(\d{2}:\d{2}:\d{2}\.\d{3}) -->/g)].map((x) => x[1]);
    expect(cueTimes.length).toBe(2);
    expect(cueTimes[0]).toBe('00:00:00.000');
    expect(cueTimes[1] > '00:00:00.000').toBe(true);
  });
});
