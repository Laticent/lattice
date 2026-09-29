/**
 * parser-bakeoff reference — the INCUMBENT for each target, wrapped so every candidate is
 * held to one output shape. The incumbent is the spec: a challenger passes a case only
 * when its output is deep-equal to what ships today.
 *
 * The five targets, and the production function each one stands for:
 *
 *   axis   `[{Effort, 0..10, 5}, Reach]`   lib/core/bracket-list.js parseBracketList (cap 3 and uncapped)
 *   flow   `Storefront -SEV1-> Payments`   lib/core/flowchart-grammar.js splitRow (one text segment)
 *   gantt  `2026 Q1..Q3`                    lib/core/gantt-time.js parseSpanToken + parseTimePoint
 *   value  `-$0.8M`  `1,25M`  `($1.2M)`     lib/core/chart-values.js isValuePill + signedValue
 *   inline `{BETA}:tag:c4`  `[x]`  `\{X}`   lib/core/inline-code-directives.js (state mark | pill | escape)
 *
 * WHAT A TARGET COVERS is the STRUCTURAL reading — the part a grammar library would replace.
 * Pure policy that sits after it (the separator rule, the magnitude table, a calendar
 * round-trip) lives in shared.mjs and every candidate calls the same copy, so a divergence
 * in the tables is a difference in how the grammar reads the string, never in the policy.
 */
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { parseBracketList } = require('../../lib/core/bracket-list.js');
const { splitRow } = require('../../lib/core/flowchart-grammar.js');
const { parseSpanToken, parseTimePoint } = require('../../lib/core/gantt-time.js');
const { isValuePill, signedValue } = require('../../lib/core/chart-values.js');
const { parseInlineState } = require('../../lib/core/state-marks.js');
const { resolve: resolvePill } = require('../../lib/core/inline-pills.js');

/** One output shape per target; every candidate's impl returns the same. */
export const reference = {
  axis: (s) => parseBracketList(s, { maxParts: 3 }),
  axisUncapped: (s) => parseBracketList(s),
  flow: (s) => {
    const { parts, arrows } = splitRow([{ kind: 'text', value: s }]);
    return {
      parts: parts.map((p) => p.text),
      arrows: arrows.map(({ heavy, label, dir, mermaid }) => ({ heavy, label, dir, mermaid })),
    };
  },
  gantt: (s) => {
    const t = parseSpanToken(s);
    if ('pointRaw' in t) return { point: parseTimePoint(t.pointRaw) };
    return { start: parseTimePoint(t.startRaw), end: parseTimePoint(t.endRaw) };
  },
  value: (s) => (isValuePill(s) ? signedValue(s) : null),
  inline: (s) => inlineOf(s),
};

function inlineOf(s) {
  const st = parseInlineState(s);
  if (st) return { kind: 'state', marker: st.marker };
  const p = resolvePill(s);
  if (p) return { kind: 'pill', value: p.value, shape: p.shape, c: p.c, size: p.size };
  if (typeof s === 'string' && s.length >= 2 && s[0] === '\\') {
    const rest = s.slice(1);
    if (parseInlineState(rest) || resolvePill(rest)) return { kind: 'escaped', text: rest };
  }
  return null;
}

export const TARGETS = Object.keys(reference);

/** Did the incumbent ACCEPT this input (read it as something, not a reject)? gantt and flow
 *  always return an object, so there it means a point parsed or an arrow was found. One
 *  definition, shared by correctness.mjs and speed-cell.mjs. */
export const positive = (v) => v !== null && !(v && 'point' in v && v.point === null)
  && !(v && 'start' in v && v.start === null && v.end === null)
  && !(v && Array.isArray(v.arrows) && v.arrows.length === 0);
