---
origin: 2422
priority: P4
recorded: 2026-09-27
area: engine
severity: medium
swimlane: engineering/decisions/2026-07-29-front-matter-lossless-writers.md
---

# Loose front-matter readers outside `frontMatterValue` still read `style: |` lines

why now   — #2422 taught `frontMatterValue` and the engine's `parseFrontMatter` to skip a
            block scalar's body. Other readers keep their own regexes and still read a CSS line
            named like a key: `class:` in lib/layout/bridge.js `FM_CLASS_RE` and
            lib/packages/render.js:38 (with `style: |\n  class: kpi` and no top-level `class:`,
            the bridge still embeds kpi's CSS the engine no longer applies), the render-target
            keys' `scalarValuesFor` (lib/core/render-target-keys.js, a deliberate union), and lint
            validators (`size:` at lint-core.js:647 and slide-class-spans.js:244,
            `findUnknownSpectrumCard`, pace/delivery/lang/glossary, logo-x/y/scale). None changes
            a render; at worst extra CSS ships or lint warns about a line the engine ignores.
            Found by #2422's maker-checker pass.
where     — the files above; `withoutBlockScalarBodies` in lib/core/front-matter-key.js is the
            shared kernel to route them through.
done when — each reader either reads through `withoutBlockScalarBodies` (or `frontMatterValue`)
            or states in a comment why it must not, with a test per reader on the
            `style: |\n  class: kpi` deck.
evidence  — the bridge's embedded CSS for that deck, before and after.
verify    — tier 1 checker, because lint and the bridge are shared kernels.
