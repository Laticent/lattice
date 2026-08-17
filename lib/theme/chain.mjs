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
 * THE content-side theme-name `@import` scanner — the one place that decides what
 * "a theme-to-theme import" looks like in BYTES.
 *
 * The manifest owns the graph for themes Lattice ships. Two callers still have to
 * read the edge out of content, and both are legitimate: `flattenCssImports` below
 * (a caller-supplied `--css` sheet, which has no manifest and never will) and
 * `ThemeStore.resolveThemeImports` (the engine store serves `addThemes([{name,css}])`
 * callers — the Studio, a shared deck payload, an external `./engine` consumer — and
 * works from content alone by design). They had a regex each, and the two DISAGREED:
 *
 *     form                          store          flattenCssImports
 *     @import 'indaco';             resolves       resolves
 *     @import"indaco";  (minified)  resolves       resolves
 *     @import indaco;   (bare)      MISSES         resolves
 *     @import url(…)                —              matched `url` (false positive)
 *
 * That is the defect this whole thread is about, one level down: a fix reaching one
 * copy and not the other. See
 * engineering/decisions/2026-08-17-composition-stays-content-addressed.md.
 *
 * THE RECONCILED GRAMMAR, matching what `checkThemeRoles` already gates:
 *  - `@import 'x';` / `@import "x";` — quotes must MATCH. A mismatched pair
 *    (`@import "x';`) is not a valid name, which is the gate's stated position; the
 *    old `['"]?…['"]?` form accepted it by accident.
 *  - `@import x;` — the bare form, accepted only when the name is followed by `;` or
 *    end-of-input. That lookahead is what excludes `@import url(…)`: the old form
 *    matched the prefix and captured `url`, and its comment claimed — wrongly — that
 *    it could not.
 *  - `\s*` (not `\s+`) throughout, so a minified `@import"x"` resolves. That is the
 *    divergence that started the thread; it is fixed here once rather than per copy.
 *  - Quoted PATHS (`@import 'a/b.css'`) cannot match either arm: `/` and `.` are
 *    outside the name class.
 *
 * A FRESH regex per call, deliberately: a shared `/g` literal carries `lastIndex`
 * between callers, so one scan would resume mid-sheet after another's.
 */
function themeImportRe() {
  return /@import\s*(?:(['"])([A-Za-z0-9_-]+)\1|([A-Za-z0-9_-]+)(?=\s*(?:;|$)))\s*;?/g;
}

/** Every theme-name `@import` in `css`, in source order. */
export function themeNameImports(css) {
  const out = [];
  for (const m of String(css ?? '').matchAll(themeImportRe())) out.push(m[2] ?? m[3]);
  return out;
}

/**
 * Rewrite every theme-name `@import` in `css`. `replacer(name, full)` returns the
 * replacement text for that directive — return `full` to leave it in place.
 */
export function replaceThemeNameImports(css, replacer) {
  return String(css ?? '').replace(themeImportRe(), (full, _q, quoted, bare) =>
    replacer(quoted ?? bare, full),
  );
}

/**
 * Flatten a stylesheet's theme-name `@import` chain from the CONTENT, parent-first.
 *
 * The manifest is the contract for themes Lattice ships. This is for the one input
 * that has no manifest and never will: a caller-supplied layout stylesheet
 * (`lattice-emulator.js --css`, a documented CLI form). Its identity and its graph
 * are genuinely whatever the bytes say, so the bytes are the only available source.
 *
 * It exists as ONE named function rather than a fourth inline regex, and it reads the
 * directive through `themeNameImports` above — the SAME scanner the engine store uses,
 * so a fix to the grammar cannot reach one and miss the other. Comments are stripped so
 * a banner quoting `@import 'self'` in prose cannot self-match and loop.
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
  for (const name of themeNameImports(body)) {
    // `lattice` is the ENGINE base, loaded separately by every caller.
    if (name === 'lattice') continue;
    const p = resolve(entryPath, name);
    if (exists(p)) imported += `${flattenCssImports(p, { read, resolve, exists }, seen)}\n`;
  }
  return imported + content;
}
