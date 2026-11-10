/**
 * Neutralize the engine's RESERVED attribute names in author-written HTML.
 *
 * The split stamps its structure on the markup it emits: `data-split-role`, `data-split-run`,
 * `data-split-label`, `data-split-mods`, and from Fluid P3 the `data-fluid-*` seams and budgets
 * (engineering/decisions/2026-10-27-fluid-layout-library.md §5.2). Downstream code reads those
 * attributes as the engine's own word: `formToggleClass` treats a `data-split-role` section as one
 * the envelope composed, and Fluid's adapter will read `data-fluid-budget` as a page budget. An
 * author's raw HTML could carry the same names, and DOMPurify keeps every `data-*` attribute, so a
 * deck could forge a seam (`data-fluid-budget="0"` on a 1,000-row table is thousands of pages) or a
 * split label holding markup (§11).
 *
 * The same holds for `data-lattice-slide`, the index the engine stamps on every top-level
 * `<section>`. The split, the slide rail and the Studio's page pick all find a slide by it, so an
 * author's raw HTML that forged one could make the split or the Studio address the wrong slide
 * (followups P8 of #2923). Only that one `data-lattice-` name is reserved: authors legitimately
 * paste `data-lattice-motion` and other engine-written attributes into raw HTML, and those do not
 * address a slide.
 *
 * THE REWRITE IS BLUNT ON PURPOSE. Every case-insensitive `data-split-` / `data-fluid-` /
 * `data-lattice-slide` in an `html_block` or `html_inline` token becomes `data-x-split-` /
 * `data-x-fluid-` / `data-x-lattice-slide`, wherever it sits:
 * in a tag, in a comment, in a quoted value, in a `<style>` or `<script>` body. A first cut parsed
 * each token's tags and dropped only real attributes, and an independent check broke it five ways,
 * each confirmed in Chromium: an empty `<!-->` comment, a `--!>` comment close, a `<!--` inside
 * `<textarea>`/`<style>`/`<script>`/`<title>` (rawtext the tokenizer did not know), and a quote
 * opened in one token and closed in the next, which put `data-split-role` live on a top-level
 * `<section>`. The browser carries comment, rawtext and quote state ACROSS tokens, so no
 * per-token parser is sound. A name cannot be rebuilt across tokens either: markdown-it escapes
 * the text between inline HTML tags, and blocks are separated by a newline, which ends an
 * attribute name. The price is that prose, script or CSS inside raw HTML that spells those prefixes
 * reads `data-x-…` instead: an author `<style>` selecting `section[data-lattice-slide="2"]` matches
 * nothing (select a slide by its `_class` instead), and a speaker note that names one is renamed,
 * which is why notes-core renames the source the same way before it matches notes to strip. No
 * shipped deck writes them.
 *
 * THE SECTION TAG IS RESERVED THE SAME WAY. A top-level `<section>` IS a slide: the engine emits one
 * per slide, and the split, the rail, pagination and `data-lattice-slide` all count them. An author's
 * raw `</section><section>` closed the engine's slide and opened a new top-level one, which the
 * engine then wrapped in form chrome and numbered, so every later slide's number moved up by one
 * (followups.d/3051-p10); a lone `<section>` did the opposite, swallowing the next slide into this
 * one. So every case-insensitive `<section` / `</section` in raw HTML becomes `<x-section` /
 * `</x-section`, bluntly, for the reason above: comment, rawtext and quote state cross tokens. An
 * author's balanced `<section>…</section>` still renders its content, as an unknown inline element
 * (`x-section`), and the sanitized surfaces (the Studio, the player) drop the tag and keep the
 * content. To group content, write a `<div class="…">`. No shipped deck writes a section.
 *
 * ESM so the docs site's Rollup build can import it; the CommonJS engine `require`s it.
 */

// `lattice-slide` takes a right-hand boundary: only that exact name is reserved, so an author's
// `data-lattice-slides` or the retired `data-lattice-slide-bake` passes through untouched.
const RESERVED = /data-(split-|fluid-|lattice-slide(?![\w.:-]))/gi;

// A `<section` or `</section` tag opener: the name ends where HTML ends a tag name (space, `/`, `>`),
// so `<sections>` or a custom `<section-card>` passes through.
const SECTION_TAG = /<(\/?)section(?![\w:.-])/gi;

/**
 * Rename every reserved prefix and every `section` tag in `html`. Input without one comes back as
 * the same string.
 */
export function neutralizeReservedAttrs(html) {
  let src = String(html ?? '');
  RESERVED.lastIndex = 0;
  if (RESERVED.test(src)) src = src.replace(RESERVED, (_m, kind) => `data-x-${kind.toLowerCase()}`);
  SECTION_TAG.lastIndex = 0;
  if (SECTION_TAG.test(src)) src = src.replace(SECTION_TAG, (_m, close) => `<${close}x-section`);
  return src;
}

/**
 * Put back the section tags `neutralizeReservedAttrs` renamed, in text a PERSON reads: a speaker
 * note, a description, a say line. The rename has to run inside comments (a comment can close a
 * quote an earlier token opened), and notes are read back from those comments, so a note about
 * HTML said `<x-section>` where its author wrote `<section>` (the checker on followups 3051-p10).
 * Only for reading: matching a note against the source still uses the renamed form on both sides.
 * The price: a note that literally writes `<x-section>` reads `<section>`.
 */
export function restoreSectionTag(text) {
  const src = String(text ?? '');
  return src.indexOf('x-section') === -1 ? src : src.replace(/<(\/?)x-section(?![\w:.-])/gi, '<$1section');
}

/** A markdown-it core rule that runs `neutralizeReservedAttrs` on every raw-HTML token (attributes and the section tag). */
export function guardReservedAttrs(md) {
  md.core.ruler.push('lattice_reserved_attrs', (state) => {
    for (const t of state.tokens) {
      if (t.type === 'html_block') t.content = neutralizeReservedAttrs(t.content);
      else if (t.type === 'inline' && t.children) {
        for (const c of t.children) if (c.type === 'html_inline') c.content = neutralizeReservedAttrs(c.content);
      }
    }
  });
}
