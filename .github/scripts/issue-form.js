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

// Headings a HAND-WRITTEN card uses for the same two ★ fields.
//
// The form is the easy path, not the only one — a card can arrive as a blank
// web issue, a `gh issue create`, or an agent's REST/MCP call, none of which
// render the form. Those cards routinely MEET the Definition of Ready in
// substance (a repro, a "## Definition of done" checklist, a governing doc
// named in prose) and then fail the gate on FORM, because the gate reads only
// the headings above. Measured 2026-08-23: 6 of 167 open cards carried
// `status:ready`, and the whole Ready column was months-old leftovers — a queue
// no session can pull from, so a human dispatches every session by hand.
//
// Aliases are resolved in a SECOND PASS that runs ONLY for a field the
// canonical headings left empty. That ordering is the whole safety argument:
// an alias heading is never a boundary during canonical extraction, so it can
// neither truncate a canonical value (H2) nor hijack a field the form itself
// supplied (M1). A form-filed card parses byte-identically to before.
const ALIAS_HEADINGS = {
  acceptance: ['definition of done', 'acceptance criteria', 'acceptance', 'done when'],
  swimlane: ['swimlane', 'governing decision doc', 'governing doc', 'design doc'],
};

/**
 * `text` with every FENCED CODE BLOCK blanked to spaces, same length, newlines
 * kept — so heading offsets computed against it still index the original.
 *
 * A `#`-prefixed line inside a fence is not a heading; it is a shell comment, a
 * pasted log, or a markdown sample. Scanning raw text honors it anyway, and the
 * captured value then runs past the closing fence into unrelated prose. The
 * canonical field names are long enough that this stayed theoretical; the alias
 * names are not — `# Done when` and `# Acceptance` are ordinary things to find
 * in a pasted snippet, and a card must not reach `status:ready` on one.
 */
function maskFences(text) {
  // CommonMark: a fence is closed only by one of the SAME character, at least as
  // long. A naive open/close toggle gets this wrong on a card that pastes a
  // markdown EXAMPLE — an inner ``` inside an outer ~~~ flips the toggle, and
  // the heading after it is exposed as a field again. That is the same defect
  // this masker exists to fix, one level deeper, and showing a fence inside a
  // fence is ordinary on a card documenting a template.
  let open = null; // { char, len } of the fence currently holding us open
  return text
    .split('\n')
    .map((line) => {
      const m = /^\s{0,3}(`{3,}|~{3,})/.exec(line);
      if (!m) return open ? ' '.repeat(line.length) : line;
      const char = m[1][0];
      const len = m[1].length;
      if (!open) open = { char, len };
      else if (char === open.char && len >= open.len) open = null;
      // else: an inner fence of the other kind, or a shorter run — still inside.
      return ' '.repeat(line.length);
    })
    .join('\n');
}

/** Every markdown heading in `text`, in document order, with its level. */
function scanHeadings(text) {
  const headingRe = /^(#{1,6})[ \t]+(.+?)[ \t]*$/gm;
  const out = [];
  const scannable = maskFences(text);
  let m;
  while ((m = headingRe.exec(scannable))) {
    out.push({
      level: m[1].length,
      label: m[2].replace(/^[★\s]+/, '').trim(), // drop the ★ required-marker
      headingAt: m.index,
      valueStart: headingRe.lastIndex,
    });
  }
  return out;
}

const blank = (v) => !v || !String(v).trim();

/** @returns {{summary?,swimlane?,acceptance?,area?,type?,priority?,notes?:string}} */
function parseForm(body) {
  const text = String(body || '').replace(/\r\n/g, '\n');
  const headings = scanHeadings(text);

  // Pass 1 — canonical form headings. Boundaries are canonical headings only.
  const marks = [];
  for (const h of headings) {
    const key = FIELD_BY_HEADING[h.label];
    if (key) marks.push({ key, valueStart: h.valueStart, headingAt: h.headingAt });
  }
  const out = {};
  for (let i = 0; i < marks.length; i++) {
    const stop = i + 1 < marks.length ? marks[i + 1].headingAt : text.length;
    let val = text.slice(marks[i].valueStart, stop).trim();
    if (/^_no response_$/i.test(val)) val = '';
    out[marks[i].key] = val;
  }

  // Pass 2 — hand-written equivalents, for the ★ fields pass 1 left empty.
  // An alias section runs to the next heading at the SAME or a HIGHER level, so
  // its own sub-headings (a "### Steps" under "## Definition of done") stay in.
  for (const [key, aliases] of Object.entries(ALIAS_HEADINGS)) {
    // ABSENT, not merely empty. `_No response_` is the author explicitly
    // skipping a required field, and the gate must keep rejecting that — a
    // "## Definition of done" further down must not rescue it. So a form-filed
    // card is unaffected by this pass in every case, which is the claim that
    // makes the change safe to land.
    if (key in out) continue;
    for (let i = 0; i < headings.length; i++) {
      const h = headings[i];
      if (FIELD_BY_HEADING[h.label]) continue; // a canonical heading is never an alias
      if (!aliases.includes(h.label.toLowerCase())) continue;
      const next = headings.slice(i + 1).find((n) => n.level <= h.level);
      const val = text.slice(h.valueStart, next ? next.headingAt : text.length).trim();
      if (!blank(val) && !/^_no response_$/i.test(val)) {
        out[key] = val;
        break;
      }
    }
  }
  return out;
}

module.exports = { parseForm, FIELD_BY_HEADING, ALIAS_HEADINGS };
