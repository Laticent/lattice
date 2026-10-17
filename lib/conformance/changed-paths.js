/**
 * lib/conformance/changed-paths.js — which paths can change a rendered component?
 *
 * ONE classification for the two tools that ask it (HARD RULE #15): `changedComponents` in
 * tools/conformance-render.js (which components does this diff touch, for the per-PR render tier) and
 * `selectGalleries` in tools/player-contrast-select.js (which galleries does the nightly player-contrast
 * sweep reopen). Each used to carry its own copy of the rule, and the two drifted. A path is one of:
 *
 *   · `non-render`  a known path no export reads (docs, tests, notes, CI config, prose);
 *   · `component`   a file under `lib/components/<bucket>/<name>/` or a flat `lib/components/<name>/`;
 *   · `theme`       a file under `themes/<name>/`;
 *   · `other`       anything else, including a `_` shared folder (`_chart-family`), whose consumers are
 *                   many and unknown here. Each caller decides what `other` costs: the selector treats
 *                   it as "every gallery"; the render tier has no per-PR answer and leaves it to the nightly.
 *
 * Pure and fs-free.
 */

/** Prefixes (and exact files) that cannot change what a player looks like. */
const NON_RENDER = [
  /^docs\//,
  /^engineering\//,
  /^design\//,
  /^test\//,
  /^changelog\.d\//,
  /^followups\.d\//,
  /^examples\//,
  /^backlog\.d\//,
  // lib/ directories no player export reads or builds from. Established by tracing the files
  // 15 galleries' exports opened (a Node `fs`/`require` hook over `lattice.js --player`) and by
  // grepping every importer of each: nothing under these is required by the export, bundled
  // into dist/lattice.css (tools/build-css.js), or read as an asset. lib/samples (images the
  // export reads), lib/motion, lib/authoring, lib/packages and the rest ARE read, so they
  // are deliberately absent and fall through to "all".
  /^lib\/(?:concepts|conformance|diagnostics|exemplars|helpers|playground|tokens)\//,
  /^lib\/README\.md$/,
  /^dist\//,
  /^\.github\//,
  /^\.claude\//,
  /^\.scratch\//,
  /^\.(?:vscode|husky|gitignore|gitattributes|editorconfig)(?:\/|$)/,
  /^(?:lefthook\.yml|biome\.jsonc?)$/,
  // Prose. A gallery IS markdown and is a deck, and lib/samples/ holds decks and assets the
  // export reads, so neither counts as prose.
  /^(?!lib\/samples\/).*(?<!\.gallery)\.md$/,
  /\.gallery\.(?:pdf|png)$/,
  /^themes\/(?:README\.md|palette-audit\.(?:md|pdf))$/,
  // Tooling that does not render: the CHECK scripts (gates and audits) and their docs. Every other
  // file under tools/ is treated as render-affecting, because tools/build-css.js,
  // tools/build-runtime.js and the rest of the build produce dist/lattice.css, which every export
  // reads. The two contrast tools and this selector change what the sweep measures, so they stay out
  // of this list too.
  /^tools\/script-docs\//,
  /^tools\/check-(?!player-contrast|slide-contrast)[^/]*$/,
];


/**
 * @param {string} p repo-relative path, forward slashes
 * @returns {{kind: 'non-render'} | {kind: 'component', name: string} | {kind: 'theme', name: string} | {kind: 'other'}}
 */
function classifyPath(p) {
  if (NON_RENDER.some((re) => re.test(p))) return { kind: 'non-render' };
  // Bucketed `<bucket>/<name>/…`, or a FLAT `<name>/<name>.<ext>`. A `_` shared folder maps to nothing.
  const comp = p.match(/^lib\/components\/[^/]+\/([^/_][^/]*)\//) || p.match(/^lib\/components\/([^/_][^/]*)\/\1\.(?:manifest\.json|styles\.css)$/);
  if (comp) return { kind: 'component', name: comp[1] };
  const theme = /^themes\/([^/]+)\//.exec(p)?.[1];
  if (theme) return { kind: 'theme', name: theme };
  return { kind: 'other' };
}

module.exports = { NON_RENDER, classifyPath };
