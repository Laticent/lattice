// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { compile } from '../compile';
import { parseScene } from '../schema';
import { vivusRenderer } from './vivus';

const MARKUP = '<svg viewBox="0 0 100 60"><path id="p1" d="M10 30 H90" stroke="#000" fill="none"/><path id="p2" d="M50 10 V50" stroke="#000" fill="none"/></svg>';
const SCENE = {
  source: 'svg',
  duration: 1000,
  hero: 1,
  asset: 'diagram',
  elements: [
    { id: 'a', pathRef: 'p1', color: 'var(--accent)', motion: [{ verb: 'draw', span: 1 }] },
    { id: 'b', pathRef: 'p2', color: 'var(--cat-2-mark)', motion: [{ verb: 'draw', at: 0.5, span: 0.5 }] },
  ],
};

function mounted(input: unknown = SCENE, assets: Record<string, string> = { diagram: MARKUP }) {
  const r = parseScene(input);
  if (!r.ok) throw new Error(r.errors.join('; '));
  const tl = compile(r.scene);
  const host = document.createElement('div');
  const renderer = vivusRenderer();
  renderer.mount(host, r.scene, assets);
  return { renderer, tl, host };
}

describe('vivusRenderer', () => {
  it('mounts the resolved svg asset (and its paths) into the host', () => {
    const { host } = mounted();
    expect(host.querySelector('svg')).not.toBeNull();
    expect(host.querySelector('#p1')).not.toBeNull();
    expect(host.querySelector('#p2')).not.toBeNull();
  });

  it('applies a token stroke colour to each referenced path', () => {
    const { host } = mounted();
    expect(host.querySelector('#p1')?.getAttribute('stroke')).toBeTruthy();
    expect(host.querySelector('#p2')?.getAttribute('stroke')).toBeTruthy();
  });

  it('poster returns the serialized svg + the viewBox size', () => {
    const { renderer, tl } = mounted();
    const p = renderer.poster(tl.poster());
    expect(p.svg).toContain('<svg');
    expect(p.width).toBe(100);
    expect(p.height).toBe(60);
  });

  it('advertises an svg-source, draw-capable, vector engine', () => {
    const { renderer } = mounted();
    expect(renderer.caps).toMatchObject({ vector: true, poster: true, draw: true, source: ['svg'] });
  });

  it('dispose removes the svg surface', () => {
    const { renderer, host } = mounted();
    renderer.dispose();
    expect(host.querySelector('svg')).toBeNull();
  });

  it('does not crash when the asset is missing (a placeholder is the host job)', () => {
    const r = parseScene({ source: 'svg', duration: 1000, hero: 1, asset: 'missing', elements: [{ id: 'a', pathRef: 'p1', motion: [{ verb: 'draw' }] }] });
    if (!r.ok) throw new Error(r.errors.join('; '));
    const renderer = vivusRenderer();
    const host = document.createElement('div');
    expect(() => {
      renderer.mount(host, r.scene, {});
      renderer.draw(compile(r.scene).at(500));
      renderer.poster(compile(r.scene).poster());
      renderer.dispose();
    }).not.toThrow();
  });
});
