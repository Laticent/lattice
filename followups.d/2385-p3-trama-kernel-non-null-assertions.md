---
origin: 2385
priority: P3
recorded: 2026-09-27
---

# Replace the Trama kernel's 111 non-null assertions with typed invariants

why now   — The kernel moved to strict TypeScript in the Trama PR under a
            zero-runtime-change rule, so every lookup TypeScript cannot prove present
            (`key.get(id)!`, `port.get(o)!`, `boxOf(id)!`) became a `!`. Biome reports 111
            `noNonNullAssertion` warnings in docs/src/lib/trama/kernel.ts. Each encodes
            a real invariant (dagre placed every node; a routed line has its ports), but
            the type system does not know it, and a future edit that breaks one fails at
            runtime, not at tsc.
where     — docs/src/lib/trama/kernel.ts.
done when — The invariants are carried by the types (a map typed by construction, a
            lookup helper that returns the value or throws with the id, narrowed
            locals). Biome reports zero warnings in the file, and the render is
            byte-identical on the demo deck, gallery and typing deck (the Trama PR's
            21-figure hash check).
evidence  — biome warning count before and after; the 21-figure hash comparison.
verify    — tier 1 checker, because it is a shared kernel.
