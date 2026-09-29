// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { type DeckMotion, hasAnimatableChart, isMermaidSvg, motionMarkCount, PREHIDE_CLASS, parseDeckMotion, prehideEligibleCharts, resolveMotion, revealPrehiddenCharts, speedToDurationMs } from './anima-host-sel';

const section = (className: string, inner = ''): Element => {
  const s = document.createElement('section');
  s.className = className;
  s.innerHTML = inner;
  return s;
};
const CHART = '<div class="funnel-figure"><svg><polygon data-mark="0" data-anima-role="bar"/></svg></div>';
const OFF: DeckMotion = { play: null, style: null, speed: null };
const DECK_ON = (style: DeckMotion['style'] = null, speed: DeckMotion['speed'] = null): DeckMotion => ({ play: 'on', style, speed });

describe('parseDeckMotion — the three front-matter keys', () => {
  it('maps Play on/off literally — no magic aliases (parity with the Studio control)', () => {
    expect(parseDeckMotion('on').play).toBe('on');
    expect(parseDeckMotion('off').play).toBe('off');
    // `yes`/`true`/`none`/`false` are NOT accepted — only the literal on/off tokens.
    expect(parseDeckMotion('yes').play).toBeNull();
    expect(parseDeckMotion('true').play).toBeNull();
    expect(parseDeckMotion('none').play).toBeNull();
    expect(parseDeckMotion('false').play).toBeNull();
    expect(parseDeckMotion(undefined).play).toBeNull();
    expect(parseDeckMotion('wat').play).toBeNull();
  });
  it('reads style + speed independently', () => {
    const d = parseDeckMotion('on', 'rise', 'fast');
    expect(d).toEqual({ play: 'on', style: 'rise', speed: 'fast' });
    expect(parseDeckMotion('on', 'bogus', 'bogus')).toEqual({ play: 'on', style: null, speed: null });
  });
});

describe('resolveMotion — Play / Style / Speed cascade', () => {
  it('Play off (deck + no slide token) → null', () => {
    expect(resolveMotion(section('funnel'), OFF)).toBeNull();
    expect(resolveMotion(section('funnel'), { play: 'off', style: 'rise', speed: 'fast' })).toBeNull();
  });
  it('deck Play on → a class-less chart resolves to the deck style/speed', () => {
    expect(resolveMotion(section('funnel'), DECK_ON('together', 'slow'))).toEqual({ style: 'together', speed: 'slow' });
  });
  it('deck Play on with no style/speed → built-in defaults (build, auto)', () => {
    expect(resolveMotion(section('funnel'), DECK_ON())).toEqual({ style: 'build', speed: 'auto' });
  });
  it('a bare style/speed token does NOT imply Play on (Play is the sole switch)', () => {
    // No Play token, deck Play off/unset → the style/speed tokens are inert.
    expect(resolveMotion(section('funnel motion-rise motion-fast'), OFF)).toBeNull();
    expect(resolveMotion(section('funnel motion-fast'), OFF)).toBeNull();
  });
  it('style/speed tokens override per-axis when Play resolves on', () => {
    // deck Play on → the slide overrides both axes
    expect(resolveMotion(section('funnel motion-rise motion-fast'), DECK_ON())).toEqual({ style: 'rise', speed: 'fast' });
    // inherits the deck style, overrides only speed
    expect(resolveMotion(section('funnel motion-fast'), DECK_ON('together'))).toEqual({ style: 'together', speed: 'fast' });
    // an explicit motion-on turns the slide on and carries its own style/speed even when deck Play is off
    expect(resolveMotion(section('funnel motion-on motion-rise motion-fast'), OFF)).toEqual({ style: 'rise', speed: 'fast' });
  });
  it('motion-off suppresses even under deck Play on', () => {
    expect(resolveMotion(section('funnel motion-off'), DECK_ON('rise'))).toBeNull();
  });
  it('motion-on enables a slide with deck defaults when the deck Play is off', () => {
    expect(resolveMotion(section('funnel motion-on'), { play: 'off', style: 'rise', speed: 'fast' })).toEqual({ style: 'rise', speed: 'fast' });
  });
  it('legacy chart-anima → Play on, build', () => {
    expect(resolveMotion(section('funnel chart-anima'), OFF)).toEqual({ style: 'build', speed: 'auto' });
  });
});

describe('speedToDurationMs', () => {
  it('fixed speeds are constant', () => {
    expect(speedToDurationMs('slow', 4)).toBe(5400);
    expect(speedToDurationMs('normal', 4)).toBe(3600);
    expect(speedToDurationMs('fast', 4)).toBe(2000);
  });
  it('auto scales with mark count, clamped', () => {
    expect(speedToDurationMs('auto', 3)).toBeGreaterThan(speedToDurationMs('auto', 1));
    expect(speedToDurationMs('auto', 100)).toBeLessThanOrEqual(5400);
    expect(speedToDurationMs('auto', 0)).toBeGreaterThanOrEqual(2400);
  });
});

describe('hasAnimatableChart', () => {
  it('true for a section holding an svg with roled marks', () => {
    expect(hasAnimatableChart(section('funnel', CHART))).toBe(true);
  });
  it('false for a chart-less section', () => {
    expect(hasAnimatableChart(section('content', '<p>hi</p>'))).toBe(false);
  });
  it('true for a Mermaid diagram — roles, no `data-mark`', () => {
    expect(hasAnimatableChart(section('', DIAGRAM))).toBe(true);
  });
  it('true for a chart with roles but no data-mark — a plain line chart with no detail bullets', () => {
    const line = '<div class="line-figure"><svg><path data-anima-role="line"/><circle data-anima-role="point"/></svg></div>';
    expect(hasAnimatableChart(section('line', line))).toBe(true);
    expect(motionMarkCount(section('line', line))).toBe(2);
  });
  it('false for an svg whose only roles are labels — nothing to build', () => {
    const labels = '<div class="line-figure"><svg><text data-anima-role="label">Q1</text></svg></div>';
    expect(hasAnimatableChart(section('line', labels))).toBe(false);
  });
  it('false for an untagged Mermaid diagram (a family we do not animate)', () => {
    expect(hasAnimatableChart(section('', '<div class="mermaid"><svg><g class="task"><rect/></g></svg></div>'))).toBe(false);
  });
});

