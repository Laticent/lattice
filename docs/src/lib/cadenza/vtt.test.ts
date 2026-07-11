import { describe, expect, it } from 'vitest';
import { buildTrack } from './track';
import { formatTimestamp, toSrt, toVtt } from './vtt';

describe('formatTimestamp', () => {
  it('formats VTT (dot) and SRT (comma) with padded fields', () => {
    expect(formatTimestamp(0)).toBe('00:00:00.000');
    expect(formatTimestamp(3_661_234)).toBe('01:01:01.234');
    expect(formatTimestamp(1_500, true)).toBe('00:00:01,500');
    expect(formatTimestamp(-50)).toBe('00:00:00.000');
  });
});

describe('toVtt', () => {
  const vtt = toVtt(buildTrack('Revenue grew to $4.2M. We beat plan.'));

  it('starts with the WEBVTT header', () => {
    expect(vtt.startsWith('WEBVTT\n')).toBe(true);
  });

  it('emits a cue timing line and karaoke word timestamps with DISPLAY glyphs', () => {
    expect(vtt).toMatch(/\d{2}:\d{2}:\d{2}\.\d{3} --> \d{2}:\d{2}:\d{2}\.\d{3}/);
    expect(vtt).toContain('$4.2M.'); // caption shows the display form, not "four point two…"
    expect(vtt).toMatch(/<\d{2}:\d{2}:\d{2}\.\d{3}>/); // inline word timestamp
  });

  it('escapes &, <, > in the cue payload (spec) without touching the timestamp tags', () => {
    // Deck prose now routes into cue text — "R&D", "5<10", "-->" must be escaped
    // so they can't corrupt the cue payload or forge a cue-timing "-->".
    const v = toVtt(buildTrack('R&D grew 5<10 and 3>2 fast --> done.'));
    expect(v).toContain('R&amp;D');
    expect(v).toContain('5&lt;10');
    expect(v).toContain('3&gt;2');
    expect(v).not.toContain('5<10'); // no raw '<' opens a cue span
    expect(v).not.toContain('3>2'); // no raw '>'
    // The one real cue-timing arrow stays; the payload "-->" became "--&gt;".
    expect((v.match(/ --> /g) || []).length).toBe(1);
    expect(v).toMatch(/<\d{2}:\d{2}:\d{2}\.\d{3}>/); // structural timestamp tag intact
  });
});

describe('toSrt', () => {
  it('numbers cues, uses comma decimals, and shows the display line', () => {
    const srt = toSrt(buildTrack('Revenue grew. We beat plan.'));
    expect(srt).toMatch(/^1\n00:00:00,000 --> /);
    expect(srt).toContain('Revenue grew.');
    expect(srt).toContain('\n2\n');
  });
});
