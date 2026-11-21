# Lattice — the copy-and-go Marp kit

Copy this folder and you are working. There is nothing to install and no build
step.

## Start here

**Open THIS FOLDER as your VS Code workspace root**, with the **Marp for VS
Code** extension installed, then open `Sample-Deck.md`. If you don't have the extension,
VS Code offers it when the folder opens (`.vscode/extensions.json` recommends it):
click **Install**.

That is not a style preference. `.vscode/settings.json` registers the
stylesheets by workspace-relative path (`./lattice-min.css`), so if the kit sits
as a sub-folder beside a deck somewhere else, those paths do not resolve and you
get unstyled slides **with no error**. Put your deck in here, next to
`Sample-Deck.md`, rather than putting this folder next to your deck.

From the command line instead:

```sh
npx @marp-team/marp-cli@4 Sample-Deck.md --config-file marp.config.cjs --allow-local-files -o deck.pdf
```

Works with marp-cli 4.x (marp-core 4.x) and Marp for VS Code 3.x. Lattice's CI renders it on the oldest it supports, marp-cli 4.0.0 with marp-core 4.0.0, on every change, and on the newest marp-cli 4.x every night. Marp for VS Code 3.0.0 and 3.6.1 were checked by hand in a real VS Code on 2026-11-10. CI checks the result: one page per slide, the diagram drawn,
the split panel built, the equation typeset, the palette and the fonts live, and a
video record drawn as its poster. To be exact about the guarantee: that runs on
changes to engine, tooling or test code, not on documentation-only ones.

## What is in here

| File | What it does |
|---|---|
| `Sample-Deck.md` | A 13-slide deck that documents itself. Your starting point. |
| `lattice-min.css` | The engine — every layout and token. **marp-cli registers this one** (`marp.config.cjs`). |
| `cuoio-min.css` | The default palette. Swap it to restyle the deck. |
| `cuoio-dark-min.css` | A second palette. Select it with `theme: cuoio-dark`. |
| `lattice-vscode-min.css` | The same engine and every palette, already shaped the way the VS Code preview shapes them. The deck links it (`<link rel="stylesheet" …>`, beside its scripts), so the preview styles the slides without re-processing 1.1 MB of theme on every keystroke. marp-cli ignores it. |
| `.vscode/themes/` | What VS Code registers (`.vscode/settings.json`): only each theme's name and slide sizes, so the preview has almost nothing to re-process per keystroke. The styling comes from the linked file above. |
| `lattice-runtime-min.js` | Builds charts and diagrams in the browser. |
| `mermaid-v11-min.js` | Third party. Diagram slides need it. |
| `lattice-dagre-min.js` | Third party. Lays out a state chart that BRANCHES. **Delete it and the chart still draws** — on the reading-order grid a chain uses, each branch drawn as a skip, which looks deliberate rather than broken. It is the one file here whose absence is invisible on the slide. |
| `lattice-plugin-icons.js` | Third party (Tabler Icons). The icon drawings; the runtime loads it the first time a slide writes `^{name}`. **Delete it and every icon stays the code you typed.** |
| `lattice-plugin-avatars.js` | Ours. The avatar drawings; the runtime loads it the first time a slide writes `!{Name}`. **Delete it and every avatar stays the code you typed, and a team-profile portrait becomes a monogram.** |
| `lattice.css` · `cuoio.css` · `cuoio-dark.css` · `lattice-runtime.js` | Unminified counterparts of the four above, for reading or diffing. Neither config references them — delete them freely, or keep them for reference. |
| `fonts/` | The embedded typefaces. **Do not drop these** — without them type falls back to system serif, silently. |
| `marp.config.cjs` | Registers the stylesheets for marp-cli. |
| `.vscode/settings.json` | Registers them for the VS Code extension. |
| `.vscode/lattice.code-snippets` | One completion per layout. On an empty line in the deck, type `lattice-` and press **Ctrl+Space** (**⌃Space** on a Mac): pick a layout and VS Code writes its skeleton. |
| `lattice-layouts.vsix` | A small VS Code extension that completes layout NAMES where one goes: type `<!-- _class: ` and the menu opens with every layout and its summary, and nowhere else, so prose never opens it. Install it once: **Extensions → ⋯ → Install from VSIX…**, or `code --install-extension lattice-layouts.vsix`. |
| `.vscode/extensions.json` | Makes VS Code offer to install Marp for VS Code. |
| `NOTICE.md` · `LICENSE` · `THIRD-PARTY-LICENSES.txt` | The terms these files come under, and the full third-party license texts. Worth two minutes. |

## Three things that will bite you

**The deck's last lines are load-bearing: one `<link>` and three `<script>`
tags.** Copy them into every deck you write here. The `<link>` is how the VS
Code preview gets its styling (without it, slides in VS Code are plain text;
marp-cli does not need it). The scripts belong at the END: Marp emits raw HTML
inline, in document order, so a `<script>` at the top lands inside slide 1 and
runs before the rest of the deck exists. `Sample-Deck.md` does this — copy the pattern.