const DIAGRAM =
  '<pre data-lattice-hydrate="mermaid" data-lattice-settle="rendered"></pre><div class="mermaid"><svg>' +
  '<g data-anima-role="bar" data-anima-order="1"><rect/></g><g data-anima-role="bar" data-anima-order="1"><rect/></g>' +
  '<path data-anima-role="bar" data-anima-order="2"/><g data-anima-role="label"><text>yes</text></g></svg></div>';

describe('motionMarkCount — the auto speed\'s pacing input', () => {
  it('counts a chart\'s data-mark indices, exactly as before', () => {
    expect(motionMarkCount(section('funnel', CHART))).toBe(1);
  });
  it('counts a diagram\'s non-label roles, since it has no data-mark', () => {
    expect(motionMarkCount(section('', DIAGRAM))).toBe(3);
  });
});

describe('isMermaidSvg', () => {
  it('true inside the runtime\'s div.mermaid host; false for a chart', () => {
    expect(isMermaidSvg(section('', DIAGRAM).querySelector('svg') as Element)).toBe(true);
    expect(isMermaidSvg(section('funnel', CHART).querySelector('svg') as Element)).toBe(false);
  });
});

describe('prehideEligibleCharts / revealPrehiddenCharts — the flash pre-hide', () => {
  const root = (...sections: Element[]): Element => {
    const d = document.createElement('div');
    for (const s of sections) d.appendChild(s);
    return d;
  };
  const figureOf = (s: Element) => s.querySelector('.funnel-figure') as HTMLElement;

  it('hides an EXPLICIT motion-on chart figure (not the section)', () => {
    const s = section('motion-on', CHART);
    const r = root(s);
    const hidden = prehideEligibleCharts(r, OFF);
    expect(figureOf(s).classList.contains(PREHIDE_CLASS)).toBe(true);
    expect(s.classList.contains(PREHIDE_CLASS)).toBe(false); // the FIGURE, never the section
    expect(hidden).toContain(figureOf(s));
  });

  it('leaves a motion-OFF chart and a chart-less section visible', () => {
    const off = section('motion-off', CHART);
    const plain = section('content', '<p>hi</p>');
    prehideEligibleCharts(root(off, plain), DECK_ON()); // even deck Play on: motion-off resolves null
    expect(figureOf(off).classList.contains(PREHIDE_CLASS)).toBe(false);
  });

  it('deck-wide Play on hides a CLASS-LESS chart section', () => {
    const s = section('', CHART); // no per-slide token
    prehideEligibleCharts(root(s), DECK_ON());
    expect(figureOf(s).classList.contains(PREHIDE_CLASS)).toBe(true);
  });

  it('NEVER re-hides an already-mounted (.anima-live) figure — the re-hide-after-reveal stranding guard', () => {
    const s = section('motion-on', CHART);
    figureOf(s).classList.add('anima-live'); // simulate: it already mounted + revealed
    const hidden = prehideEligibleCharts(root(s), OFF);
    expect(figureOf(s).classList.contains(PREHIDE_CLASS)).toBe(false); // a rebind must not re-hide it
    expect(hidden).toHaveLength(0);
  });

  it('reveal clears every pre-hide (the host-never-ran fallback)', () => {
    const s = section('motion-on', CHART);
    const r = root(s);
    prehideEligibleCharts(r, OFF);
    expect(figureOf(s).classList.contains(PREHIDE_CLASS)).toBe(true);
    revealPrehiddenCharts(r);
    expect(figureOf(s).classList.contains(PREHIDE_CLASS)).toBe(false);
  });
});

describe('a plain line chart is a motion target (the real engine, not a fixture)', () => {
  it('the rendered line sample — no detail bullets, so no data-mark — is found and builds its lines', async () => {
    const { readFileSync } = await import('node:fs');
    const { join, resolve } = await import('node:path');
    const { createRequire } = await import('node:module');
    const { chartToScene } = await import('@/lib/chart-anima');
    const root = resolve(__dirname, '../../..');
    const req = createRequire(join(root, 'package.json'));
    const engine = req('./lib/engine');
    const { sample } = JSON.parse(readFileSync(join(root, 'lib/components/chart/line/line.manifest.json'), 'utf8'));
    const html = engine.render(`---\nmarp: true\n---\n\n${sample}`, 'indaco', { preview: true }).html;
    const doc = new DOMParser().parseFromString(html, 'text/html');
    const sec = Array.from(doc.querySelectorAll('section')).find((s) => s.querySelector('svg.line-svg'));
    expect(sec, 'the sample renders a line chart').toBeTruthy();
    expect(sec?.querySelector('svg [data-mark]'), 'the fixture must have no data-mark, or it proves nothing').toBeNull();
    expect(hasAnimatableChart(sec as Element)).toBe(true);
    const built = chartToScene((sec?.querySelector('svg') as Element).outerHTML);
    // chartToScene has no `line` role, so each series path builds as a `bar` (reveal), then its points.
    const count = (role: string) => built?.roles.filter((r) => r.role === role).length;
    expect(count('bar')).toBe(3); // Enterprise, Mid-market, Services
    expect(count('point')).toBe(18); // 3 series × 6 quarters
  });
});
