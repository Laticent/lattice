---
origin: 2391
priority: P3
recorded: 2026-09-27
---

# The engine's loose front-matter reader reads a `style: |` line as a register

why now   — The Studio's reader and writer (docs/src/components/studio/front-matter.ts) now skip
            the indented body of a block scalar. The engine does not: `frontMatterValue` in
            lib/core/front-matter-key.js matches `^[ \t]*key:`, so `style: |\n  lift: on` renders
            with `lift: on`. For that contrived deck the Studio shows no `lift` override while the
            render applies one. Found while fixing followups.d/2391-p3 (the writer half); it
            predates #2391, and real CSS rarely has a line named like a register.
where     — lib/core/front-matter-key.js `frontMatterValue` (the loose reader; the preset
            fallback resolves through it). `topLevelFrontMatterValue` already reads column 0 only.
done when — the engine and the Studio agree on the contrived deck in
            docs/src/components/studio/front-matter.test.ts § block scalars, with an engine test.
evidence  — a render of that deck, before and after, showing whether `lift` applies.
verify    — tier 1 checker, because every register read goes through this function.
