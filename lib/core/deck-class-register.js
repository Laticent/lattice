/**
 * lib/core/deck-class-register.js
 *
 * THE deck-wide `class:` register — which tokens it admits, decided ONCE, at
 * the boundary where the register is read.
 *
 * WHY THIS EXISTS, and why it is a filter rather than a correction.
 *
 * Three writers reach one slot (the `<section>` class list): the front-matter
 * `class:` key, the mid-deck global `<!-- class: … -->` comment directive, and
 * the per-slide spot `<!-- _class: … -->`. The first two are the DECK-WIDE
 * register — "every slide gets this" — and the third is the slide's own.
 *
 * Two kinds of token do not belong in the deck-wide register:
 *
 *   1. A COLOR-AXIS token (`dark` / `light` / `print` / …) when the deck also
 *      sets the first-class `color-mode:` key. `color-mode:` supersedes the
 *      legacy alias (engineering/decisions/2026-07-11-color-mode-frontmatter.md),
 *      and a deck carrying both is a half-finished migration.
 *   2. A COMPONENT NAME. `class: kpi` says "every slide in this deck is a KPI
 *      slide", which is not a deck — it is a layout applied to prose it does not
 *      fit. Worse, it never worked: the token was APPENDED alongside whatever
 *      component each slide named for itself, so a `_class: cards-grid` slide
 *      came out `cards-grid kpi` and CSS source order picked the winner.
 *
 * THE SHAPE MATTERS MORE THAN THE RULE. A first attempt (#1416) let those
 * tokens be stamped onto every section and then SUBTRACTED them afterwards.
 * Subtraction has to know whether a token came from the deck or from the slide,
 * and by the time the class list exists that provenance is gone — a spot
 * `_class:` REPLACES the running global rather than merging with it
 * (lib/engine/slides.js), so the deck's `dark` and the slide's `dark` are the
 * same string on the same section. Stripping by value therefore deleted the
 * SLIDE's token too, and only one of the three code paths could have carried
 * the provenance needed to avoid it. That single choice shipped four
 * regressions, including a runtime that deleted a slide's own component.
 *
 * So: filter at the boundary, never strip afterwards. An illegal token is never
 * stamped, every propagation kernel is purely ADDITIVE, and no provenance record
 * is needed anywhere.
 *
 * WHERE THE BOUNDARY IS — every place the deck-wide register is READ:
 *
 *   · lib/engine/index.js         `globalBase.class` (front matter → the engine's
 *                                  native directive application)
 *   · lib/integrations/markdown-it/plugins.js  `deckClassPropagate`
 *   · lib/runtime/index.js        the DOM mirror of that propagation
 *   · lib/core/marp-bundle.js     the EXPORT boundary — Marp itself stamps the
 *                                  front-matter `class:` before our runtime
 *                                  loads, and the runtime may only add, so the
 *                                  illegal token has to be gone from the bytes.
 *
 * THE MID-DECK GLOBAL `<!-- class: X -->` IS NOT THIS REGISTER, and the scope of
 * this module stops there. It reads like a second spelling of the same key and it
 * is not one — the engine scopes the two differently, in a way that is
 * load-bearing rather than incidental:
 *
 *   front matter `class:`   APPENDED to every section, INCLUDING one that names
 *                           its own `_class:` (that is what `deckClassPropagate`
 *                           is for). It can therefore collide — `_class:
 *                           cards-grid` on a `class: kpi` deck yields BOTH
 *                           components on one section, resolved by CSS source
 *                           order. That collision is the whole case for refusing
 *                           a component name.
 *   `<!-- class: X -->`     a running global that a slide's own `_class:`
 *                           REPLACES wholesale (Marpit's spot-replaces-global).
 *                           It can never collide, it is bounded (write another
 *                           one to end it), and it sits BELOW the front matter in
 *                           document order — so it overrides `color-mode:`
 *                           locally for the same reason a spot `_class: dark`
 *                           does, which the outcome deliberately preserves.
 *
 * `examples/slide-class-forms.md` is the live case: a run of diagram slides
 * declared once with `<!-- class: diagram dark -->`. Refusing that would delete a
 * working capability, and — because `lib/core/slide-class-spans.js` resolves the
 * global to answer the BAND question — it would also need the refusal spelled a
 * third time there, or a diagram would bake for a canvas the section no longer
 * has. Both spellings behave as they did; neither is ever stripped after the
 * fact; nothing diverges.
 *
 * Pure and dependency-free of `fs`, so it bundles into the browser runtime and
 * the playground alongside every caller above.
 */

const { COLOR_MODE_TOKENS } = require('./color-mode');
const { classTokens, colorModeClass, deckColorModeToken } = require('./resolve-color-mode');
const { isComponentToken } = require('./resolve-component');
const { frontMatterValue } = require('./front-matter-key');

/** The color axis as a Set, for whole-token membership. */
const COLOR_AXIS = new Set(COLOR_MODE_TOKENS);

