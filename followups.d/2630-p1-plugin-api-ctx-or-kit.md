---
origin: 2630
priority: P1
recorded: 2026-10-11
area: engine
severity: high
swimlane: engineering/decisions/2026-10-11-codebase-structure.md §5
source: engineering/decisions/2026-10-11-codebase-structure.md §5
---

# Decide phase G's plugin API: `ctx` or a published plugin kit

why now   — two records disagree about the public plugin API. Plugin-system §4.6 says a plugin
            reaches the engine only through `ctx`; #2630 added `lib/plugin-kit/`, which plugins now
            `require` by relative path. Phase G (the npm door) must ship one of them, and the other
            must go. This is the owner's call, because it changes what `spec/LPM.md` promises.
where     — lib/plugin-kit/, lib/plugins/host.js (`ctx`), spec/LPM.md,
            engineering/decisions/2026-09-27-plugin-system.md §4.6, §7 phase G.
done when — the owner picks one, and the losing channel is deleted. A published kit also needs:
            · a `./plugin-kit/*` entry in package.json `exports`;
            · no module-level state. `plugin-data.js`'s loader map moves to the host, because two
              copies of one stateful module would silently disagree;
            · no repo-layout assumption. `payload-path.js` reads lib/plugins/<name>/;
            · a decision on `charts.js`, which re-exports `_chart-family` internals for an
              in-tree-only plugin.
