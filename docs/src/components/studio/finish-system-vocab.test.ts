import { describe, expect, it } from 'vitest';
import { FINISH_SYSTEM } from './architect';
import { EDGE_TYPES, MARK_TYPES, PLACEMENTS, TEXTURE_TYPES, WASH_TYPES } from './finish-generate';

// The finish generator's prompt (FINISH_SYSTEM) must offer the model EXACTLY the closed
// vocabularies the engine (finish-generate.ts / coerceRecipe) accepts — including the
// premium layers (mesh / pinstripe / lattice / frame). It previously hardcoded a stale
// subset and silently couldn't propose them; now it derives from the enums. This gate
// fails if the prompt ever falls behind the engine's vocabulary again.
describe('FINISH_SYSTEM vocabulary parity with the engine enums', () => {
  const cases: Array<[string, readonly string[]]> = [
    ['wash', WASH_TYPES],
    ['texture', TEXTURE_TYPES],
    ['mark', MARK_TYPES],
    ['edge', EDGE_TYPES],
    ['placement', PLACEMENTS],
  ];
  for (const [label, values] of cases) {
    it(`offers every ${label} value the engine accepts`, () => {
      const missing = values.filter((v) => !FINISH_SYSTEM.includes(v));
      expect(missing, `FINISH_SYSTEM omits ${label} value(s): ${missing.join(', ')}`).toEqual([]);
    });
  }

  it('names the premium layers explicitly (the regression this fixes)', () => {
    for (const premium of ['mesh', 'pinstripe', 'lattice', 'frame']) {
      expect(FINISH_SYSTEM.includes(premium), `FINISH_SYSTEM must offer the premium layer "${premium}"`).toBe(true);
    }
  });
});
