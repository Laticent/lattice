import { describe, expect, it } from 'vitest';
import { parseScene, usedVerbs, validateColor } from './schema';

const built = {
  source: 'built',
  duration: 6000,
  hero: 0.4,
  camera: { rotate: [-0.3, 0.6, 0] },
  elements: [{ id: 'rotor', shape: 'cone', color: 'var(--accent)', motion: [{ verb: 'spin', axis: 'y', period: 6000 }] }],
};

const svg = {
  source: 'svg',
  duration: 4000,
  hero: 1,
  asset: 'route.svg',
  elements: [{ id: 'path', pathRef: 'p1', color: 'var(--accent)', motion: [{ verb: 'draw', span: 1 }] }],
};

describe('parseScene — accepts', () => {
  it('a well-formed built scene', () => {
    const r = parseScene(built);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.scene.source).toBe('built');
  });
  it('a well-formed svg scene', () => {
    const r = parseScene(svg);
    expect(r.ok).toBe(true);
  });
  it('reports the verbs a scene uses', () => {
    const r = parseScene(built);
    if (r.ok) expect(usedVerbs(r.scene)).toEqual(['spin']);
  });
  it('a nested built tree (a group with children)', () => {
    const r = parseScene({ ...built, elements: [{ id: 'g', shape: 'group', children: [{ id: 'c', shape: 'cone', motion: [{ verb: 'spin', axis: 'y', period: 1000 }] }] }] });
    expect(r.ok).toBe(true);
  });
});

