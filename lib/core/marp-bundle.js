/**
 * lib/core/marp-bundle.js
 *
 * The pure, fs-free spec for an "Export to Marp" bundle — the SINGLE source of
 * truth shared by both producers so they can't drift:
 *
 *   1. tools/export-marp.js  — the Node CLI (reads asset bytes from disk, zips
 *      via the `zip` binary).
 *   2. the Drawing Board      — the in-browser export (fetches asset bytes over
 *      HTTP, zips via JSZip), through the playground engine bundle.
 *
 * This module owns: the generated text files (README, marp.config.cjs,
 * package.json, .vscode/settings.json), the trailing runtime `<script>` block
 * appended to the deck, the filename sanitizer, and the ASSET manifest (which
 * static files the bundle carries and where). It does NOT read files or know
 * about transport — each producer supplies the bytes for the manifest entries.
 * The split baking lives in lib/core/bake-splits.js (also shared); asset
 * localization is producer-side.
 *
 * The bundle is a MARP-NATIVE artifact: it is rendered with Marp (the VS Code
 * extension or marp-cli), NOT with Lattice's own engine — Lattice's role is to
 * ship the deck, the minified palette CSS (lattice.css + themes/), the browser
 * runtime, and Mermaid. There is no bundled emulator.
 */

const MARP_CLI_RANGE = '^4.3.1';

// Static assets every bundle carries, as { from, to } where `from` is the repo
// path (CLI) / served basename (browser) and `to` is the path inside the bundle.
// All are MINIFIED. lattice.css + themes/ are the Marp themeSet; the runtime +
// mermaid render diagrams/components when the exported HTML is opened in a
// browser. The per-palette theme CSS is added per-deck by each producer (from
// dist/themes/<palette>.min.css), since which palette ships depends on the deck.
const STATIC_ASSETS = Object.freeze([
  { from: 'dist/lattice.min.css', to: 'lattice.css' },
  { from: 'dist/lattice-runtime.min.js', to: 'lattice-runtime.min.js' },
  { from: 'mermaid-v11.min.js', to: 'mermaid-v11.min.js' },
]);

// The AGENT KIT — carried by default so a recipient's AI agent (Claude, Copilot,
// Cursor, …) can KEEP AUTHORING the exported deck correctly: it ships the
// machine-readable Lattice component catalog (axes, slots, skeletons, and the
// content-capacity contract) the agent reads to pick layouts by content shape.
// Paired with a generated, bundle-tailored AGENTS.md (agentsMd) at the root.
// Opt-out per-export (CLI `--no-agent`); see engineering/decisions/2026-06-13-export-to-marp.md §10.
const AGENT_ASSETS = Object.freeze([
  { from: 'dist/docs/components.json', to: 'agent/components.json' },
]);

// A stylesheet-relative font reference: `url(fonts/<file>)`, optionally quoted.
// Every quantifier is BOUNDED — the browser producer runs this over CSS it just
// fetched, so an unbounded `\s*`/`+` pair here is an untrusted-input-into-
// superlinear-regex flow. The real corpus is nowhere near these ceilings (the
// longest filename in dist/fonts/ is 31 chars; url() bodies carry no padding at
// all), so the bounds are generous rather than load-bearing.
const FONT_URL = /url\([ \t]{0,8}['"]?fonts\/([^)'"\s]{1,256})['"]?[ \t]{0,8}\)/g;

/**
 * The FONT supply — the woff2 faces `lattice.css` references, carried into the
 * bundle at `fonts/<file>` so exported decks keep Lattice's typography.
 *
 * Why this is derived rather than listed: the stylesheet's `@font-face` src is
 * a stylesheet-relative `url(fonts/<file>.woff2)` (lib/fonts/text-faces.js —
 * "resolved relative to the stylesheet"), correct for the npm package where
 * dist/fonts/ sits beside dist/lattice.css. A bundle that ships the CSS without
 * that directory 404s every face and silently falls back to system serif/sans —
 * the whole typographic contract (HARD RULE #4) gone, on every slide. Reading
 * the refs back OUT of the stylesheet the bundle actually carries is the one
 * source that cannot drift from it: add a face, drop a face, or bump KaTeX, and
 * the supply follows without a second list to update.
 *
 * Marp INLINES a themeSet entry into the rendered HTML's `<style>`, so `fonts/`
 * resolves against the deck document — which is why the directory sits at the
 * bundle ROOT, beside both `lattice.css` and `<name>.html`.
 *
 * @param {string} latticeCss text of the bundled (minified) lattice.css
 * @returns {{from: string, to: string}[]} sorted, deduped, producer-agnostic
 */
