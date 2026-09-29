---
origin: 2417
priority: P5
recorded: 2026-09-28
---

# Plugin phase D, the browser half: Mermaid's payload, settle state and rosters through the host

why now   — phase D put Mermaid on the plugin host for the ENGINE (the fence, `as: "code"`) and
            the CLI (its `bake`, run by `lib/plugins/host-bake.js`), and made the runtime its
            declared browser half (`render.exec.hydrate: "runtime"`). What still names Mermaid by
            hand in a browser is counted by `drawnFenceClasses` in `checkPluginMigration` (18 at
            phase D; the budget only falls):
            - the library: `mermaidUrl` is minted in four pages and threaded through ~22 docs-site
              files; the host's `payload` + `ensurePayload` should load it (`payload.from` takes
              only `npm:` today, and the file is the committed repo-root `mermaid-v11.min.js`);
            - the settle state: the runtime writes `data-mermaid-state`, which the plugin host's
              barrier (`PENDING_FIGURES`) cannot see, so the Studio export
              (`deck-export.js waitForDiagrams`) and the player bake still name Mermaid's
              selectors; mirroring the state into `data-lattice-settle` needs the engine to mark
              the fence, which changes engine bytes for every diagram deck;
            - the probes: `slide-thumb.tsx hasMermaid`, `deck-preview.js needsMermaid`,
              `anima-scenes.ts`, `present-guide.ts`, `studio-stage.ts`, `door-attr.mjs`,
              `remote-ref.js` — each a `language-mermaid` roster;
            - the highlight grammar (`registerMermaidHljs`, `lib/integrations/markdown-it/plugins.js`)
              and `lib/integrations/mermaid/mermaid.css` are still installed by the engine, not
              contributed by the plugin;
            - `render.exec.hydrate: "runtime"` is in-tree and transitional (LPM §3.4): moving the
              runtime's diagram pass into the plugin as a runtime-bundled `hydrate.js` retires it,
              and the resolver's "runtime-drawn plugins declare no hydrate" rule changes with it;
            - the bake `ctx`'s Mermaid-shaped members (`diagramTheme`, the re-bake closures on
              `state`, read by name in the emulator's image-set path) want a generic "re-bake in
              another band" hook — phase F's chart bakes are its second user;
            - the CLI never passes `disabled` to `bakeDeck`, so a bake cannot be switched off from
              the CLI while the engine's `plugins.disabled` can switch the plugin off.
where     — `engineering/decisions/2026-09-27-plugin-system.md` §4.7, §4.8 and §11 (phase D);
            `lib/plugins/mermaid/`, `lib/plugins/host-browser.mjs`, `lib/runtime/index.js`,
            `docs/src/components/studio/export/deck-export.js`, the `mermaidUrl` sites.
done when — no browser code names Mermaid by any of its three hand idioms: `drawnFenceClasses`
            reaches 0 (widen the ratchet first to also count `mermaidUrl` — 18 files — and
            `data-mermaid-state` — 8 — which it does not count today); the Studio export waits
            on the host's settle barrier alone; the library loads through `payload`.
evidence  — the ratchet's count falling in each PR; engine byte identity (or an export sign-off
            where engine bytes change); the Studio export of a diagram deck, light and dark.
verify    — tier 2 adversarial trio: it moves the preview and Studio-export path every diagram
            deck uses.
