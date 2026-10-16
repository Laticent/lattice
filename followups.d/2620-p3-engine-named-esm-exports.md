---
origin: 2620
priority: P3
recorded: 2026-10-09
area: engine
severity: medium
swimlane: engineering/decisions/2026-10-07-first-npm-release.md
---

# `import { render } from '@laticent/lattice'` fails: the engine has no named ESM exports

why now   — #2620 made the root import the engine. ESM users will write `import { render } from
            '@laticent/lattice'`, and Node throws `SyntaxError: Named export 'render' not found`.
            lib/engine/index.js assigns `module.exports = api` and then adds only `createEngine`
            as a property, so Node's CommonJS export scan sees only `createEngine` and `default`.
            `import pkg from '@laticent/lattice'` with `pkg.render` works, and `./engine` behaves
            the same, so this predates #2620. It is cheapest to settle before 1.0.0 publishes.
where     — lib/engine/index.js (~line 1065, the `module.exports = api` tail); README exports
            table; RELEASE.md §The distribution contract.
done when — `import { render, geometry, addThemes, hasTheme, languages, createEngine } from
            '@laticent/lattice'` works from an installed package, and so does the same from
            `@laticent/lattice/engine`, with `require` unchanged.
evidence  — an arm in test/integration/export/installed-package.test.js that imports each name,
            failing on today's engine.
verify    — tier 1 checker, because it changes the package's public entry point.
