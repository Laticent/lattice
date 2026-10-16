# Evidence for `2026-10-15-bridges-and-two-hosts.md`

| File | What it is | Note section |
|---|---|---|
| `layer-census.cjs` | Exports each deck to Marp, builds a layered, a flattened and a reference theme for its palette, renders each through marp-cli and compares every element's computed style | §3.1 |
| `layer-census-results.json` | One entry per deck, measured on `main` at `6e7c738`: palette, element count, `AvsC` (flattened vs reference) and `AvsL` (the veto) differing elements. `bundleMissingPalettes` lists palettes the deck's Marp bundle imports but does not ship (a P0 follow-up); the census read those from `dist/themes/` | §3.1 |
| `runtime-census.cjs` | The same comparison on one deck as an author sees it: rendered through the bundle's own `marp.config.cjs` (real allowlist, runtime loaded and settled, `::marker` included), adding today's unlayered sheet (D) and the theme stylesheet's size | §3.1 |
| `runtime-census-results/` | Its output for the gallery deck, screen and print media | §3.1 |
| `measure-manifests.mjs` | Applies §5.3's field changes to the in-tree plugin manifests (eight on `main` at `6e7c738`) and counts lines before and after | §3.4 |

## Rerunning

`measure-manifests.mjs` needs nothing but Node:

```sh
node engineering/decisions/2026-10-15-bridges-and-two-hosts/measure-manifests.mjs
```

It treats `render.figureClasses` as derived. If that field stays (§5.3 leaves it open), add one to
four lines per drawn plugin.

`layer-census.cjs` needs marp-cli, the flattener and Playwright, which are deliberately not repo
dependencies. Its header gives the install line. It uses the spike's layer order (`root` before
`base`); the gallery was also run in the repo's declared order (`tools/build-css.js`, `base`
first) with identical results.

`layer-census.cjs` renders CSS only (`--html=false`), so the runtime's DOM is not covered there; `runtime-census.cjs` covers it for one deck at a time (about seven minutes on the gallery). The VS Code
run in §3.2 used a real code-server and marp-vscode; its method is the one recorded in
`engineering/gotchas/vscode.md` §"Does the marp-vscode webview execute `<script>`?".