**`html: true` is required, not optional.** marp-core escapes raw HTML by
default, which turns the deck's `<script>` tags into visible text and leaves
every chart and diagram unbuilt. Both config files here set it.

**Dark mode is `class: dark`, not `color-mode:`.** `class:` is Marp's own
front-matter key and it stamps every slide, which is exactly what Lattice's dark
styling keys off. Lattice's richer deck registers (`color-mode:`, `finish:`,
`logo:`, …) are read from a block that only the full export pipeline writes, so
in a hand-authored deck like this one they do nothing. Set one or the other, never
both: in Lattice's own pipeline `color-mode:` supersedes the `class:` alias and
drops it, so a deck carrying both renders differently on the two sides.

## Fidelity

**The runtime is what makes this deck complete, and it only runs in a browser.**
Four of the thirteen slides are assembled by `lattice-runtime-min.js`, not by
CSS: the Mermaid diagram, the chart, the matrix grid, and the split panel. Where
that script runs, the deck is whole. Where it does not, those four are raw.

- **`marp --pdf`** drives real headless Chrome, so the runtime runs and the PDF
  is complete. This is the path `Sample-Deck.md` is verified on, and the one to trust.
- **`marp --html`** does NOT launch a browser — it converts in about a second
  and writes a file. The runtime runs later, when a person opens that file, and
  only if `lattice-runtime-min.js` and `mermaid-v11-min.js` are still sitting
  beside it. Mail someone the `.html` on its own and they get a broken deck.
- **The VS Code preview pane** runs marp-core directly, without Lattice's
  markdown-it plugins, and runs the deck's `<script>` tags at one preview
  security level only. At VS Code's default (*Strict*) the preview shows *"Some
  content has been disabled in this document"* and those four slides stay raw;
  click that message and choose **Disable** (*"Allow all content and script
  execution"*) and they draw. VS Code remembers the choice per folder. The folder
  must be trusted first (the *Restricted Mode* banner → **Manage** → **Trust**).
  Measured on VS Code 1.142.0 and 1.145.2 with Marp for VS Code 3.6.1.

Everything CSS does — layout, palette, typography, every purely-CSS layout —
holds on all three. Render the deck for anything you need to trust.

**A video** is written as a record on a line of its own,
`@video{"<the clip's address>", title="…"}`, and draws as a poster that links to
the clip (YouTube, Vimeo, TikTok or Instagram), and on a `video` slide as the same
card Lattice draws. It needs the runtime, like a chart. The address is always read
from your Markdown, never from the page: `marp.config.cjs` hands the records over
as marp-cli parses the deck, and the VS Code preview reads the saved file. So in
VS Code a record you have just typed draws when you save.

## What these settings allow

The kit asks for three things that Marp leaves off by default. Each one applies to
**every deck in this folder**, not only to yours, so keep decks you did not write
out of it.

- **Raw HTML** (`html: true` in `marp.config.cjs`, `"markdown.marp.html": "all"`
  in `.vscode/settings.json`). The runtime is loaded by `<script>` tags in the
  deck, which Marp would otherwise print as text. It also lets any HTML a deck
  contains through, scripts included.
- **Local files** (`allowLocalFiles`, `--allow-local-files`). marp-cli's
  browser may read files on your disk so the fonts and images beside the deck
  load. marp-cli warns that this is insecure every time, and it is, for a deck you
  did not write.
- **The VS Code preview at *Disable*** (only for the preview to draw charts,
  diagrams and videos). That lets the preview run every script a deck carries.
  VS Code remembers it per folder, so it covers this folder and nothing else.

A deck you wrote yourself gains nothing hostile from any of these. For a deck
someone sent you, render it with Lattice, or export it to Marp from Lattice:
an exported bundle lists the HTML a deck may use and runs none of its scripts.

## If the slides look plain

Unstyled slides — system fonts, no palette, no layout — mean the stylesheets did
not register, which is the one failure here that produces no error message. In
order of likelihood:

1. **The folder is not your workspace root.** `.vscode/settings.json` uses
   workspace-relative paths. Open THIS folder, not its parent.
2. **In VS Code: the deck has no `<link rel="stylesheet" href="lattice-vscode-min.css">`.**
   The preview's styling comes from that line. Copy the last lines of `Sample-Deck.md`.
3. **The whole folder did not come across.** `lattice-min.css` and
   `lattice-vscode-min.css` must sit beside `Sample-Deck.md`, and `fonts/` beside that.
4. **VS Code has not reloaded the setting.** Run *Developer: Reload Window* after
   the folder is first opened.

When the scripts run (VS Code at *Disable*, or a marp-cli render), the browser's
console says which of these it is: the runtime warns once when the Lattice
stylesheet did not reach the slides.

If type looks right but the layout does not, it is the palette rather than the
engine: `cuoio-min.css` `@import`s `lattice` **by name**, so both files
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
