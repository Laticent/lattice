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

const SCRIPT_LINE_RE = /^\s*<script\s+src="[^"]*(?:mermaid|lattice-runtime)[^"]*"\s*>\s*<\/script>\s*$/i;
const SINGLE_LINE_COMMENT_RE = /^\s*<!--.*-->\s*$/;

/**
 * Strip a pre-existing trailing "local preview" runtime-script block — zero or
 * more HTML comments (the markdownlint-disable pragma, or an explanatory
 * note), followed by one or more `<script src="...">` tags whose src
 * references mermaid or lattice-runtime. This is the exact convention
 * example/gallery decks use so Mermaid + structural components render when
 * previewing locally (`engineering/workflow.md`).
 *
 * Line-based, NOT a single backtracking regex over the whole document. A
 * Lattice deck's body is full of *other*, unrelated `<!-- _class: … -->`
 * directive comments — one per slide — so a naive `(?:<!--[\s\S]*?-->)*`
 * pattern is a real footgun: on backtrack it can lazily stretch to treat the
 * ENTIRE deck as "one comment" spanning from the first directive comment near
 * the top to the trailing scripts at the bottom, deleting the whole body.
 * Walking backward line by line can't do that — it stops the instant a line
 * isn't blank, part of a *contiguous* trailing comment, or a qualifying
 * script tag, so it can never reach past real slide content.
 */
function stripTrailingRuntimeScripts(deckSource) {
  const trimmed = deckSource.replace(/\s*$/, '');
  const lines = trimmed.split(/\r?\n/);
  let i = lines.length;
  let sawScript = false;
  while (i > 0) {
    const line = lines[i - 1];
    if (line.trim() === '') { i--; continue; }
    if (SCRIPT_LINE_RE.test(line)) { sawScript = true; i--; continue; }
    if (SINGLE_LINE_COMMENT_RE.test(line)) { i--; continue; }
    if (/-->\s*$/.test(line)) {
      // The closing line of a MULTI-line comment (didn't also open on this
      // line, or SINGLE_LINE_COMMENT_RE above would already have matched it).
      // Scan backward for its opening `<!--` — bounded: stops at the first
      // line containing it, never rescans, and bails out (breaks the outer
      // loop without stripping) if no opener is found at all.
      let k = i - 2;
      while (k >= 0 && !lines[k].includes('<!--')) k--;
      if (k < 0) break;
      i = k;
      continue;
    }
    break;
  }
  if (!sawScript) return trimmed;
  return lines.slice(0, i).join('\n').replace(/\s*$/, '');
}

/**
 * Append the runtime scripts to a (baked, front-matter-included) deck source.
 * Strips any pre-existing trailing runtime-script block first — a source deck
 * that already carries one (for local VS Code / browser preview) would
 * otherwise end up with the pair duplicated once the bundle's own copy, with
 * bundle-relative paths, is appended below.
 */
function withRuntimeScripts(deckSource) {
  return `${stripTrailingRuntimeScripts(deckSource)}\n${RUNTIME_SCRIPTS}`;
}

// The marp-cli config: register the bundled theme CSS (lattice.css + every
// palette under themes/) so `marp` splits (via the baked `---`) and styles the
// deck. Every palette `@import 'lattice'` by name, so lattice.css MUST be
// registered too. Marp applies palette + CSS layouts; Mermaid + JS-driven
// components are rendered by lattice-runtime.min.js when the exported HTML is
// opened in a browser (the deck's trailing <script> tags) — which requires
// `html: true`: marp-core's default HTML sanitizer strips raw <script src>
// tags from markdown as an XSS precaution, and without this the runtime never
// loads, silently breaking every structural component (masthead-lift's
// `.cell-stage`, split panels, chart-family, …) in both the PDF and HTML
// export paths. Safe to enable unconditionally here: this bundle is a
// self-contained artifact generated from the author's own trusted deck, not
// aggregating third-party markdown (contrast the docs-site Studio, HARD RULE
// #22) — `allowLocalFiles` right below is the same kind of fixed default.
const MARP_CONFIG_CJS = `// Auto-generated by Lattice "Export to Marp".
const fs = require('fs');
const path = require('path');
const themeSet = [
  path.join(__dirname, 'lattice.css'),
  ...fs.readdirSync(path.join(__dirname, 'themes')).map((f) => path.join(__dirname, 'themes', f)),
];
module.exports = { themeSet, allowLocalFiles: true, html: true };
`;

/**
 * .vscode/settings.json for the bundle — registers the bundled palette with the
 * Marp for VS Code extension so opening the deck previews in the right theme.
 * `themes` is the workspace-relative path list (lattice.css + the palette files);
 * lattice.css is included because every palette `@import 'lattice'` by name.
 */
function vscodeSettings(themes) {
  return `${JSON.stringify({ 'markdown.marp.themes': themes }, null, 2)}\n`;
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
with **Marp** (the VS Code extension or marp-cli); the \`${palette}\` palette + the
Lattice layout ride along as plain CSS, and a small browser runtime renders
Mermaid + structural components when you open the exported HTML.

## VS Code (Marp for VS Code)

1. Install the **Marp for VS Code** extension (\`marp-team.marp-vscode\`).
2. Open this folder — the bundled \`.vscode/settings.json\` already registers the
   palette via \`markdown.marp.themes\` (${themes.join(', ')}).
3. Open \`${name}.md\` and toggle the Marp preview, or export to PDF/HTML/PPTX from
   the command palette.

## Marp CLI

\`\`\`sh
npm install        # installs marp-cli (the only dependency)
npm run pdf        # → ${name}.pdf   (or: npm run html)
\`\`\`

…or without installing, point marp-cli at the bundled themes directly:

\`\`\`sh
npx @marp-team/marp-cli ${name}.md --theme-set lattice.css themes \\
  --allow-local-files -o ${name}.pdf
\`\`\`

Marp applies the palette + the CSS layouts (card grids, split panels, typography).
It does **not** run the Mermaid/component runtime — those render in the browser
route below.

## Full fidelity — open the HTML in a browser

\`${name}.html\` (from \`npm run html\`, or any Marp HTML export of \`${name}.md\`)
loads the bundled \`mermaid-v11.min.js\` + \`lattice-runtime.min.js\` via two
\`<script>\` tags at the end of the deck. Opened in a browser they render Mermaid
diagrams **and** the structural layouts (card grids, split panels, islands, badge
tables) client-side — the full deck, no install. (The VS Code preview pane blocks
inline scripts, so those show here, not in the preview.)

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
| \`lattice-runtime.min.js\`, \`mermaid-v11.min.js\` | render diagrams + components in the browser |
| \`.vscode/settings.json\` | registers the themes for the Marp VS Code preview |
| \`marp.config.cjs\` | Marp CLI config (registers \`lattice.css\` + \`themes/\`) |
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
  RUNTIME_SCRIPTS,
  MARP_CONFIG_CJS,
  withRuntimeScripts,
  safeName,
  packageJson,
  vscodeSettings,
  readme,
  agentsMd,
};
