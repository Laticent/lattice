/**
 * lib/core/render-target-keys.js
 *
 * The three RENDER-TARGET front-matter keys — `fluid:`, `player:`, `present:` —
 * read in ONE place (HARD RULE #1).
 *
 * WHAT MAKES THESE THREE A FAMILY, and why they are not registers. Every other
 * front-matter key describes the DECK: its palette, its Form, its rhythm. These
 * three describe the ARTIFACT a particular render should emit — a fluid-box
 * viewer, a self-contained player, a PDF flagged to open full-screen. They exist
 * in front matter only as a CLI convenience, so a deck that is always exported
 * the same way need not repeat the flag; `lib/core/export-settings.js` argues at
 * length that a render target does not belong in the deck, and the Studio agrees
 * — it decides all three at export time (ShareSheet) and offers no control.
 * Recorded in engineering/decisions/2026-08-18-settings-panel-coverage-and-ux.md
 * §2.3, which is the doc to update if that ever changes.
 *
 * WHY A KERNEL FOR THREE BOOLEANS. `lattice-emulator.js` hand-rolled the same
 * pattern three times:
 *
 *     /^\s*fluid:\s*(?:true|yes|on)\s*$/im.test(fm)
 *
 * and it carries the trailing-comment defect `frontMatterName`'s docblock
 * describes: the `$` anchor means `fluid: true  # for the web` matches NOTHING,
 * so the key silently does nothing while every other register in the same block
 * reads through `frontMatterScalar` and strips the comment. An author cannot see
 * that from the deck — the render just quietly emits the wrong artifact. Reading
 * through the shared scalar rule fixes it for all three at once.
 *
 * It also gives `lib/authoring/lint-core.js` a vocabulary to lint against, so a
 * value that is neither on nor off (`fluid: ture`) is reported while the author
 * is writing rather than discovered in the artifact. That is the whole reason
 * the vocabulary is DATA here and not three inline regexes: a warning and a
 * render that disagree about what `on` means are worse than no warning.
 */

const { frontMatterScalar } = require('./front-matter-key');

/**
 * The keys, with the one line each needs to explain itself to an author. The
 * `info` is consumed by the linter's fix text; the Studio editor's autocomplete
 * carries its own prose, like its other forty-nine entries.
 */
const RENDER_TARGET_KEYS = Object.freeze({
  fluid: 'Emit the .html as the responsive fluid-box viewer (--fluid). PDF/PPTX/PNG are unchanged.',
  player: 'Emit the .html as the self-contained offline player (--player). Supersedes fluid:.',
  present: 'Flag the exported PDF to open in full-screen presentation mode (--present). PDF only.',
});

/** The names alone, in declaration order — the linter iterates this. */
const RENDER_TARGET_KEY_NAMES = Object.freeze(Object.keys(RENDER_TARGET_KEYS));

/**
 * The ON vocabulary — the three words the emulator's regexes accepted. Widening the
 * LIST is a behavior change to every deck that carries a key, so it happens here or
 * not at all.
 *
 * The list is not the whole story, and an earlier draft of this file claimed it was
 * ("character-for-character the set the regexes accepted"). It is not: the regexes
 * and `frontMatterValue` are different MATCHERS, and they disagree about which line
 * they are reading the word from. See `readRenderTargetKey` for the six measured
 * divergences and what this module does about them.
 */
const ON_WORDS = Object.freeze(['true', 'yes', 'on']);

/**
 * The OFF vocabulary. The emulator never needed one — anything that was not an
 * ON word simply read as off — but the LINTER does, because "not on" covers two
 * very different decks: an author who wrote `fluid: false` and meant it, and an
 * author who wrote `fluid: ture` and did not. Only the second is a finding.
 */
const OFF_WORDS = Object.freeze(['false', 'no', 'off']);

/** Every value either vocabulary accepts — the linter's "did you mean" candidates. */
const RENDER_TARGET_VALUES = Object.freeze([...ON_WORDS, ...OFF_WORDS]);