/**
 * Why the deck-wide register refuses `token`, or null when it admits it.
 *
 * `colorModeToken` is the deck's resolved `color-mode:` class token ('' when the
 * key is unset or unknown) — passed in rather than re-read, so a caller that
 * already has it cannot ask the question a second, subtly different way.
 *
 * @returns {'component'|'color-mode'|null}
 */
function deckClassRefusal(token, colorModeToken = '') {
  // Checked FIRST because it holds regardless of `color-mode:`, and because the
  // two sets are disjoint today but need not stay that way — no component is
  // named `dark` or `print`, and if one ever were, "it is a component" is the
  // reason an author would need to hear.
  if (isComponentToken(token)) return 'component';
  if (colorModeToken && COLOR_AXIS.has(token)) return 'color-mode';
  return null;
}

/**
 * The deck-wide class tokens the register ADMITS, in authored order.
 *
 * @param {string} value          the raw `class:` value (front matter or a
 *                                global `<!-- class: … -->` payload)
 * @param {string} colorModeToken the deck's resolved `color-mode:` class token
 */
function deckClassTokens(value, colorModeToken = '') {
  return classTokens(value).filter((t) => !deckClassRefusal(t, colorModeToken));
}

/** The admitted tokens, re-joined — the sanitized `class:` VALUE. */
function deckClassValue(value, colorModeToken = '') {
  return deckClassTokens(value, colorModeToken).join(' ');
}

/**
 * The tokens the register REFUSED, with the reason — the payload the deck linter
 * turns into a warning. Same order as authored, so a message can list them.
 *
 * @returns {{token: string, reason: 'component'|'color-mode'}[]}
 */
function deckClassRefusals(value, colorModeToken = '') {
  const out = [];
  for (const token of classTokens(value)) {
    const reason = deckClassRefusal(token, colorModeToken);
    if (reason) out.push({ token, reason });
  }
  return out;
}

/**
 * Read the register out of a front-matter BODY (no `---` fences) and sanitize it
 * in one step — the form every propagation kernel wants, so none of them has to
 * pair the `class:` read with a matching `color-mode:` read by hand. Pairing
 * those two reads by hand is exactly how the loose/strict split that produced a
 * print canvas with light-baked ink got in.
 *
 * THE TWO KEYS ARE READ DIFFERENTLY, and the asymmetry is the engine's:
 *
 *   · `class:` LOOSELY, because `parseFrontMatter` (lib/engine/directives.js)
 *     trims each line before matching and therefore STAMPS a `class:` at any
 *     indentation onto every section. A refusal that reads more strictly than the
 *     thing it is refusing simply fails to fire — an indented `class: kpi` would
 *     sail past this and get stamped deck-wide, which is the collision the refusal
 *     exists to prevent.
 *   · `color-mode:` at COLUMN 0, because nothing in the engine stamps it. It is a
 *     Lattice register, and every writer of it (`--print`, the Studio's
 *     front-matter writer, the export boundary) writes at column 0. Reading it
 *     loosely let a `color-mode:` nested under some other key supersede — and
 *     DELETE — a real top-level `class: dark` that the exported bytes then kept.
 *
 * Both directions of that were shipped and caught on this branch, which is the
 * argument for stating the rule here rather than leaving it to be re-derived: the
 * reader must match whatever actually acts on the key, and for these two keys that
 * is two different things.
 */
function deckClassTokensFromFrontMatter(fmBody) {
  return deckClassTokens(frontMatterValue(fmBody, 'class') || '', deckColorModeToken(fmBody));
}

/** The refusals for a front-matter BODY — the linter's entry point. */
function deckClassRefusalsFromFrontMatter(fmBody) {
  return deckClassRefusals(frontMatterValue(fmBody, 'class') || '', deckColorModeToken(fmBody));
}

/**
 * One TOP-LEVEL `class:` line.
 *
 * Anchored to the line so the value can never run past its own newline into the
 * next key, and `\r` is captured rather than swallowed by a `.*` so a CRLF deck's
 * carriage return survives a rewrite as the terminator it is.
 *
 * AND ANCHORED TO COLUMN 0, which is the half that matters. An INDENTED
 * `class:` is not the deck's register — it is a key nested under another one, or
 * a line inside a block scalar (`style: |`), and rewriting it corrupts the deck:
 *
 *     foo:
 *       class: kpi     ← a nested key. Removing it deletes `foo`'s only child.
 *     style: |
 *       class: kpi     ← CSS-ish text inside a block scalar.
 *
 * This function exists to govern what MARP will stamp, and Marp parses real
 * YAML — where neither of those is the top-level `class:`. So matching exactly
 * what YAML would call the register is not conservatism, it is the contract.
 * The READERS above apply the same rule, through `topLevelFrontMatterValue` — a
 * loose read paired with a strict write is how the render path came to drop a
 * `class:` token the exported bytes kept.
 */
const CLASS_LINE = /^class:[ \t]*([^\r\n]*?)[ \t]*(\r?)$/;