describe('parseScene — rejects', () => {
  const bad = (patch: Record<string, unknown>, elements?: unknown) => parseScene({ ...built, ...patch, ...(elements ? { elements } : {}) });

  it('an unknown source', () => expect(bad({ source: 'webgl' }).ok).toBe(false));
  it('a non-positive duration', () => expect(bad({ duration: 0 }).ok).toBe(false));
  it('hero out of [0,1]', () => {
    expect(bad({ hero: 1.5 }).ok).toBe(false);
    expect(bad({ hero: -0.1 }).ok).toBe(false);
  });
  it('empty elements', () => expect(bad({}, []).ok).toBe(false));
  it('an unknown primitive', () => expect(bad({}, [{ id: 'a', shape: 'sphere' }]).ok).toBe(false));
  it('a duplicate id', () =>
    expect(
      bad({}, [
        { id: 'a', shape: 'box' },
        { id: 'a', shape: 'box' },
      ]).ok,
    ).toBe(false));
  it('a draw verb in a built scene (source/verb mismatch)', () => expect(bad({}, [{ id: 'a', shape: 'box', motion: [{ verb: 'draw' }] }]).ok).toBe(false));
  it('a spin verb in an svg scene (source/verb mismatch)', () => {
    const r = parseScene({ ...svg, elements: [{ id: 'p', pathRef: 'p1', motion: [{ verb: 'spin', axis: 'y', period: 1000 }] }] });
    expect(r.ok).toBe(false);
  });
  it('a spin with a non-positive period', () => expect(bad({}, [{ id: 'a', shape: 'box', motion: [{ verb: 'spin', axis: 'y', period: 0 }] }]).ok).toBe(false));
  it('a fill level out of [0,1]', () => expect(bad({}, [{ id: 'a', shape: 'box', motion: [{ verb: 'fill', to: 2 }] }]).ok).toBe(false));
  it('a negative explode distance', () => expect(bad({}, [{ id: 'a', shape: 'box', motion: [{ verb: 'explode', distance: -1 }] }]).ok).toBe(false));
  it('a built element carrying a pathRef (cross-shape field)', () => expect(bad({}, [{ id: 'a', shape: 'box', pathRef: 'p1' }]).ok).toBe(false));
  it('an svg element carrying a built-only field (shape)', () => {
    expect(parseScene({ ...svg, elements: [{ id: 'p', pathRef: 'p1', shape: 'box' }] }).ok).toBe(false);
  });
  it('an svg element with a valid 2-D transform (now allowed — the slide/base-transform channel)', () => {
    expect(parseScene({ ...svg, elements: [{ id: 'p', pathRef: 'p1', transform: { at: [10, -4, 0], scale: 1.2 } }] }).ok).toBe(true);
  });
  it('an svg element with an INVALID transform is still rejected', () => {
    expect(parseScene({ ...svg, elements: [{ id: 'p', pathRef: 'p1', transform: { at: [1, 0] } }] }).ok).toBe(false);
    expect(parseScene({ ...svg, elements: [{ id: 'p', pathRef: 'p1', transform: { scale: 'big' } }] }).ok).toBe(false);
  });
  it('an svg slide verb needs a [dx,dy] from', () => {
    expect(parseScene({ ...svg, elements: [{ id: 'p', pathRef: 'p1', motion: [{ verb: 'slide', from: [40, 0] }] }] }).ok).toBe(true);
    expect(parseScene({ ...svg, elements: [{ id: 'p', pathRef: 'p1', motion: [{ verb: 'slide' }] }] }).ok).toBe(false);
    expect(parseScene({ ...svg, elements: [{ id: 'p', pathRef: 'p1', motion: [{ verb: 'slide', from: [1, 2, 3] }] }] }).ok).toBe(false);
  });
  it('an svg highlight verb validates its window; reveal is now valid in svg', () => {
    expect(parseScene({ ...svg, elements: [{ id: 'p', pathRef: 'p1', motion: [{ verb: 'highlight', at: 0.5, span: 0.3 }] }] }).ok).toBe(true);
    expect(parseScene({ ...svg, elements: [{ id: 'p', pathRef: 'p1', motion: [{ verb: 'highlight', at: 2 }] }] }).ok).toBe(false);
    expect(parseScene({ ...svg, elements: [{ id: 'p', pathRef: 'p1', motion: [{ verb: 'reveal' }] }] }).ok).toBe(true);
  });
  it('slide/highlight in a BUILT scene are rejected (svg-only)', () => {
    expect(bad({}, [{ id: 'a', shape: 'box', motion: [{ verb: 'slide', from: [1, 1] }] }]).ok).toBe(false);
    expect(bad({}, [{ id: 'a', shape: 'box', motion: [{ verb: 'highlight' }] }]).ok).toBe(false);
  });
  it('an svg scene with no asset', () => {
    const noAsset = { source: 'svg', duration: 4000, hero: 1, elements: [{ id: 'p', pathRef: 'p1', motion: [{ verb: 'draw' }] }] };
    expect(parseScene(noAsset).ok).toBe(false);
  });
  it('a sub-1ms rotation period (overflows compile)', () => expect(bad({}, [{ id: 'a', shape: 'box', motion: [{ verb: 'spin', axis: 'y', period: 0.5 }] }]).ok).toBe(false));
  it('a camera on an svg scene (built-only field)', () => expect(parseScene({ ...svg, camera: { rotate: [0, 0, 0] } }).ok).toBe(false));
  it('an asset on a built scene (svg-only field)', () => expect(bad({ asset: 'x.svg' }).ok).toBe(false));
  it('an svg element with children (svg scenes are flat)', () => expect(parseScene({ ...svg, elements: [{ id: 'p', pathRef: 'p1', children: [] }] }).ok).toBe(false));
  it('a duplicate id across the nested tree', () => expect(bad({}, [{ id: 'a', shape: 'group', children: [{ id: 'a', shape: 'box' }] }]).ok).toBe(false));
  it('a polygon with sides < 3 or non-integer (crashes the renderer otherwise)', () => {
    expect(bad({}, [{ id: 'a', shape: 'polygon', props: { sides: 2 } }]).ok).toBe(false);
    expect(bad({}, [{ id: 'a', shape: 'polygon', props: { sides: 0 } }]).ok).toBe(false);
    expect(bad({}, [{ id: 'a', shape: 'polygon', props: { sides: 5.5 } }]).ok).toBe(false);
    expect(bad({}, [{ id: 'a', shape: 'polygon', props: { sides: 5000 } }]).ok).toBe(false); // upper cap (DoS)
  });
  it('accepts an integer sides >= 3', () => expect(bad({}, [{ id: 'a', shape: 'polygon', props: { sides: 6, size: 30 } }]).ok).toBe(true));

  it('rejects an over-deep element tree — DROPS, never overflows the stack (trio DoS)', () => {
    // A children chain far past MAX_TREE_DEPTH (32). Unbounded, this would RangeError out of
    // parseScene; bounded, it's an ordinary validation failure that a caller can drop.
    let node: Record<string, unknown> = { id: 'leaf', shape: 'box' };
    for (let i = 0; i < 500; i++) node = { id: `g${i}`, shape: 'group', children: [node] };
    let r: ReturnType<typeof parseScene> | undefined;
    expect(() => {
      r = parseScene({ source: 'built', duration: 1000, hero: 0.5, elements: [node] });
    }).not.toThrow();
    expect(r?.ok).toBe(false);
    if (r && !r.ok) expect(r.errors.join(' ')).toMatch(/nesting depth/i);
  });

  it('rejects a scene past the max element count (breadth DoS)', () => {
    const elements = Array.from({ length: 2100 }, (_, i) => ({ id: `e${i}`, shape: 'box' }));
    const r = parseScene({ source: 'built', duration: 1000, hero: 0.5, elements });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors.join(' ')).toMatch(/element count/i);
  });
});

describe('validateColor', () => {
  it('accepts a token ref and a token fallback', () => {
    expect(validateColor('var(--accent)')).toBeNull();
    expect(validateColor('var(--accent, var(--fg))')).toBeNull();
  });
  it('rejects hex, url(), and markup', () => {
    expect(validateColor('#c20000')).not.toBeNull();
    expect(validateColor('var(--x); background: url(http://evil)')).not.toBeNull();
    expect(validateColor('red')).not.toBeNull();
    expect(validateColor(42)).not.toBeNull();
  });
});