/**
 * The matcher this module replaced, preserved EXACTLY, one compiled pattern per key.
 *
 * Swapping the regex for `frontMatterValue` looked like a pure bug fix and is not. The
 * two are different matchers, and a parity sweep found TEN inputs where they disagree: the
 * SIX below, every one of which turns a target OFF that used to be ON — a self-inflicted
 * regression on decks already in the field (HARD RULE #18) — plus the four widenings named
 * under `readRenderTargetKey`.
 *
 * (An earlier draft of this comment said "six inputs … four of them" turn off. Both halves
 * were wrong, and neither was measured. `render-target-keys.test.js` now drives the two
 * matchers over every row and pins the direction of each, so the count in this docblock is
 * a statement the suite can falsify rather than one a reader has to trust.)
 *
 *   `Fluid: true`                  the /i flag covered the KEY, not just the value
 *   `FLUID: TRUE`                  likewise
 *   `fluid: false` + `fluid: true` the regex matched ANY line; frontMatterValue takes the FIRST
 *   an indented `fluid:` above a   so a nested key now SHADOWS the real one, which is
 *     top-level one                strictly more dangerous than what it replaced
 *   `fluid:` \n `  true`           `\s*` spanned the newline; `[ \t]*` does not
 *   a NBSP before the key          `\s` covered U+00A0; `[ \t]` does not
 *
 * So the reader is the UNION: a deck is opted in if EITHER matcher says so. The legacy
 * arm means no deck in the field loses its viewer; the scalar arm adds the fix this
 * module was written for (a trailing YAML comment) and quoted values. Neither arm can
 * turn a target off that the other turned on, which is the property that matters —
 * these keys decide which ARTIFACT ships, so a false ON is a visible surprise and a
 * false OFF is silent.
 *
 * THE UNION HAS ONE NEW FALSE-ON, and the safety argument above does not cover it, so it
 * is stated rather than buried. The scalar arm's line pattern is `^[ \t]*`, which matches a
 * NESTED key as well as a top-level one, and the two widenings make a nested line readable
 * that the `$`-anchored legacy regex could not read:
 *
 *     nest:
 *       fluid: "true"     <- the scalar arm reads THIS…
 *     fluid: false        <- …not the author's real register
 *
 * The old export said OFF here; the union says ON. Plain nested shadowing (`fluid: true`
 * with no quotes or comment) already did this and is pre-existing — the widenings extend it
 * to two more spellings, and the any-match read above extends it again, since the nested
 * line no longer has to come first. Measured across the committed corpus: 268 decks carry
 * front matter, 3 opt a render target in, and ZERO hit this shape — so it is contrived
 * rather than live. Narrowing the scalar arm to top-level-only would re-break the six
 * parity rows above; if this ever does bite, the fix is a linter warning on a nested
 * render-target key, not a change to this reader.
 *
 * THE PATTERN IS NOT KEPT VERBATIM, and the reason is measured. An earlier draft of this
 * file kept `^\\s*<key>:\\s*(?:true|yes|on)\\s*$` and argued it could not blow up, because
 * "the value is a fixed alternation of literals with no character in common with `\\s`, so
 * there is nothing for the engine to backtrack across." That argument is wrong, and the
 * cost is quadratic — `fluid:` followed by a run of newlines:
 *
 *     newlines     10k      20k      40k
 *     verbatim   190ms    640ms   2477ms      (4x per doubling — O(n^2))
 *
 * The cost is not backtracking. It is the leading `^\\s*`: with `/m` the engine retries at
 * every line start, and from each one `\\s*` scans forward across the whole remaining run.
 * `front-matter-key.js`'s docblock documents a 4.1s reader from a related shape; this is
 * the same family, and the front-matter block is only "a few hundred bytes" until someone
 * pastes something into it.
 *
 * Three changes, each equivalence-checked rather than reasoned about:
 *
 *  1. The LEADING run drops to non-line-terminator whitespace. `^\\s*` spanning a newline
 *     is redundant — if it spans one, the LATER line start matches with a shorter run — so
 *     restricting it removes no match. This is the fix; the other two are hygiene.
 *  2. The MIDDLE run keeps `\\s` (the folded value `fluid:` \n `  true` needs the newline)
 *     but is made atomic via the lookahead-backreference idiom. Backing off would leave a
 *     whitespace character where `t`/`y`/`o` is required, so it can never help.
 *  3. The TRAILING `\\s*$` becomes a non-line-terminator run. `$` can only hold at a
 *     terminator or end of input, so consuming terminators first never reaches a position
 *     `$` accepts that the shorter run did not.
 *
 * Equivalence is PINNED, not asserted: `render-target-keys.test.js` runs both patterns over
 * a generated corpus and fails on one disagreement. 600k randomized blocks over a whitespace
 * and token alphabet chosen to hit every clause found zero. Result: 200k newlines in 2.09ms,
 * linear, against 640ms for 20k before.
 */
