// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { type DeckMotion, hasAnimatableChart, parseDeckMotion, resolveMotion, speedToDurationMs } from './anima-host-sel';

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
  it('maps Play on/off (+ friendly aliases)', () => {
    expect(parseDeckMotion('on').play).toBe('on');
    expect(parseDeckMotion('yes').play).toBe('on');
    expect(parseDeckMotion('off').play).toBe('off');
    expect(parseDeckMotion('none').play).toBe('off');
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
  it('a slide style/speed token turns Play ON and overrides per-axis', () => {
    expect(resolveMotion(section('funnel motion-rise motion-fast'), OFF)).toEqual({ style: 'rise', speed: 'fast' });
    // inherits the deck style, overrides only speed
    expect(resolveMotion(section('funnel motion-fast'), DECK_ON('together'))).toEqual({ style: 'together', speed: 'fast' });
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
});
