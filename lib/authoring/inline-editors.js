/**
 * INLINE EDITORS — the kernels a point-and-click editor needs, in one door for the browser bundle.
 *
 * The Studio's Compose editor (docs/src/components/studio/PillEditor.tsx) draws a chip
 * beside each pill and opens an editor on it. Everything it knows about a pill comes from here,
 * which is the engine's own kernel, not a copy (HARD RULES #1, #7; Segno decision 20): the reader
 * that decides whether a span is a pill, the writer that changes one word of it, the vocabulary,
 * and the function that draws the same DOM the slide gets.
 *
 * Packaged by tools/build-authoring-core.js into docs/src/playground/authoring-core.generated.js.
 * Design: engineering/decisions/2026-10-13-compose-inline-notation-editors.md.
 */

const pills = require('../core/inline-pills.js');
const { isLiteralFromSource, INLINE_CODE_LITERAL } = require('../core/resolve-inline-code.js');

module.exports = {
  pill: {
    /** The span's fields, or null when it is not a pill the engine draws. */
    read: pills.resolve,
    /** The span with one word changed, or null (never a guess). See `editPill`. */
    edit: pills.editPill,
    /** The same DOM the slide gets. */
    element: pills.pillElement,
    SHAPES: pills.SHAPES,
    COLORS: pills.COLORS,
    SIZES: pills.SIZES,
  },
  /** Does this deck's front matter turn the inline grammar off (`inline-code: literal`)? */
  isLiteralFromSource,
  /** The class a slide carries when it does (`<!-- _class: inline-code-literal -->`). */
  INLINE_CODE_LITERAL,
};
