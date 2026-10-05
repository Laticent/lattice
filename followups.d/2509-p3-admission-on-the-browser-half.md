---
origin: 2509
priority: P3
recorded: 2026-10-05
---

# Plugin admission on the browser half — before any host narrows the default set

why now   — E0 (#2509) made the ENGINE and the CLI `bakeDeck` load plugins explicitly
            (`lib/plugins/host-grammar.mjs` `admitPlugins`), but three paths still act for every
            shipped plugin, found by the HARD RULE #25 inversion lens:
            - the runtime's passes (`lib/runtime/index.js` `PASSES`): Mermaid's pass draws every
              `code.language-mermaid` it finds, and the engine's output for that fence is the same
              whether Mermaid is admitted or not (`as: "code"`). The engine could stamp the
              admitted set on the deck root and the host hand a pass only what was admitted;
            - the drawn-probe consumers (`slide-thumb.tsx`, `single-slide-render.ts`,
              `present-guide.ts`, `anima-scenes.ts`) count fences from source or markup;
            - the boundary parser installs every plugin's block rules (`blocks.generated.mjs`);
            - `lattice-emulator.js` passes neither `defaults` nor `disabled` to `bakeDeck`, so a host
              configures the engine's knobs and the bake's separately (phase D's CLI `disabled`
              item covers half of this).
            All of it agrees while the default set is every shipped plugin — every shipped host.
            It stops agreeing the day a host passes `createEngine({ plugins: { defaults } })`.
where     — the files above; `spec/LPM.md` §3.2.1 states the precondition.
done when — a deck that does not load a plugin draws none of it on any surface (engine, CLI
            export, Studio preview and export, player), proved with `defaults: []` per surface; the
            README's "Where admission is enforced today" paragraph is deleted.
evidence  — per surface, the same deck rendered with and without the plugin admitted.
verify    — tier 2 adversarial trio: it changes what draws on every render path.
