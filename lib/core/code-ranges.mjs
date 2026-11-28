/**
 * lib/core/code-ranges.mjs
 *
 * The `[start, end)` ranges of a deck the ENGINE's parser reads as code (fences and indented code blocks), wherever a
 * comment the door acts on could sit inside one. Shared by the door (lib/engine/source-hooks.js hands it to the `meta`
 * source hook) and by Export to Marp's strip of old setting comments (lib/core/without-legacy-settings.mjs), so the two
 * agree on what is code.
 *
 * The line scan's fences (lib/core/fence-ranges.mjs) over-reach (any indent; an unclosed fence runs to the end) and miss
 * indented code. They decide nothing unless a candidate comment sits inside one of them, or on an indented line (a
 * possible indented code block, or a fence inside a list item): only then is the engine's block parse paid (about 2 ms
 * on a 1,400-line deck). Every other deck keeps the cheap answer, which agrees with the parse everywhere it matters.
 * The red team on the cut (slice E) found the indented case: `    <!-- _class: x -->` is code, and the door blanked it.
 *
 * Pure and fs-free (HARD RULE #7). ESM so the Studio imports it as source.
 */

import { FRONT_MATTER, boundaryParser as md } from './boundary-parser.mjs';
import { fenceRanges } from './fence-ranges.mjs';
import { MAY_NEED_DOOR } from './meta-door.mjs';

/** A comment the door may act on: the door's own fast-path test, global, so the scan can walk every one. */
const CANDIDATE = new RegExp(MAY_NEED_DOOR.source, 'gi');

/**
 * @param {string} src  LF source
 * @returns {Array<[number, number]>}  sorted, non-overlapping
 */
export function codeRanges(src) {
  const loose = fenceRanges(src);
  let k = 0;
  const inLoose = (at) => {
    while (k < loose.length && loose[k][1] <= at) k++;
    return k < loose.length && at >= loose[k][0];
  };
  let hit = false;
  CANDIDATE.lastIndex = 0;
  for (let m = CANDIDATE.exec(src); m && !hit; m = CANDIDATE.exec(src)) {
    const lineStart = src.lastIndexOf('\n', m.index - 1) + 1;
    // Anything but nothing before it on its line (an indent, `>`, a list marker): a possible indented code block, or a
    // fence inside a container, neither of which the line scan models.
    hit = inLoose(m.index) || /^[ \t>*+\-0-9.)]+$/.test(src.slice(lineStart, m.index));
  }
  if (!hit) return loose;
  const fm = (src.match(FRONT_MATTER) || [''])[0];
  const body = src.slice(fm.length);
  const starts = [0];
  for (let i = body.indexOf('\n'); i !== -1; i = body.indexOf('\n', i + 1)) starts.push(i + 1);
  const tokens = [];
  md.block.parse(body, md, {}, tokens);
  return tokens
    .filter((t) => (t.type === 'fence' || t.type === 'code_block') && t.map)
    .map((t) => [fm.length + starts[t.map[0]], fm.length + (t.map[1] < starts.length ? starts[t.map[1]] : body.length)])
    .sort((a, b) => a[0] - b[0]);
}
