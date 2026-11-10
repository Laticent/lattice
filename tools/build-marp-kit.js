#!/usr/bin/env node
/**
 * build-marp-kit — assemble dist/marp-kit/, the copy-and-go folder.
 *
 * The requirement (owner, 2026-08-03): *"when i go use vscode with marp i simply
 * go and copy files from dist and be working in vscode in no time. my intention
 * here is not to have to export a deck from studio to get this working."*
 *
 * So this is a COMMITTED, SHIPPED artifact — not something a recipient runs.
 * `npm run build` regenerates it; `--check` fails when it is stale, same as
 * every other builder behind the ownership gate.
 *
 * Usage:
 *   node tools/build-marp-kit.js            # write dist/marp-kit/
 *   node tools/build-marp-kit.js --check    # exit 1 if the committed kit is stale
 *
 * WHY IT SHARES THE EXPORT'S ASSET LIST. `lib/export/marp-bundle.js` already knows
 * which files a Marp render needs — it learned the hard way (#1256 shipped a
 * bundle with no fonts, so every title slide fell back to system serif). This
 * builder IMPORTS that module's `STATIC_ASSETS` and its `fontAssetsFor()` walker
 * rather than restating them, so the kit cannot drift from the export. A kit that
 * omits a font is not a cosmetic bug: `lattice.css` references fonts
 * `url(fonts/…)`-relative, and a missing file degrades SILENTLY.
 *
 * The first version of this file only CLAIMED that. It required nothing but `fs`
 * and `path` and kept private copies of both — and the copied font regex was
 * strictly narrower than the original (`[A-Za-z0-9._-]{1,64}` against
 * `[^)'"\s]{1,256}`, and no comment-stripping), so a face named `my+font.woff2`,
 * or one referenced from inside a CSS comment, diverged in one direction or the
 * other. Latent on today's corpus, and exactly the #1256 failure mode the comment
 * promised immunity from. Caught by the adversarial trio; the sentence is now
 * true by construction instead of by assertion.
 *
 * MINIFIED, `-min`-NAMED FILES ARE WHAT THE KIT ACTUALLY RUNS ON. The export
 * bundle renames `lattice-min.css` → `lattice.css`; this does not — someone
 * grabbing files by hand should be able to see what they took. The savings
 * are not marginal (roughly 3x on the stylesheet and more on the runtime; the
 * sizes move with every release, so they are measured, not written here:
 * `renderBytes` below, which the sample deck's "what the folder costs you" slide
 * is held to). `marp.config.cjs` and `.vscode/settings.json`
 * both wire up the `-min` files only, which is also the pair Lattice's own CI
 * renders through real marp-cli (see the README's fidelity section).
 *
 * The Lattice-authored engine files ALSO ship an unminified counterpart —
 * `lattice.css` beside `lattice-min.css`, `lattice-runtime.js` beside
 * `lattice-runtime-min.js`, `cuoio.css` beside `cuoio-min.css` and its dark
 * pair — for someone who wants to read or diff what they took, not to
 * run against. They are not registered anywhere and are safe to delete. The
 * readable runtime is copied WITHOUT the inline source map `dist/lattice-runtime.js`
 * carries for DevTools: the map is three quarters of that file (about 8.5 of 11 MB)
 * and a reader of an unminified file has no use for it. The source itself is named
 * in NOTICE.md (the repository), not smuggled in through a debugging aid.
 * Third-party `mermaid-v11-min.js` stays minified-only: only a minified build
 * is vendored in this repo, so there is no unminified counterpart to copy.
 *
 * Minification is safe here only because `tools/minify-css.js` preserves the
 * `@theme` / `@size` directive comments a stock minifier strips. If that guard
 * regresses, the kit degrades to UNSTYLED SLIDES WITH NO ERROR — which is what
 * Sample-Deck.md is for: a wrong-looking sample is visible, a silently
 * unregistered theme in someone else's deck is a support ticket.
 */

const fs = require('node:fs');
const path = require('node:path');

