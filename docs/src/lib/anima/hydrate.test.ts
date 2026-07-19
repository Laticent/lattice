import { afterEach, describe, expect, it } from 'vitest';
import { decodeSpec, effectiveTier, hasContinuousMotion, hydrateScene, rendererFor, toLegible, whollyVestibular } from './hydrate';
import { parseScene, usedVerbs } from './schema';
import type { Scene } from './types';

function scene(input: unknown): Scene {
  const r = parseScene(input);
  if (!r.ok) throw new Error(r.errors.join('; '));
  return r.scene;
}
const b64 = (o: unknown) => Buffer.from(JSON.stringify(o)).toString('base64');

const spinOnly = scene({ source: 'built', duration: 1000, hero: 0.5, elements: [{ id: 'a', shape: 'cone', motion: [{ verb: 'spin', axis: 'y', period: 1000 }] }] });
const spinAndReveal = scene({
  source: 'built', duration: 1000, hero: 0.5,
  elements: [
    { id: 'rig', shape: 'group', motion: [{ verb: 'spin', axis: 'y', period: 1000 }], children: [{ id: 'r', shape: 'cone', motion: [{ verb: 'orbit', axis: 'y', period: 500 }] }] },
    { id: 'base', shape: 'box', motion: [{ verb: 'reveal', at: 0, span: 0.4 }] },
  ],
});
const drawScene = scene({ source: 'svg', duration: 1000, hero: 1, asset: 'a', elements: [{ id: 'p', pathRef: 'p1', motion: [{ verb: 'draw' }] }] });

describe('whollyVestibular', () => {
  it('is true when every verb is spin/orbit, false when a meaning-bearing verb survives', () => {
    expect(whollyVestibular(spinOnly)).toBe(true);
    expect(whollyVestibular(spinAndReveal)).toBe(false); // reveal survives
    expect(whollyVestibular(drawScene)).toBe(false);
  });
});

describe('hasContinuousMotion', () => {
  it('true for spin/orbit (loop), false for one-shot draw/reveal', () => {
    expect(hasContinuousMotion(spinOnly)).toBe(true);
    expect(hasContinuousMotion(spinAndReveal)).toBe(true); // has spin/orbit
    expect(hasContinuousMotion(drawScene)).toBe(false);
  });
});

describe('effectiveTier — prefers-reduced-motion is an accessibility floor', () => {
  it('honors the declared tier when motion is not reduced', () => {
    expect(effectiveTier('still', false, spinAndReveal)).toBe('still');
    expect(effectiveTier('full', false, spinAndReveal)).toBe('full');
    expect(effectiveTier('legible', false, spinAndReveal)).toBe('legible');
    expect(effectiveTier('system', false, spinAndReveal)).toBe('full');
  });
  it('caps at legible under reduced motion, or still when nothing meaning-bearing survives', () => {
    expect(effectiveTier('full', true, spinAndReveal)).toBe('legible'); // author full → user floor
    expect(effectiveTier('system', true, spinAndReveal)).toBe('legible');
    expect(effectiveTier('full', true, spinOnly)).toBe('still'); // wholly vestibular → poster
    expect(effectiveTier('system', true, spinOnly)).toBe('still');
    expect(effectiveTier('still', true, spinAndReveal)).toBe('still'); // still stays still
  });
});

describe('toLegible — strip the vestibular verbs, keep the rest, deep + immutable', () => {
  it('removes spin/orbit anywhere in the tree (incl. nested children), keeps reveal', () => {
    const leg = toLegible(spinAndReveal);
    expect(usedVerbs(leg).sort()).toEqual(['reveal']); // nested orbit + top-level spin both gone
    // input untouched
    expect(usedVerbs(spinAndReveal).sort()).toEqual(['orbit', 'reveal', 'spin']);
  });
  it('leaves an svg draw scene unchanged (draw is meaning-bearing)', () => {
    expect(usedVerbs(toLegible(drawScene))).toEqual(['draw']);
  });
});

