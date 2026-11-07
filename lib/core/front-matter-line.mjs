/**
 * The line of a repeated front-matter key that counts, for the ESM readers that cannot import the CJS
 * `lastFrontMatterMatch` (lib/core/front-matter-key.js) — the docs site bundles them with Rollup, which will not
 * read named exports off a CJS file outside its root. Same rule (#3050, D1): the LAST column-0 line wins, and only
 * when the key is nowhere at column 0 does the first indented one stand in. `key :` is the key.
 *
 * @param {string} body  the front-matter body
 * @param {string} key   a key name ([A-Za-z_][\w-]*)
 * @returns {[string, string] | null}  the whole line and its raw value
 */
export function frontMatterLine(body, key) {
  let top = null;
  let first = null;
  for (const m of String(body ?? '').matchAll(new RegExp(`^([ \\t]*)${key}[ \\t]*:[ \\t]*(.*)$`, 'gm'))) {
    first ??= m;
    if (!m[1]) top = m;
  }
  const hit = top || first;
  return hit ? [hit[0], hit[2]] : null;
}
