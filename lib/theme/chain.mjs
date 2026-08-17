/**
 * THE theme chain — a palette and everything it extends, parent-first.
 *
 * A palette's parent is declared ONCE, in `themes/<name>.manifest.json` as
 * `extends`. It is also written a second time in the CSS as `@import 'parent'`,
 * and that copy exists for MARP, which has no manifest and must learn the graph
 * from the stylesheet. Lattice reads the manifest; Marp reads the import; the theme
 * gate (`checkThemeRoles`) keeps them equal so the second copy cannot lie.
 *
 * WHY THIS MODULE EXISTS. Until 2026-08-16 the edge was re-derived from the CSS
 * by THREE different regexes — `lib/engine/themes.js`, `lattice-emulator.js`, and
 * `docs/src/lib/theme-fetch.ts` — and they had already drifted apart:
 *
 *     source    @import 'indaco';   engine: resolves | emulator: resolves | docs: resolves
 *     minified  @import"indaco"     engine: resolves | emulator: MISSES   | docs: resolves
 *
 * The engine's copy carries a comment explaining that exact fix ("minified
 * palettes ship the import with no space"); the emulator's copy never got it.
 * One bug, fixed in one of the three places it existed. See
 * engineering/decisions/2026-08-16-manifest-is-the-theme-contract.md.
 *
 * ESM (`.mjs`), like every other lib module the browser bundle imports
 * (`class-directive-scan.mjs`, `present-transport.mjs`): Rollup cannot take named
 * exports from a source-tree CommonJS file, and CJS callers `require()` it fine on
 * Node 22.12+. A `.js` here built locally and failed the docs bundle in CI.
 *
 * PURE AND FS-FREE — the same shape lint-core.js uses for the same reason: the
 * Node side builds `edges` by reading the
 * manifests, the browser side gets the same map from the baked theme catalog,
 * and both call this. No stylesheet is parsed to discover the THEME graph.
 * (`flattenCssImports`, below, does parse one — for the caller-supplied layout sheet,
 * which has no manifest and never will. That is the exception, and it is the whole
 * exception.)
 */

/**
 * The chain for `name`, PARENT-FIRST — `['onyx', 'a11y-base', 'a11y-deuteranopia']`.
 *
 * Parent-first is the load-bearing part: concatenated in this order a child's
 * `:root` block overrides its parent's at equal specificity, which is the CSS
 * cascade order the emulator's hand-rolled flattener produced and every palette
 * is authored against.
 *
 * @param {string} name             the theme to resolve
 * @param {Record<string,string|undefined>} edges  name → the name it extends
 * @returns {string[]} the chain, always ending with `name` itself
 */
export function themeChain(name, edges) {
  if (!name || typeof name !== 'string') return [];
  const chain = [];
  const seen = new Set();
  let cur = name;
  while (cur && !seen.has(cur)) {
    seen.add(cur);
    chain.push(cur);
    // `edges` comes from JSON, so guard the prototype chain: a theme called
    // `constructor` would otherwise "extend" Object's constructor and loop.
    cur = Object.hasOwn(edges ?? {}, cur) ? edges[cur] : undefined;
  }
  // A CYCLE terminates rather than throwing: a malformed manifest should degrade to
  // "resolve what we can", not take out the CLI. NOTE what does and does not catch it —
  // `checkThemeRoles` compares `extends` against the CSS `@import` and passes a
  // SELF-CONSISTENT cycle (both agree on a bad target), so the gate is NOT the backstop.
  // `test/unit/theme/chain.test.js` is: it asserts no palette's chain repeats a name and
  // that every declared parent exists.
  return chain.reverse();
}

/**
 * `{ name → extends }` from a list of parsed manifests. `extends` is optional —
 * a base palette extends the ENGINE (`@import 'lattice'`), which is not a theme
 * edge and is resolved by composeCss, so it is deliberately absent here.
 */
export function edgesFromManifests(manifests) {
  const edges = Object.create(null);
  for (const m of manifests) {
    if (m?.name) edges[m.name] = m.extends;
  }
  return edges;
}

/**
 * Flatten a stylesheet's theme-name `@import` chain from the CONTENT, parent-first.
 *
 * The manifest is the contract for themes Lattice ships. This is for the one input
 * that has no manifest and never will: a caller-supplied layout stylesheet
 * (`lattice-emulator.js --css`, a documented CLI form). Its identity and its graph
 * are genuinely whatever the bytes say, so the bytes are the only available source.
 *
 * It exists as ONE named function rather than a fourth inline regex. `\s*` (not
 * `\s+`) so a minified `@import"x"` resolves — the divergence that motivated moving
 * the theme graph to the manifest in the first place, fixed here rather than
 * re-introduced. Comments are stripped so a banner quoting `@import 'self'` in prose
 * cannot self-match and loop.
 *
 * @param {string} entryPath        absolute path to the stylesheet
 * @param {(p: string) => string} read   file reader (injected, so this stays testable)
 * @param {(importerPath: string, name: string) => string} resolve  the IMPORTER'S FILE path
 *        plus the imported name → the imported file's path (callers do `path.dirname(from)`)
 * @param {(p: string) => boolean} exists
 */
export function flattenCssImports(entryPath, { read, resolve, exists }, seen = new Set()) {
  if (seen.has(entryPath)) return '';
  seen.add(entryPath);
  const content = read(entryPath);
  const body = content.replace(/\/\*[\s\S]*?\*\//g, '');
  let imported = '';
  // Quotes OPTIONAL, matching the three forms the flattener this restores accepted:
  // `@import 'x';`, `@import "x";` and the bare `@import x;`. `\s*` (not `\s+`) so a
  // minified `@import"x"` resolves — the divergence that motivated moving the theme
  // graph to the manifest, fixed here rather than re-introduced. `@import url(…)` and
  // quoted paths cannot match: `(`, `/` and `.` are outside the name class.
  for (const m of body.matchAll(/@import\s*['"]?([A-Za-z0-9_-]+)['"]?\s*;?/g)) {
    // `lattice` is the ENGINE base, loaded separately by every caller.
    if (m[1] === 'lattice') continue;
    const p = resolve(entryPath, m[1]);
    if (exists(p)) imported += `${flattenCssImports(p, { read, resolve, exists }, seen)}\n`;
  }
  return imported + content;
}
