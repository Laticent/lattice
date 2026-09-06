/**
 * lib/core/resolve-inline-code.js
 *
 * The deck front-matter `inline-code:` register decides whether the INLINE DIRECTIVE
 * GRAMMAR runs — `{LABEL}` pills, `[x]` `[-]` `[ ]` `[/]` state marks, and every
 * dispatcher that lands in `lib/core/inline-code-directives.js` later.
 *
 *   inline-code: rich     → (no token)              the grammar runs — the DEFAULT
 *   inline-code: literal  → inline-code-literal     every single-backtick span stays a <code>
 *
 * WHY A REGISTER EXISTS AT ALL. The grammar reads EVERY single-backtick span in every
 * deck. Across the deck corpus #2066 measured — `examples/`, `lib/`, `docs/src`,
 * `test/integration` — it captured zero an author meant
 * literally — but that is OUR corpus. (The span COUNT is deliberately not restated here:
 * #2066's figure was recorded without its method, and an independent re-derivation over
 * the same stated corpus got a different total. A number that cannot be reproduced is
 * worse than a pointer to where it was taken — HARD RULE #9.) A deck written elsewhere, against plain Marp,
 * whose prose says `[x]` or `{LABEL}` in inline code now renders a disc or a pill where
 * it rendered text. The per-occurrence remedy (a backslash) is fine for one span and
 * absurd for ninety, so the deck needs one line that turns the grammar off wholesale.
 * This is that line, and it was the `raise it by:` on #2066's pre-merge card.
 *
 * WHY THE NAME IS `inline-code:` AND NOT `pills:`. The register governs a SURFACE — every
 * single-backtick span — not one of the two things currently drawn from it. `pills:` would
 * be a lie the moment it also silenced `[x]`, and would need renaming again when
 * `{$now.date}` lands (2026-05-11-inline-code-directives.md § AMENDMENT 2026-09-06).
 * `directives:` was rejected for a worse reason: Marp already calls `<!-- _class: … -->`
 * and its front-matter keys DIRECTIVES, so `directives: off` reads as "disable Marp
 * directives" to exactly the audience most likely to type it.
 *
 * THE CLASS IS THE CONTRACT, NOT THE REGISTER — on BOTH paths. The engine resolves the
 * register to `inline-code-literal` on each section (`deckClassPropagate`, which runs
 * before the grammar) and then gates on that resolved class; the runtime reads the same
 * class off the section. One signal, one answer, per slide.
 *
 * ONE PLACE READS THE SOURCE, and it is a timing exception rather than a second contract.
 * The engine builds `header:` / `footer:` chrome at the 15th core ruler rule, and the deck
 * class is propagated at the 26th — eleven rules later — so at the moment chrome is rendered the
 * deck-level token is not on the section yet. `slideIsInlineCodeLiteral`
 * (`lib/engine/slides.js`) therefore reads the section class FIRST, which is how a
 * per-slide `_class:` reaches that slide's chrome, and falls back to re-deriving the
 * deck-level answer from the front matter. Same inputs, same answer, one ruler step too
 * early to read it off the class. The RUNTIME needs no such case: marp-core emits
 * `<header>` / `<footer>` inside the section, so `closest('section')` finds the class from
 * inside chrome exactly as it does from inside the body. Both halves are pinned in
 * `test/unit/core/inline-code-register-paths.test.js`.
 *
 * THE FIRST CUT GATED THE ENGINE ON FRONT MATTER INSTEAD, and an independent checker
 * found three defects falling out of that one asymmetry: a per-slide
 * `<!-- _class: inline-code-literal -->` was documented as working and did not; a
 * deck-wide `class: inline-code-literal` — the spelling the docs teach for raw Marp —
 * stamped the token and still drew the pills; and the same deck rendered one way through
 * the engine and the other through the runtime, with no warning on either. Gating both on
 * the class is what makes the sentence above true rather than aspirational.
 *
 * WHAT THE CLASS BUYS ON A RAW MARP PREVIEW. An author there writes marp-core's own global
 * `class:` directive and marp-core puts the token on every section itself, with no Lattice
 * code in the loop. Verified against real marp-cli 4.x — `class: inline-code-literal`
 * emits `<section id="1" data-class="inline-code-literal" … class="inline-code-literal">`.
 *
 * (THIS NOTE HAS BEEN WRONG TWICE, in opposite directions, and both are worth recording
 * because the second correction is what a reader would otherwise trust.
 *
 * It first said "nothing of ours can read `inline-code:` on a raw Marp preview, the same
 * wall `form: off` hits". Too strong: `deckFrontMatterSource()` DOES fetch the sibling
 * `.md` and apply nineteen front-matter keys from it — the `deckTokens` array in
 * `lib/runtime/index.js` is the list, and `inline-code:` is the nineteenth. Believing that
 * overstatement is plausibly what left this register out of that very mirror.
 *
 * The correction then over-swung, claiming that fetch is "how `eyebrow: dot` reaches a
 * section THERE" — on a raw Marp preview. It does not. `deck-front-matter.js` measures it:
 * over `file://` the fetch is CORS-blocked outright, and marp-cli loads a deck over
 * `file://`. Over http(s) it arrives, but after the pills are drawn. So on a marp-core
 * render the register genuinely cannot reach the runtime — which is what makes the CLASS
 * the contract there, and it is the right conclusion reached by a wrong route twice.)
 *
 *     ---
 *     marp: true
 *     class: inline-code-literal     # a raw-Marp deck, no Lattice engine in the loop
 *     ---
 *
 * KNOW WHAT THAT COSTS on a raw Marp deck: Marpit's per-slide `_class:` REPLACES the
 * global `class:` for that slide, so a slide setting its own `_class:` loses the token and
 * the grammar comes back — measured through Marpit itself. The remedy is to list the token
 * alongside (`_class: big-number inline-code-literal`). A Lattice deck is unaffected: the
 * engine APPENDS the register's token to the class list it builds, so a per-slide
 * `_class:` composes with it instead of competing.
 *
 * Pure + dependency-free so it bundles into the browser runtime and is unit-testable in
 * isolation; shared by plugins.js and runtime/index.js so both render paths agree
 * (HARD RULE #1).
 */

