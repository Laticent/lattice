/**
 * INLINE EDITORS — the kernels a point-and-click editor needs, in one door for the browser bundle.
 *
 * The Studio's Compose editor (docs/src/components/studio/PillEditor.tsx, SparkPanel.tsx) draws each
 * pill and spark and opens an editor on it. Everything it knows about one comes from here,
 * which is the engine's own kernel, not a copy (HARD RULES #1, #7; Segno decision 20): the reader
 * that decides whether a span is a pill, the writer that changes one word of it, the vocabulary,
 * and the function that draws the same DOM the slide gets.
 *
 * Packaged by tools/build-authoring-core.js into docs/src/playground/authoring-core.generated.js.
 * Design: engineering/decisions/2026-10-13-compose-inline-notation-editors.md.
 */

const pills = require('../core/inline-pills.js');
const { pillIsCrowded } = require('./lint-core.js');
const sparks = require('../plugins/sparks/sparks.inline.js');
const { isLiteralFromSource, INLINE_CODE_LITERAL } = require('../core/resolve-inline-code.js');
const codeRecord = require('../plugins/code/shared/record.js');
const { ownsRecordSpan } = require('../core/chart-rows.js');

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
    /** Is this a circle or diamond whose label is too long for it? The linter's `pill-shape-crowded`. */
    crowded: pillIsCrowded,
  },
  spark: {
    /** The span's fields and its data, or null when it is not a spark the engine draws. */
    read: sparks.read,
    /** The span with the changed words replaced, or null (never a guess). See `editSpark`. */
    edit: sparks.editSpark,
    /** The same DOM the slide gets. */
    element: sparks.sparkElement,
    TYPES: sparks.TYPES,
    SERIES_TYPES: sparks.SERIES_TYPES,
    SIZES: sparks.SIZES,
    COLORS: sparks.COLORS,
    MARKERS: sparks.MARKERS,
    MAX_POINTS: sparks.MAX_POINTS,
  },
  /**
   * A fence's `@code{…}` record (the code plugin's reader, lib/plugins/code/shared/record.js), for the
   * Compose code-block options (docs/src/components/studio/code-record-editor.tsx). Its writer,
   * record-edit.js, is the panel's own load (esm/code-record.js), so this bundle does not carry it.
   */
  code: {
    /** A record's fields, with what it could not read. Never throws. */
    read: (text) => codeRecord.readBody(codeRecord.recordBody(text) ?? '{}'),
    /** The deck's `code:` default, from the front matter body. */
    deckDefaults: codeRecord.deckDefaults,
    INDENTS: codeRecord.INDENTS,
  },
  /** Does this deck's front matter turn the inline grammar off (`inline-code: literal`)? */
  isLiteralFromSource,
  /** The class a slide carries when it does (`<!-- _class: inline-code-literal -->`). */
  INLINE_CODE_LITERAL,
  /** Is this span a chart row's data record, which the chart reads and the pill pass leaves alone? */
  ownsChartRecord: ownsRecordSpan,
};