describe('decodeSpec', () => {
  it('decodes + validates a good base64 spec', () => {
    expect(decodeSpec(b64({ source: 'built', duration: 1000, hero: 0.5, elements: [{ id: 'a', shape: 'cone' }] }))?.source).toBe('built');
  });
  it('returns null on bad JSON, an invalid scene, or garbage base64', () => {
    expect(decodeSpec(Buffer.from('{ not json').toString('base64'))).toBeNull();
    expect(decodeSpec(b64({ source: 'built' }))).toBeNull(); // fails the schema (no duration/elements)
    expect(decodeSpec('%%%not-base64%%%')).toBeNull();
  });
  it('rejects an oversized spec BEFORE decoding it (client-DoS guard)', () => {
    expect(decodeSpec('A'.repeat(256 * 1024 + 1))).toBeNull();
  });
});

describe('rendererFor', () => {
  it('picks Zdog for a built scene and Vivus for an svg scene', () => {
    expect(rendererFor(spinOnly)?.caps.source).toContain('built');
    expect(rendererFor(drawScene)?.caps.source).toContain('svg');
  });
});

// The reduced-motion opt-in + control gating (Stage 6b). These cover the DECISION branches
// that never mount a backend (jsdom has no canvas); the interactive control transitions
// (click pause → resume → replay, and the opt-in click that mounts + plays) are exercised on
// the REAL Playground surface with a real Chromium — HARD RULE #23 (interaction is verified
// where a human actually touches it, not in a harness).
const spinOnlySpec = { source: 'built', duration: 1000, hero: 0.5, elements: [{ id: 'a', shape: 'cone', motion: [{ verb: 'spin', axis: 'y', period: 1000 }] }] };
const motionlessSpec = { source: 'built', duration: 1000, hero: 0.5, elements: [{ id: 'a', shape: 'cone' }] };

function makeSection(spec: unknown, motion?: string): HTMLElement {
  const section = document.createElement('section');
  section.className = 'scene';
  section.setAttribute('data-scene-spec', Buffer.from(JSON.stringify(spec)).toString('base64'));
  if (motion) section.setAttribute('data-scene-motion', motion);
  const figure = document.createElement('div');
  figure.className = 'scene-figure';
  figure.appendChild(document.createElementNS('http://www.w3.org/2000/svg', 'svg'));
  section.appendChild(figure);
  document.body.appendChild(section);
  return section;
}

describe('hydrateScene — reduced-motion opt-in + control gating (Stage 6b)', () => {
  afterEach(() => {
    document.body.innerHTML = '';
  });

  it('an author-declared `still` scene keeps the poster — no controller, no control', () => {
    const section = makeSection(spinOnlySpec, 'still');
    expect(hydrateScene(section, { reducedMotion: false })).toBeNull();
    expect(section.querySelector('.scene-control')).toBeNull();
    expect(section.getAttribute('data-scene-live')).toBeNull();
  });

  it('a floor-suppressed scene offers a "Play the motion" opt-in — poster kept, backend NOT yet mounted', () => {
    const section = makeSection(spinOnlySpec); // wholly vestibular → reduced motion floors it to still
    const c = hydrateScene(section, { reducedMotion: true, eager: true });
    expect(c).not.toBeNull();
    const btn = section.querySelector('.scene-control') as HTMLElement;
    expect(btn?.dataset.mode).toBe('optin');
    expect(btn.getAttribute('aria-label')).toBe('Play the motion');
    expect(btn.textContent).toBe('Play the motion'); // labelled, not icon-only
    expect(section.querySelector('.scene-live')).toBeNull(); // no mount until the viewer opts in
    expect((section.querySelector('.scene-figure > svg') as SVGSVGElement).style.display).not.toBe('none'); // poster visible
    c?.dispose();
    expect(section.querySelector('.scene-control')).toBeNull(); // dispose removes the control
    expect(section.getAttribute('data-scene-live')).toBeNull();
  });

  it('a motionless scene under reduced motion has nothing to opt into — poster stands (null)', () => {
    const section = makeSection(motionlessSpec);
    expect(hydrateScene(section, { reducedMotion: true })).toBeNull();
    expect(section.querySelector('.scene-control')).toBeNull();
  });
});
