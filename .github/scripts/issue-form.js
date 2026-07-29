/**
 * Parse a GitHub issue-FORM body (.github/ISSUE_TEMPLATE/work-item.yml) into
 * its fields. Shared by the dor-gate and apply-form-labels workflows so the
 * extraction logic lives — and is unit-tested — in exactly one place.
 *
 * Robust by design: section boundaries are the EXACT known field headings
 * only. A value that itself contains a markdown heading (e.g. an Acceptance
 * check written as "### Steps\n…") is NOT truncated, and a stray heading in
 * prose (e.g. "### Area of concern") is NOT mistaken for a field — the two
 * failure modes a naive "slice to the next ###" helper falls into.
 *
 * Forms render each field as `### <label>` then its value; a skipped optional
 * field renders `_No response_` (normalised to '').
 */

// Heading text (after stripping the ★ required-marker) → field key.
const FIELD_BY_HEADING = {
  Summary: 'summary',
  'Swimlane / governing decision doc': 'swimlane',
  'Acceptance check': 'acceptance',
  Area: 'area',
  Type: 'type',
  Priority: 'priority',
  'Notes / context': 'notes',
};

/** @returns {{summary?,swimlane?,acceptance?,area?,type?,priority?,notes?:string}} */
function parseForm(body) {
  const text = String(body || '').replace(/\r\n/g, '\n');
  const headingRe = /^#{1,6}[ \t]+(.+?)[ \t]*$/gm;
  const marks = [];
  let m;
  while ((m = headingRe.exec(text))) {
    const label = m[1].replace(/^[★\s]+/, '').trim(); // drop the ★ required-marker
    const key = FIELD_BY_HEADING[label];
    if (key) marks.push({ key, valueStart: headingRe.lastIndex, headingAt: m.index });
  }
  const out = {};
  for (let i = 0; i < marks.length; i++) {
    const stop = i + 1 < marks.length ? marks[i + 1].headingAt : text.length;
    let val = text.slice(marks[i].valueStart, stop).trim();
    if (/^_no response_$/i.test(val)) val = '';
    out[marks[i].key] = val;
  }
  return out;
}

module.exports = { parseForm, FIELD_BY_HEADING };
