import { describe, expect, it } from 'vitest';
import { decodeSpec, effectiveTier, hasContinuousMotion, rendererFor, toLegible, whollyVestibular } from './hydrate';
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