/**
 * The front-matter fence, split into open / body / close for reassembly.
 *
 * A LEADING BOM is tolerated because a Windows-saved deck really does carry one,
 * and `tools/export-marp.js` reads the deck with no normalization. Anchored with
 * no BOM term, this returned the source UNCHANGED — and since this byte-level
 * rewrite is (by this module's own argument) the only place the refusal can
 * happen for a Marp bundle, a BOM'd deck exported a superseded `class: dark`
 * intact and Marp stamped it.
 */
const FRONT_MATTER_FENCE = /^(\uFEFF?---\r?\n)([\s\S]*?)(\r?\n---)/;

/** One TOP-LEVEL `color-mode:` line — the column-0 rule CLASS_LINE explains. */
const COLOR_MODE_LINE = /^color-mode:[ \t]*([^\r\n]*?)[ \t]*\r?$/;

/**
 * The deck's `color-mode:` token, off the already-split lines this rewrite walks.
 * Same column-0 rule as `deckColorModeToken` — this one just avoids re-scanning
 * the body the writer has already split, for the same reason
 * `withSanitizedDeckClass` reads its own target line rather than a shared helper's.
 */
function topLevelColorModeToken(lines) {
  const line = lines.find((l) => COLOR_MODE_LINE.test(l));
  return line === undefined ? '' : colorModeClass(COLOR_MODE_LINE.exec(line)[1]);
}

/**
 * Rewrite a whole deck SOURCE so its front-matter `class:` carries only admitted
 * tokens — the EXPORT boundary (lib/core/marp-bundle.js).
 *
 * This is the one caller that cannot be served by filtering at read time: an
 * exported bundle is rendered by MARP, which applies the front-matter `class:`
 * to every section before `lattice-runtime.js` has loaded. The runtime is purely
 * additive by design, so whatever Marp stamps is final — which leaves the
 * emitted BYTES as the only place the refusal can happen.
 *
 * Two normalizations, both of them the point rather than tidiness:
 *
 *   · A register with nothing admitted loses its LINE, not just its value. A
 *     bundle is an artifact someone reads and edits, and a bare `class:` invites
 *     re-adding the token that was refused.
 *   · A DUPLICATE `class:` line collapses to one. Lattice reads the first
 *     (`frontMatterValue`); js-yaml, which Marp parses front matter with, takes
 *     the last — so a deck carrying two of them renders differently on the two
 *     sides of the export. Emitting one line is what makes the bundle mean the
 *     same thing to both.
 */
function withSanitizedDeckClass(source) {
  const src = String(source ?? '');
  const m = FRONT_MATTER_FENCE.exec(src);
  if (!m) return src;
  const [whole, open, body, close] = m;
  const lines = body.split('\n');
  // READ THE LINE THIS FUNCTION WILL REWRITE, not `frontMatterValue`. The shared
  // reader matches `^[ \t]*class:`, so on a deck with an INDENTED `class:` above
  // the real one it returns the nested value — and acting on that while rewriting
  // the top-level line deletes a register the author wrote, with a token from
  // somewhere else deciding it. A writer has to read its own target.
  const first = lines.find((line) => CLASS_LINE.test(line));
  if (first === undefined) return src;
  const next = deckClassValue(CLASS_LINE.exec(first)[1], topLevelColorModeToken(lines));
  const out = [];
  let seen = false;
  for (const line of lines) {
    const hit = CLASS_LINE.exec(line);
    if (!hit) { out.push(line); continue; }
    if (seen) continue; // duplicate register — collapsed into the first
    seen = true;
    if (next) out.push(`class: ${next}${hit[2]}`);
  }
  // The CLOSING fence supplies its own `\r?\n`, so the body must not end with a
  // bare `\r`. It can: the body's LAST line had its carriage return eaten by that
  // fence, so dropping that line as a refused register promoted a line that still
  // carries its own — emitting `marp: true\r\r\n---` into a CRLF deck's exported
  // bytes. Harmless to YAML (it reads as a blank line) and therefore exactly the
  // kind of thing that survives; these are export bytes, and `tools/export-marp.js`
  // reads the deck unnormalized by this module's own argument.
  const nextBody = out.join('\n').replace(/\r$/, '');
  if (nextBody === body) return src;
  // Nothing left but blanks → drop the whole block, so refusing a deck's only
  // register leaves it exactly as clean as a deck that never had one. Matches
  // what the Studio's own front-matter writer does when it clears the last key.
  if (!nextBody.trim()) return src.slice(0, m.index) + src.slice(m.index + whole.length).replace(/^(?:\r?\n)+/, '');
  return src.slice(0, m.index) + open + nextBody + close + src.slice(m.index + whole.length);
}

module.exports = {
  deckClassRefusal,
  deckClassTokens,
  deckClassValue,
  deckClassRefusals,
  deckClassTokensFromFrontMatter,
  deckClassRefusalsFromFrontMatter,
  withSanitizedDeckClass,
};
