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

  it('is idempotent: re-mounting leaves exactly one svg (no leak)', () => {
    const { renderer, host } = mounted();
    const r2 = parseScene(SCENE);
    if (r2.ok) renderer.mount(host, r2.scene, { diagram: MARKUP });
    expect(host.querySelectorAll('svg').length).toBe(1);
  });

  it('parses inertly + strips a script/on* handler from untrusted markup (defense-in-depth)', () => {
    const evil = '<svg viewBox="0 0 10 10"><script>window.__x=1</script><path id="p1" onload="window.__x=1" d="M0 0 H10" stroke="#000"/></svg>';
    const r = parseScene({ source: 'svg', duration: 1000, hero: 1, asset: 'e', elements: [{ id: 'a', pathRef: 'p1', motion: [{ verb: 'draw' }] }] });
    if (!r.ok) throw new Error(r.errors.join('; '));
    const host = document.createElement('div');
    vivusRenderer().mount(host, r.scene, { e: evil });
    expect(host.querySelector('script')).toBeNull();
    expect(host.querySelector('#p1')?.getAttribute('onload')).toBeNull();
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

// ── Per-element paint (slice: transform/opacity/emphasis) — runs in jsdom even though Vivus
//    (stroke-draw) can't init here, because paintElements is attribute-only. ────────────────
const PAINT_MARKUP =
  '<svg viewBox="0 0 100 60">' +
  '<path id="d" d="M0 0 H10" stroke="#000" stroke-width="2" fill="none"/>' +
  '<text id="l" x="5" y="5">Hi</text>' +
  '<rect id="s" x="0" y="0" width="4" height="4"/>' +
  '<path id="h" d="M0 0 H10" stroke="#000" stroke-width="1.5" fill="none"/>' +
  '</svg>';
const PAINT_SCENE = {
  source: 'svg',
  duration: 1000,
  hero: 1,
  asset: 'm',
  elements: [
    { id: 'd', pathRef: 'd', motion: [{ verb: 'draw', span: 1 }] }, // stroke-drawn (not faded)
    { id: 'l', pathRef: 'l', motion: [{ verb: 'reveal', at: 0, span: 1 }] }, // fade via opacity
    { id: 's', pathRef: 's', motion: [{ verb: 'slide', from: [40, 0], at: 0, span: 1 }] }, // transform
    { id: 'h', pathRef: 'h', motion: [{ verb: 'highlight', at: 0, span: 1 }] }, // emphasis
  ],
};

describe('vivusRenderer — per-element paint', () => {
  it('fades a reveal-only part via opacity (0→1), not a stroke', () => {
    const { renderer, tl, host } = mounted(PAINT_SCENE, { m: PAINT_MARKUP });
    renderer.draw(tl.at(0));
    expect(Number(host.querySelector('#l')?.getAttribute('opacity'))).toBeCloseTo(0, 3);
    renderer.draw(tl.at(1000));
    expect(Number(host.querySelector('#l')?.getAttribute('opacity'))).toBeCloseTo(1, 3);
  });

  it('slides a part in via a transform translate, arriving at 0', () => {
    const { renderer, tl, host } = mounted(PAINT_SCENE, { m: PAINT_MARKUP });
    renderer.draw(tl.at(0));
    expect(host.querySelector('#s')?.getAttribute('transform')).toContain('translate(40 0)');
    renderer.draw(tl.at(1000));
    expect(host.querySelector('#s')?.getAttribute('transform')).toContain('translate(0 0)');
  });

  it('bumps stroke-weight on a highlighted part, holding at full emphasis', () => {
    const { renderer, tl, host } = mounted(PAINT_SCENE, { m: PAINT_MARKUP });
    renderer.draw(tl.at(0));
    expect(Number(host.querySelector('#h')?.getAttribute('stroke-width'))).toBeCloseTo(1.5, 3); // base
    renderer.draw(tl.at(1000));
    expect(Number(host.querySelector('#h')?.getAttribute('stroke-width'))).toBeCloseTo(1.5 * 1.9, 3); // +90%
  });

  it('does not paint opacity on a stroke-drawn (non-fade) part', () => {
    const { renderer, tl, host } = mounted(PAINT_SCENE, { m: PAINT_MARKUP });
    renderer.draw(tl.at(500));
    expect(host.querySelector('#d')?.getAttribute('opacity')).toBeNull();
  });

  it('bakes the per-element channels into the poster serialization', () => {
    const { renderer, tl } = mounted(PAINT_SCENE, { m: PAINT_MARKUP });
    const p = renderer.poster(tl.poster()); // hero = 1 → arrived, fully revealed, full emphasis
    expect(p.svg).toContain('opacity="1"');
    expect(p.svg).toContain('transform="translate(0 0)"');
  });
});
