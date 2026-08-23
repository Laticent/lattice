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
  // CommonMark 4.5, in full — three conditions, because getting two of them right
  // is what produced the first three defects here:
  //   1. the closer is the SAME character as the opener;
  //   2. its run is at least as LONG;
  //   3. it carries NO INFO STRING.
  // (3) is the one that bites in practice. A card pasting a nested markdown
  // example writes an outer ``` and an inner ```markdown — because remembering to
  // lengthen the outer fence is not a thing people do — and treating that inner
  // line as a closer exposes every heading in the example as a real field. That is
  // a SILENT FALSE ACCEPT: the DoR gate keeps `status:ready` on a card with no
  // swimlane and no acceptance check, which is the one outcome this gate exists to
  // prevent. A false reject, by contrast, is loud and self-correcting — the bot
  // comments and a human re-applies the label.
  //
  // HTML COMMENTS are the second unrendered region. GitHub renders nothing for
  // them, but a `# Done when` inside one used to be honored as a field, and
  // hand-written cards routinely carry comment boilerplate from a template.
  //
  // Indentation is SPACES only (` {0,3}`), not `\s`: a tab-indented run is an
  // indented code block per CommonMark, not a fence, so the heading after it is a
  // real heading and masking it would drop a legitimate field.
  //
  // Every branch returns a string of the SAME LENGTH as its input, so heading
  // offsets computed against the mask still index the original text.
  const blankOut = (str) => ' '.repeat(str.length);
  let open = null; // { char, len } of the fence currently holding us open
  let inComment = false;
  return text
    .split('\n')
    .map((line) => {
      if (inComment) {
        if (line.includes('-->')) inComment = false;
        return blankOut(line); // a heading cannot start mid-line, so mask it all
      }
      if (!open) {
        const at = line.indexOf('<!--');
        if (at !== -1 && line.indexOf('-->', at) === -1) {
          inComment = true;
          // Keep anything BEFORE the comment: `# Title <!--` is a real heading.
          return line.slice(0, at) + blankOut(line.slice(at));
        }
      }
      const m = /^ {0,3}(`{3,}|~{3,})(.*)$/.exec(line);
      if (!m) return open ? blankOut(line) : line;
      const run = m[1];
      const info = m[2];
      if (!open) open = { char: run[0], len: run.length };
      else if (run[0] === open.char && run.length >= open.len && info.trim() === '') open = null;
      // else: an inner fence — other character, shorter run, or carrying an info
      // string — so it is content, and we are still inside the outer block.
      return blankOut(line);
    })
    .join('\n');
}

/**
 * `text` with HTML-COMMENT regions blanked to equal-length spaces, and nothing
 * else. Two masks are needed because fences and comments differ in KIND:
 *
 *   - a fenced code block is VISIBLE content that merely must not be scanned for
 *     headings — an acceptance check written as a single ``` block is a filled
 *     field, and blanking it for the emptiness test would falsely reject a real
 *     card;
 *   - an HTML comment renders as NOTHING, so content inside one must not count
 *     as filling a field at all.
 *
 * So headings are located against the fence+comment mask, and field VALUES are
 * sliced from this one. Without the split, `## Definition of done <!--` followed
 * by a commented-out checklist reads as a filled field whose content no human can
 * see — a real heading (GitHub renders it) carrying invisible content.
 */
function maskComments(text) {
  let inComment = false;
  return text
    .split('\n')
    .map((line) => {
      const blankOut = (str) => ' '.repeat(str.length);
      if (inComment) {
        const end = line.indexOf('-->');
        if (end === -1) return blankOut(line);
        inComment = false;
        return blankOut(line.slice(0, end + 3)) + line.slice(end + 3);
      }
      let out = '';
      let rest = line;
      for (;;) {
        const at = rest.indexOf('<!--');
        if (at === -1) return out + rest;
        const close = rest.indexOf('-->', at);
        if (close === -1) {
          inComment = true;
          return out + rest.slice(0, at) + blankOut(rest.slice(at));
        }
        out += rest.slice(0, at) + blankOut(rest.slice(at, close + 3));
        rest = rest.slice(close + 3);
      }
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
  // Values come from the comment-masked copy: same length, so every offset below
  // still lines up, but commented-out content cannot fill a required field.
  const src = maskComments(text);

  // Pass 1 — canonical form headings. Boundaries are canonical headings only.
  const marks = [];
  for (const h of headings) {
    const key = FIELD_BY_HEADING[h.label];
    if (key) marks.push({ key, valueStart: h.valueStart, headingAt: h.headingAt });
  }
  const out = {};
  for (let i = 0; i < marks.length; i++) {
    const stop = i + 1 < marks.length ? marks[i + 1].headingAt : text.length;
    let val = src.slice(marks[i].valueStart, stop).trim();
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
      const val = src.slice(h.valueStart, next ? next.headingAt : src.length).trim();
      if (!blank(val) && !/^_no response_$/i.test(val)) {
        out[key] = val;
        break;
      }
    }
  }
  return out;
}

module.exports = { parseForm, FIELD_BY_HEADING, ALIAS_HEADINGS, maskFences, maskComments };
