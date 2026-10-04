// Frozen copy of lib/core/flowchart-grammar.js `parseSpan` (and the vocabulary it reads) from main
// before Segno phase 2 (see README.md), less the three budget constants parseSpan never read. The
// codemod reads it to recognize the old colon chain.
const SHAPES = Object.freeze(['box', 'square', 'pill', 'diamond', 'circle', 'cylinder', 'io', 'doc']);
// CHART_STATUS (lib/core/chart-status.js) — repeated here only as a lookup set; the
// frozen list there stays the authority, and a unit test pins the two equal.
const STATUS_WORDS = Object.freeze(['on-track', 'done', 'live', 'at-risk', 'warn', 'blocked', 'fail', 'pilot', 'decision', 'deferred']);
const HEADS = Object.freeze(['open', 'dot', 'cross']);
const PATTERNS = Object.freeze(['dashed', 'dotted']);
// The chart family's categorical slots are `--chart-cat-1..8` (design/skills/chart-component.md
// "The color story"), not the twelve engine-wide `--cat-N` a pill uses.
const SLOT_COUNT = 8;

const SHAPE_SET = new Set(SHAPES);
const STATUS_SET = new Set(STATUS_WORDS);
const HEAD_SET = new Set(HEADS);
const PATTERN_SET = new Set(PATTERNS);

function parseSpan(span, extraLead) {
  const out = { id: null, shape: {}, line: {}, unknown: [] };
  const words = String(span).split(':');
  words.forEach((raw, idx) => {
    const w = raw.trim();
    if (!w) return;
    if (idx === 0 && w[0] === '#') {
      const id = w.slice(1);
      if (/^[a-z0-9][a-z0-9-]*$/.test(id) && id.length <= 40) out.id = id;
      else out.unknown.push(w);
      return;
    }
    let m;
    if (STATUS_SET.has(w)) out.shape.status = w;
    else if (extraLead?.has(w)) (out.shape.lead = out.shape.lead || []).push(w);
    else if (idx === 0) out.unknown.push(w);
    else if (SHAPE_SET.has(w)) out.shape.shape = w;
    else if (HEAD_SET.has(w)) out.line.head = w;
    else if (PATTERN_SET.has(w)) out.line.pattern = w;
    else if (w === 'loose') out.line.loose = true;
    else if ((m = /^c([1-9])$/.exec(w)) && +m[1] <= SLOT_COUNT) out.shape.slot = +m[1];
    else if ((m = /^(fill|border|text)-c([1-9])$/.exec(w)) && +m[2] <= SLOT_COUNT) out.shape[m[1]] = +m[2];
    else out.unknown.push(w);
  });
  return out;
}

module.exports = { parseSpan };
