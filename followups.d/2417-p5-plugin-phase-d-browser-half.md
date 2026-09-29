---
origin: 2417
priority: P5
recorded: 2026-09-28
---

# Plugin phase D, what is left: the runtime's diagram pass moves into the Mermaid plugin

why now   — phase D's browser half landed: Mermaid's library loads through the host's `payload`,
            its settle state is the host's `data-lattice-settle`, and no browser code names it by
            a hand idiom (`checkPluginMigration`: `drawnFenceClasses`, `drawnLibraryUrls`,
            `drawnSettleStates` all 0). What remains is the plugin OWNING its code rather than
            the engine and the runtime owning it on the plugin's behalf:
            - `render.exec.hydrate: "runtime"` is in-tree and transitional (LPM §3.4): the
              runtime's diagram pass (`lib/runtime/index.js`, ~2,000 lines around `wrapFences`,
              `initAndRun` and the render queue) moves into the plugin as a runtime-bundled
              `hydrate.js`, which retires the flag and changes the resolver's "runtime-drawn
              plugins declare no hydrate" rule with it;
            - the highlight grammar (`registerMermaidHljs`, `lib/integrations/markdown-it/plugins.js`)
              and `lib/integrations/mermaid/mermaid.css` are still installed by the engine, not
              contributed by the plugin (`styles: true` would move the CSS into the plugin slot;
              a pixel check of the diagram gallery rides with it);
            - the bake `ctx`'s Mermaid-shaped members (`diagramTheme`, the re-bake closures on
              `state`, read by name in the emulator's image-set path) want a generic "re-bake in
              another band" hook — phase F's chart bakes are its second user;
            - the CLI never passes `disabled` to `bakeDeck`, so a bake cannot be switched off from
              the CLI while the engine's `plugins.disabled` can switch the plugin off;
            - two copies of the library: `mermaid-v11-min.js` (committed; the Export-to-Marp kit
              and the integration tier's browser harness) and the payload
              `node_modules/mermaid/dist/mermaid.min.js` (every browser surface; the CLI bake
              resolves the same npm package). `mermaid-library-parity.test.js` holds them equal;
              one copy would retire the test;
            - hand rosters the ratchet does not count, which a SECOND runtime-drawn plugin would
              need generalized: the `mermaid` boolean prop threaded through `DeckPreview` /
              `renderInto` / the landing components (it now only stamps `data-lattice-diagrams`
              and keys a frame rewrite; `stage-window.js` already derives the same from markup),
              and the selectors that find a drawn figure by Mermaid's output classes
              (`.mermaid`, `.mermaid-svg` in `deck-export.js`, `anima-host-sel.ts`,
              `anima-scenes.ts`, `present-guide.ts`) — a host-owned marker on the output
              container would let them read the host instead;
            - a deck's own `data-lattice-hydrate` / `data-lattice-settle` survive the slide
              sanitizer, so an author can forge a pending figure; the host now releases a forged
              runtime-drawn one that is not a `<pre>`, but a forged `<pre>` or `hydrating`
              placeholder still stalls a capture for its budget (pre-existing — the engine could
              refuse author-written `data-lattice-*`, as `lib/core/door-attr.mjs` does for code
              packages).
where     — `engineering/decisions/2026-09-27-plugin-system.md` §4.7 and §11 (phase D, the browser
            half); `lib/runtime/index.js`, `lib/plugins/mermaid/`, `lib/integrations/mermaid/`.
done when — the Mermaid plugin ships its own `hydrate.js` (drawing into the sibling, keeping the
            host's markup on the `<pre>` — the geometry §11 settled) and `styles.css`,
            `render.exec.hydrate` has no `"runtime"` value, the bake `ctx` has no Mermaid-named
            member, and no consumer finds a drawn figure by a plugin's output class.
evidence  — engine byte identity; the diagram gallery's CLI PDFs byte-identical, light and dark;
            a Studio export of the diagram gallery pixel-identical to `main`, light and dark.
verify    — tier 2 adversarial trio: it moves the runtime pass every diagram deck uses.