const { distributeLeadingIs } = require('./leading-is');

/**
 * Make a stylesheet MARP-SCOPABLE before it enters the bundle.
 *
 * marp-core scopes a theme rule off its leftmost compound: a literal leading
 * `section` is the slide, anything else is a slide descendant. Lattice's chart
 * and Form CSS leads with the dual-surface `:is(section.x, figure.x)` head, so
 * marp-core prefixed the whole head and emitted `… > section :is(section.x, …)`
 * — a slide nested in a slide, which never matches. ~835 rules died that way in
 * every Marp render: the entire chart bucket (matrix-grid, roadmap, gantt,
 * kanban, radar, quadrant, funnel, piechart, progress, map, timeline-list,
 * word-cloud) plus the shared `:is(section, figure)` Form layer.
 *
 * Our own engine never hit this because lib/engine/css.js distributes the arms
 * before scoping. We cannot patch marp-core, so the export bakes the same
 * distribution into the CSS it hands over — one shared kernel, both paths
 * (lib/core/leading-is.js). Producers call this on the stylesheet bytes they
 * write as `lattice.css`; everything else about the file is untouched, and
 * `dist/lattice.min.css` itself is unchanged for every non-Marp consumer.
 */
function marpScopableCss(css) {
  return distributeLeadingIs(css);
}

function fontAssetsFor(latticeCss) {
  const files = new Set();
  for (const m of String(latticeCss || '').matchAll(FONT_URL)) files.add(m[1]);
  return [...files].sort().map((f) => ({ from: `dist/fonts/${f}`, to: `fonts/${f}` }));
}

