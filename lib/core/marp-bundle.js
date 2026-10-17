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
 * The split baking lives in lib/core/bake-splits.js (also shared). Asset COPYING is
 * producer-side, but WHICH references a bundle localizes is shared here (`mapImageRefs`,
 * `mapFrontMatterLogo`), so the CLI and the in-browser producer rewrite the same strings.
 *
 * The bundle is a MARP-NATIVE artifact: it is rendered with Marp (the VS Code
 * extension or marp-cli), NOT with Lattice's own engine — Lattice's role is to
 * ship the deck, the minified palette CSS (lattice.css + themes/), the browser
 * runtime, and Mermaid. There is no bundled emulator.
 */

const { distributeLeadingIs, stripCssComments } = require('./leading-is');
const {
  FRONT_MATTER_TYPE, readFrontMatterBlock, frontMatterBlock, withoutFrontMatterBlock,
} = require('./deck-front-matter');
const {
  exportSettingsBlock, withoutExportSettingsBlock,
} = require('./export-settings');
const { withSanitizedDeckClass } = require('./deck-class-register');
const { withoutLiveAuthorHtml } = require('./live-author-html');
const { refuseAuthorMarkupInSource, offDrawnFences } = require('../plugins/author-markup.js');
const { sampleName } = require('./remote-ref');
const { PLUGIN_GRAMMAR } = require('../plugins/grammar.generated.mjs');
const { withoutCodeRecords } = require('../plugins/code/shared/marp-export.js');
const { configSource: htmlConfigSource, refusedHtml } = require('./marp-bundle-html');
const { fidelityNotes } = require('./marp-fidelity');
const { bakeMath } = require('./marp-bundle-math');
const {
  OVERFLOW_MARKER_LEVELS, EXPORT_DEFAULT_MARKER, resolveOverflowMarker, resolveExportOverflowMarker,
} = require('./resolve-overflow-marker');

const MARP_CLI_RANGE = '^4.3.1';
// The README's npx line names the MAJOR only: cmd.exe reads `^` as an escape character, so a
// pasted `@^4.3.1` silently becomes the exact pin `@4.3.1` there. `@4` means the newest 4.x on
// every shell.
const MARP_CLI_MAJOR = MARP_CLI_RANGE.replace(/^\^?(\d+)\..*$/, '$1');

// Static assets every bundle carries, as { from, to } where `from` is the repo
// path (CLI) / served basename (browser) and `to` is the path inside the bundle.
// All are MINIFIED. lattice.css + themes/ are the Marp themeSet; the runtime +
// mermaid render diagrams/components when the exported HTML is opened in a
// browser. The per-palette theme CSS is added per-deck by each producer (from
// dist/themes/<palette>-min.css), since which palette ships depends on the deck.
const STATIC_ASSETS = Object.freeze([
  { from: 'dist/lattice-min.css', to: 'lattice.css' },
  { from: 'dist/lattice-runtime-min.js', to: 'lattice-runtime-min.js' },
  // The dagre layout engine, split OUT of the runtime bundle so it stops riding the
  // eager path (25.9 KiB gzipped on every reader of every deck, for something only a
  // BRANCHING state chart uses). It has to travel WITH the runtime here: an exported
  // deck is opened from `file://` with no build step, so the recipient's browser can
  // only find the engine as a file beside the one that needs it. Absent → a branching
  // machine paints as the numbered column, and the runtime says so on the console.
  { from: 'dist/lattice-dagre-min.js', to: 'lattice-dagre-min.js' },
  // Mermaid: the mermaid plugin's OWN copy (its manifest's `payload.vendored`), the build every
  // surface ships, under the name the bundle has always given it. `from` is the repo path the CLI
  // reads and, by basename, the file the Studio stages under export/ and fetches.
  { from: 'lib/plugins/mermaid/vendor/mermaid.min.js', to: 'mermaid-v11-min.js' },
  // The icons plugin's drawings (tools/build-plugin-data-bundles.js). No tag names it: the runtime
  // fetches it from beside itself when the deck writes an icon (lib/runtime/index.js
  // `ensurePluginData`), so it travels with the runtime for the same `file://` reason as dagre.
  // One entry per data plugin; test/unit/core/marp-bundle.test.js checks the list is whole.
  { from: 'docs/public/playground/lattice-plugin-icons.js', to: 'lattice-plugin-icons.js' },
  // The avatars plugin's drawings, on the same terms as the icons'.
  { from: 'docs/public/playground/lattice-plugin-avatars.js', to: 'lattice-plugin-avatars.js' },
]);

