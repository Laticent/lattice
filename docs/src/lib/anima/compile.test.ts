import { describe, expect, it } from 'vitest';
import { compile } from './compile';
import { parseScene } from './schema';

/** Parse + assert-ok + compile, so tests exercise the real spec → timeline path. */
function timeline(input: unknown) {
  const r = parseScene(input);
  if (!r.ok) throw new Error(`fixture invalid: ${r.errors.join('; ')}`);
  return compile(r.scene);
}

const el = (id: string, extra: Record<string, unknown> = {}) => ({ id, shape: 'box', ...extra });
const scene = (elements: unknown[], extra: Record<string, unknown> = {}): unknown => ({ source: 'built', duration: 1000, hero: 0.5, elements, ...extra });

describe('compile — transform verbs', () => {
  it('spin rotates about its axis by (t/period)·2π', () => {
    const tl = timeline(scene([el('a', { motion: [{ verb: 'spin', axis: 'y', period: 1000 }] })]));
    expect(tl.at(250).elements[0].transform.rotate[1]).toBeCloseTo(Math.PI / 2, 6);
    expect(tl.at(1000).elements[0].transform.rotate[1]).toBeCloseTo(Math.PI * 2, 6);
  });

  it('bob is a sinusoid on its axis (0 at t=0, +amplitude at quarter period)', () => {
    const tl = timeline(scene([el('a', { motion: [{ verb: 'bob', axis: 'y', amplitude: 8, period: 1000 }] })]));
    expect(tl.at(0).elements[0].transform.at[1]).toBeCloseTo(0, 6);
    expect(tl.at(250).elements[0].transform.at[1]).toBeCloseTo(8, 6);
  });

  it('explode pushes an element outward from the origin', () => {
    const tl = timeline(scene([el('a', { transform: { at: [10, 0, 0] }, motion: [{ verb: 'explode', distance: 1 }] })]));
    expect(tl.at(0).elements[0].transform.at[0]).toBeCloseTo(10, 6); // progress 0 → no push
    expect(tl.at(1000).elements[0].transform.at[0]).toBeCloseTo(20, 6); // progress 1 → +100%
  });
});

describe('compile — reveal / presence', () => {
  it('reveal is 0 before its window and 1 after', () => {
    const tl = timeline(scene([el('a', { motion: [{ verb: 'reveal', at: 0.5, span: 0.5 }] })]));
    expect(tl.at(250).elements[0].reveal).toBeCloseTo(0, 6); // progress .25 < .5
    expect(tl.at(250).elements[0].visible).toBe(false);
    expect(tl.at(1000).elements[0].reveal).toBeCloseTo(1, 6);
    expect(tl.at(1000).elements[0].visible).toBe(true);
  });

  it('sequence staggers presence across elements (earlier element leads)', () => {
    const tl = timeline(scene([el('a', { motion: [{ verb: 'sequence' }] }), el('b', { motion: [{ verb: 'sequence' }] }), el('c', { motion: [{ verb: 'sequence' }] })]));
    const s = tl.at(200); // progress 0.2 → into element 0's [0,1/3] slot, before element 1's
    expect(s.elements[0].reveal).toBeGreaterThan(s.elements[1].reveal);
    expect(s.elements[1].reveal).toBe(0);
  });

  it('sequence staggers over the SEQUENCED SUBSET, ignoring non-sequenced elements', () => {
    // 3 elements, only #0 and #2 sequenced → they tile [0,.5] and [.5,1]; #1 stays present.
    const tl = timeline(scene([el('a', { motion: [{ verb: 'sequence' }] }), el('b'), el('c', { motion: [{ verb: 'sequence' }] })]));
    const s = tl.at(400); // progress .4 → into #0's [0,.5] slot (0.8), before #2's [.5,1]
    expect(s.elements[0].reveal).toBeCloseTo(0.8, 6);
    expect(s.elements[1].reveal).toBe(1); // non-sequenced → always present
    expect(s.elements[2].reveal).toBe(0);
    expect(tl.at(750).elements[2].reveal).toBeGreaterThan(0); // #2 begins past the midpoint
  });

  it('an element with no reveal verb is present throughout', () => {
    const tl = timeline(scene([el('a')]));
    expect(tl.at(0).elements[0].reveal).toBe(1);
    expect(tl.at(0).elements[0].visible).toBe(true);
  });
});

describe('compile — fill (data-bound level)', () => {
  it('level ramps 0 → to and leaves reveal alone', () => {
    const tl = timeline(scene([el('a', { motion: [{ verb: 'fill', to: 0.8 }] })]));
    expect(tl.at(500).elements[0].level).toBeCloseTo(0.4, 6);
    expect(tl.at(1000).elements[0].level).toBeCloseTo(0.8, 6);
    expect(tl.at(500).elements[0].reveal).toBe(1); // presence unaffected
  });
});

describe('compile — svg draw', () => {
  it('draw reveals the stroke 0 → 1 over its window', () => {
    const tl = timeline({
      source: 'svg',
      duration: 1000,
      hero: 1,
      asset: 'a.svg',
      elements: [{ id: 'p', pathRef: 'p1', motion: [{ verb: 'draw', span: 1 }] }],
    });
    expect(tl.at(0).elements[0].reveal).toBeCloseTo(0, 6);
    expect(tl.at(1000).elements[0].reveal).toBeCloseTo(1, 6);
    expect(tl.at(0).source).toBe('svg');
  });
});

describe('compile — timeline invariants', () => {
  const fixture = scene([el('a', { motion: [{ verb: 'spin', axis: 'y', period: 1000 }] })], { hero: 0.4 });

  it('clamps t to [0, duration]', () => {
    const tl = timeline(fixture);
    expect(tl.at(-100)).toEqual(tl.at(0));
    expect(tl.at(99999)).toEqual(tl.at(1000));
  });

  it('poster() samples the hero time', () => {
    const tl = timeline(fixture);
    expect(tl.poster()).toEqual(tl.at(0.4 * 1000));
  });

  it('is deterministic — same scene + t yields a deep-equal snapshot', () => {
    const a = timeline(fixture).at(373);
    const b = timeline(fixture).at(373);
    expect(a).toEqual(b);
  });

  it('carries the token colour through untouched (resolved at paint, not here)', () => {
    const tl = timeline(scene([el('a', { color: 'var(--accent)' })]));
    expect(tl.at(0).elements[0].color).toBe('var(--accent)');
  });
});
