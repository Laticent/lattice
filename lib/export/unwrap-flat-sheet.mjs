/**
 * lib/export/unwrap-flat-sheet.mjs
 *
 * The one unwrap every flat host runs on the engine's flat pack before shipping it into a
 * document whose slides do not sit in `article.lattice`: the CLI export
 * (`cli-deck-sheet.js`), the Studio's Webpage player and Reading view (`share-export.ts`),
 * and `check:render`'s flat and reading passes (`tools/check-viz-render.js`). It is pure and
 * fs-free, so the browser bundle and Node read the same function (HARD RULE #1).
 * engineering/decisions/2026-09-24-one-style-delivery-spine.md §4.1.
 */

/** The container prefix the pack adds; a flat document has no container. */
const WRAPPER_RE = /article\.lattice\s*>\s*/g;

/**
 * Unwrap the pack WITHOUT turning a child-only slide selector into an any-depth one.
 *
 * `article.lattice > section` meant "a slide". Deleting the prefix leaves `section`, which
 * also matches a raw `<section>` an author nests inside a slide: measured, it took the
 * scaffold's 1280×720 box, `overflow:hidden` and `container-type:size`, and inside a `dark`
 * slide the re-declared light tokens painted it as a white panel, clipping both slides. So
 * the prefix becomes a condition on the slide itself: `section:where(:not(section *))` — a
 * section with no section above it — whose specificity is exactly plain `section`'s, so no
 * rule moves against any other. The packed `:root` arm, `:where(section)`, becomes
 * `:where(section:not(section *))` and stays at zero.
 *
 * @param {string} css the engine's flat pack (`render(…, { styles: 'flat' }).flatCss`)
 * @returns {string}
 */
export function unwrapFlatSheet(css) {
  return css
    .replace(/article\.lattice\s*>\s*section(?![\w-])/g, 'section:where(:not(section *))')
    .replace(/article\.lattice\s*>\s*:where\(section\)/g, ':where(section:not(section *))')
    .replace(WRAPPER_RE, '');
}
