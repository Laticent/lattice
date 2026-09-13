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
 * Escape a literal for a RegExp. `front-matter-key.js` keeps its own copy for the same
 * reason: the keys ARE ours, from a frozen list, and `renderTargetKeyState`'s unknown-key
 * guard returns before any interpolation site it reaches.
 *
 * IT IS NO LONGER UNREACHABLE, which an earlier draft of this comment claimed. Exporting
 * `scalarValuesFor` and both pattern factories — done so the suite could assert on the
 * SHIPPED path — put three callable doors around that guard:
 * `scalarValuesFor('a.b: true\naxb: no', 'a.b')` returns `['true']`, and without the escape
 * `a.b` would match `axb` too. The export that made the guards honest is the same export
 * that made this escape load-bearing.
 */
function escapeKey(key) {
  return String(key).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

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
 * Swapping the regex for a scalar read looked like a pure bug fix and is not. The two are
 * different matchers, and the six rows below are inputs the ORIGINAL scalar read turned OFF
 * that used to be ON — a self-inflicted regression on decks already in the field
 * (HARD RULE #18).
 *
 * TWO OF THE SIX still need this arm. The other four were closed by making the scalar arm
 * match the legacy one: reading EVERY line for the key (see scalarValuesFor) closed the
 * duplicate key and the nested shadow, and reading the key CASE-INSENSITIVELY closed both
 * key-case rows. What the legacy arm alone can still read is a value FOLDED onto the next
 * line, plus any leading whitespace the scalar arm's `[ \t]*` cannot cross: the legacy arm
 * allows `[^\S\r\n\u2028\u2029]*`, so NBSP, form feed, vertical tab, U+3000, a BOM, and
 * the rest of the Unicode spaces all qualify. The committed fixtures name one of them
 * (NBSP), and an earlier draft of this line called that "the two spellings" — a closed
 * class, stated from a fixture list. It is a class of two SHAPES, not two spellings.
 *
 * (The count in this docblock has been wrong twice — "six inputs … four of them", then a
 * stale six after any-match landed — both times because nobody re-derived it and the arm
 * that "pinned" it measured a stand-in. `render-target-keys.test.js` now derives it from
 * `scalarValuesFor` itself and fails when the set changes.)
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
 *       fluid: "true"     <- the scalar arm reads this line too, and believes it
 *     fluid: false        <- the author's real register, outvoted by an on-word anywhere
 *
 * The old export said OFF here; the union says ON. Plain nested shadowing (`fluid: true`
 * with no quotes or comment) already did this and is pre-existing — the widenings extend it
 * to two more spellings, and the any-match read above extends it again, since the nested
 * line no longer has to come first. Measured across the committed corpus — every tracked
 * `*.md`, via `git ls-files "*.md"` — 906 carry front matter, 3 opt a render target in, and
 * ZERO carry an indented render-target key, so nothing hits this shape. (An earlier draft
 * said 268 and left no reproduction command; it reproduces under no scoping anyone has
 * found. The denominator is stated here so the next reader can re-run it — it was 905 on
 * 2026-09-12 and 906 a day later, so re-run it rather than quoting this line.) It is
 * contrived rather than live. Narrowing the scalar arm to top-level-only would re-break the
 * six parity rows above.
 *
 * THE WARNING IS NOW THE FIX, as this paragraph used to propose in the conditional. The
 * linter's `nested-render-target-key` rule reads `indentedKeyLines` below and reports the
 * line, so the reader keeps believing an indented key and the author is told which of the
 * two readings acts. The corpus zero above is no longer prose either: an arm in
 * `render-target-keys.test.js` sweeps every tracked `*.md` through the shipped rule.
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
 * a generated corpus and fails on one disagreement — 50,000 blocks, the number the arm
 * itself asserts, over a whitespace and token alphabet chosen to hit every clause. (An
 * earlier draft said 600k. That was an ad-hoc run during development; the COMMITTED guard
 * is 50k, and the docblock has to state the guard's width, not the author's afternoon.) Result: 200k newlines in 2.09ms,
 * linear, against 640ms for 20k before.
 */
/** Whitespace that is NOT a line terminator — the only kind that can precede a `$`. */
const NON_TERMINATOR_WS = '[^\\S\\r\\n\\u2028\\u2029]';

/** The legacy predicate, one compiled pattern per key. Exported for the equivalence test. */
function legacyOnPattern(key) {
  return new RegExp(`^${NON_TERMINATOR_WS}*${escapeKey(key)}:(?=(\\s*))\\1(?:true|yes|on)${NON_TERMINATOR_WS}*$`, 'im');
}

/** The shape this replaced, verbatim — the test drives it as the equivalence oracle. */
function legacyOnPatternVerbatim(key) {
  return new RegExp(`^\\s*${escapeKey(key)}:\\s*(?:true|yes|on)\\s*$`, 'im');
}

const LEGACY_ON = Object.freeze(Object.fromEntries(
  Object.keys(RENDER_TARGET_KEYS).map((key) => [key, legacyOnPattern(key)]),
));

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
 * That also makes the verdict invariant under reordering — for blocks of COMPLETE
 * `key: value` lines, which is the qualifier this sentence shipped without. The first-match
 * version was not even that (`fluid: false` above `fluid: "true"` read OFF, and read ON
 * reordered). A value FOLDED onto the following line is the exception and always will be:
 * the legacy arm's middle `\s*` is the only run in either matcher that crosses a line
 * terminator, so reading a fold depends on the two lines staying adjacent —
 * `fluid:` / `  true` / `fluid: false` is ON, and shuffled it is OFF.
 *
 * The cost is paid in the same place the kernel already documents: a nested key can say the
 * on-word and be believed. That widened slightly — it no longer matters whether the nested
 * line comes first — and it stays the direction this module errs in on purpose, because a
 * false ON is a visible surprise and a false OFF is silent.
 */
function scalarValuesFor(fm, key) {
  // CASE-INSENSITIVE on the key, matching the legacy arm's /i. YAML keys are case-sensitive
  // and that /i was arguably the old regex's bug — but the two arms have to ask the SAME
  // question or the split re-opens somewhere new. It did: while this pattern was
  // case-sensitive, the two widenings (quoted values, trailing comments) worked on `fluid:`
  // and not on `FLUID:`, so `FLUID: "true"` read OFF where `fluid: "true"` read ON. The
  // metamorphic arm that asserts key-case invariance passed anyway, because each relation is
  // applied ALONE and the blocks where it fails are the ones the value-rewriting relations
  // produce. Composing them is what exposed it.
  //
  // IT STAYS LOCAL TO THIS FAMILY, and that was ruled on rather than inherited: every sibling
  // reader in front-matter-key.js is case-sensitive, and aligning them would honor a `CLASS:`
  // no writer at column 0 can ever update (#1416). Recorded in
  // engineering/decisions/2026-08-18-settings-panel-coverage-and-ux.md §2.3 with the sweep
  // behind it — zero tracked decks change verdict either way; the /i protects decks in the
  // field, which is the only reason it is here.
  const re = new RegExp(`^[ \t]*${escapeKey(key)}:[ \t]*(.*)$`, 'gmi');
  const out = [];
  for (const m of String(fm ?? '').matchAll(re)) {
    // A COMMENT-ONLY value is an EMPTY value. `frontMatterScalar` treats only a
    // whitespace-PRECEDED `#` as a comment (an unquoted `#ffffff` is a real color), so a
    // value that is nothing but a comment came back as the comment TEXT — and the linter
    // then told an author parking a key with a note that `# decide before we ship` is not a
    // valid on/off value, which the rule's own docblock promises it will not do.
    const raw = String(m[1] ?? '').trim();
    out.push(raw.startsWith('#') ? '' : frontMatterScalar(m[1]));
  }
  return out;
}

/**
 * The indented lines writing `key` that a reader arm ACTUALLY READS — the shape this module
 * treats as the deck's own register while YAML usually does not.
 *
 * This is the remedy the docblock above names for the union's new false-ON, and it lives
 * here rather than in the linter for the reason the vocabulary does (HARD RULE #1): which
 * indented lines get read is decided by the two MATCHERS, and they disagree. The scalar arm
 * opens `^[ \t]*` and reads any value on such a line; the legacy arm opens
 * `^[^\S\r\n\u2028\u2029]*` but only ever matches a bare, unquoted ON-word. So the
 * candidates are collected over the WIDER class and then filtered by whether an arm reads
 * them, which is not the same set either arm defines:
 *
 *     `  fluid: false`       the scalar arm reads it -> reported
 *     `\u00a0fluid: true`    only the legacy arm, and only because the value is a bare
 *                            on-word -> reported
 *     `\u00a0fluid: false`   NEITHER arm reads it (`[ \t]` cannot cross the NBSP, and the
 *                            legacy arm wants an on-word) -> NOT reported
 *
 * The filter exists because a warning is a CLAIM about the export. An earlier draft took
 * the wide class unfiltered, and a checker measured 48 of 104 probed shapes where it told
 * an author the export reads a line that neither arm touches — a NBSP pasted from a web
 * page in front of `fluid: false`, say. The legacy arm is consulted through `LEGACY_ON`,
 * the table the READER consults, never a re-derived twin: certifying a stand-in is the
 * defect this module keeps repeating.
 *
 * It reports LINES, not a boolean, and each one verbatim WITH its indentation. The linter
 * hands the raw line to the editor as the needle it places the underline with
 * (docs/src/playground/editor-diagnostics.js), and the indentation is load-bearing there:
 * a nested `fluid: true` under a top-level `fluid: true` trims to the same string, and the
 * mapper would otherwise underline the innocent top-level line. Every matching line is
 * reported rather than the first, so the CLI lists each place to fix; where two indented
 * lines are byte-identical the editor underlines the first of them, and the second surfaces
 * on the next lint after that one is fixed.
 *
 * The one it CANNOT see is a value folded onto an indented line (`fluid:` at the margin,
 * `  true` beneath it). That line does not write the key at all — it is the legacy arm's
 * middle `\s*` reaching across the newline for a value — so there is no nested key to warn
 * about, and the deck is on for a reason the author can read.
 *
 * @param {string} fm front-matter body (no `---` fences)
 * @param {string} key one of RENDER_TARGET_KEY_NAMES; an unknown key reports nothing
 * @returns {string[]} the indented source lines, verbatim and in source order
 */
function indentedKeyLines(fm, key) {
  if (!Object.hasOwn(LEGACY_ON, key)) return [];
  // `i`, matching both arms: the key is read case-insensitively, so `  FLUID: true` is
  // nested and believed exactly as `  fluid: true` is.
  const re = new RegExp(`^${NON_TERMINATOR_WS}+${escapeKey(key)}:.*$`, 'gmi');
  const legacy = LEGACY_ON[key];
  return [...String(fm ?? '').matchAll(re)].map((m) => m[0]).filter((line) => /^[ \t]/.test(line) || legacy.test(line));
}

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
 * Read with `scalarValuesFor` (`^[ \t]*`, every matching line), not a top-level-only
 * reader. `topLevelFrontMatterValue`'s docblock reserves the column-0 restriction
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
function renderTargetKeyState(fm, key) {
  // An unknown key used to throw here (`LEGACY_ON[key]` is undefined → TypeError on
  // `.test`). Both call sites pass a literal from the family, so it was never reachable,
  // but a kernel that tolerates any `fm` (`String(fm ?? '')`) should not be pickier about
  // its other argument than about its input.
  // `Object.hasOwn`, not a truthiness test: `LEGACY_ON` is a plain object, so every name on
  // `Object.prototype` — `toString`, `constructor`, `__proto__`, `valueOf`,
  // `hasOwnProperty` — came back truthy and then threw on `.test`. The earlier guard caught
  // a key that is simply absent (`nope`) and missed the inherited ones entirely; its commit
  // said the throw was fixed. ("One third of it", an intermediate draft said — a fraction
  // with no derivation behind it, in the module whose subject is figures nobody re-derives.)
  if (!Object.hasOwn(LEGACY_ON, key)) return { state: 'absent', value: null };
  const pattern = LEGACY_ON[key];
  const values = scalarValuesFor(fm, key);
  // `value` stays the FIRST written value — it is what the linter quotes back to the author,
  // and the first bad line is the one they want pointed at. The DECISION below uses all of
  // them; see the docblock on scalarValuesFor for why those are two different questions.
  const value = values.length ? values[0] : null;
  const anyOnWord = values.some((v) => ON_WORDS.includes(v.toLowerCase()));
  // ON is decided FIRST, so every state below describes a deck that is really off — which
  // is what keeps the linter from reporting a line the export does not act on. Both arms now
  // read EVERY line for the key (see scalarValuesFor), so a deck with `fluid: ture` on one
  // line and `fluid: true` on another is ON by either arm rather than by the legacy one
  // alone: the two are belt and braces for different SPELLINGS now, not for different lines.
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
  indentedKeyLines,
  // Exported so the suite can assert on the table the READER consults. An arm that compared
  // the two pattern FACTORIES instead certified a stand-in, and the reader ran the quadratic
  // pattern for three commits behind it.
  LEGACY_ON,
  scalarValuesFor,
  legacyOnPattern,
  legacyOnPatternVerbatim,
};
