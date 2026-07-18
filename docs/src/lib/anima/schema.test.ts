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
  it('an svg element carrying a built-only field', () => {
    expect(parseScene({ ...svg, elements: [{ id: 'p', pathRef: 'p1', shape: 'box' }] }).ok).toBe(false);
    expect(parseScene({ ...svg, elements: [{ id: 'p', pathRef: 'p1', transform: { at: [1, 0, 0] } }] }).ok).toBe(false);
  });
  it('an svg scene with no asset', () => {
    const noAsset = { source: 'svg', duration: 4000, hero: 1, elements: [{ id: 'p', pathRef: 'p1', motion: [{ verb: 'draw' }] }] };
    expect(parseScene(noAsset).ok).toBe(false);
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
