/**
 * The input sets behind golden.json: 240 seeded random photo sets plus 12 hand-picked sets
 * of repeated shapes, each run in 16 variants (free/ordered × tight/fill × hero or not × bleed or not). The golden file holds a
 * short hash of `JSON.stringify(packCollage(...))` per case, captured from the packer as it
 * stood in lib/core/collage-pack.js at 69b521f, before it moved into @laticent/mosaico.
 * Changing this generator invalidates the golden: the point is that the inputs never change.
 * To recapture it (only ever from the OLD packer, never from the code under test):
 *   git show 69b521f:lib/core/collage-pack.js > /tmp/old-pack.cjs
 *   node -e "const {packCollage}=require('/tmp/old-pack.cjs'),{cases,hash,SETS}=require('./test/fixtures/collage-golden/cases.js');
 *     const s=Array.from({length:SETS},()=>[]);for(const [i,,a,o] of cases())s[i].push(hash(JSON.stringify(packCollage(a,o))));
 *     console.log(JSON.stringify({capturedFrom:'lib/core/collage-pack.js at 69b521f',sets:s.map(x=>x.join(' '))},null,1))"
 * engineering/decisions/2026-10-16-mosaico-layout-library.md §8 slice 1.
 */

const SEED = 0x6d6f7361; // "mosa"
const RANDOM_SETS = 240;
// Repeated shapes make arrangements that score exactly alike, so these sets are the ones that
// reach the tie-break (the arrangement string). Random shapes almost never tie: with only the
// random sets, reversing the tie-break changed no case.
const TIE_SETS = [
  { aspects: [1, 1], stageAspect: 1.41 },
  { aspects: [1, 1, 1], stageAspect: 1.41 },
  { aspects: [1, 1, 1, 1], stageAspect: 1.41 },
  { aspects: [1, 1, 1, 1, 1], stageAspect: 16 / 9 },
  { aspects: [1, 1, 1, 1, 1, 1], stageAspect: 1.5 },
  { aspects: [1.5, 1.5, 1.5, 1.5], stageAspect: 1.41 },
  { aspects: [0.75, 0.75, 0.75, 0.75, 0.75, 0.75], stageAspect: 3.4 },
  { aspects: [16 / 9, 16 / 9, 16 / 9], stageAspect: 1 },
  { aspects: [2, 2, 0.5, 0.5], stageAspect: 1.41 },
  { aspects: [1, 1, 2, 2, 1, 1], stageAspect: 1.7 },
  { aspects: [0.8, 0.8, 0.8, 1.25, 1.25, 1.25], stageAspect: 0.62 },
  { aspects: [1.5, 0.67, 1.5, 0.67], stageAspect: 9 / 16 },
].map((t, i) => ({ ...t, gap: undefined, hero: i % t.aspects.length }));
const SETS = RANDOM_SETS + TIE_SETS.length;

// mulberry32: small, seedable, the same numbers on every machine.
function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Common camera and screen shapes, plus a few the packer must clamp to 1:1.
const COMMON = [3 / 2, 2 / 3, 4 / 3, 3 / 4, 16 / 9, 9 / 16, 1, 4 / 5, 5 / 4, 2, 0.5, 21 / 9];
const BAD = [0, -1, NaN, 0.01, 50];
const STAGES = [1.41, 3.4, 16 / 9, 1, 1.7, 0.62, 9 / 16, 2.2, 0.8];

function photoSets() {
  const r = rng(SEED);
  const pick = (arr) => arr[Math.floor(r() * arr.length)];
  const sets = [];
  for (let s = 0; s < RANDOM_SETS; s++) {
    // n is 1..6 for most sets, with the 0 and 7 fallbacks represented a few times.
    const n = s < 4 ? [0, 7, 0, 7][s] : 1 + (s % 6);
    const aspects = [];
    for (let i = 0; i < n; i++) {
      const u = r();
      if (u < 0.55) aspects.push(pick(COMMON));
      else if (u < 0.97) aspects.push(0.3 + r() * 3.2);
      else aspects.push(pick(BAD));
    }
    const stageAspect = r() < 0.6 ? pick(STAGES) : 0.4 + r() * 3;
    const gap = r() < 0.75 ? undefined : pick([0, 0.006, 0.02, 0.035]);
    const hero = n > 0 ? Math.floor(r() * n) : 0;
    sets.push({ aspects, stageAspect, gap, hero });
  }
  return [...sets, ...TIE_SETS];
}

/** Every case: [setIndex, variantIndex, aspects, opts]. */
function cases() {
  const out = [];
  photoSets().forEach((set, si) => {
    let v = 0;
    for (const order of ['free', 'ordered']) {
      for (const fit of ['tight', 'fill']) {
        for (const withHero of [false, true]) {
          for (const bleed of [false, true]) {
            const opts = { stageAspect: set.stageAspect, order, fit };
            if (set.gap !== undefined) opts.gap = set.gap;
            if (withHero) opts.hero = set.hero;
            if (bleed) opts.bleed = true;
            out.push([si, v++, set.aspects, opts]);
          }
        }
      }
    }
  });
  return out;
}

// FNV-1a, 32 bits, as 8 hex characters: enough to tell two outputs apart in 4,032 cases.
function hash(str) {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, '0');
}

module.exports = { cases, hash, SETS };
