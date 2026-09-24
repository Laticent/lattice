/**
 * mapSections — the shared depth-aware `<section>` walker every
 * applyToRenderedHtml-style transform uses to visit Marpit's rendered
 * slides and rewrite the ones it owns.
 *
 * Before this module the identical ~30-line scan loop was pasted into five
 * transforms (chart-family, roadmap, journey, split-panels, masthead — the
 * masthead copy even said "Mirrors the walker in lib/core/split-panels.js").
 * Each copy differed ONLY in which sections it matched and what it did with
 * them, so that variation is the callback here and the walk is written once.
 *
 * The scan is depth-aware because user content can nest <section> inside a
 * slide; a naive indexOf('</section>') would close the slide at the inner
 * tag and hand the transform half a slide.
 *
 * Contract:
 *   mapSections(html, rewrite) → html
 *   rewrite(openTag, cls, inner) is called for EVERY top-level section:
 *     - openTag  the verbatim `<section ...>` open tag (attributes intact)
 *     - cls      the value of its class attribute ('' when absent)
 *     - inner    everything between the open tag and its matching close
 *   Return value:
 *     - null / undefined            → section passes through byte-identical
 *     - a string                    → replaces inner (open/close tags kept)
 *     - { openTag, inner }          → replaces both (e.g. chart-family
 *                                     patching the class attribute)
 *
 * Pure string-in/string-out — no fs, no DOM — safe for every browser bundle.
 *
 * Also the home of `readAttr` / `readClassAttr` — the one correct way to read an
 * attribute off an open tag in this engine. See below for why that needs a home
 * at all.
 */

const { splitSections } = require('./split-sections');

/**
 * The class attribute of an open tag, WITH THE LEFT BOUNDARY THAT MAKES IT THE
 * `class` ATTRIBUTE RATHER THAN ANY ATTRIBUTE ENDING IN `-class`.
 *
 * A Lattice `<section>` carries BOTH, and they say different things:
 *
 *   <section id="1" data-class="content" class="content no-note form" …>
 *                   ^^^^^^^^^^^^^^^^^^^  ^^^^^^^^^^^^^^^^^^^^^^^^^^^
 *                   the RAW `_class:`     the RESOLVED list — deck-wide
 *                   directive payload,    `class:` tokens merged in, plus
 *                   mirrored from         `form` / the default component /
 *                   marp-core             finish / mode / …
 *
 * `data-class` comes FIRST, so a bare `/class="([^"]*)"/` — leftmost match wins —
 * silently reads the raw directive instead of the resolved list. Every token the
 * engine ADDS (the deck-wide `class:` register, `form`, the `content` default,
 * `finish-*`, `mode-*`) is invisible to a transform reading it that way, and it
 * fails in the worst direction: a plausible class list that renders, on the exact
 * slides that name their own `_class:`.
 *
 * That cost two shipped bugs (#1358), which is why this is one function and not an
 * idiom to remember:
 *   - below-note promoted a trailing paragraph on `class: no-note` + `_class: content`
 *     (it read `data-class="content"`, which of course has no `no-note` in it);
 *   - `wrapImageText` skipped the `.image-text` panel on `class: image` + `_class: dark`
 *     (it read `data-class="dark"`, which has no `image` in it) — a divergence from the
 *     DOM path, which reads `className` and gets this right for free.
 *
 * `(?:^|\s)` rather than a `(?<!…)` lookbehind deliberately: this module is bundled for
 * the browser, and an open tag's attributes are always whitespace-separated, so the cheap
 * guard is also the complete one. `\b` is NOT a guard — the boundary between `-` and `c`
 * in `data-class` is a word boundary, so `\bclass="` matches it. The `^` alternative is
 * what makes this correct on a BARE ATTRIBUTE STRING too (`class="a"`, with no leading
 * space), which a caller that has already split the tag name off will hand it.
 *
 * ONE IMPLEMENTATION, generalized. `lib/core/collections.js` had carried a private,
 * already-correct `readAttr` since before #1358 — the review's fair objection was that a
 * class-only second copy is a duplicate of it (HARD RULE #15). So the general form lives
 * here, `collections` imports it, and `readClassAttr` is the named wrapper that carries
 * the teaching above. The engine stamps `data-<kebab>` for every applied directive
 * (`APPLIED_DIRECTIVES`, lib/engine/directives.js), so `data-header` / `data-build` /
 * `data-footer` all shadow their bare forms the same way — `readAttr` is what the next
 * one of those should use.
 */
