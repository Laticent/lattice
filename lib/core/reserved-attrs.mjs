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
 * THE REWRITE IS BLUNT ON PURPOSE. Every case-insensitive `data-split-` / `data-fluid-` in an
 * `html_block` or `html_inline` token becomes `data-x-split-` / `data-x-fluid-`, wherever it sits:
 * in a tag, in a comment, in a quoted value, in a `<style>` or `<script>` body. A first cut parsed
 * each token's tags and dropped only real attributes, and an independent check broke it five ways,
 * each confirmed in Chromium: an empty `<!-->` comment, a `--!>` comment close, a `<!--` inside
 * `<textarea>`/`<style>`/`<script>`/`<title>` (rawtext the tokenizer did not know), and a quote
 * opened in one token and closed in the next, which put `data-split-role` live on a top-level
 * `<section>`. The browser carries comment, rawtext and quote state ACROSS tokens, so no
 * per-token parser is sound. A name cannot be rebuilt across tokens either: markdown-it escapes
 * the text between inline HTML tags, and blocks are separated by a newline, which ends an
 * attribute name. The price is that prose or script inside raw HTML that spells those prefixes
 * reads `data-x-…` instead. No shipped deck writes them.
 *
 * ESM so the docs site's Rollup build can import it; the CommonJS engine `require`s it.
 */

const RESERVED = /data-(split|fluid)-/gi;

/** Rename every reserved prefix in `html`. Input without one comes back as the same string. */
export function neutralizeReservedAttrs(html) {
  const src = String(html ?? '');
  RESERVED.lastIndex = 0;
  return RESERVED.test(src) ? src.replace(RESERVED, (_m, kind) => `data-x-${kind.toLowerCase()}-`) : src;
}

/** A markdown-it core rule that runs `neutralizeReservedAttrs` on every raw-HTML token. */
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
