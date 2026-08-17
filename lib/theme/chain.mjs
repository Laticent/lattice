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

import { stripCssComments } from '../core/strip-css-comments.mjs';

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
 * The manifest owns the graph for themes Lattice ships. THREE callers still read the
 * edge out of content, and all three are legitimate:
 *
 *   `flattenCssImports` below        a caller-supplied `--css` sheet, which has no
 *                                    manifest and never will
 *   `ThemeStore.resolveThemeImports` the engine store serves `addThemes([{name,css}])`
 *                                    callers — the Studio, a shared deck payload, an
 *                                    external `./engine` consumer — from content alone
 *   `THEME_IMPORT_RE` in engine/css.js  the BASE import (`@import 'lattice'`), which
 *                                    composeCss resolves one step later
 *
 * The first two share this scanner. The third stays where it is — it answers a
 * different question (splice the engine base, not a theme edge) against a different
 * target — but it is quoted-only, so THIS grammar must not accept a form it rejects.
 * An earlier cut of this module widened to a bare `@import x;` and asserted there were
 * only two readers; the result was that `@import lattice;` resolved here, was handed
 * off, and then composed to 2 KB of scaffold because css.js could not read it. One
 * grammar means agreeing with all three, not with two of them.
 *
 * THE GRAMMAR — quoted only, matching CSS itself, `checkThemeRoles`' extractor, Marp,
 * and css.js:
 *  - `@import 'x';` / `@import "x";` — quotes must MATCH. A mismatched pair is not a
 *    valid name, which is `checkThemeRoles`'s stated position.
 *  - an optional `.css` suffix — `@import "extra.css";` is what a plain CSS layout
 *    sheet actually contains, it is the documented `--css` form, and the flattener
 *    resolved it before (by accident: its `['"]?` bookends let it capture the stem and
 *    stop at the dot). Kept deliberately rather than by accident.
 *  - `\s*` (not `\s+`) so a minified `@import"x"` resolves — the divergence that
 *    started this thread, fixed here once rather than per copy.
 *  - `@import url(…)`, quoted PATHS (`'a/b.css'`) and the bare `@import x;` do NOT
 *    match. The bare form is not valid CSS, real Marp ignores it, css.js rejects it,
 *    and nothing in the tree emits it.
 *
 * COMMENTS ARE NOT CODE, and the comment policy is SHARED — both consumers scan through
 * `stripCssComments` (lib/core/strip-css-comments.mjs), which is quote- and
 * escape-aware and blanks rather than deletes, so offsets survive. This is
 * load-bearing, not hygiene: theme files document their own parent in prose
 * (`themes/onyx.css` says "a11y palettes that @import onyx"), and
 * `lib/theme/serialize.js` interpolates a Studio user's free-text description straight
 * into the header comment. Without it, a description mentioning `@import 'onyx';`
 * splices a whole 768 KB palette into a theme that declared no parent — and because
 * `composeCss` strips comments AFTER, the leaf's remaining prose is torn open and read
 * as a selector, silently dropping the rule that follows it.
 *
 * TWO WRONG ANSWERS WERE SHIPPED HERE FIRST, so the shape of the right one is worth
 * recording. Index-range skipping left `@import /* c *\/ 'onyx';` resolving in one
 * consumer and not the other, read a closer-then-star (`/*!banner*\/*{…}`, the
 * minified-reset idiom) as an OPENER, and cost O(matches x ranges) per compose — 20 s on
 * a 1 MB sheet. Replacing it with the naive `replace(/\/\*[\s\S]*?\*\//g,'')` fixed
 * those and kept the worst one: an opener inside a STRING still pairs with the next real
 * closer, so `content: "/*"` above an import silently ate the palette's parent and the
 * theme composed to a 2 KB scaffold with no error. The quote-aware scanner was already
 * in the repo, in `tools/check-css-values.js`, carrying a docblock about this exact
 * failure — it has been promoted rather than re-derived a third time (HARD RULE #15).
 *
 * A FRESH regex per call. `matchAll` and `replace` do NOT advance `lastIndex` (only
 * `exec`/`test` do), so this is defensive rather than load-bearing.
 */
function themeImportRe() {
  return /@import\s*(['"])([A-Za-z0-9_-]+)(?:\.css)?\1\s*;?/g;
}

/** Every theme-name `@import` in `css`, in source order. Comments are not scanned. */
export function themeNameImports(css) {
  return [...stripCssComments(css).matchAll(themeImportRe())].map((m) => m[2]);
}

/**
 * Rewrite every theme-name `@import` in `css`. `replacer(name, full)` returns the
 * replacement text for that directive — return `full` to leave it in place.
 *
 * The scan runs over a comment-MASKED copy (comments blanked to spaces, length and
 * therefore every offset preserved), while the splice is applied to the ORIGINAL text.
 * That combination is the point: comments cannot be mistaken for code, and the returned
 * bytes are otherwise untouched. An earlier cut returned the stripped text directly and
 * inflated every composed sheet with the blanked comments' whitespace — caught by the
 * 128/128 byte-equality check, which is exactly what it is for.
 */
export function replaceThemeNameImports(css, replacer) {
  const text = String(css ?? '');
  const masked = stripCssComments(text);
  let out = '';
  let at = 0;
  for (const m of masked.matchAll(themeImportRe())) {
    out += text.slice(at, m.index) + replacer(m[2], text.slice(m.index, m.index + m[0].length));
    at = m.index + m[0].length;
  }
  return out + text.slice(at);
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
 * including the SAME comment stripping, so a fix to the grammar cannot reach one and
 * miss the other. (It used to strip separately before calling, which is subtly not the
 * same thing: the two then disagreed on `@import /* c *\/ 'onyx';` — valid CSS one
 * followed and the other refused.)
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
  let imported = '';
  for (const name of themeNameImports(content)) {
    // `lattice` is the ENGINE base, loaded separately by every caller.
    if (name === 'lattice') continue;
    const p = resolve(entryPath, name);
    if (exists(p)) imported += `${flattenCssImports(p, { read, resolve, exists }, seen)}\n`;
  }
  return imported + content;
}
