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

/**
 * The same read, restricted to a TOP-LEVEL key — column 0, no leading whitespace.
 *
 * `frontMatterValue`'s `^[ \t]*` matches a NESTED key too, and for most registers
 * that is harmless: nobody writes `foo:` with a `logo:` under it. It stops being
 * harmless for a register that something also WRITES, because every writer in this
 * repo anchors at column 0 (an indented `class:` may be a nested key or a line of
 * a `style: |` block scalar, and rewriting either corrupts the deck). Reader and
 * writer then disagree about which line is the register:
 *
 *     ---
 *     foo:
 *       color-mode: light      # the loose READ finds this…
 *     class: dark              # …and drops the author's real register,
 *     ---                      # while the WRITER, at column 0, sees no key at all
 *
 * The render path resolved that deck without `dark`; an Export-to-Marp of the same
 * bytes kept it. Two different decks from one source, which is the whole failure
 * #1416 exists to end — so the two registers with a writer, `class:` and
 * `color-mode:`, read top-level-only. The looser reader stays the default for
 * read-only keys; this is not a repo-wide sweep.
 *
 * @param {string} fm front-matter body
 * @param {string} key the key name, without the colon
 * @returns {string|null}
 */
function topLevelFrontMatterValue(fm, key) {
  const m = String(fm ?? '').match(new RegExp(`^${escapeKey(key)}:[ \\t]*(.*)$`, 'm'));
  if (!m) return null;
  return m[1].trim().replace(/^['"]/, '').replace(/['"]$/, '');
}

module.exports = { frontMatterValue, topLevelFrontMatterValue };
