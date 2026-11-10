import { describe, expect, it } from 'vitest';
import { stackVisitsFor, topLevelElements } from './tags';

// The open-element walk scanned the whole stack for each tag, so unclosed raw HTML walked in
// quadratic time: `'<div>\n'` repeated 32k times took 16 s (followups.d/3051-p9). Held by WORK
// DONE, not the clock (HARD RULE #32): the stack entries the scans visit must grow linearly. A
// quadratic walk visits about N²/2 entries, so doubling N quadruples the count; linear doubles it.
const SHAPES: Record<string, string> = {
  'unclosed <div> lines': '<div>\n',
  'unclosed <b> in text': 'x <b>',
  'unclosed <span>': '<span>a',
  'unclosed <li> under a list': '<ul><li>',
  'unclosed headings': '<h2>t',
};

describe('walkStack stays linear on unclosed raw HTML', () => {
  for (const [name, unit] of Object.entries(SHAPES)) {
    it(name, () => {
      const small = stackVisitsFor(unit.repeat(4000));
      const big = stackVisitsFor(unit.repeat(16000));
      // Linear: 4x the input costs about 4x the visits. Quadratic would be 16x.
      expect(big).toBeLessThanOrEqual(Math.max(5 * small, 5 * 16000));
    });
  }

  it('still reads the structure: one top-level element for a nest of unclosed divs', () => {
    expect([...topLevelElements('<div>\n'.repeat(1000))].length).toBe(1);
  });
});