const CLASS_ATTR = /(?:^|\s)class="([^"]*)"/;

/**
 * Read any attribute's value off an open tag (or off a bare attribute string, which
 * starts either at the whitespace after the tag name or at the attribute itself).
 * `null` when absent — the shape `collections.readAttr` has always had.
 *
 * `name` is interpolated into a RegExp, so it must be a literal attribute name from
 * the caller, never parsed input. Every call site passes a constant.
 */
function readAttr(tag, name) {
  if (typeof tag !== 'string') return null;
  const m = tag.match(new RegExp(`(?:^|\\s)${name}="([^"]*)"`));
  return m ? m[1] : null;
}

/**
 * Read the resolved class list off an open tag. '' when absent — never null, so
 * callers can `.split()` / `.includes()` without a guard.
 */
function readClassAttr(tag) {
  if (typeof tag !== 'string') return '';
  const m = tag.match(CLASS_ATTR);
  return m ? m[1] : '';
}

// The walk itself is `splitSections` (lib/core/split-sections.js), the one
// section walker, which reads the document through the `scanTags` tokenizer.
// This module used to carry its own `indexOf('<section')` scan, and so did
// qr-card's `walkSections` and svg-a11y-names' `sectionSpans`. A literal scan
// cannot tell markup from text: one `<section` quoted in an HTML comment or in
// `<style>` text opened a phantom section that never closed, the walk stopped,
// and every slide from that point on passed through UNTOUCHED — no masthead
// band, no stage cell, no coda, for every kernel built on this function, with
// every gate green. Measured on a three-slide deck with one quoting comment on
// slide 2: the engine built 0 masthead bands where the same deck without the
// comment builds 2. See
// engineering/decisions/2026-09-20-form-is-not-configurable.md § Known gaps.
//
// `cls` is still read with `readClassAttr`, not the piece's own `cls`: the two
// class readers differ on a single-quoted or valueless class attribute, and the
// callers of this function rewrite `class="…"` with the double-quoted grammar
// `readClassAttr` speaks. Changing the READER is a separate question from
// changing the WALK, and this change is only the walk.
function mapSections(html, rewrite) {
  let out = '';
  for (const piece of splitSections(html)) {
    if (piece.type === 'gap') { out += piece.text; continue; }
    const { openTag, inner, close } = piece;
    const result = rewrite(openTag, readClassAttr(openTag), inner);
    if (result === null || result === undefined) {
      out += openTag + inner + close;
    } else if (typeof result === 'string') {
      out += openTag + result + '</section>';
    } else {
      out += (result.openTag ?? openTag) + (result.inner ?? inner) + '</section>';
    }
  }
  return out;
}

/**
 * mapSectionHtml(html, rewrite) → html — the same walk, for a callback that works
 * on the WHOLE section (`openTag + inner + close`) and returns a whole section.
 *
 * Several transforms were written against a lazy `/<section…>[\s\S]*?<\/section>/g`
 * `replace`, whose callback received the whole match. That regex is not a walk: a
 * `</section>` quoted in an HTML comment ended the slide there, and a nested
 * section closed its parent early. This keeps each callback's shape and moves the
 * boundary-finding onto `splitSections`, so a migrated caller changes WHERE a
 * section ends and nothing else.
 *
 * `rewrite(sectionHtml, cls)` returns the replacement section, or null/undefined
 * to pass the section through byte-identical (its close tag verbatim).
 */
function mapSectionHtml(html, rewrite) {
  let out = '';
  for (const piece of splitSections(html)) {
    if (piece.type === 'gap') { out += piece.text; continue; }
    const whole = piece.openTag + piece.inner + piece.close;
    const result = rewrite(whole, readClassAttr(piece.openTag));
    out += result === null || result === undefined ? whole : result;
  }
  return out;
}

module.exports = { mapSections, mapSectionHtml, readAttr, readClassAttr, CLASS_ATTR };
