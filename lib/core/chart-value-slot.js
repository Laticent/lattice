/**
 * chart-value-slot — does a pill sit in a VALUE slot: the two tests chart-rows.js needs from the chart family's number
 * reader, and nothing else of it.
 *
 * Split from chart-values.js (which re-exports both) because the engine imports chart-rows.js for the `{…}` record decision, and
 * chart-values.js carries the whole parser, the magnitude and money tables and the unit keys. The route budget
 * (docs/route-budget.json `engineJsGz`) should pay for these two functions and Segno's number reader, not for the parser too.
 */

const { malformedNumber, readNumber } = require('@laticent/segno/values');

/**
 * Does this pill sit in a VALUE slot, read or not? A malformed number (`(5`, `--5`) holds the slot
 * it was typed in and reads as NaN there. A chart that sorts pills into slots by "is it a value"
 * otherwise moved it onto the label and promoted the NEXT value into its place: bullet drew a
 * target of 10 as the actual for `Revenue `(5` `10``.
 */
function isValueSlot(raw) {
  return raw != null && (isValuePill(raw) || malformedNumber(String(raw)) !== undefined);
}

function isValuePill(raw) {
  if (raw == null) return false;
  // Segno's reader IS this test: a wholly numeric pill, and never a range — `0..10` is not a
  // value (the separator rule used to read it as 10, a range silently become its upper end).
  return readNumber(String(raw)) !== undefined;
}

module.exports = { isValuePill, isValueSlot };
