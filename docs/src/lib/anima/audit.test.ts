import { describe, expect, it } from 'vitest';
import { auditScene, READABLE_PERIOD_MS } from './audit';
import type { Scene } from './types';

// The "reads as information?" audit — pure heuristics over a Scene (2026-07-18 §3.2).
// It advises, never blocks; these pin the four checks and the clean case.

const built = (elements: Scene['elements']): Scene => ({ source: 'built', duration: 3000, hero: 0.5, elements } as Scene);

describe('auditScene — the anti-gimmick check', () => {
  it('passes a readable scene clean (no notes)', () => {
    const scene = built([
      { id: 'rig', shape: 'group', motion: [{ verb: 'spin', axis: 'y', period: 3000 }], children: [{ id: 'rotor', shape: 'cone' }] },
    ]);
    expect(auditScene(scene)).toEqual([]);
  });

  it('flags a still scene as info (a legitimate poster, but named)', () => {
    const notes = auditScene(built([{ id: 'a', shape: 'box' }]));
    expect(notes).toHaveLength(1);
    expect(notes[0].level).toBe('info');
    expect(notes[0].message).toMatch(/still poster/i);
  });

  it('warns when a spin is too fast to track', () => {
    const notes = auditScene(built([{ id: 'z', shape: 'box', motion: [{ verb: 'spin', axis: 'y', period: READABLE_PERIOD_MS - 100 }] }]));
    expect(notes.some((n) => n.level === 'warn' && n.elId === 'z' && /too fast/i.test(n.message))).toBe(true);
  });

  it('warns on a truly redundant duplicate (same verb, no distinguishing param)', () => {
    const notes = auditScene(built([{ id: 'q', shape: 'box', motion: [{ verb: 'reveal' }, { verb: 'reveal' }] }]));
    expect(notes.some((n) => n.level === 'warn' && n.elId === 'q' && /read as one|repeats/i.test(n.message))).toBe(true);
  });

  it('warns on two spins on the SAME axis (they fold into one rate)', () => {
    const notes = auditScene(built([{ id: 'q', shape: 'box', motion: [{ verb: 'spin', axis: 'y', period: 3000 }, { verb: 'spin', axis: 'y', period: 5000 }] }]));
    expect(notes.some((n) => n.level === 'warn' && /repeats “spin”/.test(n.message))).toBe(true);
  });

  it('does NOT flag two spins on DIFFERENT axes (a real compound tumble)', () => {
    const notes = auditScene(built([{ id: 'q', shape: 'box', motion: [{ verb: 'spin', axis: 'x', period: 3000 }, { verb: 'spin', axis: 'y', period: 3000 }] }]));
    expect(notes.every((n) => !/repeats/.test(n.message))).toBe(true);
  });

  it('warns when a moving group has no visible geometry', () => {
    const notes = auditScene(built([{ id: 'hollow', shape: 'group', motion: [{ verb: 'spin', axis: 'y', period: 3000 }], children: [] }]));
    expect(notes.some((n) => n.level === 'warn' && n.elId === 'hollow' && /nothing to show/i.test(n.message))).toBe(true);
  });

  it('does not warn a moving group whose descendant renders geometry', () => {
    const notes = auditScene(built([
      { id: 'outer', shape: 'group', motion: [{ verb: 'spin', axis: 'y', period: 3000 }], children: [{ id: 'inner', shape: 'group', children: [{ id: 'leaf', shape: 'cone' }] }] },
    ]));
    expect(notes.every((n) => !/nothing to show/i.test(n.message))).toBe(true);
  });
});
