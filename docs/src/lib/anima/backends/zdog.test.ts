// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { compile } from '../compile';
import { parseScene } from '../schema';
import { zdogRenderer } from './zdog';

const SCENE = {
  source: 'built',
  duration: 1000,
  hero: 0.5,
  elements: [
    {
      id: 'housing',
      shape: 'group',
      transform: { rotate: [0, 0.3, 0] },
      children: [{ id: 'rotor', shape: 'cone', color: 'var(--accent)', props: { diameter: 40, length: 40 }, motion: [{ verb: 'spin', axis: 'y', period: 1000 }] }],
    },
    { id: 'base', shape: 'box', props: { width: 60, height: 20, depth: 60 } },
  ],
};

function mounted(input: unknown = SCENE) {
  const r = parseScene(input);
  if (!r.ok) throw new Error(r.errors.join('; '));
  const tl = compile(r.scene);
  const host = document.createElement('div');
  const renderer = zdogRenderer({ size: 200 });
  renderer.mount(host, r.scene);
  return { renderer, tl, host };
}

describe('zdogRenderer', () => {
  it('mounts an <svg> and renders paths for the scene', () => {
    const { renderer, tl, host } = mounted();
    renderer.draw(tl.at(250));
    const svg = host.querySelector('svg');
    expect(svg).not.toBeNull();
    expect(svg?.querySelectorAll('path').length).toBeGreaterThan(0);
  });

  it('poster() returns a serialized svg string of the right size', () => {
    const { renderer, tl } = mounted();
    const poster = renderer.poster(tl.poster());
    expect(poster.svg).toContain('<svg');
    expect(poster.width).toBe(200);
    expect(poster.height).toBe(200);
  });

  it('the poster is deterministic (same state → identical svg)', () => {
    const a = mounted();
    const b = mounted();
    expect(a.renderer.poster(a.tl.poster()).svg).toBe(b.renderer.poster(b.tl.poster()).svg);
  });

  it('dispose() removes the surface', () => {
    const { renderer, host } = mounted();
    renderer.dispose();
    expect(host.querySelector('svg')).toBeNull();
  });

  it('applies the scene camera (a camera change alters the render)', () => {
    const base = { source: 'built', duration: 1000, hero: 0.5, elements: [{ id: 'a', shape: 'box', props: { width: 40, height: 40, depth: 40 } }] };
    const a = mounted({ ...base, camera: { rotate: [0, 0, 0] } });
    const b = mounted({ ...base, camera: { rotate: [0.6, 0.6, 0] } });
    expect(a.renderer.poster(a.tl.poster()).svg).not.toBe(b.renderer.poster(b.tl.poster()).svg);
  });

  it('advertises a vector, poster-capable, built-source engine', () => {
    const { renderer } = mounted();
    expect(renderer.caps).toMatchObject({ vector: true, poster: true, draw: false, source: ['built'] });
  });
});
