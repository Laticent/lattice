---
origin: 2509
priority: P5
recorded: 2026-10-06
---

# Give the other plugin libraries the Mermaid treatment: an owned, pinned, checked copy

why now   — owner, 2026-10-06: we host third-party libraries ourselves. The plugin owns a copy, every
            surface (browser pages, the CLI, the Marp kit, exports) ships that copy, `node_modules`
            is only the source, and a user never downloads a library. Mermaid does this as of #2557
            (`payload.vendored` in its manifest, `lib/plugins/mermaid/vendor/mermaid.min.js`,
            `npm run vendor:plugins`, the resolver's SHA-256 check, an exact version pin). The rest
            still read the installed package, under a `^` range an install can move:
            - function-plot — `payload` `npm:function-plot/dist/function-plot.js` (staged by
              docs/scripts/sync-playground-assets.mjs, read by lib/plugins/hydrate-script.js);
            - KaTeX — the math plugin's renderer and its stylesheet and fonts (math.render.js,
              tools/build-katex-provider.js, the `katex/` staging);
            - the CLI bake's other two inputs from npm: `@mermaid-js/mermaid-zenuml`'s IIFE and
              `@mermaid-js/mermaid-cli`'s `dist/index.html` render page
              (lib/plugins/mermaid/shared/render-worker.js `resolveBundles`).
where     — the files above; `payload.vendored` and lib/plugins/payload-path.js are the pattern.
            KaTeX is not a `payload` today (it is bundled into the engine), so its copy needs a
            shape of its own; decide that first.
done when — each library ships from a copy its plugin owns, is pinned to an exact version, and is
            checked by hash; the render evidence below is unchanged.
evidence  — byte-identical CLI PDFs of the math and diagram galleries; the function-plot gallery in
            the real Playground; the Marp kit through real marp-cli.
verify    — tier 1 checker.
