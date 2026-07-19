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

  it('orbit rotates the position about its axis, right-handed and consistent across axes', () => {
    // +x, orbit +90° about y → −z (right-handed). Guards the F1 handedness fix.
    const tl = timeline(scene([el('a', { transform: { at: [10, 0, 0] }, motion: [{ verb: 'orbit', axis: 'y', period: 1000 }] })]));
    const p = tl.at(250).elements[0].transform.at;
    expect(p[0]).toBeCloseTo(0, 6);
    expect(p[2]).toBeCloseTo(-10, 6);
  });

  it('composes multiple motions in array order (both applied to one element)', () => {
    const tl = timeline(scene([el('a', { transform: { at: [10, 0, 0] }, motion: [{ verb: 'explode', distance: 1 }, { verb: 'spin', axis: 'y', period: 1000 }] })]));
    const s = tl.at(1000).elements[0];
    expect(s.transform.at[0]).toBeCloseTo(20, 6); // explode doubled the offset
    expect(s.transform.rotate[1]).toBeCloseTo(Math.PI * 2, 6); // spin one full rev
  });

  it('explode pushes an element outward from the origin', () => {
    const tl = timeline(scene([el('a', { transform: { at: [10, 0, 0] }, motion: [{ verb: 'explode', distance: 1 }] })]));
    expect(tl.at(0).elements[0].transform.at[0]).toBeCloseTo(10, 6); // progress 0 → no push
    expect(tl.at(1000).elements[0].transform.at[0]).toBeCloseTo(20, 6); // progress 1 → +100%
  });
});