/** Deck → a filesystem-safe slug for the bundle/zip name. */
function safeName(name) {
  return (name || 'deck').trim().replace(/[^\w.-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60) || 'deck';
}

// Appended to the exported deck's markdown (at EOF). The bundled mermaid + the
// Lattice browser runtime render diagrams and structural components CLIENT-SIDE
// when the deck is opened as HTML in a browser. The markdownlint-disable keeps
// the inline <script> tags from tripping MD033 when the .md is edited.
const RUNTIME_SCRIPTS = [
  '',
  '<!-- markdownlint-disable MD033 -->',
  '<script src="mermaid-v11.min.js"></script>',
  '<script src="lattice-runtime.min.js"></script>',
  '',
].join('\n');

/** Append the runtime scripts to a (baked, front-matter-included) deck source. */
function withRuntimeScripts(deckSource) {
  return `${deckSource.replace(/\s*$/, '')}\n${RUNTIME_SCRIPTS}`;
}

// The marp-cli config: register the bundled theme CSS (lattice.css + every
// palette under themes/) so `marp` splits (via the baked `---`) and styles the
// deck. Every palette `@import 'lattice'` by name, so lattice.css MUST be
// registered too. Marp applies palette + CSS layouts; Mermaid + JS-driven
// components are rendered by lattice-runtime.min.js when the exported HTML is
// opened in a browser (the deck's trailing <script> tags).
//
// `html: true` is LOAD-BEARING, not a convenience. marp-core defaults to
// `html: false`, which ESCAPES raw HTML instead of passing it through — so the
// two RUNTIME_SCRIPTS tags this bundle appends to the deck came out the far end
// as literal `<script src="lattice-runtime.min.js"></script>` TEXT printed on
// the deck's last slide, and the runtime never loaded. Every transform-driven
// component (split-panel, the chart family, Mermaid) then rendered as bare
// markdown. It also matches the owned engine, which parses with `html: true`
// (lib/engine/index.js) — a deck that may write raw HTML on our render path has
// to be able to write it on the export path (HARD RULE #1).
const MARP_CONFIG_CJS = `// Auto-generated by Lattice "Export to Marp".
const fs = require('fs');
const path = require('path');
const themeSet = [
  path.join(__dirname, 'lattice.css'),
  ...fs.readdirSync(path.join(__dirname, 'themes')).map((f) => path.join(__dirname, 'themes', f)),
];
// html: marp-core escapes raw HTML by default, which would turn the deck's
// runtime <script> tags into visible text and leave the runtime unloaded.
module.exports = { themeSet, allowLocalFiles: true, html: true };
`;

/**
 * .vscode/settings.json for the bundle — registers the bundled palette with the
 * Marp for VS Code extension so opening the deck previews in the right theme.
 * `themes` is the workspace-relative path list (lattice.css + the palette files);
 * lattice.css is included because every palette `@import 'lattice'` by name.
 *
 * `markdown.marp.enableHtml` mirrors the marp-cli config's `html: true`: the
 * extension also defaults to escaping raw HTML, so without it the deck's two
 * trailing runtime `<script>` tags print as literal text across the preview's
 * last slide. Enabling it is necessary for the tags to survive; whether the
 * preview WEBVIEW then executes them is a separate question the extension owns
 * (engineering/gotchas.md § "VS Code / marp-vscode").
 */
function vscodeSettings(themes) {
  return `${JSON.stringify(
    { 'markdown.marp.themes': themes, 'markdown.marp.enableHtml': true },
    null,
    2,
  )}\n`;
}

/**
 * package.json for the bundle. The ONLY dependency is marp-cli (so `npm install`
 * → `npm run pdf` works). Listing `@slidewright/lattice` here would break
 * `npm install` outright: it is not published to the public registry, so npm
 * 404s on it and the recipient never gets marp-cli either. Lattice ships no
 * engine in the bundle — it is rendered with Marp.
 */
function packageJson(name) {
  return {
    name: `${safeName(name)}-marp-export`,
    private: true,
    description: `Portable Marp bundle of the "${name}" Lattice deck`,
    scripts: {
      pdf: `marp ${name}.md --config-file marp.config.cjs --allow-local-files -o ${name}.pdf`,
      html: `marp ${name}.md --config-file marp.config.cjs --allow-local-files -o ${name}.html`,
    },
    dependencies: {
      '@marp-team/marp-cli': MARP_CLI_RANGE,
    },
  };
}

/** README.md for the bundle. `themes` is the list of bundled theme paths;
 *  `agent` (caller-driven) adds the "extend with an AI agent" section + rows
 *  when truthy — the CLI passes `includeAgent`, the browser passes `agentOk`. */
function readme({ name, palette, themes, agent }) {
  return `# ${name} — portable Marp bundle

Exported from Lattice. The slide splits are **baked into literal \`---\`**, so the
deck divides correctly in any Marp tool — no Lattice plugin required. Render it
with **Marp** (the VS Code extension or marp-cli); the \`${palette}\` palette, the
Lattice layout, and the bundled type ride along as plain CSS, and a small browser
runtime renders Mermaid + the structural components.

## Marp CLI — the full-fidelity route

\`\`\`sh
npm install        # installs marp-cli (the only dependency)
npm run pdf        # → ${name}.pdf   (or: npm run html)
\`\`\`

Both scripts use \`marp.config.cjs\`, which registers the bundled themes **and**
sets \`html: true\`. That flag is required: marp-core escapes raw HTML by default,
which would turn this deck's two trailing \`<script>\` tags into visible text and
leave the runtime unloaded. With it, marp-cli's headless browser runs
\`mermaid-v11.min.js\` + \`lattice-runtime.min.js\` while it renders, so the PDF and
the HTML both carry the structural layouts (split panels, card grids, islands,
badge tables), the Mermaid diagrams, and the per-shape adaptive reflow.

If you invoke marp-cli by hand instead, pass \`--html\` yourself — without it you
get palette + CSS layout only:

\`\`\`sh
npx @marp-team/marp-cli ${name}.md --theme-set lattice.css themes \\
  --html --allow-local-files -o ${name}.pdf
\`\`\`

\`${name}.html\` opens standalone in any browser — same scripts, same result, no
install.

## VS Code (Marp for VS Code)

1. Install the **Marp for VS Code** extension (\`marp-team.marp-vscode\`).
2. Open this folder — the bundled \`.vscode/settings.json\` already registers the
   palette via \`markdown.marp.themes\` (${themes.join(', ')}) and sets
   \`markdown.marp.enableHtml\`.
3. Open \`${name}.md\` and toggle the Marp preview, or export to PDF/HTML/PPTX from
   the command palette.

**What the preview pane can and can't show.** It renders the palette, the
typography, and every CSS-driven layout. Its webview does not execute the deck's
\`<script>\` tags, so anything the runtime builds — Mermaid diagrams, split panels,
the chart family — stays as plain markdown there. Use \`npm run pdf\` / \`npm run
html\` (above) for the full deck; the preview is for drafting copy and checking
palette, not for final review.

${agent ? `## Extend it with an AI agent

This bundle carries the Lattice component catalog, so an AI coding agent (Claude,
Copilot, Cursor, …) can keep authoring the deck correctly. Open this folder with
your agent and point it at \`AGENTS.md\` — it explains how to pick a component,
honour its slots, and stay within each layout's content **capacity** (so added
slides don't overflow).

` : ''}## What's in here

| Path | What |
|---|---|
| \`${name}.md\` | the deck — splits baked to \`---\`, image paths localized, runtime \`<script>\` tags appended |${agent ? `
| \`AGENTS.md\` | entrypoint for an AI agent extending the deck |
| \`agent/components.json\` | the Lattice component catalog — pick layouts, slots, capacity |` : ''}
| \`lattice.css\` | the palette-blind engine stylesheet (minified) |
| \`themes/\` | the \`${palette}\` palette (+ dark), minified |
| \`fonts/\` | the woff2 faces \`lattice.css\` references — keep beside it |
| \`lattice-runtime.min.js\`, \`mermaid-v11.min.js\` | render diagrams + components in the browser |
| \`.vscode/settings.json\` | registers the themes + enables HTML for the Marp VS Code preview |
| \`marp.config.cjs\` | Marp CLI config (registers \`lattice.css\` + \`themes/\`, sets \`html\`) |
| \`package.json\` | pins marp-cli (for \`npm run pdf\` / \`npm run html\`) |
| \`assets/\` | local images the deck references (if any) |
`;
}