const { STATIC_ASSETS, fontAssetsFor, MARP_SUPPORT, marpSupportLine, vscodeExtensions, VSCODE_ONLY_ASSETS, KIT_VSCODE_STYLESHEET } = require('../lib/export/marp-bundle.js');
const { stubOf } = require('../lib/export/marp-vscode-stub.js');
// The video plugin's Marp engine, as source (lib/plugins/video/video.services.js `marpEngineSource`).
const videoRecordsEngine = require('../lib/core/plugin-services.js').service('video', 'marpEngineSource')();

const ROOT = path.join(__dirname, '..');
const OUT_DIR = path.join(ROOT, 'dist', 'marp-kit');
const DECK = 'Sample-Deck.md';

/** The default palette. Named, not "some themes" — a deck says `theme: cuoio`. */
const THEME = 'cuoio';

/**
 * Files copied verbatim. `from` is repo-relative, `to` is kit-relative.
 *
 * The engine assets come from the export's own `STATIC_ASSETS`, so adding one
 * there supplies it here too. Only the DESTINATION NAME differs by design: the
 * export renames `lattice-min.css` → `lattice.css`, the kit keeps the `-min`
 * basename, because someone grabbing files by hand should see what they took.
 *
 * The palettes are the kit's own addition. The export adds them per-deck (which
 * palette ships depends on the deck); a copy-and-go folder has no deck to ask,
 * so it carries the default pair. `cuoio-dark-min.css` rides along for a deck
 * that sets `class: dark` — see the README's note on what that does and does not
 * reach.
 *
 * UNMINIFIED_PAIRS adds a readable counterpart beside each Lattice-authored
 * minified file, `to` matching the minified name minus `-min`. `dist/lattice.css`
 * and `dist/lattice-runtime.js` are the same build's unminified output;
 * `themes/${THEME}/${THEME}.css` is not a `dist/` build output at all but the tracked
 * SOURCE the minifier reads — reusing it (rather than adding an unminified
 * theme build) means one less thing for the theme pipeline to produce. Nothing
 * here is wired into marp.config.cjs / .vscode/settings.json — see the
 * MINIFIED, `-min`-NAMED FILES docblock above.
 */
const UNMINIFIED_PAIRS = [
  { from: 'dist/lattice.css', to: 'lattice.css' },
  { from: 'dist/lattice-runtime.js', to: 'lattice-runtime.js' },
  { from: `themes/${THEME}/${THEME}.css`, to: `${THEME}.css` },
  { from: `themes/${THEME}-dark/${THEME}-dark.css`, to: `${THEME}-dark.css` },
];

const ASSETS = [
  // Our own `dist/` builds keep their `-min` basename (see above); a third-party copy (Mermaid,
  // from the plugin that owns it) keeps the name the export gives it, which the kit's deck loads.
  // Every shared asset but the bundle's VS Code stylesheet and engine stub: the kit ships its own (below), cut from the files the
  // kit registers.
  ...STATIC_ASSETS.filter(({ to }) => !VSCODE_ONLY_ASSETS.includes(to))
    .map(({ from, to }) => ({ from, to: from.startsWith('dist/') ? path.basename(from) : to })),
  { from: `dist/themes/${THEME}-min.css`, to: `${THEME}-min.css` },
  { from: `dist/themes/${THEME}-dark-min.css`, to: `${THEME}-dark-min.css` },
  ...UNMINIFIED_PAIRS,
  // The stylesheet as the VS Code preview shapes it (tools/build-marp-vscode-css.js): the deck links it, so the preview stops
  // re-processing the 1.1 MB theme on every keystroke. marp-cli does not use it (its selectors match nothing there).
  { from: 'dist/lattice-vscode-min.css', to: KIT_VSCODE_STYLESHEET },
  { from: `kit/${DECK}`, to: DECK },
];

/**
 * THE VS CODE THEMES: stubs of the registered themes. A palette's is cut here by the same `stubOf` the build cuts with
 * (`@theme`, `@size`, its `@import`); the engine's is the build's own file (`built`), its directives plus the few declarations
 * that must keep the theme's place in the preview (tools/build-marp-vscode-css.js `pinnedRules`). The preview re-processes the
 * registered themes on every keystroke; a stub costs it next to nothing, and the styling arrives from `lattice-vscode-min.css`,
 * which the deck links. marp.config.cjs keeps the full themes: marp-cli renders once.
 */
