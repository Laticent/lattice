---
origin: 2339
priority: P1
recorded: 2026-09-24
source: https://github.com/Laticent/lattice/pull/2339
---

# Build LTT step 1: the `@laticent/ltt` package, the spec, and the tour-narrator drift fix

why now   — every later LTT step (the HTML player, video export, Vetrina actions) imports
            from this package, and the tour narrators already time sentences differently
            from the deck (they pass only `pace` to `buildTrack`).
where     — engineering/decisions/2026-09-24-lattice-timing-track.md §6 and §8 step 1,
            which list the wiring: `docs/src/lib/ltt/` workspace, `tools/build-ltt-lib.js`,
            `tools/build.js` ordering, `tools/build-capabilities.js` rows, the `ltt` boundary
            gate and Cadenza's widened gate in `tools/check-ownership.js`. Move the TYPES
            `Word`/`Cue`/`CaptionTrack` only; `makeCursor` stays put.
            Drift: `docs/src/lib/vetrina-narration/cadenza-narrator.ts:73` and `:255`.
done when — `@laticent/ltt` builds and is gated; Cadenza re-exports the moved types and
            every existing importer compiles unchanged; `engineering/ltt.md` names an owner
            and states the transport rules; the JSON Schema is generated from the types
            (G1); `validateLtt` and the canonical/packed/legacy converters pass round-trip
            tests generated from the schema; a parity test pushes one sentence through the
            deck producer and both Vetrina narrators and gets identical timings.
evidence  — the parity test failing on `main` and passing on the branch; `npm run build:check`
            green with the new gate; a diff of one exported HTML deck before/after showing
            ZERO byte change (step 1 must not move export bytes).
verify    — tier 1 checker, because it is a multi-package refactor touching three boundary
            gates and the build order.