/** Whitespace that is NOT a line terminator — the only kind that can precede a `$`. */
const NON_TERMINATOR_WS = '[^\\S\\r\\n\\u2028\\u2029]';

/** The legacy predicate, one compiled pattern per key. Exported for the equivalence test. */
function legacyOnPattern(key) {
  return new RegExp(`^${NON_TERMINATOR_WS}*${key}:(?=(\\s*))\\1(?:true|yes|on)${NON_TERMINATOR_WS}*$`, 'im');
}

/** The shape this replaced, verbatim — the test drives it as the equivalence oracle. */
function legacyOnPatternVerbatim(key) {
  return new RegExp(`^\\s*${key}:\\s*(?:true|yes|on)\\s*$`, 'im');
}

const LEGACY_ON = Object.freeze(Object.fromEntries(
  Object.keys(RENDER_TARGET_KEYS).map((key) => [key, legacyOnPatternVerbatim(key)]),
));

/**
 * What a render-target key SAYS in this front matter.
 *
 *   absent        the key is not written at all
 *   on            an ON word — the target is opted in
 *   off           an explicit OFF word — the author said no, deliberately
 *   empty         `fluid:` with nothing after it (an unfinished key; reads as off)
 *   unrecognized  a value in neither vocabulary — reads as off, and almost
 *                 certainly is not what the author meant
 *
 * Read with the LOOSE reader (`frontMatterValue`, `^[ \t]*`), not the top-level
 * one. `topLevelFrontMatterValue`'s docblock reserves the column-0 restriction
 * for registers something also WRITES, where a reader and a writer disagreeing
 * corrupts the deck; nothing writes these three, and tightening the read would
 * silently stop honoring an indented key that works today.
 *
 * `value` IS NOT A DESCRIPTION OF `state`, and the one case that surprises is `on`. The
 * legacy arm can fire on a line the scalar read never looked at, so `on` legitimately
 * comes back with `value: null` (the key is capitalized, or NBSP-prefixed), `value: ''`
 * (a folded value), or even `value: 'false'` (a duplicate key, off first). Read `state`
 * for the decision; `value` is only ever the scalar arm's view, for reporting the line
 * the author most likely meant. A consumer that renders "this deck says X" from `value`
 * will print `false` on a deck that really is on.
 *
 * @param {string} fm front-matter body (no `---` fences)
 * @param {string} key one of RENDER_TARGET_KEY_NAMES; an unknown key reads as absent
 * @returns {{ state: 'absent'|'on'|'off'|'empty'|'unrecognized', value: string|null }}
 */
