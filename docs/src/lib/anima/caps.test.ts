import { describe, expect, it } from 'vitest';
import { canRender, negotiate, type RendererCaps, requiredCaps } from './caps';
import { parseScene } from './schema';
import type { Scene } from './types';

function scene(input: unknown): Scene {
  const r = parseScene(input);
  if (!r.ok) throw new Error(r.errors.join('; '));
  return r.scene;
}

const ZDOG: RendererCaps = { vector: true, poster: true, draw: false, true3d: false, gltf: false, live: true, source: ['built'] };
const VIVUS: RendererCaps = { vector: true, poster: true, draw: true, true3d: false, gltf: false, live: true, source: ['svg'] };
const THREE: RendererCaps = { vector: false, poster: false, draw: false, true3d: true, gltf: true, live: true, source: ['built'] };

const builtSpin = scene({ source: 'built', duration: 1000, hero: 0.5, elements: [{ id: 'a', shape: 'cone', motion: [{ verb: 'spin', axis: 'y', period: 1000 }] }] });
const svgDraw = scene({ source: 'svg', duration: 1000, hero: 1, asset: 'a.svg', elements: [{ id: 'p', pathRef: 'p1', motion: [{ verb: 'draw' }] }] });

describe('requiredCaps', () => {
  it('a built/transform scene needs no draw', () => {
    expect(requiredCaps(builtSpin)).toEqual({ source: 'built', draw: false });
  });
  it('an svg draw scene needs draw + the svg source', () => {
    expect(requiredCaps(svgDraw)).toEqual({ source: 'svg', draw: true });
  });
});

describe('negotiate', () => {
  it('Zdog renders a built scene', () => {
    expect(negotiate(builtSpin, ZDOG)).toEqual([]);
    expect(canRender(builtSpin, ZDOG)).toBe(true);
  });
  it('Zdog cannot render an svg scene (source model mismatch)', () => {
    const errs = negotiate(svgDraw, ZDOG);
    expect(errs.length).toBeGreaterThan(0);
    expect(canRender(svgDraw, ZDOG)).toBe(false);
  });
  it('Vivus renders an svg draw scene', () => {
    expect(negotiate(svgDraw, VIVUS)).toEqual([]);
  });
  it('Three (build, raster) renders a built scene — poster capability is a separate concern', () => {
    expect(negotiate(builtSpin, THREE)).toEqual([]);
  });
  it('a draw scene is rejected by a build-only engine that lacks the draw capability', () => {
    const errs = negotiate(svgDraw, { ...THREE, source: ['svg'] }); // pretend it took svg but has no draw
    expect(errs.join(' ')).toMatch(/draw/);
  });
});