// The AGENT KIT — carried by default so a recipient's AI agent (Claude, Copilot,
// Cursor, …) can KEEP AUTHORING the exported deck correctly: it ships the
// machine-readable Lattice component catalog (axes, slots, skeletons, and the
// content-capacity contract) the agent reads to pick layouts by content shape.
// Paired with a generated, bundle-tailored AGENTS.md (agentsMd) at the root.
// Opt-out per-export (CLI `--no-agent`); see engineering/decisions/2026-06-13-export-to-marp.md §10.
const AGENT_ASSETS = Object.freeze([
  { from: 'dist/docs/components.pick.md', to: 'agent/components.pick.md' },
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
 * COMMENTS ARE STRIPPED FIRST. A `url(fonts/…)` inside a comment is not a
 * reference — it's an example, or a face someone retired in place — and counting
 * it either copies a file nothing asks for or, when the file is gone, makes the
 * bundle's own font-coverage test fail on a stylesheet that is in fact complete.
 * The unminified sheet is the one this matters for: `lattice.css`'s @font-face
 * block documents the `url(fonts/…)` convention in prose right beside the rules.
 *
 * @param {string} latticeCss text of the bundled (minified) lattice.css
 * @returns {{from: string, to: string}[]} sorted, deduped, producer-agnostic
 */
function fontAssetsFor(latticeCss) {
  const files = new Set();
  for (const m of stripCssComments(latticeCss).matchAll(FONT_URL)) files.add(m[1]);
  return [...files].sort().map((f) => ({ from: `dist/fonts/${f}`, to: `fonts/${f}` }));
}

/**
 * Make a stylesheet MARP-SCOPABLE before it enters the bundle.
 *
 * marp-core scopes a theme rule off its leftmost compound: a literal leading
 * `section` is the slide, anything else is a slide descendant. Lattice's chart
 * and Form CSS leads with the dual-surface `:is(section.x, figure.x)` head, so
 * marp-core prefixed the whole head and emitted `… > section :is(section.x, …)`
 * — a slide nested in a slide, which never matches. Measured against real
 * marp-core on the pre-fix sheet: 835 dead SELECTORS across 518 declaration
 * blocks. Two populations — the chart bucket (matrix-grid, roadmap, gantt,
 * kanban, radar, quadrant, funnel, piechart, progress, map, timeline-list,
 * word-cloud), and 465 `:is(section, figure)` selectors over MERMAID diagram
 * internals. An earlier version of this comment called the second group the
 * "Form layer"; it is not, and the distinction matters — the Mermaid half is
 * invisible until a deck has a diagram.
 *
 * Our own engine never hit this because lib/engine/css.js distributes the arms
 * before scoping. We cannot patch marp-core, so the export bakes the same
 * distribution into the CSS it hands over — one shared kernel, both paths
 * (lib/core/leading-is.js). Producers call this on the stylesheet bytes they
 * write as `lattice.css`; everything else about the file is untouched.
 *
 * As of the build-time move, `tools/build-css.js` already distributes every
 * stylesheet dist/ ships, so this pass is a BYTE-for-byte no-op on a current dist
 * and exists as belt-and-braces for a bundle built against an older one. (It used
 * to grow a minified sheet ~262 bytes by re-joining comma lists with `, `; the
 * character walk leaves an already-distributed prelude untouched.)
 */
function marpScopableCss(css) {
  return distributeLeadingIs(css);
}

/**
 * Deck → a filesystem-safe slug for the bundle/zip name, the deck FILE inside it,
 * and every path the generated files reference.
 *
 * The output charset is deliberately `[\w.-]` with no leading `-`, which is what
 * lets the generated `npm run pdf` / `npm run html` scripts name the deck
 * UNQUOTED. That mattered: those scripts used to interpolate the raw deck title,
 * so exporting `Q3 Board Review.md` wrote a bundle whose only documented render
 * command was `marp Q3 Board Review.md …` — three arguments to marp-cli, which
 * fails on the first one. Both producers now name the file with this, so the
 * script and the file on disk are the same string by construction.
 * (`test/unit/core/marp-bundle.test.js` pins the charset invariant the
 * quote-free interpolation rests on.)
 */
function safeName(name) {
  return (name || 'deck').trim().replace(/[^\w.-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60) || 'deck';
}

// The runtime engines an exported deck loads, IN LOAD ORDER, and the one list that
// names them. The bundled mermaid + the Lattice browser runtime render diagrams and
// structural components CLIENT-SIDE when the deck is opened as HTML in a browser.
//
// ORDER IS THE MECHANISM, so this array's order is load-bearing: dagre sits BEFORE the
// runtime because both are classic scripts, so they execute in document order, and the
// runtime's state-chart pass reads `globalThis.__latticeDagre` synchronously on its
// first draw. After it, the engine would arrive too late and every branching machine
// would paint as a column.
//
// FROZEN, like every other exported list in this module (STATIC_ASSETS, AGENT_ASSETS),
// and here the freeze earns its keep twice over: consumers now ALIAS this array rather
// than build their own copy, and an in-place `.sort()` in any one of them would leave
// the derived tag block below — a frozen string — correct while every array reader
// silently disagreed with it about load order.
const RUNTIME_SCRIPT_SRCS = Object.freeze([
  'mermaid-v11-min.js',
  'lattice-dagre-min.js',
  'lattice-runtime-min.js',
]);

// Appended to the exported deck's markdown (at EOF), DERIVED from the list above. The
// markdownlint-disable keeps the inline <script> tags from tripping MD033 when the .md
// is edited.
//
// The tags and the filenames used to be two hand-maintained arrays that had to agree
// for the strip regex to find what the bake wrote, and nothing checked that they did.
// The same shape had already gone wrong one level up, where the agent kit's README said
// "the two runtime <script> tags" while this block emitted three: dagre was split out of
// the runtime bundle and the second copy stayed behind.
//
// Deriving one from the other removes THAT pair. It does not make adding an engine a
// one-line job: STATIC_ASSETS above is the list the producers actually copy from, so a
// fourth name here without a matching entry there ships a deck referencing a file that
// never travels with it — a 404 under `file://`, silent, and the layout that engine
// drives paints as its fallback. Nothing in this module ties the two lists together, so
// the agreement is asserted in test/unit/core/marp-bundle.test.js instead, as set
// equality over the `.js` assets — both directions, because an asset no src names is
// dead weight in every bundle.
// RUNTIME_BLOCK_GUARD ends a raw-HTML block the deck left open before the trailer arrives. markdown-it
// runs a block that opens with <pre>, <script>, <style> or <textarea> on to the first line that closes
// ANY of the four, and Marpit lifts a block that opens with <style> into the theme before any renderer
// sees it, so a deck ending in an unclosed <style> turned the runtime lines into CSS and the engine's
// peel never saw them (measured: the runtime did not load). The guard carries every terminator
// markdown-it reads (types 1 to 5), so an open block ends on it; with nothing open it is a one-line
// comment, which the config's engine keeps out of the speaker notes.
const RUNTIME_BLOCK_GUARD = '<!-- Lattice: ends any HTML block left open above: </pre></script></style></textarea> ?> ]]> -->';
const RUNTIME_SCRIPTS = [
  '',
  RUNTIME_BLOCK_GUARD,
  '<!-- markdownlint-disable MD033 -->',
  ...RUNTIME_SCRIPT_SRCS.map((src) => `<script src="${src}"></script>`),
  '',
].join('\n');

// The tag block above, for stripping it back off a deck we already baked.
//
// BUILT FROM THE TAG SET, NOT FROM THE BLOCK'S EXACT TEXT, and that is a correctness
// requirement rather than a generalisation. Re-exporting a deck a recipient sent back
// is ordinary, and the deck in their hands was baked by whatever version they had. An
// escape of today's exact string stops matching the moment the set changes — which it
// just did, when dagre was split out of the runtime bundle and gained a tag — so a
// deck baked before that would keep its old block AND get a new one appended: two
// copies of every runtime tag. Matching the comment plus any run of OUR OWN tags
// strips yesterday's block and tomorrow's alike.
//
// ANCHORED TO THE END, and not global. Matching a tag SET rather than an exact
// block is what makes the strip survive the set changing; it also widens what the
// pattern can hit, and a deck may legitimately QUOTE our tag block — the kit's own
// "how to wire the runtime" slide does exactly that, inside a fenced code block.
// An unanchored match gutted that fence, silently, leaving an empty ```html``` in a
// delivered deck. The block this function strips is one it appended itself, and by
// this point the front-matter and export-settings blocks have already been removed,
// so it is the LAST thing in the document — anchoring there strips what we wrote and
// leaves what the author wrote. A quoted block is followed by its closing fence, so
// `\s*$` cannot reach it.
// EVERY metacharacter, not just the dot these filenames happen to contain.
// Escaping `.` alone is correct for today's three names and silently wrong for
// the first one that carries a `+` or a `(` — the pattern would still compile and
// would match something else, which is the failure mode a strip regex cannot
// afford. CodeQL flags the partial form for exactly that reason.
const reEscape = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
// The same names as they were spelled before the minified suffix moved from `.min` to
// `-min` (2026-09-29): a deck baked by an older version carries `lattice-runtime.min.js`,
// and it is exactly the stale block this strip exists to remove.
const RUNTIME_SCRIPT_STRIP_SRCS = RUNTIME_SCRIPT_SRCS.flatMap((s) => [s, s.replace(/-min\.js$/, '.min.js')]);
const RUNTIME_SCRIPTS_RE = new RegExp(
  // The guard is matched by its fixed opening, so a later edit to the rest of its text cannot stack a
  // second one, and an author comment that merely starts "Lattice: ends" is not taken for it.
  '\\n*(?:<!-- Lattice: ends any HTML block[^\\n]*-->\\n)?<!-- markdownlint-disable MD033 -->'
  + '(?:\\n<script src="(?:' + RUNTIME_SCRIPT_STRIP_SRCS.map(reEscape).join('|') + ')"></script>)+'
  + '\\s*$',
);

// ── Asset references ─────────────────────────────────────────────────────────
// The two places a deck names a picture file that a bundle must carry: a Markdown
// image's target (`![alt](path)`, `![bg …](path "title")`) and the front-matter
// `logo:`. Each producer decides what a reference becomes: the CLI copies the file
// from disk (tools/export-marp.js `localizeOne`), and the in-browser producer can
// only fetch `sample:` art from the site (`withSampleAssets`).

const IMAGE_REF_RE = /(!\[[^\]]*\]\()([^)\s]+)(\s*(?:"[^"]*")?\))/g;
// Must not be TIGHTER than the readers', or a producer skips a ref the runtime then
// resolves. lib/runtime/index.js and the engine's `readDeckLogoFrontMatter` both read
// `^[ \t]*logo:[ \t]*["']?(.*?)["']?[ \t]*$`.
const LOGO_REF_RE = /^([ \t]*logo:[ \t]*["']?)([^"'\r\n]+?)(["']?[ \t]*)$/m;
// The same fences `readFrontMatterBlock` (deck-front-matter.js) accepts: trailing whitespace, and a
// closing `---` at the end of the file.
const FRONT_MATTER_RE = /^---[ \t]*\r?\n[\s\S]*?\r?\n---[ \t]*(?:\r?\n|$)/;

/** Rewrite every Markdown image target in `body`: `fn(url)` returns the new one, or null to keep it. */
function mapImageRefs(body, fn) {
  return body.replace(IMAGE_REF_RE, (full, pre, url, post) => {
    const next = fn(url);
    return next ? `${pre}${next}${post}` : full;
  });
}

/** Rewrite the `logo:` value in a front-matter block, the same way as `mapImageRefs`. */
function mapFrontMatterLogo(fm, fn) {
  return fm.replace(LOGO_REF_RE, (full, pre, url, post) => {
    const next = fn(url.trim());
    return next ? `${pre}${next}${post}` : full;
  });
}

/** Both reference shapes across a whole deck source: front-matter `logo:` and body images. */
function mapDeckAssetRefs(deck, fn) {
  const fm = deck.match(FRONT_MATTER_RE);
  const body = fm ? deck.slice(fm[0].length) : deck;
  return (fm ? mapFrontMatterLogo(fm[0], fn) : '') + mapImageRefs(body, fn);
}

/** The sample files a deck names as `sample:<name>`, deduplicated, in first-seen order. */
function sampleAssetNames(deck) {
  const names = new Set();
  mapDeckAssetRefs(deck, (url) => {
    const name = sampleName(url);
    if (name) names.add(name);
    return null;
  });
  return [...names];
}

/**
 * Point each `sample:<name>` reference the bundle carries at its copy: `paths` maps a
 * sample name to its bundle path (`assets/portrait-ada.svg`). A name not in `paths`
 * stays as written, because a producer that could not fetch a file must not name a
 * path the bundle lacks.
 */
function withSampleAssets(deck, paths) {
  return mapDeckAssetRefs(deck, (url) => {
    const name = sampleName(url);
    return (name && paths.get(name)) || null;
  });
}

/**
 * Append the runtime scripts + the BAKED FRONT MATTER to a (baked,
 * front-matter-included) deck source. Both producers end with this call, so the
 * two bundles agree on the SHAPE of the emitted deck — not byte-for-byte: only the
 * CLI can copy a deck's local files, so it rewrites image and `logo:` paths to
 * `assets/…` while the in-browser producer passes `localAssets: false`, plus the
 * `bundledAssets` it did fetch (its `sample:` art).
 *
 * The front-matter block is what makes the deck-wide registers (`color-mode:`,
 * `class:`, `logo:`, `meta:`, …) survive: Marp strips front matter, and the
 * runtime's old recovery path — fetching the source `.md` from beside the
 * document — cannot work over `file://`, which is how both a double-clicked
 * export and marp-cli itself load the deck. See lib/core/deck-front-matter.js.
 */
function withRuntimeScripts(deckSource, opts = {}) {
  return withRuntimeScriptsReport(deckSource, opts).markdown;
}

/**
 * `withRuntimeScripts`, plus what the live-HTML boundary removed from the deck (counted after
 * the previous export's runtime block comes off, so a re-export does not report Lattice's own
 * tags). The CLI prints it and the Studio's Share sheet puts it in the toast.
 * `escaped` — the deck defeated the strip and had every `<` escaped (lib/core/live-author-html.js).
 * `refused` — the tags and attributes the config's HTML list will show as text or drop.
 * `math` — the equations typeset into the deck, and those that could not be and show as TeX
 * (lib/core/marp-bundle-math.js).
 * @returns {{ markdown: string, removed: { scripts: number, handlers: number, urls: number }, escaped: boolean,
 *             refused: { tags: Record<string, number>, attrs: Record<string, number> },
 *             math: { baked: number, failed: number } }}
 */
function withRuntimeScriptsReport(deckSource, { localAssets = true, bundledAssets, overflowMarker, pluginsOff } = {}) {
  // IDEMPOTENT: strip what a PREVIOUS export appended before appending again.
  // Re-exporting a bundle's own deck is an ordinary thing to do (edit the deck a
  // recipient sent back, re-export), and it used to stack a second copy of the
  // runtime tags AND — once the front matter was baked — a second, staler
  // snapshot of it. Two snapshots of the same front matter is exactly the
  // ambiguity a snapshot exists to avoid. (`readBakedFrontMatter` prefers the
  // last block as a backstop, for a deck assembled some way this can't see.)
  //
  // The EXPORT SETTINGS block is stripped and rewritten the same way, and that is
  // load-bearing rather than tidy: it carries THIS export's choices, so a re-export
  // must not inherit the previous one's. While the level was a front-matter key it
  // did inherit — a one-time "quiet this for the board" `off` became a permanent
  // property of every deck derived from that bundle.
  // THE EXPORT BOUNDARY for the deck-wide `class:` register. Every other consumer
  // sanitizes the register where it READS it; this bundle has a reader we do not
  // own — MARP applies the front-matter `class:` to every section, and it does so
  // before `lattice-runtime-min.js` has even loaded. The runtime is purely
  // additive by design (it cannot tell a token the deck wrote from the same token
  // a slide wrote), so anything Marp stamps is final. The refusal therefore has to
  // happen in the BYTES this function emits. See lib/core/deck-class-register.js.
  //
  // THE EXPORT BOUNDARY for the deck's own executable HTML, for the same reason: any tool that
  // renders the deck with HTML on (VS Code's preview, or marp-cli with `--html`, both outside the
  // config's allowlist) would run it. Stripped AFTER the
  // previous runtime block comes off and BEFORE this one goes on, so Lattice's tags survive and a
  // deck's `<script>`, `on…=`, `srcdoc` and `javascript:` do not. See lib/core/live-author-html.js.
  // The code plugin's `@code{…}` record lines come out too: Marp has no rule that reads them, so
  // each would print as a line of inline code above its block (lib/plugins/code/shared/marp-export.js).
  // Not when the deck runs without the code plugin: the engine then prints the record as text, and
  // the bundle shows what the engine shows.
  const recordsRead = !(pluginsOff || []).includes('code');
  const stripped = withoutLiveAuthorHtml(
    withSanitizedDeckClass(withoutExportSettingsBlock(withoutFrontMatterBlock(recordsRead ? withoutCodeRecords(deckSource) : deckSource)))
      .replace(RUNTIME_SCRIPTS_RE, ''),
  );
  const off = [...new Set(pluginsOff || [])].sort();
  // THE EXPORT BOUNDARY for math. Marp would typeset the deck's TeX itself (MathJax), and that
  // output reaches the page past the HTML list: a `\style{…"/on…="…}` ran a handler in marp-cli and
  // in VS Code alike. So the bundle carries its math already typeset, by the engine's own KaTeX
  // renderers, canonicalized, and every other `$` escaped; the config and `.vscode` turn Marp's
  // typesetter off. With the math plugin off, nothing is typeset and the `$`s are only escaped.
  // See lib/core/marp-bundle-math.js and § 15 of the preview-sink decision note.
  const mathBake = bakeMath(stripped.markdown, { math: !off.includes('math') });
  const deck = mathBake.markdown.replace(/\s*$/, '');
  // RESOLVED here, at the choke point, so every bundle carries a real level and a
  // producer that passes nothing cannot emit a block-LESS deck. That mattered: the
  // runtime reads "no block" as "authoring surface", so the Drawing Board — which
  // never passed a marker — shipped delivered bundles with the red QA ring and the
  // "FIX ME" overlays, the exact defect this setting exists to fix. Resolving at the
  // producer instead of here made "the producer chose nothing" and "this is an
  // authoring surface" the same wire signal.
  // `pluginsOff` — the plugins the PRODUCER's admission left off for this deck (a host that narrowed
  // its default set, or switched one off). Marp renders the bundle, so the engine's
  // `data-lattice-off` marker is never written; the runtime writes it from this list before any
  // pass (lib/plugins/mark-off.mjs). Absent — and the block byte-identical — when nothing is off.
  // THE AUTHOR'S RAW HTML MAY NOT SPEAK THE PLUGIN HOST'S CHANNEL, here as in the engine
  // (lib/plugins/author-markup.js, spec/LPM.md §3.2.1). Marp renders this deck's raw HTML (on a list
  // in marp-cli, all of it in VS Code), so
  // a raw `data-lattice-hydrate` placeholder would reach the bundled runtime's hydrator, and a raw
  // `<pre><code class="language-mermaid…">` of a plugin left off would be drawn. Refused in the
  // BYTES, for the reason the deck class is above: the runtime cannot tell the author's markup from
  // its own. A deck with nothing to refuse comes back byte-identical.
  const refused = refuseAuthorMarkupInSource(deck, authorMarkupParser(), offDrawnFences(PLUGIN_GRAMMAR, (name) => off.includes(name)));
  const settings = exportSettingsBlock({
    overflowMarker: resolveOverflowMarker(overflowMarker, EXPORT_DEFAULT_MARKER),
    ...(off.length ? { pluginsOff: off } : {}),
  });
  // `refusedHtml` — what the config's HTML list will show as text or drop in marp-cli, so the
  // producer can say so now rather than leave the recipient to find it (lib/core/marp-bundle-html.js).
  return {
    markdown: `${refused}\n${RUNTIME_SCRIPTS}${frontMatterBlock(deck, { localAssets, bundledAssets })}${settings}`,
    removed: stripped.removed,
    escaped: Boolean(stripped.escaped),
    refused: refusedHtml(refused),
    math: { baked: mathBake.baked, failed: mathBake.failed },
  };
}

// A markdown-it that tokenizes raw HTML the way Marp's does (`html: true`), built once: only its
// parse is used, to find the deck's raw-HTML lines (refuseAuthorMarkupInSource).
let authorMarkupMd = null;
function authorMarkupParser() {
  if (!authorMarkupMd) authorMarkupMd = require('markdown-it')({ html: true });
  return authorMarkupMd;
}

// The marp-cli config: register the bundled theme CSS (lattice.css + every
// palette under themes/) so `marp` splits (via the baked `---`) and styles the
// deck. Every palette `@import 'lattice'` by name, so lattice.css MUST be
// registered too. Marp applies palette + CSS layouts; Mermaid + JS-driven
// components are rendered by lattice-runtime-min.js when the exported HTML is
// opened in a browser (the deck's trailing <script> tags).
//
// `html` is LOAD-BEARING, and it is an ALLOWLIST, not `true`. marp-core defaults to
// `html: false`, which ESCAPES raw HTML instead of passing it through, so a deck's own
// `<div class=…>` and `<span style=…>` (and, before the engine plugin, the runtime tags) came
// out as text and the runtime never loaded. `html: true` fixed that and passed the deck's own
// script through with it. The config now names the tags and attributes a deck may write
// (lib/core/marp-bundle-html.js), and a marp-cli `engine:` plugin lets through the bundle's own
// trailing blocks and nothing else that looks like them, so no `<script>` of the deck's reaches
// the render even if the strip in `withRuntimeScriptsReport` missed one
// (engineering/decisions/2026-08-17-theme-css-is-a-preview-sink.md § 13).
/**
 * The bundle's marp-cli config. `math: false` ALWAYS: the producer has already typeset the deck's
 * math (lib/core/marp-bundle-math.js), and marp-core's own typesetter is the injection surface that
 * bake closes. `false` is also the one value a deck's own `math:` directive cannot override.
 */
function marpConfigCjs() {
  return `// Auto-generated by Lattice "Export to Marp".
const fs = require('fs');
const path = require('path');
const themeSet = [
  path.join(__dirname, 'lattice.css'),
  ...fs.readdirSync(path.join(__dirname, 'themes')).map((f) => path.join(__dirname, 'themes', f)),
];
// html: the tags and attributes this deck may write. Anything else shows as text, and no
// <script> of the deck's runs. Do not pass --html on the command line: it replaces this list
// with "everything". The engine below lets the bundle's own runtime tags through.
${htmlConfigSource(RUNTIME_SCRIPT_SRCS)}
// math: false — the deck's equations are already typeset (KaTeX, at export). Marp's own
// typesetter would run the deck's TeX, so it stays off, whatever the deck's math: directive says.
module.exports = { themeSet, allowLocalFiles: true, html, engine, options: { math: false } };
`;
}
const MARP_CONFIG_CJS = marpConfigCjs();

/**
 * .vscode/settings.json for the bundle — registers the bundled palette with the
 * Marp for VS Code extension so opening the deck previews in the right theme.
 * `themes` is the workspace-relative path list (lattice.css + the palette files);
 * lattice.css is included because every palette `@import 'lattice'` by name.
 *
 * `markdown.marp.html: "all"` turns raw HTML on in the extension, which reads neither the
 * marp-cli config's allowlist nor its engine (the deck's own script is still stripped from
 * the file, § 11). The extension defaults to escaping raw HTML, so without it the deck's
 * trailing runtime `<script>` tags print as literal text across the preview's
 * last slide. Enabling it is necessary for the tags to survive; whether the
 * preview WEBVIEW then executes them is a separate question the extension owns
 * (engineering/gotchas.md § "VS Code / marp-vscode"). `html` replaced the boolean
 * `enableHtml` in marp-vscode 3.0.0 (2024-12-31); 3.6.1 shows a deprecation warning
 * when the old key is set, so the bundle writes the new key only.
 */
function vscodeSettings(themes) {
  // `mathTypesetting: off` — the deck's math is already typeset (lib/core/marp-bundle-math.js), and
  // `off` is the one value that also disables a deck's own `math:` directive in the extension.
  return `${JSON.stringify(
    { 'markdown.marp.themes': themes, 'markdown.marp.html': 'all', 'markdown.marp.mathTypesetting': 'off' },
    null,
    2,
  )}\n`;
}

/**
 * package.json for the bundle. The ONLY dependency is marp-cli (so `npm install`
 * → `npm run pdf` works). Listing `@laticent/lattice` here would break
 * `npm install` outright: it is not published to the public registry, so npm
 * 404s on it and the recipient never gets marp-cli either. Lattice ships no
 * engine in the bundle — it is rendered with Marp.
 */
function packageJson(name) {
  const file = safeName(name);
  return {
    name: `${file}-marp-export`,
    private: true,
    description: `Portable Marp bundle of the "${name}" Lattice deck`,
    scripts: {
      pdf: `marp ${file}.md --config-file marp.config.cjs --allow-local-files -o ${file}.pdf`,
      html: `marp ${file}.md --config-file marp.config.cjs --allow-local-files -o ${file}.html`,
      pptx: `marp ${file}.md --config-file marp.config.cjs --allow-local-files --pptx -o ${file}.pptx`,
    },
    dependencies: {
      '@marp-team/marp-cli': MARP_CLI_RANGE,
    },
  };
}

/**
 * .vscode/extensions.json — makes the bundle a VS Code project that asks for its one
 * extension. Opening the folder shows "Do you want to install the recommended 'Marp for
 * VS Code' extension…?" with an Install button (measured on VS Code 1.142.0 desktop, a
 * fresh profile), so the reader never has to search the Marketplace.
 */
function vscodeExtensions() {
  return `${JSON.stringify({ recommendations: ['marp-team.marp-vscode'] }, null, 2)}\n`;
}

/**
 * .vscode/tasks.json — the package.json scripts under Terminal → Run Task…, so a reader
 * can export from VS Code without a terminal. VS Code's `npm` task type, not a shell
 * line: it runs the same on every OS, where `npm install && npm run pdf` would fail in
 * Windows PowerShell 5.1, which has no `&&`. Each export depends on the install task,
 * so the first run installs marp-cli by itself (measured: a folder with no
 * node_modules, Run Task → "Marp: export PowerPoint", wrote the .pptx). Tasks run only
 * in a trusted folder, which the README's step 2 covers.
 */
function vscodeTasks() {
  const install = 'Marp: install marp-cli';
  const exportTask = (label, script) => ({ label, type: 'npm', script, dependsOn: install, problemMatcher: [] });
  return `${JSON.stringify(
    {
      version: '2.0.0',
      tasks: [
        { label: install, type: 'npm', script: 'install', problemMatcher: [] },
        exportTask('Marp: export PDF', 'pdf'),
        exportTask('Marp: export PowerPoint', 'pptx'),
        exportTask('Marp: export HTML', 'html'),
      ],
    },
    null,
    2,
  )}\n`;
}

/** README.md for the bundle. `themes` is the list of bundled theme paths;
 *  `agent` (caller-driven) adds the "extend with an AI agent" section + rows
 *  when truthy — the CLI passes `includeAgent`, the browser passes `agentOk`. */
// What the README says about overflow, per level. Written per-level because the
// prose used to be unconditional: an `off` bundle shipped documentation telling its
// recipient that clipped slides carry a "Content clipped" tag — in the one bundle
// where they carry nothing.
const OVERFLOW_README = Object.freeze({
  reader: 'Rather than lose it quietly, this deck tags such a slide **"Content clipped"** '
    + 'along its bottom edge.\n\nRe-export from Lattice to change that — `--overflow-marker=author` '
    + 'for the full editing signal (a red ring and per-cell "Fix Me" tags), or '
    + '`--overflow-marker=off` for no marker at all. Without Lattice to hand, edit the '
    + '`overflowMarker` value in the generated settings block at the end of the deck.',
  author: 'This deck was exported with the **authoring** signal on, so such a slide carries a '
    + 'red ring, an "Overflows" flag, and "Fix Me" tags on the boxes that overran. That is a '
    + 'working view, not a delivery one — re-export with `--overflow-marker=reader` (or edit '
    + '`overflowMarker` in the generated settings block at the end of the deck) before sharing it.',
  off: '**This deck was exported with no overflow marker**, so a clipped slide looks finished '
    + 'and nothing on the page will tell you. If you did not choose that, re-export with '
    + '`--overflow-marker=reader`, or edit `overflowMarker` in the generated settings block at '
    + 'the end of the deck.',
});

function readme({ name, palette, themes, agent, overflowMarker }) {
  // Prose keeps `name` as given; every PATH and COMMAND uses the safe slug, which
  // is the name both producers write the deck file under. (The in-browser producer
  // passes an already-slugged `name`, so its README heading reads the slug — the
  // CLI's reads the deck's real title.)
  //
  // EVERY STEP BELOW WAS DONE, NOT INFERRED (2026-10-16): VS Code 1.142.0 desktop with a
  // fresh profile and Marp for VS Code 3.6.1 from the Marketplace, and marp-cli 4.5.1 on
  // Node 22 from a fresh unzip. The prompts are quoted as VS Code shows them. Re-verify
  // with tools/vscode-preview-probe.mjs and a clean `npm install` before changing a step.
  // The command-line route also ran (2026-10-17) on Windows Server 2025 in PowerShell 5.1
  // and cmd.exe, and on macOS in zsh, each from a fresh unzip. The shortcuts and the
  // File menu entry are read from VS Code 1.142's own keybinding and menu definitions.
  const file = safeName(name);
  return `# ${name}

This folder is a Lattice deck packaged for **Marp**. Everything it needs is already in
here: the slides, the \`${palette}\` theme, the fonts, and the small scripts that draw its
diagrams and charts. You do not install a theme or edit any settings by hand.

You can work with it two ways, and they produce the same result:

- **In VS Code**, to edit the slides with a live preview and export from the editor.
- **From the command line**, with marp-cli, to export in one command.

## What you need

| For | Install |
|---|---|
| Editing and previewing | [Visual Studio Code](https://code.visualstudio.com). It offers the Marp extension for you in step 3. |
| Exporting a PDF, PowerPoint or image, on either route | Google Chrome or Microsoft Edge. Marp drives the browser in the background; you will not see a window. (Marp can also use Firefox; this bundle was tested with Chrome.) |
| The command line, or VS Code's export tasks | [Node.js](https://nodejs.org) 18 or later. |

## Quick start: VS Code

1. **Open this folder.** If it came as a zip, unzip it first. In VS Code, choose **File → Open Folder…** and pick
   the folder that contains this README. Open this folder itself, not a folder above it:
   the theme settings in \`.vscode/\` only apply when this is the folder you opened. (The
   first time VS Code ever runs, a *Welcome to VS Code* window comes first; click
   **Continue without Signing In**, then **Get Started**.)
2. **Trust the folder.** VS Code opens a new folder in **Restricted Mode**: a banner at
   the top says *"Restricted Mode is intended for safe code browsing"*, and the bottom-left
   corner reads *Restricted Mode*. Click **Manage** in the banner, then **Trust**. Until you
   do, VS Code ignores the folder's theme settings and will not run its export tasks. (If
   VS Code instead asks *"Do you trust the authors of the files in this folder?"*, choose
   **Yes, I trust the authors**.)
3. **Install Marp for VS Code.** A notification asks *"Do you want to install the
   recommended 'Marp for VS Code' extension from Marp team for this repository?"* Click
   **Install**, then **Trust Publisher & Install**. Missed it? Open the Extensions view
   (Ctrl+Shift+X, or Cmd+Shift+X on macOS), search for **Marp for VS Code**, and install it.
4. **Open the deck.** Click \`${file}.md\` in the Explorer.
5. **Open the preview.** Click **Open Preview to the Side** at the top right of the editor,
   or press Ctrl+K then V (Cmd+K then V on macOS).
6. **Let the deck draw its diagrams and charts.** The preview first shows *"Some content
   has been disabled in this document"*, and the slides that need drawing look unfinished.
   Click that message and choose **Disable** (*"Allow all content and script execution"*).
   VS Code remembers the choice for this folder. The scripts it allows are the deck's own
   bundled renderers; Lattice removed every other script from the deck when it exported.
7. **Export.** Click in the editor that shows \`${file}.md\` (not the preview), then click
   the Marp icon at its top right (*Show Quick Pick Of Marp Commands*) and choose **Export
   Slide Deck…**. In the save dialog, pick the format in the file-type list **and** make
   the file name end with its extension: \`.pdf\`, \`.pptx\` or \`.html\`.
   **The name decides the format**: Marp reads only the extension of the file you save,
   so choosing *HTML* in the list but keeping the name \`${file}.pdf\` still saves a
   PDF. (\`.png\` and \`.jpeg\` save the first slide only.)
   Or choose **Terminal → Run Task…** and pick **Marp: export PDF**, **Marp: export
   PowerPoint** or **Marp: export HTML** (the list also shows tasks other tools offer;
   pick one that starts with *Marp:*). Each task first runs \`npm install\`. The first time,
   that downloads marp-cli, which takes a few seconds; after that it finishes at once, even
   offline. Both routes give the same result.

Edit \`${file}.md\` and the preview updates as you type.

## Quick start: command line

In a terminal, in this folder:

\`\`\`sh
npm install       # once: installs marp-cli, the only dependency
npm run pdf       # → ${file}.pdf
npm run pptx      # → ${file}.pptx
npm run html      # → ${file}.html
\`\`\`

To export without installing anything into the folder:

\`\`\`sh
npx @marp-team/marp-cli@${MARP_CLI_MAJOR} ${file}.md --config-file marp.config.cjs --allow-local-files -o ${file}.pdf
\`\`\`

Always pass \`--config-file marp.config.cjs\`. It registers the theme and lists the HTML
the deck may use. Do **not** add \`--html\`: that replaces the list with "everything".
Each export prints *"WARN Insecure local file accessing is enabled"*. That is expected:
\`--allow-local-files\` lets the browser read the fonts and images in this folder.

## What each export gives you

- **PDF**: the complete deck, one page per slide. The one to share.
- **PowerPoint**: the complete deck, one picture per slide. It looks the same, but you
  cannot edit the text in PowerPoint; edit \`${file}.md\` and export again.
- **HTML**: opens in a browser and draws the deck there, so it needs the scripts and
  fonts in this folder next to it. Opened here, it is complete. Moved on its own, its
  diagrams and charts disappear; to share it, send the whole folder as a zip.
- **The VS Code preview**: complete once you allow scripts in step 6. Use it to write;
  export to check the final slides.

## If something looks wrong

| You see | Do this |
|---|---|
| Plain slides: system fonts, no colors, no layout | You opened a folder above this one, or the folder is not trusted. Open this folder itself (step 1) and trust it (step 2). |
| An export came out as a PDF when you wanted another format | The file name decides the format. Export again and end the name with \`.pptx\` or \`.html\` (step 7). |
| *"The specified theme … is not recognized by Marp for VS Code"* | The deck was opened before the folder was trusted. Trust it (step 2), then close the deck and open it again. |
| Diagrams or charts missing in the preview, or the banner *"Some content has been disabled"* | Allow scripts (step 6). |
| HTML tags like \`<div>\` or \`<script>\` printed on the slides in VS Code | The folder is not trusted: trust it (step 2). If it is trusted, your Marp for VS Code is older than 3.0; update it in the Extensions view. |
| Fractions and superscripts collapsed onto one line, or \`<svg\` printed inside an equation, in VS Code | The folder is not trusted. Trust it (step 2). |
| *"No suitable browser found"* | Install Chrome or Edge. If one is installed somewhere unusual, point Marp at it: on the command line, set the \`CHROME_PATH\` environment variable to its path; in VS Code, set **Markdown › Marp: Browser Path** (\`markdown.marp.browserPath\`) in Settings. |
| *"No usable sandbox!"* when exporting on Linux | On the command line, run the export with \`CHROME_NO_SANDBOX=1\` set (for example \`CHROME_NO_SANDBOX=1 npm run pdf\`). In VS Code, quit it and start it from a terminal where that variable is set. |
| A task does nothing, or VS Code says tasks are not allowed | Trust the folder (step 2). |
| \`npm: command not found\` | Install Node.js 18 or later. |
| An HTML file with no diagrams or charts | It was moved out of this folder. Open the copy in this folder, or send the folder as a zip. |

## Editing the deck

Edit \`${file}.md\` and export again. That works for slides, prose, and per-slide
\`<!-- _class: … -->\` directives.

**The front matter at the top is the exception.** Marp ignores Lattice's deck-wide
settings there (\`color-mode:\`, \`class:\`, \`logo:\`, \`meta:\`, \`finish:\`, …), so they
travel in a generated settings block at the end of the file. Changing them at the top has
no effect: edit that block to match, or re-export from Lattice.

**Equations are the other exception.** Lattice typeset each one when it exported, because
Marp's own math typesetter can run code hidden in a formula, so it is switched off here.
The TeX stays readable inside each equation's \`<annotation>\`; to change an equation,
edit the source deck and re-export. A dollar sign in prose, and in a \`header:\` or
\`footer:\`, is written \`\\$\` for the same reason.

### If a slide overflows

A slide whose content was taller than the frame is **clipped**: the extra content is not
scrollable and is not printed. Trimming it, or moving it to a layout with more room, is
the only fix.

${OVERFLOW_README[resolveOverflowMarker(overflowMarker, EXPORT_DEFAULT_MARKER)]}

### What Marp renders differently from Lattice

Some Lattice features are built while the deck is parsed, earlier than any Marp tool lets
a plugin in, and some come from code that a Marp render never runs. Each one falls back to
something readable:

${fidelityNotes().map((line) => line).join('\n')}

Outside that list, the theme, the typography, the diagrams, the charts and every
component layout we have rendered through Marp come out the same. If a slide looks wrong
here and right in Lattice, it is a bug worth reporting.

${agent ? `## Extend it with an AI agent

This folder carries the Lattice component catalog, so an AI coding agent (Claude,
Copilot, Cursor, …) can keep authoring the deck correctly. Open this folder with your
agent and point it at \`AGENTS.md\`: it explains how to pick a component, honor its
slots, and stay within each layout's content **capacity**, so added slides don't
overflow.

` : ''}## What's in here

| Path | What it is |
|---|---|
| \`${file}.md\` | The deck. Edit this. |
| \`lattice.css\` | The Lattice layout stylesheet. |
| \`themes/\` | The \`${palette}\` theme (+ dark) and every theme it builds on. |
| \`fonts/\` | The typefaces. Keep them beside \`lattice.css\`, or the type falls back silently. |
| \`lattice-runtime-min.js\`, \`lattice-dagre-min.js\`, \`mermaid-v11-min.js\` | Draw the diagrams, charts and structural layouts in the browser. |
| \`lattice-plugin-icons.js\`, \`lattice-plugin-avatars.js\` | Icon and avatar drawings, loaded when a slide uses one. |
| \`.vscode/settings.json\` | Registers the theme (${themes.join(', ')}) and turns on HTML for Marp for VS Code. |
| \`.vscode/extensions.json\` | Makes VS Code offer to install Marp for VS Code (step 3). |
| \`.vscode/tasks.json\` | The **Marp: export …** tasks under Terminal → Run Task…. |
| \`marp.config.cjs\` | The marp-cli settings: the theme and the HTML the deck may use. |
| \`package.json\` | Pins marp-cli and defines \`npm run pdf\`, \`pptx\` and \`html\`. |${agent ? `
| \`AGENTS.md\`, \`agent/\` | The entry point and component catalog for an AI agent. |` : ''}
| \`assets/\` | The images the deck uses, if any. |
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
  const file = safeName(name);
  return `# AGENTS.md — extend this deck with an AI agent

This folder is a portable **Marp** bundle of the "${name}" deck, exported from
Lattice. It carries the Lattice component catalog so an AI agent (Claude,
Copilot, Cursor, an SDK agent) can keep authoring the deck correctly — picking
the right layout, honoring each component's slots, and staying within its
content capacity.

## The deck

- \`${file}.md\` — the slides. Each opts into a Lattice **component** via a
  \`<!-- _class: <name> -->\` directive and fills its slots with ordinary
  Markdown. Edit this file; re-render per \`README.md\` (Marp — the VS Code
  extension or marp-cli).

## Pick the right component

- \`agent/components.pick.md\` — **start here.** One line per component: bucket,
  axes, search tags, **\`capacity\`** + escalation target, the components it is most
  often confused with, and a one-line purpose. The whole catalog is ~4k tokens, so skim
  or grep it to CHOOSE a layout. **Never invent a \`_class\` that isn't in it.**
- \`agent/components.json\` — the full machine-readable catalog behind it: slots,
  authoring skeleton, and \`whenToUse\` / \`antiPatterns\` / \`related\` prose.
  Consult it for the component you picked; at ~95k tokens it is not a document to read
  end to end.
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
- **No new \`$…$\` math here.** The equations are typeset at export and Marp's
  math is off in this bundle (it can run code hidden in a formula), so new TeX
  shows as text. Write it in the Lattice source and re-export. Keep a prose
  dollar escaped as \`\\$\`.

## Provenance

The catalog is a **frozen snapshot** taken when this deck was exported
(${stamp}). It reflects the components available then; a newer Lattice may add
more. Re-export from Lattice to refresh it.
`;
}

// `resolveExportOverflowMarker` lives in lib/core/resolve-overflow-marker.js, beside the levels it
// resolves, and is re-exported from here for the callers that already import it from this module.
// It moved so the Studio can import it: the docs dev server's CommonJS shim serves only a file
// that requires nothing, and this one requires a great deal.

module.exports = {
  OVERFLOW_MARKER_LEVELS,
  resolveExportOverflowMarker,
  MARP_CLI_RANGE,
  STATIC_ASSETS,
  AGENT_ASSETS,
  fontAssetsFor,
  marpScopableCss,
  RUNTIME_SCRIPTS,
  RUNTIME_SCRIPT_SRCS,
  FRONT_MATTER_TYPE,
  readFrontMatterBlock,
  frontMatterBlock,
  MARP_CONFIG_CJS,
  marpConfigCjs,
  withRuntimeScripts,
  withRuntimeScriptsReport,
  withoutCodeRecords,
  mapImageRefs,
  mapFrontMatterLogo,
  sampleAssetNames,
  withSampleAssets,
  safeName,
  packageJson,
  vscodeSettings,
  vscodeExtensions,
  vscodeTasks,
  readme,
  agentsMd,
};
