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

const { frontMatterValue } = require('./front-matter-key');

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
 * two are different matchers, and a parity sweep found SIX inputs where they disagree —
 * four of them in the direction that turns a target OFF that used to be ON, which is a
 * self-inflicted regression on decks already in the field (HARD RULE #18):
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
 * The pattern is kept verbatim rather than re-derived because it is the thing being
 * matched for parity, and it only ever runs against the front-matter BLOCK — a few
 * hundred bytes — which is what it always did. (`front-matter-key.js`'s docblock warns
 * about a polynomial reader; that blowup came from a lazy `(.*?)` between two `[ \t]*`
 * runs. Here the value is a fixed alternation of literals with no character in common
 * with `\s`, so there is nothing for the engine to backtrack across.)
 */
const LEGACY_ON = Object.freeze(Object.fromEntries(
  Object.keys(RENDER_TARGET_KEYS).map((key) => [key, new RegExp(`^\\s*${key}:\\s*(?:true|yes|on)\\s*$`, 'im')]),
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
 * @param {string} fm front-matter body (no `---` fences)
 * @param {string} key one of RENDER_TARGET_KEY_NAMES
 * @returns {{ state: 'absent'|'on'|'off'|'empty'|'unrecognized', value: string|null }}
 */
function renderTargetKeyState(fm, key) {
  const value = frontMatterValue(fm, key);
  const word = value === null ? null : value.toLowerCase();
  // The legacy arm decides FIRST, so every state below describes a deck that is really
  // off. Without this the linter and the export read the same block differently: a deck
  // with `fluid: ture` on one line and `fluid: true` on another renders the viewer (the
  // legacy matcher finds the good line) while the scalar read sees only the typo, and a
  // rule that reports on a line the export does not consult is worse than no rule.
  if (ON_WORDS.includes(word) || LEGACY_ON[key].test(String(fm ?? ''))) {
    return { state: 'on', value: value === null ? null : value };
  }
  if (value === null) return { state: 'absent', value: null };
  if (!value) return { state: 'empty', value: '' };
  if (OFF_WORDS.includes(word)) return { state: 'off', value };
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
};