const { frontMatterName } = require('./front-matter-key');

/** Recognized values. `rich` is the default and maps to NO token (today's render). */
const INLINE_CODE_NAMES = Object.freeze(['rich', 'literal']);
/** The one class token — also the per-slide override, and the raw-Marp `class:` value. */
const INLINE_CODE_LITERAL = 'inline-code-literal';
/** The per-slide override set, in the shape the section stamper expects. */
const INLINE_CODE_TOKENS = Object.freeze([INLINE_CODE_LITERAL]);

const INLINE_CODE_NAME_SET = new Set(INLINE_CODE_NAMES);

/** Extract the raw `inline-code:` value from a deck source's front matter, or null. */
function readFrontMatterInlineCode(md) {
  if (!md) return null;
  const m = md.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n/);
  if (!m) return null;
  return frontMatterName(m[1], 'inline-code');
}

/** True if `value` is a recognized `inline-code:` value. */
function isKnownInlineCode(value) {
  return typeof value === 'string' && INLINE_CODE_NAME_SET.has(value.trim().toLowerCase());
}

/**
 * Map an `inline-code:` value to its class token. `rich` (the default), empty, and
 * UNKNOWN all map to `''` — an unknown value must not silently turn the grammar off, so
 * it falls to the running default and the linter says so (`unknown-inline-code`).
 */
function inlineCodeClass(value) {
  if (typeof value !== 'string') return '';
  return value.trim().toLowerCase() === 'literal' ? INLINE_CODE_LITERAL : '';
}

/** Convenience: does this deck source turn the grammar off? */
function isLiteralFromSource(md) {
  return inlineCodeClass(readFrontMatterInlineCode(md) || '') !== '';
}

/**
 * Does this element sit inside a section that turned the grammar off? The runtime's gate.
 *
 * Reads the CLASS, for the reason the docblock gives — it is the one signal present on
 * all three paths. `closest` rather than a section-scoped query so a per-slide override
 * (`<!-- _class: inline-code-literal -->`) is honored per slide, which is what every other
 * register does.
 */
function isLiteralElement(el) {
  const section = el && typeof el.closest === 'function' ? el.closest('section') : null;
  return !!section && section.classList.contains(INLINE_CODE_LITERAL);
}

module.exports = {
  INLINE_CODE_NAMES,
  INLINE_CODE_TOKENS,
  INLINE_CODE_LITERAL,
  readFrontMatterInlineCode,
  isKnownInlineCode,
  inlineCodeClass,
  isLiteralFromSource,
  isLiteralElement,
};
