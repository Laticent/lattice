---
origin: 2609
priority: P3
recorded: 2026-10-08
area: engine
severity: low
swimlane: engineering/decisions/2026-10-08-library-trio-before-publish.md
source: engineering/decisions/2026-10-08-library-trio-before-publish.md §4
---

# Library API items the trio ruled fine for 0.1.0, to settle before a 0.2

why now   — the trio found API shapes that 0.x semver lets us change in a minor version, so they
            did not block the first publish. Each is cheaper to settle before outside callers
            depend on it.
where     — docs/src/lib/{ltt,segno,trama}/.
done when — each is changed or ruled to stay:
            · one error shape across the three (LTT returns string[], Segno has four styles, Trama
              returns null with no reason); the inversion lens proposes Segno's Diagnostic shape;
            · CJS consumers get `.d.cts` declarations (every entry now shares one `.d.ts`);
            · Segno un-exports the engine's internals (`FlatTree`, `toNodes`, the tuning constants)
              once no test needs them through the root;
            · Trama gains `dagre` / `dagreUrl` options on `PassOptions`, a disposer from
              `installGraphPass`, one rectangle shape, and a documented stable subset of
              `RadialKernel`;
            · LTT names its unprefixed types (`CaptionTrack`, `Cue`, `Word`) consistently.
evidence  — the README's "What is stable" section for each library, updated.
verify    — tier 0 gates plus the nodenext consumer test (test/unit/tools/package-nodenext-types.test.js).
