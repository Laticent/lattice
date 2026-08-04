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

function mapSections(html, rewrite) {
  let out = '';
  let i = 0;
  while (i < html.length) {
    const open = html.indexOf('<section', i);
    if (open < 0) { out += html.slice(i); break; }
    out += html.slice(i, open);
    const tagEnd = html.indexOf('>', open);
    if (tagEnd < 0) { out += html.slice(open); break; }
    const openTag = html.slice(open, tagEnd + 1);
    const cls = readClassAttr(openTag);

    // Depth-aware </section> scan. Jumps straight to the next '<section' or
    // '</section>' via indexOf rather than testing every character position —
    // same matching semantics (the leftmost occurrence of either literal
    // substring), just without the O(n) startsWith probe at each char.
    let depth = 1, pos = tagEnd + 1, closeEnd = -1;
    while (pos < html.length) {
      const nextOpen = html.indexOf('<section', pos);
      const nextClose = html.indexOf('</section>', pos);
      if (nextClose < 0) break;
      if (nextOpen >= 0 && nextOpen < nextClose) {
        const e = html.indexOf('>', nextOpen);
        if (e < 0) break;
        depth++; pos = e + 1;
      } else {
        depth--;
        if (depth === 0) { closeEnd = nextClose + '</section>'.length; break; }
        pos = nextClose + '</section>'.length;
      }
    }
    if (closeEnd < 0) { out += html.slice(open); break; }

    const inner = html.slice(tagEnd + 1, closeEnd - '</section>'.length);
    const result = rewrite(openTag, cls, inner);
    if (result === null || result === undefined) {
      out += html.slice(open, closeEnd);
    } else if (typeof result === 'string') {
      out += openTag + result + '</section>';
    } else {
      out += (result.openTag ?? openTag) + (result.inner ?? inner) + '</section>';
    }
    i = closeEnd;
  }
  return out;
}

module.exports = { mapSections, readAttr, readClassAttr, CLASS_ATTR };
