import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { FINISH_SYSTEM } from './architect';
import { FINISHES } from './finish-catalog';
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
  // Match each value as a WHOLE token delimited by `|` or `"` in the prompt's
  // `"type": "a|b|c"` vocab strings — a bare substring check would let `left` ride on
  // `top-left` (and `none` on everything), masking a real gap.
  const offered = (v: string) => new RegExp(`["|]${v.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}["|]`).test(FINISH_SYSTEM);
  for (const [label, values] of cases) {
    it(`offers every ${label} value the engine accepts`, () => {
      const missing = values.filter((v) => !offered(v));
      expect(missing, `FINISH_SYSTEM omits ${label} value(s): ${missing.join(', ')}`).toEqual([]);
    });
  }

  it('names the premium layers explicitly (the regression this fixes)', () => {
    for (const premium of ['mesh', 'pinstripe', 'lattice', 'frame']) {
      expect(offered(premium), `FINISH_SYSTEM must offer the premium layer "${premium}"`).toBe(true);
    }
  });
});

// Win 4 — the finish canon carries TEACHING, not just vocabulary: the four-layer
// semantics, a point-of-view (reach for a signature layer), and the shipped finishes
// as grounded exemplars sourced from the catalog (so the "reads well" examples can't
// drift from what ships). Reconciled with design/skills/finish.md.
describe('FINISH_SYSTEM teaching grounding', () => {
  it('teaches the four layer roles and a point of view', () => {
    for (const term of ['WASH', 'TEXTURE', 'MARK', 'EDGE', 'SIGNATURE', 'RESTRAINED']) {
      expect(FINISH_SYSTEM, `FINISH_SYSTEM should teach "${term}"`).toContain(term);
    }
  });

  it('grounds the model in EVERY shipped finish exemplar (sourced from the catalog)', () => {
    // The shipped finishes (group 'finish') and their blurbs come straight from
    // finish-catalog.ts, so a new/renamed finish flows into the prompt automatically —
    // and this gate fails if the interpolation is ever dropped.
    const shipped = FINISHES.filter((f) => f.group === 'finish');
    expect(shipped.length, 'there should be shipped finish exemplars to teach').toBeGreaterThan(4);
    for (const f of shipped) {
      expect(FINISH_SYSTEM, `FINISH_SYSTEM omits shipped finish "${f.label}"`).toContain(f.label);
    }
  });

  it('agrees with design/skills/finish.md on the signature-layer principle', () => {
    const doc = readFileSync(join(__dirname, '../../../../design/skills/finish.md'), 'utf8').toLowerCase();
    expect(doc).toContain('signature layer');
    expect(FINISH_SYSTEM.toLowerCase()).toContain('signature');
    // Both name the premium signature layers a finish can carry.
    for (const layer of ['mesh', 'lattice', 'pinstripe', 'frame']) {
      expect(doc, `finish.md should mention the signature layer "${layer}"`).toContain(layer);
    }
  });
});
