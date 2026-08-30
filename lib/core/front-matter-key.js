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
 * Clean ONE front-matter scalar — the single rule every reader in the repo has to
 * agree on, because the readers that DISAGREE are how a deck renders two ways.
 *
 * The defect this closes: a trailing YAML comment was kept as part of the value.
 * `theme: cuoio  # our brand palette` read as the literal string
 * `"cuoio  # our brand palette"`, which matches no registered palette — so the deck
 * silently fell back to the default while an Export-to-Marp of the same bytes (real
 * YAML, which strips the comment) kept `cuoio`. Two different decks from one source,
 * which is the failure #1416 exists to end.
 *
 * Three rules, and the second and third are load-bearing against real decks:
 *
 *  1. A QUOTED value is the quoted span. Anything after the closing quote is a
 *     comment and is dropped — `footer: 'Q3' # draft` → `Q3`.
 *  2. A `#` INSIDE a quoted span survives, because a quoted `#` is not a comment.
 *     `examples/default-slide-layout.md` ships `meta: "Default layout · #1292"`;
 *     a naive comment strip truncates it to `Default layout ·`. This is the one
 *     corpus deck that proves the quote-awareness is not theoretical.
 *  3. In an UNQUOTED value, only a WHITESPACE-PRECEDED `#` starts a comment. A `#`
 *     that opens the value, or that follows a non-space, is data:
 *       · `backgroundColor: #ffffff` → `#ffffff`. Strict YAML calls that a comment
 *         and demands quotes, but `color`/`backgroundColor` are real directives that
 *         take colors, so an unquoted hex is a deck someone would plausibly write
 *         and it works today. Breaking it to gain YAML purity would be a
 *         self-inflicted regression (HARD RULE #18) for no one's benefit.
 *       · `logo: /brand/mark.svg#icon` → kept, for the same reason.
 *
 * MALFORMED input (one stray quote) keeps the legacy single-character strip rather
 * than inventing a new behavior. `frontMatterValue` and `parseFrontMatter` used to
 * differ here — the former stripped a lone leading quote, the latter kept it — and
 * this unifies them on the former. Unobservable on every committed deck: a scan of
 * the corpus finds ZERO front-matter values with unbalanced quotes.
 *
 * @param {string} raw the text after `key:` to end-of-line
 * @returns {string} the cleaned scalar
 */
function frontMatterScalar(raw) {
  const t = String(raw ?? '').trim();
  if (!t) return '';
  const quote = t[0];
  if (quote === '"' || quote === "'") {
    // Find the CLOSING quote, honouring `\"` inside a double-quoted scalar the way YAML
    // does. A plain `indexOf` stops at the escaped quote and truncates the value — which
    // silently disarms `logo: "./acme.svg\"><script>…"` by throwing the payload away
    // instead of passing it to the escaper that is supposed to neutralise it. Safer by
    // accident is still a reader that disagrees with YAML, and the security property
    // belongs to the HTML escaper downstream, not to an accident here.
    let end = -1;
    for (let i = 1; i < t.length; i++) {
      if (quote === '"' && t[i] === '\\') { i++; continue; } // skip the escaped character
      if (t[i] === quote) { end = i; break; }
    }
    // Terminated: the quoted span IS the value; a trailing comment is not part of it.
    // The span is returned RAW (escapes not unfolded), exactly as the readers this
    // replaces returned it — unfolding would be a second behavior change riding along.
    if (end !== -1) return t.slice(1, end);
    // Unterminated: fall through to the legacy lone-quote strip (see MALFORMED above).
    return t.slice(1);
  }
  // Unquoted: cut at the first whitespace-preceded `#`. `search` returns the index of
  // the WHITESPACE, so the value keeps nothing of the comment or the space before it.
  const cut = t.search(/[ \t]#/);
  const body = (cut === -1 ? t : t.slice(0, cut)).trim();
  // The legacy independent single-character strips, preserved so a value carrying one
  // stray quote reads exactly the way it always did.
  return body.replace(/^['"]/, '').replace(/['"]$/, '');
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
  return frontMatterScalar(m[1]);
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
  return frontMatterScalar(m[1]);
}

/**
 * A front-matter value that must be a bare NAME — the shape a dozen deck registers
 * (`finish:`, `mode:`, `split:`, `stamp:`, `claim:`, `rule:`, `eyebrow:`, …) share.
 *
 * Each of those used to inline `/^[ \t]*<key>:[ \t]*["']?([A-Za-z0-9_-]+)["']?[ \t]*$/m`,
 * which did two jobs in one pattern: READ the value, and CONSTRAIN it to a bare name.
 * The constraint is right and is preserved here verbatim. The read was wrong in one
 * specific way — the `$` anchor meant a trailing YAML comment made the whole pattern
 * fail to match, so `finish: sketch  # for review` silently resolved to NO finish while
 * the engine's own parse read `sketch`. Every one of those registers had it.
 *
 * Splitting the two jobs is what fixes it: read through the one shared scalar rule, then
 * apply the constraint as its own predicate. An out-of-shape value still returns null,
 * exactly as before, so a linter that reports an unknown name keeps reporting it.
 *
 * @param {string} fm front-matter body
 * @param {string} key the key name, without the colon
 * @returns {string|null} the bare name, or null when absent or not name-shaped
 */
function frontMatterName(fm, key) {
  const value = frontMatterValue(fm, key);
  if (value === null) return null;
  return BARE_NAME.test(value) ? value : null;
}

/** The bare-name shape every register above constrained its value to. Unchanged. */
const BARE_NAME = /^[A-Za-z0-9_-]+$/;

module.exports = { frontMatterValue, topLevelFrontMatterValue, frontMatterScalar, frontMatterName };