describe('compile — hierarchy (nesting)', () => {
  it('nests children as a tree, each carrying its LOCAL transform (backend composes)', () => {
    const tl = timeline(
      scene([
        {
          id: 'housing',
          shape: 'group',
          transform: { rotate: [0, 0.5, 0] },
          children: [{ id: 'rotor', shape: 'cone', motion: [{ verb: 'spin', axis: 'y', period: 1000 }] }],
        },
      ]),
    );
    const root = tl.at(250).elements[0];
    expect(root.id).toBe('housing');
    expect(root.transform.rotate[1]).toBeCloseTo(0.5, 6); // housing keeps its own LOCAL tilt
    expect(root.children).toHaveLength(1);
    const rotor = root.children[0];
    expect(rotor.id).toBe('rotor');
    // The rotor's spin is LOCAL (π/2 at quarter period) — NOT pre-composed with the housing tilt.
    expect(rotor.transform.rotate[1]).toBeCloseTo(Math.PI / 2, 6);
  });

  it('a leaf and an svg element report an empty children array', () => {
    const built = timeline(scene([el('a')]));
    expect(built.at(0).elements[0].children).toEqual([]);
  });

  it('composes reveal DOWN the tree — a group revealing gates its children (Munger #3)', () => {
    const tl = timeline(scene([{ id: 'g', shape: 'group', motion: [{ verb: 'reveal', at: 0, span: 1 }], children: [{ id: 'c', shape: 'box' }] }]));
    const s = tl.at(500); // group reveal 0.5 → child effective = own(1) × parent(0.5)
    expect(s.elements[0].reveal).toBeCloseTo(0.5, 6);
    expect(s.elements[0].children[0].reveal).toBeCloseTo(0.5, 6);
    // Fully-present branches are unaffected (×1).
    expect(timeline(scene([el('a')])).at(500).elements[0].reveal).toBe(1);
  });

  it('composes reveal 3 levels deep (multiplicative)', () => {
    const tl = timeline(
      scene([{ id: 'g', shape: 'group', motion: [{ verb: 'reveal', at: 0, span: 1 }], children: [{ id: 'm', shape: 'group', children: [{ id: 'c', shape: 'box', motion: [{ verb: 'reveal', at: 0, span: 1 }] }] }] }]),
    );
    const s = tl.at(500); // g=0.5 ; m=1×0.5=0.5 ; c=0.5×0.5=0.25
    expect(s.elements[0].reveal).toBeCloseTo(0.5, 6);
    expect(s.elements[0].children[0].reveal).toBeCloseTo(0.5, 6);
    expect(s.elements[0].children[0].children[0].reveal).toBeCloseTo(0.25, 6);
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

  it('trace reveals the stroke like draw', () => {
    const tl = timeline({
      source: 'svg',
      duration: 1000,
      hero: 1,
      asset: 'a.svg',
      elements: [{ id: 'p', pathRef: 'p1', motion: [{ verb: 'trace', span: 1 }] }],
    });
    expect(tl.at(0).elements[0].reveal).toBeCloseTo(0, 6);
    expect(tl.at(1000).elements[0].reveal).toBeCloseTo(1, 6);
  });
});

describe('compile — timeline invariants', () => {
  const fixture = scene([el('a', { motion: [{ verb: 'spin', axis: 'y', period: 1000 }] })], { hero: 0.4 });

  it('clamps t to [0, duration]', () => {
    const tl = timeline(fixture);
    expect(tl.at(-100)).toEqual(tl.at(0));
    expect(tl.at(99999)).toEqual(tl.at(1000));
  });

  it('maps a non-finite clock to 0 (a bad rAF timestamp must not flood NaN)', () => {
    const tl = timeline(fixture);
    expect(tl.at(Number.NaN)).toEqual(tl.at(0));
    expect(tl.at(Number.POSITIVE_INFINITY)).toEqual(tl.at(1000));
    expect(tl.at(Number.NEGATIVE_INFINITY)).toEqual(tl.at(0));
  });

  it('passes the camera rotate into the snapshot', () => {
    const tl = timeline(scene([el('a')], { camera: { rotate: [0.1, 0.2, 0.3] } }));
    expect(tl.at(0).camera.rotate).toEqual([0.1, 0.2, 0.3]);
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

// ── SVG per-element channels (slice: SvgElement.transform + slide/highlight/emphasis) ──
const svgScene = (elements: unknown[], extra: Record<string, unknown> = {}): unknown => ({ source: 'svg', asset: 'a.svg', duration: 1000, hero: 1, elements, ...extra });
const svgEl = (id: string, extra: Record<string, unknown> = {}) => ({ id, pathRef: id, ...extra });

describe('compile — svg per-element channels', () => {
  it('slide moves the element IN from its `from` offset to 0 over the window', () => {
    const tl = timeline(svgScene([svgEl('a', { motion: [{ verb: 'slide', from: [40, -20] }] })]));
    expect(tl.at(0).elements[0].transform.at[0]).toBeCloseTo(40, 6); // fully displaced at t0
    expect(tl.at(0).elements[0].transform.at[1]).toBeCloseTo(-20, 6);
    expect(tl.at(500).elements[0].transform.at[0]).toBeCloseTo(20, 6); // half-way in (linear)
    expect(tl.at(1000).elements[0].transform.at[0]).toBeCloseTo(0, 6); // arrived
    expect(tl.at(1000).elements[0].transform.at[1]).toBeCloseTo(0, 6);
  });

  it('slide composes onto a base transform — arrives AT the base position', () => {
    const tl = timeline(svgScene([svgEl('a', { transform: { at: [100, 0, 0] }, motion: [{ verb: 'slide', from: [40, 0] }] })]));
    expect(tl.at(0).elements[0].transform.at[0]).toBeCloseTo(140, 6); // base + full offset
    expect(tl.at(1000).elements[0].transform.at[0]).toBeCloseTo(100, 6); // settled at the base
  });

  it('highlight raises emphasis over its window and HOLDS at 1 (persists into the poster)', () => {
    const tl = timeline(svgScene([svgEl('a', { motion: [{ verb: 'highlight', at: 0.5, span: 0.5 }] })]));
    expect(tl.at(0).elements[0].emphasis).toBeCloseTo(0, 6); // before the window
    expect(tl.at(750).elements[0].emphasis).toBeCloseTo(0.5, 6); // half-way through [0.5,1]
    expect(tl.at(1000).elements[0].emphasis).toBeCloseTo(1, 6); // full, and held past the window
  });

  it('emphasis defaults to 0 and reveal to 1 when nothing drives them', () => {
    const st = timeline(svgScene([svgEl('a')])).at(500).elements[0];
    expect(st.emphasis).toBe(0);
    expect(st.reveal).toBe(1);
  });

  it('reveal on an svg element fades presence 0→1 over the window', () => {
    const tl = timeline(svgScene([svgEl('a', { motion: [{ verb: 'reveal', at: 0, span: 1 }] })]));
    expect(tl.at(0).elements[0].reveal).toBeCloseTo(0, 6);
    expect(tl.at(500).elements[0].reveal).toBeCloseTo(0.5, 6);
    expect(tl.at(1000).elements[0].reveal).toBeCloseTo(1, 6);
  });

  it('an svg base transform threads scale + rotate.z into the ElementState', () => {
    const st = timeline(svgScene([svgEl('a', { transform: { at: [5, 6, 0], scale: 1.5, rotate: [0, 0, 0.3] } })])).at(0).elements[0];
    expect(st.transform.at[0]).toBeCloseTo(5, 6);
    expect(st.transform.at[1]).toBeCloseTo(6, 6);
    expect(st.transform.scale).toBeCloseTo(1.5, 6);
    expect(st.transform.rotate[2]).toBeCloseTo(0.3, 6);
  });
});

describe('compile — highlight holds past its window (poster guarantee)', () => {
  it('emphasis stays at full PAST the window end, so a pre-hero highlight shows in the poster', () => {
    // window [0.3, 0.6]; the hero (progress 1) is PAST it — the hold must keep emphasis at 1.
    const tl = timeline(svgScene([svgEl('a', { motion: [{ verb: 'highlight', at: 0.3, span: 0.3 }] })]));
    expect(tl.at(600).elements[0].emphasis).toBeCloseTo(1, 6); // at the window end
    expect(tl.at(1000).elements[0].emphasis).toBeCloseTo(1, 6); // PAST the window — held, not decayed
    expect(tl.poster().elements[0].emphasis).toBeCloseTo(1, 6); // hero=1 → the still shows emphasis
  });
});