/**
 * Every value written for `key` in this block, read through the shared scalar rule.
 *
 * WHY ANY-MATCH AND NOT FIRST-MATCH. `frontMatterValue` takes the first matching line, and
 * the legacy arm matches ANY line — so the union asked two different questions of the same
 * block, and metamorphic tests caught what that costs. Both of these are YAML no-ops, and
 * both flipped a deck from ON to OFF:
 *
 *     player: maybe            player: maybe  # a note
 *     player: yes       ->     player: yes    # a note
 *     => ON                    => OFF
 *
 * The comment stops the legacy arm matching the good line, and the scalar arm never looks
 * past the typo on the first. Quoting the values does the same thing for the same reason.
 * A reader where adding a comment changes which artifact ships is not one anybody can hold
 * in their head.
 *
 * So the scalar arm reads EVERY `key:` line, matching the legacy arm's any-match. The rule
 * is now sayable in one sentence: THE TARGET IS ON IF ANY LINE FOR THIS KEY SAYS AN ON-WORD.
 * That also makes the verdict invariant under reordering, which the first-match version was
 * not (`fluid: false` above `fluid: "true"` read OFF, and read ON reordered).
 *
 * The cost is paid in the same place the kernel already documents: a nested key can say the
 * on-word and be believed. That widened slightly — it no longer matters whether the nested
 * line comes first — and it stays the direction this module errs in on purpose, because a
 * false ON is a visible surprise and a false OFF is silent.
 */
function scalarValuesFor(fm, key) {
  const re = new RegExp(`^[ \t]*${key}:[ \t]*(.*)$`, 'gm');
  const out = [];
  for (const m of String(fm ?? '').matchAll(re)) out.push(frontMatterScalar(m[1]));
  return out;
}

function renderTargetKeyState(fm, key) {
  // An unknown key used to throw here (`LEGACY_ON[key]` is undefined → TypeError on
  // `.test`). Both call sites pass a literal from the family, so it was never reachable,
  // but a kernel that tolerates any `fm` (`String(fm ?? '')`) should not be pickier about
  // its other argument than about its input.
  const pattern = LEGACY_ON[key];
  if (!pattern) return { state: 'absent', value: null };
  const values = scalarValuesFor(fm, key);
  // `value` stays the FIRST written value — it is what the linter quotes back to the author,
  // and the first bad line is the one they want pointed at. The DECISION below uses all of
  // them; see the docblock on scalarValuesFor for why those are two different questions.
  const value = values.length ? values[0] : null;
  const anyOnWord = values.some((v) => ON_WORDS.includes(v.toLowerCase()));
  // The legacy arm decides FIRST, so every state below describes a deck that is really
  // off. Without this the linter and the export read the same block differently: a deck
  // with `fluid: ture` on one line and `fluid: true` on another renders the viewer (the
  // legacy matcher finds the good line) while the scalar read sees only the typo, and a
  // rule that reports on a line the export does not consult is worse than no rule.
  if (anyOnWord || pattern.test(String(fm ?? ''))) {
    return { state: 'on', value: value === null ? null : value };
  }
  if (value === null) return { state: 'absent', value: null };
  if (!value) return { state: 'empty', value: '' };
  if (OFF_WORDS.includes(value.toLowerCase())) return { state: 'off', value };
  return { state: 'unrecognized', value };
}

/**
 * Is this render target opted in by the deck? The emulator's call — it ORs this
 * with the CLI flag, and the flag always wins on its own.
 *
 * @param {string} fm front-matter body (no `---` fences)
 * @param {string} key one of RENDER_TARGET_KEY_NAMES
 * @returns {boolean}
 */
function readRenderTargetKey(fm, key) {
  return renderTargetKeyState(fm, key).state === 'on';
}

module.exports = {
  RENDER_TARGET_KEYS,
  RENDER_TARGET_KEY_NAMES,
  RENDER_TARGET_VALUES,
  ON_WORDS,
  OFF_WORDS,
  renderTargetKeyState,
  readRenderTargetKey,
  legacyOnPattern,
  legacyOnPatternVerbatim,
};