/**
 * AGENTS.md for the bundle — the vendor-neutral entrypoint that lets an AI agent
 * extend the exported deck with full Lattice knowledge. Tailored to the bundle's
 * OWN layout (the repo's AGENTS.md points at repo paths/tooling that don't exist
 * here), and honest that the catalog is a frozen snapshot. `version` is the
 * Lattice version that produced the bundle (optional).
 */
function agentsMd({ name, version }) {
  const stamp = version ? `Lattice ${version}` : 'Lattice';
  return `# AGENTS.md — extend this deck with an AI agent

This folder is a portable **Marp** bundle of the "${name}" deck, exported from
Lattice. It carries the Lattice component catalog so an AI agent (Claude,
Copilot, Cursor, an SDK agent) can keep authoring the deck correctly — picking
the right layout, honouring each component's slots, and staying within its
content capacity.

## The deck

- \`${name}.md\` — the slides. Each opts into a Lattice **component** via a
  \`<!-- _class: <name> -->\` directive and fills its slots with ordinary
  Markdown. Edit this file; re-render per \`README.md\` (Marp — the VS Code
  extension or marp-cli).

## Pick the right component

- \`agent/components.json\` — the machine-readable Lattice catalog: every
  component's axes, search tags, slots, authoring skeleton, **\`capacity\`**, and
  \`whenToUse\` / \`antiPatterns\` / \`related\` prose. **Load it before adding or
  changing a slide; never invent a \`_class\` that isn't in it.**
- **Count first, then filter by capacity.** A layout overflows when it holds
  more elements than it's built for — the most common authoring slip. Before
  choosing a \`_class\`, count your content (items / rows / columns / code lines)
  and check the component's \`capacity\` \`{ axis, sweet, soft, hard, escalateTo }\`:
  \`sweet\` is ideal, past \`soft\` it crowds, past \`hard\` it overflows. Over
  \`hard\`? Take an \`escalateTo\` target or split across slides. Not every
  component declares \`capacity\` yet; where it's absent, judge by the skeleton
  and split when a slide looks crowded.

## Rules agents most often break

- **Card-style layouts use nested bullets, not inline bold:** \`- Title\` then
  \`  - body\`, never \`- **Title.** body\`.
- **Slots + skeletons in the catalog are the contract** — follow the selectors;
  don't improvise structure.

## Provenance

The catalog is a **frozen snapshot** taken when this deck was exported
(${stamp}). It reflects the components available then; a newer Lattice may add
more. Re-export from Lattice to refresh it.
`;
}

module.exports = {
  STATIC_ASSETS,
  AGENT_ASSETS,
  fontAssetsFor,
  marpScopableCss,
  RUNTIME_SCRIPTS,
  MARP_CONFIG_CJS,
  withRuntimeScripts,
  safeName,
  packageJson,
  vscodeSettings,
  readme,
  agentsMd,
};
