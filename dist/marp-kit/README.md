# Lattice — the copy-and-go Marp kit

Copy this folder and you are working. There is nothing to install and no build
step.

## Start here

**Open THIS FOLDER as your VS Code workspace root**, with the **Marp for VS
Code** extension installed, then open `Sample-Deck.md`.

That is not a style preference. `.vscode/settings.json` registers the
stylesheets by workspace-relative path (`./lattice.min.css`), so if the kit sits
as a sub-folder beside a deck somewhere else, those paths do not resolve and you
get unstyled slides **with no error**. Put your deck in here, next to
`Sample-Deck.md`, rather than putting this folder next to your deck.

From the command line instead:

```sh
npx @marp-team/marp-cli@^4.3.1 Sample-Deck.md --config-file marp.config.cjs --allow-local-files -o deck.pdf
```

The version range is deliberate: it is the same range Lattice's own export bundle
pins, so the kit and the export cannot ask for different tools. Being honest about
what that does and does not buy you — it is a range, not a pin, so npm will resolve
a newer 4.x over time. Lattice's CI renders this exact deck through real marp-cli
and checks the result — one page per slide, the diagram drawn, the split panel
built, the equation typeset, the palette and the fonts live. To be exact about
the guarantee: that runs on changes to engine/tooling/test code, not on
documentation-only ones. It is new as of this kit's second revision; before that,
nothing on our side had ever rendered it. The reference render was made with
4.3.1; the range currently resolves to 4.5.0.

## What is in here

| File | What it does |
|---|---|
| `Sample-Deck.md` | A 13-slide deck that documents itself. Your starting point. |
| `lattice.min.css` | The engine — every layout and token. |
| `cuoio.min.css` | The default palette. Swap it to restyle the deck. |
| `cuoio-dark.min.css` | A second palette. Select it with `theme: cuoio-dark`. |
| `lattice-runtime.min.js` | Builds charts and diagrams in the browser. |
| `mermaid-v11.min.js` | Third party. Diagram slides need it. |
| `fonts/` | 37 files. **Do not drop these** — without them type falls back to system serif, silently. |
| `marp.config.cjs` | Registers the stylesheets for marp-cli. |
| `.vscode/settings.json` | Registers them for the VS Code extension. |
| `NOTICE.md` · `LICENSE` | The terms these files come under. Worth two minutes. |

## Three things that will bite you

**Scripts belong at the END of the deck.** Marp emits raw HTML inline, in
document order, so a `<script>` at the top lands inside slide 1 and runs before
the rest of the deck exists. At the bottom it runs once the whole deck is parsed.
`Sample-Deck.md` does this — copy the pattern.

**`html: true` is required, not optional.** marp-core escapes raw HTML by
default, which turns the deck's `<script>` tags into visible text and leaves
every chart and diagram unbuilt. Both config files here set it.

**Dark mode is `class: dark`, not `color-mode:`.** `class:` is Marp's own
front-matter key and it stamps every slide, which is exactly what Lattice's dark
styling keys off. Lattice's richer deck registers (`color-mode:`, `finish:`,
`logo:`, …) are read from a block that only the full export pipeline writes, so
in a hand-authored deck like this one they do nothing.

## Fidelity

**The runtime is what makes this deck complete, and it only runs in a browser.**
Four of the thirteen slides are assembled by `lattice-runtime.min.js`, not by
CSS: the Mermaid diagram, the chart, the matrix grid, and the split panel. Where
that script runs, the deck is whole. Where it does not, those four are raw.

- **`marp --pdf`** drives real headless Chrome, so the runtime runs and the PDF
  is complete. This is the path `Sample-Deck.md` is verified on, and the one to trust.
- **`marp --html`** does NOT launch a browser — it converts in about a second
  and writes a file. The runtime runs later, when a person opens that file, and
  only if `lattice-runtime.min.js` and `mermaid-v11.min.js` are still sitting
  beside it. Mail someone the `.html` on its own and they get a broken deck.
- **The VS Code preview pane** runs marp-core directly, without Lattice's
  markdown-it plugins. Whether it executes the deck's `<script>` tags is
  genuinely unsettled in this project's own notes, so treat those four slides as
  unknown there rather than promised. If they come up flat for you, that is the
  unresolved case above and not a broken copy of the kit — everything else on the
  slide should still be fully styled.

Everything CSS does — layout, palette, typography, every purely-CSS layout —
holds on all three. Render the deck for anything you need to trust.

## If the slides look plain

Unstyled slides — system fonts, no palette, no layout — mean the stylesheets did
not register, which is the one failure here that produces no error message. In
order of likelihood:

1. **The folder is not your workspace root.** `.vscode/settings.json` uses
   workspace-relative paths. Open THIS folder, not its parent.
2. **The whole folder did not come across.** `lattice.min.css` must sit beside
   `Sample-Deck.md`, and `fonts/` beside that.
3. **VS Code has not reloaded the setting.** Run *Developer: Reload Window* after
   the folder is first opened.

If type looks right but the layout does not, it is the palette rather than the
engine: `cuoio.min.css` `@import`s `lattice` **by name**, so both files
have to be registered — one alone renders bare.

**If a render fails with "No usable sandbox!"** — common on CI runners and
hardened Linux — set `CHROME_NO_SANDBOX=1` in the environment. marp-cli turns
the Chromium sandbox off by itself for root, and inside a container, but a plain
non-root machine with unprivileged user namespaces restricted is neither, and
Chromium refuses to start. This is marp-cli's own switch.

If a render hangs instead, the usual cause is a small `/dev/shm` — give the
container more shared memory (`docker run --shm-size=1g` or equivalent).

Both of these lines used to say "pass `--browser-args=…`". **marp-cli has no
such option** (only `--browser`, `--browser-path`, `--browser-protocol`,
`--browser-timeout`), so that advice did nothing at all.

---

Generated by `tools/build-marp-kit.js`. Do not edit in place — edit
`kit/Sample-Deck.md` and run `npm run build`.
