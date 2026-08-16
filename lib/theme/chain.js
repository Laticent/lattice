/**
 * THE theme chain — a palette and everything it extends, parent-first.
 *
 * A palette's parent is declared ONCE, in `themes/<name>.manifest.json` as
 * `extends`. It is also written a second time in the CSS as `@import 'parent'`,
 * and that copy exists for MARP, which has no manifest and must learn the graph
 * from the stylesheet. Lattice reads the manifest; Marp reads the import; a gate
 * (`checkThemeGraph`) keeps them equal so the second copy cannot lie.
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
 * PURE AND FS-FREE (HARD RULE #7): the Node side builds `edges` by reading the
 * manifests, the browser side gets the same map from the baked theme catalog,
 * and both call this. No stylesheet is parsed on either path.
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
function themeChain(name, edges) {
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
  // A CYCLE terminates rather than throwing. A malformed manifest pair should
  // degrade to "render what we can resolve", not take out the CLI — and the gate
  // is what reports it as the authoring error it is.
  return chain.reverse();
}

/**
 * `{ name → extends }` from a list of parsed manifests. `extends` is optional —
 * a base palette extends the ENGINE (`@import 'lattice'`), which is not a theme
 * edge and is resolved by composeCss, so it is deliberately absent here.
 */
function edgesFromManifests(manifests) {
  const edges = Object.create(null);
  for (const m of manifests) {
    if (m?.name) edges[m.name] = m.extends;
  }
  return edges;
}

module.exports = { themeChain, edgesFromManifests };