const VSCODE_THEMES = [
  { from: 'dist/lattice-vscode-stub.css', to: '.vscode/themes/lattice.css', built: true },
  { from: `dist/themes/${THEME}-min.css`, to: `.vscode/themes/${THEME}.css` },
  { from: `dist/themes/${THEME}-dark-min.css`, to: `.vscode/themes/${THEME}-dark.css` },
];

/**
 * Every `dist/fonts/` file the kit's CSS references, via the EXPORT's walker.
 * `fontAssetsFor` strips CSS comments first and bounds the filename charset at
 * `[^)'"\s]{1,256}` — both hard-won, and both were lost in the copy this replaces.
 */
function fontFiles(cssTexts) {
  const files = new Set();
  for (const css of cssTexts) {
    for (const { to } of fontAssetsFor(css)) files.add(to.replace(/^fonts\//, ''));
  }
  return [...files].sort();
}

/**
 * `marp.config.cjs` — `html: true` is LOAD-BEARING, not a convenience.
 * marp-core defaults to `html: false`, which ESCAPES raw HTML rather than
 * dropping it, so the deck's two trailing <script> tags would print as literal
 * text on the last slide and the runtime would never load (#1256).
 *
 * `engine` hands the deck's `@video{…}` records to the runtime from markdown-it's
 * tokens (lib/plugins/video/shared/video-marp-engine.js): the runtime never reads an
 * address off the page, so without it a record prints as code. Written in as SOURCE,
 * the function the export bundle's config carries too, because this file runs with
 * nothing but marp-cli installed.
 */
function marpConfig() {
  return `// Auto-generated by tools/build-marp-kit.js — the Lattice copy-and-go kit.
const path = require('path');
// Hands the deck's \`@video{…}\` records to the runtime, read from the Markdown itself.
const latticeVideoRecords = (${videoRecordsEngine});
// Both files must be registered: a palette \`@import 'lattice'\` BY NAME, and
// only Marp's theme set resolves that. Registering the palette alone yields
// unstyled slides with no error.
module.exports = {
  themeSet: [
    path.join(__dirname, 'lattice-min.css'),
    path.join(__dirname, '${THEME}-min.css'),
    path.join(__dirname, '${THEME}-dark-min.css'),
  ],
  allowLocalFiles: true,
  // marp-core escapes raw HTML by default; without this the deck's runtime
  // <script> tags render as visible text and no chart or diagram is built.
  html: true,
  engine: ({ marp }) => marp.use(latticeVideoRecords),
};
`;
}

/**
 * `.vscode/settings.json` — paths are WORKSPACE-relative, which is why the kit
 * documents "open this folder as the workspace root". Register both stylesheets
 * for the same by-name `@import` reason as the marp-cli config.
 */
function vscodeSettings() {
  return `${JSON.stringify(
    {
      // The directive-only stubs (VSCODE_THEMES): the styling comes from lattice-vscode-min.css, which the deck links.
      'markdown.marp.themes': VSCODE_THEMES.map((t) => `./${t.to}`),
      // Mirrors marp.config.cjs's html:true. Without it the deck's trailing
      // <script> tags print as literal text across the preview. `html: "all"`
      // replaced the deprecated boolean `enableHtml` in marp-vscode 3.0.0.
      'markdown.marp.html': 'all',
    },
    null,
    2,
  )}\n`;
}

/**
 * `NOTICE.md` — the license facts a recipient needs, and cannot get from the kit
 * without them.
 *
 * This folder is NOT covered by Lattice's output exception, and that is not a
 * technicality. `LICENSE-EXCEPTIONS` §Limits withholds the exception from "(a)
 * the Lattice engine itself or any of its source or object form distributed
 * other than inside a rendered deck" and "(b) the embedded assets extracted or
 * separated from a rendered deck for reuse". A folder whose entire pitch is
 * "copy this folder" is both at once — so the kit is a plain AGPL-3.0
 * conveyance of engine object code, and it has to carry the license with it.
 *
 * The first version shipped 1 MB of minified engine and 37 third-party font
 * files with no LICENSE, no copyright notice, and no font attribution, while
 * inviting the recipient to redistribute the lot. The recipient was the one left
 * exposed. Found by the red team.
 *
 * THE RENDER-ROUTE PARAGRAPH is not padding — it replaces a sentence that read
 * "If you only want to make decks, nothing about this constrains you," which is
 * too broad. Measured on a real marp-cli render: `--pdf` carries no engine code
 * at all (no CSS rule, no `@theme` directive survives), but `--html` inlines
 * ~852 KB of engine stylesheet into the output file. The exception is written
 * for assets *Lattice's own export pipeline* embeds, and marp-cli is not that —
 * so publishing a `marp --html` file is, on a literal reading, outside it. That
 * gap is unresolved and is the OWNER's call, not this file's: see
 * engineering/decisions/2026-08-04-marp-render-output-exception.md.
 *
 * KEEP THIS PARAGRAPH FACTUAL — it must stay true under BOTH resolutions of that
 * question, and an earlier draft did not. It said the gap "is an open question on
 * our side" and told recipients to treat a published `.html` as carrying LICENSE
 * terms "until it is settled." A Munger inversion killed that: this is a
 * COPY-AND-GO folder with no update channel, so whatever it says today, the
 * copies people took say forever. If the exception is later extended, a shipped
 * warning that publishing conveys code outside it becomes wrong — permanently,
 * in every copy. What survives both outcomes is only the measurement (`--pdf`
 * carries nothing, `--html` inlines the stylesheet) and the neutral pointer to
 * LICENSE. Do not add a verdict here, in either direction, and do not re-broaden
 * it to the old reassurance either.
 */
function notice() {
  return `# Notices

## Lattice

Copyright (c) 2025-2026 Laticent. Licensed under the **GNU Affero General
Public License, version 3** — the full text is in \`LICENSE\`, beside this file.

\`lattice-min.css\`, \`${THEME}-min.css\`, \`${THEME}-dark-min.css\`,
\`lattice-vscode-min.css\`, the theme stubs in \`.vscode/themes/\` and
\`lattice-runtime-min.js\` are the Lattice engine in object form — as are their
unminified counterparts \`lattice.css\`, \`${THEME}.css\`, \`${THEME}-dark.css\`
and \`lattice-runtime.js\`, included for reading rather than running. They are
built from the Lattice repository, https://github.com/Laticent/lattice, which is
where their source is.

**The output exception does not apply to this folder.** Lattice grants an
exception for engine assets its export pipeline embeds *inside a rendered deck*.
This kit is deliberately the other thing — the engine handed over loose, for
reuse — so the AGPL applies to it in full. Slides you write are yours and were
never covered either way; the terms here are about redistributing these files.

**Rendering is worth one more paragraph**, because the two routes differ and only
one of them puts engine code in your hands to pass on:

- **\`marp --pdf\` and \`marp --pptx\` carry no engine code.** Measured, not
  assumed, on both: every stream in the PDF was decompressed and searched, and
  all 81 entries of the PPTX (which carries the deck as one image per slide).
  No CSS rule, no \`@theme\` directive, nothing of the engine survives either.
  What the PDF *does* embed is font subsets of the third-party faces below,
  which the OFL and MIT both permit in a document; the PPTX embeds no fonts.
  Render either way and share the file however you like. (The one route not
  measured is \`--pptx-editable\`, which converts through LibreOffice.)
- **\`marp --html\` inlines the engine stylesheet** — about 852 KB of it — into
  the output file. Keeping that file to yourself conveys nothing to anyone.
  Publishing it conveys the engine in object form, so if that is your plan, read
  \`LICENSE\` first. Rendering to PDF instead avoids the question entirely.

If you plan to redistribute the kit itself, or ship a service built on it, read
\`LICENSE\`.

## Third-party components

Bundled unmodified, under their own terms. Their licenses govern them, not the
AGPL above.

| Component | Files | License |
|---|---|---|
| Mermaid | \`mermaid-v11-min.js\` | MIT — Copyright (c) 2014-2022 Knut Sveidqvist |
| Tabler Icons | \`lattice-plugin-icons.js\` (all but \`stream\` and \`gateway\`), and the six status marks (\`--mark-*\`) in \`lattice-min.css\` and \`lattice.css\` | MIT — Copyright (c) 2020-2026 Paweł Kuna |
| KaTeX fonts | \`fonts/KaTeX_*.woff2\` | MIT — Copyright (c) 2013-2020 Khan Academy and contributors |
| Outfit | \`fonts/outfit-*.woff2\` | SIL Open Font License 1.1 |
| Playfair Display | \`fonts/playfair-*.woff2\` | SIL Open Font License 1.1 |
| JetBrains Mono | \`fonts/jetbrains-*.woff2\` | SIL Open Font License 1.1 |
| Caveat | \`fonts/caveat-*.woff2\` | SIL Open Font License 1.1 |
| Shantell Sans | \`fonts/shantell-*.woff2\` | SIL Open Font License 1.1 |

The OFL permits bundling and redistribution with the notice above kept intact.
It does not permit selling the font files on their own.

---

Generated by \`tools/build-marp-kit.js\`.
`;
}

function readme() {
  return `# Lattice — the copy-and-go Marp kit

Copy this folder and you are working. There is nothing to install and no build
step.

## Start here

**Open THIS FOLDER as your VS Code workspace root**, with the **Marp for VS
Code** extension installed, then open \`${DECK}\`. If you don't have the extension,
VS Code offers it when the folder opens (\`.vscode/extensions.json\` recommends it):
click **Install**.

That is not a style preference. \`.vscode/settings.json\` registers the
stylesheets by workspace-relative path (\`./lattice-min.css\`), so if the kit sits
as a sub-folder beside a deck somewhere else, those paths do not resolve and you
get unstyled slides **with no error**. Put your deck in here, next to
\`${DECK}\`, rather than putting this folder next to your deck.

From the command line instead:

\`\`\`sh
npx @marp-team/marp-cli@${MARP_SUPPORT.cli.major} ${DECK} --config-file marp.config.cjs --allow-local-files -o deck.pdf
\`\`\`

${marpSupportLine()} CI checks the result: one page per slide, the diagram drawn,
the split panel built, the equation typeset, the palette and the fonts live, and a
video record drawn as its poster. To be exact about the guarantee: that runs on
changes to engine, tooling or test code, not on documentation-only ones.

## What is in here

| File | What it does |
|---|---|
| \`${DECK}\` | A 13-slide deck that documents itself. Your starting point. |
| \`lattice-min.css\` | The engine — every layout and token. **marp-cli registers this one** (\`marp.config.cjs\`). |
| \`${THEME}-min.css\` | The default palette. Swap it to restyle the deck. |
| \`${THEME}-dark-min.css\` | A second palette. Select it with \`theme: ${THEME}-dark\`. |
| \`lattice-vscode-min.css\` | The same engine and every palette, already shaped the way the VS Code preview shapes them. The deck links it (\`<link rel="stylesheet" …>\`, beside its scripts), so the preview styles the slides without re-processing 1.1 MB of theme on every keystroke. marp-cli ignores it. |
| \`.vscode/themes/\` | What VS Code registers (\`.vscode/settings.json\`): only each theme's name and slide sizes, so the preview has almost nothing to re-process per keystroke. The styling comes from the linked file above. |
| \`lattice-runtime-min.js\` | Builds charts and diagrams in the browser. |
| \`mermaid-v11-min.js\` | Third party. Diagram slides need it. |
| \`lattice-dagre-min.js\` | Third party. Lays out a state chart that BRANCHES. **Delete it and the chart still draws** — on the reading-order grid a chain uses, each branch drawn as a skip, which looks deliberate rather than broken. It is the one file here whose absence is invisible on the slide. |
| \`lattice-plugin-icons.js\` | Third party (Tabler Icons). The icon drawings; the runtime loads it the first time a slide writes \`^{name}\`. **Delete it and every icon stays the code you typed.** |
| \`lattice-plugin-avatars.js\` | Ours. The avatar drawings; the runtime loads it the first time a slide writes \`!{Name}\`. **Delete it and every avatar stays the code you typed, and a team-profile portrait becomes a monogram.** |
| \`lattice.css\` · \`${THEME}.css\` · \`${THEME}-dark.css\` · \`lattice-runtime.js\` | Unminified counterparts of the four above, for reading or diffing. Neither config references them — delete them freely, or keep them for reference. |
| \`fonts/\` | The embedded typefaces. **Do not drop these** — without them type falls back to system serif, silently. |
| \`marp.config.cjs\` | Registers the stylesheets for marp-cli. |
| \`.vscode/settings.json\` | Registers them for the VS Code extension. |
| \`.vscode/extensions.json\` | Makes VS Code offer to install Marp for VS Code. |
| \`NOTICE.md\` · \`LICENSE\` · \`THIRD-PARTY-LICENSES.txt\` | The terms these files come under, and the full third-party license texts. Worth two minutes. |

## Three things that will bite you

**The deck's last lines are load-bearing: one \`<link>\` and three \`<script>\`
tags.** Copy them into every deck you write here. The \`<link>\` is how the VS
Code preview gets its styling (without it, slides in VS Code are plain text;
marp-cli does not need it). The scripts belong at the END: Marp emits raw HTML
inline, in document order, so a \`<script>\` at the top lands inside slide 1 and
runs before the rest of the deck exists. \`${DECK}\` does this — copy the pattern.

**\`html: true\` is required, not optional.** marp-core escapes raw HTML by
default, which turns the deck's \`<script>\` tags into visible text and leaves
every chart and diagram unbuilt. Both config files here set it.

**Dark mode is \`class: dark\`, not \`color-mode:\`.** \`class:\` is Marp's own
front-matter key and it stamps every slide, which is exactly what Lattice's dark
styling keys off. Lattice's richer deck registers (\`color-mode:\`, \`finish:\`,
\`logo:\`, …) are read from a block that only the full export pipeline writes, so
in a hand-authored deck like this one they do nothing. Set one or the other, never
both: in Lattice's own pipeline \`color-mode:\` supersedes the \`class:\` alias and
drops it, so a deck carrying both renders differently on the two sides.

## Fidelity

**The runtime is what makes this deck complete, and it only runs in a browser.**
Four of the thirteen slides are assembled by \`lattice-runtime-min.js\`, not by
CSS: the Mermaid diagram, the chart, the matrix grid, and the split panel. Where
that script runs, the deck is whole. Where it does not, those four are raw.

- **\`marp --pdf\`** drives real headless Chrome, so the runtime runs and the PDF
  is complete. This is the path \`${DECK}\` is verified on, and the one to trust.
- **\`marp --html\`** does NOT launch a browser — it converts in about a second
  and writes a file. The runtime runs later, when a person opens that file, and
  only if \`lattice-runtime-min.js\` and \`mermaid-v11-min.js\` are still sitting
  beside it. Mail someone the \`.html\` on its own and they get a broken deck.
- **The VS Code preview pane** runs marp-core directly, without Lattice's
  markdown-it plugins, and runs the deck's \`<script>\` tags at one preview
  security level only. At VS Code's default (*Strict*) the preview shows *"Some
  content has been disabled in this document"* and those four slides stay raw;
  click that message and choose **Disable** (*"Allow all content and script
  execution"*) and they draw. VS Code remembers the choice per folder. The folder
  must be trusted first (the *Restricted Mode* banner → **Manage** → **Trust**).
  Measured on VS Code 1.142.0 and 1.145.2 with Marp for VS Code 3.6.1.

Everything CSS does — layout, palette, typography, every purely-CSS layout —
holds on all three. Render the deck for anything you need to trust.

**A video** is written as a record on a line of its own,
\`@video{"<the clip's address>", title="…"}\`, and draws as a poster that links to
the clip (YouTube, Vimeo, TikTok or Instagram), and on a \`video\` slide as the same
card Lattice draws. It needs the runtime, like a chart. The address is always read
from your Markdown, never from the page: \`marp.config.cjs\` hands the records over
as marp-cli parses the deck, and the VS Code preview reads the saved file. So in
VS Code a record you have just typed draws when you save.

## What these settings allow

The kit asks for three things that Marp leaves off by default. Each one applies to
**every deck in this folder**, not only to yours, so keep decks you did not write
out of it.

- **Raw HTML** (\`html: true\` in \`marp.config.cjs\`, \`"markdown.marp.html": "all"\`
  in \`.vscode/settings.json\`). The runtime is loaded by \`<script>\` tags in the
  deck, which Marp would otherwise print as text. It also lets any HTML a deck
  contains through, scripts included.
- **Local files** (\`allowLocalFiles\`, \`--allow-local-files\`). marp-cli's
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

1. **The folder is not your workspace root.** \`.vscode/settings.json\` uses
   workspace-relative paths. Open THIS folder, not its parent.
2. **In VS Code: the deck has no \`<link rel="stylesheet" href="lattice-vscode-min.css">\`.**
   The preview's styling comes from that line. Copy the last lines of \`${DECK}\`.
3. **The whole folder did not come across.** \`lattice-min.css\` and
   \`lattice-vscode-min.css\` must sit beside \`${DECK}\`, and \`fonts/\` beside that.
4. **VS Code has not reloaded the setting.** Run *Developer: Reload Window* after
   the folder is first opened.

When the scripts run (VS Code at *Disable*, or a marp-cli render), the browser's
console says which of these it is: the runtime warns once when the Lattice
stylesheet did not reach the slides.

If type looks right but the layout does not, it is the palette rather than the
engine: \`${THEME}-min.css\` \`@import\`s \`lattice\` **by name**, so both files
have to be registered — one alone renders bare.

**If a render fails with "No usable sandbox!"** — common on CI runners and
hardened Linux — set \`CHROME_NO_SANDBOX=1\` in the environment. marp-cli turns
the Chromium sandbox off by itself for root, and inside a container, but a plain
non-root machine with unprivileged user namespaces restricted is neither, and
Chromium refuses to start. This is marp-cli's own switch.

If a render hangs instead, the usual cause is a small \`/dev/shm\` — give the
container more shared memory (\`docker run --shm-size=1g\` or equivalent).

Both of these lines used to say "pass \`--browser-args=…\`". **marp-cli has no
such option** (only \`--browser\`, \`--browser-path\`, \`--browser-protocol\`,
\`--browser-timeout\`), so that advice did nothing at all.

---

Generated by \`tools/build-marp-kit.js\`. Do not edit in place — edit
\`kit/${DECK}\` and run \`npm run build\`.
`;
}

/** A bundle's trailing `//# sourceMappingURL=data:…` line removed; any other text is left exactly as it was. */
function withoutInlineSourceMap(js) {
  const at = js.lastIndexOf('\n//# sourceMappingURL=data:');
  return at === -1 ? js : `${js.slice(0, at)}\n`;
}

/**
 * The bytes the kit SHIPS FOR RENDERING, on disk: every stylesheet and script the configs and the deck pull in (the engine,
 * the palettes, the runtime, Mermaid, dagre, the icon and avatar drawings) and every font. A render loads less: a browser
 * fetches a font face only when the slide uses its characters (the emoji and KaTeX faces are mostly never fetched). The
 * readable copies, the docs, the licenses and the configs are not loaded by anything. `kit/Sample-Deck.md`'s "what the folder costs you" slide states
 * this number, and test/unit/tools/marp-kit-sample-deck.test.js holds it to this measure.
 * @param {Map<string, Buffer|string>} kit  `buildKit()`'s map
 */
function renderBytes(kit) {
  const readable = new Set(UNMINIFIED_PAIRS.map((u) => u.to));
  let total = 0;
  for (const [rel, body] of kit) {
    const loaded = rel.startsWith('fonts/') || (/\.(?:css|js)$/.test(rel) && !readable.has(rel));
    if (loaded) total += norm(body).length;
  }
  return total;
}

/** The kit as a flat map of kit-relative path → contents (Buffer or string). */
function buildKit() {
  const out = new Map();
  for (const a of ASSETS) out.set(a.to, fs.readFileSync(path.join(ROOT, a.from)));
  for (const t of VSCODE_THEMES) {
    const css = fs.readFileSync(path.join(ROOT, t.from), 'utf8');
    out.set(t.to, t.built ? css : stubOf(css));
  }
  // The readable runtime, without the DevTools source map that is most of its weight (see the docblock).
  out.set('lattice-runtime.js', withoutInlineSourceMap(out.get('lattice-runtime.js').toString('utf8')));

  const cssTexts = ASSETS.filter((a) => a.to.endsWith('.css')).map((a) =>
    out.get(a.to).toString('utf8'),
  );
  const fonts = fontFiles(cssTexts);
  for (const f of fonts) {
    out.set(`fonts/${f}`, fs.readFileSync(path.join(ROOT, 'dist', 'fonts', f)));
  }

  out.set('marp.config.cjs', marpConfig());
  out.set('.vscode/settings.json', vscodeSettings());
  out.set('.vscode/extensions.json', vscodeExtensions());
  out.set('README.md', readme());
  out.set('NOTICE.md', notice());
  // Verbatim, not summarized: an AGPL conveyance has to carry the actual text.
  out.set('LICENSE', fs.readFileSync(path.join(ROOT, 'LICENSE')));
  // The exception NOTICE.md reasons about, so a recipient can check the claim
  // rather than take it on trust.
  out.set('LICENSE-EXCEPTIONS', fs.readFileSync(path.join(ROOT, 'LICENSE-EXCEPTIONS')));
  // THIRD-PARTY-LICENSES.txt arrives through STATIC_ASSETS above, the same file the
  // Export-to-Marp bundle carries (lib/export/third-party-licenses.js, #1354). MIT and
  // OFL both require their TEXT to travel with the files, not merely a mention.
  return out;
}

function readCommitted() {
  const seen = new Map();
  const walk = (dir, prefix) => {
    let entries;
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of entries) {
      const rel = prefix ? `${prefix}/${e.name}` : e.name;
      if (e.isDirectory()) walk(path.join(dir, e.name), rel);
      else seen.set(rel, fs.readFileSync(path.join(dir, e.name)));
    }
  };
  walk(OUT_DIR, '');
  return seen;
}

const norm = (v) => (Buffer.isBuffer(v) ? v : Buffer.from(String(v), 'utf8'));

function main(argv) {
  const fresh = buildKit();
  if (argv.includes('--check')) {
    const cur = readCommitted();
    const missing = [...fresh.keys()].filter((k) => !cur.has(k));
    const extra = [...cur.keys()].filter((k) => !fresh.has(k));
    const differs = [...fresh.keys()].filter(
      (k) => cur.has(k) && !norm(fresh.get(k)).equals(norm(cur.get(k))),
    );
    if (missing.length || extra.length || differs.length) {
      process.stderr.write('error: dist/marp-kit is stale.\n');
      if (missing.length) process.stderr.write(`       missing: ${missing.join(', ')}\n`);
      if (extra.length) process.stderr.write(`       unexpected: ${extra.join(', ')}\n`);
      if (differs.length) process.stderr.write(`       changed: ${differs.join(', ')}\n`);
      process.stderr.write('       Run `npm run build` to regenerate.\n');
      return 1;
    }
    process.stdout.write(`dist/marp-kit is up to date (${fresh.size} files).\n`);
    return 0;
  }

  fs.rmSync(OUT_DIR, { recursive: true, force: true });
  for (const [rel, body] of fresh) {
    const dest = path.join(OUT_DIR, rel);
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.writeFileSync(dest, norm(body));
  }
  process.stdout.write(`[build-marp-kit] dist/marp-kit (${fresh.size} files)\n`);
  return 0;
}

if (require.main === module) process.exit(main(process.argv.slice(2)));

module.exports = { buildKit, renderBytes, withoutInlineSourceMap, fontFiles, marpConfig, vscodeSettings, readme, main, OUT_DIR, DECK };
