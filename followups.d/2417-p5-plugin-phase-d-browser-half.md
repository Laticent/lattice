---
origin: 2417
priority: P5
recorded: 2026-09-28
---

# Plugin phase D, what is left after the pass moved: Mermaid-named consumers outside the plugin

why now   — the plugin owns its whole browser half since 2026-10-04: the diagram pass is
            `lib/plugins/mermaid/mermaid.hydrate.js` (`render.exec.hydrate: "pass"`), its
            stylesheet and highlight grammar are its `styles` and `highlight` contributions, and the
            bake context's services are generic (`BAKE_SERVICES`, with the `state.rebake` hook). The
            ratchet counts all of it at 0 (`runtimePluginNames`, `pluginAssetsOutside`,
            `bakeContextByName`). What remains are CONSUMERS that still find Mermaid's output by
            name, which a second drawn plugin (phase F's charts) would need generalized:
            - the `mermaid` boolean prop threaded through `DeckPreview` / `renderInto` / the landing
              components (it only stamps `data-lattice-diagrams` and keys a frame rewrite;
              `stage-window.js` already derives the same from markup);
            - selectors that find a drawn figure by Mermaid's output classes (`.mermaid`,
              `.mermaid-svg`): `deck-export.js`, `anima-host-sel.ts`, `anima-scenes.ts`,
              `present-guide.ts`, and the CLI player capture's `SEL` in `lattice-emulator.js` — a
              host-owned marker on the output container (`data-lattice-figure`, say) would let them
              read the host instead. The image-set look already reads the selector from the bake's
              re-bake hook;
            - the CLI never passes `disabled` to `bakeDeck`, so a bake cannot be switched off from the
              CLI while the engine's `plugins.disabled` can switch the plugin off;
            - two copies of the library: `mermaid-v11-min.js` (committed; the Export-to-Marp kit and
              the integration tier's browser harness) and the payload
              `node_modules/mermaid/dist/mermaid.min.js`. `mermaid-library-parity.test.js` holds them
              equal; one copy would retire the test;
            - the pass's KERNELS still live in `lib/integrations/mermaid/` (`init-directive`,
              `reorient`, `motion-roles`, `render-worker`): the plugin owns its driver, not yet its
              kernels, and no ratchet arm counts them;
            - the pass interface was designed from ONE implementation. The runtime now isolates
              passes (boot before run, a per-pass `runAll` result, `force` per pass, a try per
              hook), but nothing has run two: `describe()` keys merge unprefixed, and each pass
              runs its own boot wait, each calling the whole content pass per frame while it waits;
            - the generated grammar field `runtimeDrawn` (and `RUNTIME_DRAWN` in
              `drawn.generated.mjs`) still carries the pre-"pass" name;
            - the runtime's double-load guard was renamed (`__llMermaidBootstrapLoaded` →
              `__llLatticeRuntimeLoaded`), so a page carrying a pre-2026-10-04 runtime AND a current
              one would boot both (no such page is known);
            - a deck's own `data-lattice-hydrate` / `data-lattice-settle` survive the slide
              sanitizer, so an author can forge a pending figure; the host releases a forged one that
              is not a `<pre>`, but a forged `<pre>` or `hydrating` placeholder still stalls a capture
              for its budget (pre-existing — the engine could refuse author-written `data-lattice-*`,
              as `lib/core/door-attr.mjs` does for code packages).
where     — `engineering/decisions/2026-09-27-plugin-system.md` §11 (phase D, the browser half);
            the consumers above; `lattice-emulator.js` (bake call, player capture).
done when — no consumer outside `lib/plugins` finds a drawn figure by a plugin's output class or a
            plugin-named prop, the ratchet counts that idiom at 0, and the CLI honors `disabled` for
            bakes.
evidence  — engine byte identity; the diagram gallery's CLI PDFs byte-identical, light and dark; a
            Studio export of the diagram gallery pixel-identical to `main`, light and dark.
verify    — tier 1 checker: it renames selectors across consumers, not a render path.
