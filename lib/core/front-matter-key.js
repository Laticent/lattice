/**
 * Read one KEY out of a deck's front matter — the linear-time way, in one place.
 *
 * The idiom this replaces was written twenty-odd times over:
 *
 *     fm.match(/^[ \t]*logo:[ \t]*["']?(.*?)["']?[ \t]*$/m)
 *
 * and it is polynomial. Three quantifiers — `[ \t]*`, the lazy `(.*?)`, and the
 * trailing `[ \t]*$` — can all match the same tab, so a long run of them makes the
 * engine try every split. Measured before this: a 128 KB run took 4.1 s in ONE
 * reader, and the runtime resolves ~20 of them. (An earlier round of this fix
 * bounded `\s` to `[ \t]`, which removed the NEWLINE dimension — the multiline
 * blowup — but left the single-line ambiguity behind. CodeQL was right to flag it
 * again.)
 *
 * The fix is the shape `lib/core/chart-narration.js` already uses and documents:
 * one GREEDY `(.*)` to end-of-line, which cannot fail and so never backtracks,
 * then trim and unquote in JS where those operations are linear by construction.
 *
 * The unquoting is deliberately two independent single-character strips, matching
 * the `["']?…["']?` it replaces: a value with one stray quote reads the same way it
 * always did, rather than newly failing to unquote.
 */

/** Escape a literal for embedding in a RegExp (keys are ours, but don't assume). */
function escapeKey(key) {
  return String(key).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * The value of `key` in a front-matter block, trimmed and unquoted — or null when
 * the key is absent. `fm` is the YAML BODY (no `---` fences).
 *
 * @param {string} fm front-matter body
 * @param {string} key the key name, without the colon
 * @returns {string|null}
 */
function frontMatterValue(fm, key) {
  const m = String(fm ?? '').match(new RegExp(`^[ \\t]*${escapeKey(key)}:[ \\t]*(.*)$`, 'm'));
  if (!m) return null;
  return m[1].trim().replace(/^['"]/, '').replace(/['"]$/, '');
}

module.exports = { frontMatterValue };
