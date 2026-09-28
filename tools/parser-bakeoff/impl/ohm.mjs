/**
 * Ohm (PEG, interpreted, grammars as text with separate semantics). Ohm is the purest
 * of the field: a grammar has no actions and no predicates, and it cannot count. Two
 * consequences show up below and are the finding, not workarounds to hide:
 *
 *   - axis: the parts cap (`maxParts`) is a number chosen by the CALLER at parse time.
 *     An Ohm grammar cannot read it, so one grammar is INSTANTIATED per cap value.
 *   - flow: an arrow label is capped at 61 characters. Ohm has no bounded repetition,
 *     so the label rule is UNROLLED — 122 generated rules, one per position and state.
 *
 * Everything else reads naturally, and Ohm's parameterized rules (`body<c>`) carry the
 * arrow's shaft character the way no other library here can.
 */
import * as ohm from 'ohm-js';
import * as h from '../shared.mjs';

export const name = 'ohm';
export const grammarFiles = ['impl/ohm.mjs'];

const WS = '"\\t".."\\r" | " " | "\\u00a0" | "\\u1680" | "\\u2000".."\\u200a" | "\\u2028" | "\\u2029" | "\\u202f" | "\\u205f" | "\\u3000" | "\\ufeff"';

const INLINE = String.raw`
Inline {
  start = escaped | direct
  escaped = "\\" direct
  direct = state | pill | rest
  state = "[" marker "]" end
  marker = ${[...h.STATE_MARKERS].map((m) => JSON.stringify(m)).join(' | ')}
  pill = "{" label "}" mod* end
  label = (~"}" any)*
  mod = ":" (~":" any)*
  rest = any*
}`;

const GANTT = String.raw`
Gantt {
  span = side ".." any*  -- range
       | any*            -- point
  side = (~".." any)*
  point = ws* (date | quarter | month) ws* end
  date = d4 "-" d2 "-" d2 &(ws* end)
  quarter = year? caseInsensitive<"Q"> "1".."4"
  month = year? alpha+ &(ws* end)
  year = d4 ws*
  d4 = digit digit digit digit
  d2 = digit digit
  alpha = "a".."z" | "A".."Z"
  ws = ${WS}
}`;

const VALUE = String.raw`
Value {
  pill = ws* lead? ws* sym? sym? sym? ws* inner? digit (digit | "," | ".")* ws* unit? ws* ")"? ws* end
  lead = "(" | "+" | "-" | "\u2212"
  inner = "-" | "\u2212"
  unit = "%" | "\u2030" | letters
  letters = alpha alpha? alpha? alpha? alpha? alpha?
  sym = ~(alpha | digit | "_" | ws) any
  alpha = "a".."z" | "A".."Z"
  ws = ${WS}
}`;

/** axis — one grammar PER CAP: `levelK` has K parts kept; the last level absorbs commas. */
function axisGrammar(cap) {
  const levels = [];
  if (cap > 0) {
    for (let k = 0; k < cap - 1; k++) {
      levels.push(`  level${k} = emptyPart ("," level${k})?  -- empty\n         | part ("," level${k + 1})?  -- kept`);
    }
    levels.push(`  level${cap - 1} = cappedPart`);
  } else {
    levels.push('  level0 = part ("," part)*');
  }
  return String.raw`
Axis${cap} {
  outer = ws* "[" inner "]" ws* end
  inner = (~("]" ws* end) any)*
  list = member* barePart end
  member = braced | barePart ","  -- bare
  braced = ws* "{" level0 ("}" | end) (ws* ",")?
${levels.join('\n')}
  emptyPart = ws* blankQuote? ws* &("," | "}" | end)
  blankQuote = "\"" ws* "\"" | "'" ws* "'"
  part = ws* quoted? (~("," | "}") any)*
  cappedPart = ws* quoted? (~"}" any)*
  barePart = ws* quoted? (~"," any)*
  quoted = "\"" &((~("\"" ws* stop) any)* "\"" ws* stop) (~"\"" any)* "\""  -- dq
         | "'" &((~("'" ws* stop) any)* "'" ws* stop) (~"'" any)* "'"  -- sq
  stop = "," | "}" | "]" | end
  ws = ${WS}
}`;
}

/** flow — the label unrolled to LABEL_MAX + 1 positions, in two states (after a space or not). */
function flowGrammar() {
  const N = h.LABEL_MAX + 1;
  const rules = [];
  for (let k = 1; k < N; k++) {
    rules.push(`  n${k}<c> = sp1 s${k + 1}<c>  -- sp\n         | ~closer<c> nch n${k + 1}<c>  -- ch\n         | &closer<c>  -- end`);
    rules.push(`  s${k}<c> = sp1 s${k + 1}<c>  -- sp\n         | nch n${k + 1}<c>  -- ch`);
  }
  rules.push(`  n${N}<c> = &closer<c>`);
  rules.push(`  s${N}<c> = ~any any`);
  return String.raw`
Flow {
  row = arrow? item* end
  item = sp arrow?  -- sp
       | "\\" punct  -- esc
       | any  -- other
  sp = " " | "\t" | "\n" | "\r"
  sp1 = " " | "\t" | "\r"
  b = &(sp | end)
  punct = "!".."/" | ":".."@" | "[".."\u0060" | "{".."~"
  arrow = "<" leftAny  -- left
        | rightAny  -- right
  leftAny = left<"-"> | left<"=">
  rightAny = right<"-"> | right<"=">
  right<c> = c c c? ">" b  -- dbl_gt
           | c c c? b  -- dbl
           | c ~c ">" b  -- gt
           | c ~c ~">" ~sp label<c> closer<c>  -- label
  left<c> = c c c? ">" b  -- dbl_gt
          | c c c? b  -- dbl
          | c ~c ">" b  -- gt
          | c b  -- bare
          | c ~c ~">" ~sp label<c> closer<c>  -- label
  label<c> = ~(sp | ">") any n1<c>
  closer<c> = c ">" b  -- gt
            | c b  -- bare
  nch = ~("<" | ">" | sp) any
${rules.join('\n')}
}`;
}

const t0 = performance.now();
const G = {
  inline: ohm.grammar(INLINE),
  gantt: ohm.grammar(GANTT),
  value: ohm.grammar(VALUE),
  axis0: ohm.grammar(axisGrammar(0)),
  axis3: ohm.grammar(axisGrammar(3)),
  flow: ohm.grammar(flowGrammar()),
};

// \u2500\u2500 semantics \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500
const S = {};

S.inline = G.inline.createSemantics().addOperation('v', {
  start(x) { return x.v(); },
  escaped(_, d) { return d.v() ? { kind: 'escaped', text: d.sourceString } : null; },
  direct(x) { return x.v(); },
  state(_a, m, _b, _e) { return { kind: 'state', marker: m.sourceString }; },
  pill(_a, label, _b, mods, _e) { return h.pill(label.sourceString, mods.children.map((m) => m.children[1].sourceString)); },
  rest(_) { return null; },
});

S.gantt = G.gantt.createSemantics().addOperation('v', {
  point(_a, p, _b, _e) { return p.v(); },
  date(y, _a, m, _b, d, _w, _e) { return h.date(+y.sourceString, +m.sourceString, +d.sourceString); },
  quarter(y, _q, n) { return h.quarter(y.children[0] ? +y.children[0].children[0].sourceString : null, n.sourceString); },
  month(y, w, _w, _e) { return h.month(y.children[0] ? +y.children[0].children[0].sourceString : null, w.sourceString); },
});
S.gantt.addOperation('span', {
  span_range(side, _dd, rest) { return { start: ganttPoint(side.sourceString), end: ganttPoint(rest.sourceString) }; },
  span_point(all) { return { point: ganttPoint(all.sourceString) }; },
});
const ganttPoint = (raw) => { const m = G.gantt.match(raw, 'point'); return m.succeeded() ? S.gantt(m).v() : null; };

function axisSemantics(g) {
  const partOf = (_ws, q, rest) => {
    const quoted = q.children.length > 0;
    return h.partValue((q.sourceString + rest.sourceString).trimEnd(), quoted);
  };
  const levels = {};
  const rest = (next) => (next.children[0] ? next.children[0].v() : []);
  for (const r of Object.keys(g.rules).filter((n) => /^level\d+$/.test(n))) {
    if (g.rules[`${r}_kept`]) {
      levels[`${r}_empty`] = (_e, _c, next) => rest(next);
      levels[`${r}_kept`] = (p, _c, next) => { const v = p.v(); return [...(v ? [v] : []), ...rest(next)]; };
    } else if (g.rules.level0 && r === 'level0' && !g.rules.level1 && g.rules.level0.body.factors) {
      levels[r] = (first, _c, more) => [first.v(), ...more.children.map((x) => x.v())].filter(Boolean);
    } else {
      levels[r] = (p) => { const v = p.v(); return v ? [v] : []; };
    }
  }
  return g.createSemantics().addOperation('inner', {
    outer(_w, _o, inner, _c, _t, _e) { return inner.sourceString; },
  }).addOperation('v', {
    list(members, last, _e) { const l = last.v(); return h.finalizeMembers([...members.children.map((m) => m.v()), l ? [l] : []]); },
    member_bare(p, _c) { const v = p.v(); return v ? [v] : []; },
    braced(_w, _o, level, _c, _t, _t2) { return level.v(); },
    part: partOf,
    cappedPart: partOf,
    barePart: partOf,
    ...levels,
  });
}
S.axis0 = axisSemantics(G.axis0);
S.axis3 = axisSemantics(G.axis3);

function axisWith(cap) {
  const g = cap ? G.axis3 : G.axis0;
  const sem = cap ? S.axis3 : S.axis0;
  return (s) => {
    const m = g.match(s, 'outer');
    if (!m.succeeded()) return null;
    const inner = sem(m).inner();
    const lm = g.match(inner, 'list');
    return lm.succeeded() ? sem(lm).v() : null;
  };
}

S.flow = G.flow.createSemantics().addOperation('items', {
  row(a, items, _e) { return [...(a.children[0] ? [a.children[0].items()] : []), ...items.children.flatMap((i) => i.items())]; },
  item_sp(s, a) { return [{ t: s.sourceString }, ...(a.children[0] ? [a.children[0].items()] : [])]; },
  item_esc(_, p) { return [{ t: p.sourceString === '&' ? h.ESC_AMP : p.sourceString }]; },
  item_other(c) { return [{ t: c.sourceString }]; },
  arrow_left(_, x) { return arrowOf(true, x.children[0]); },
  arrow_right(x) { return arrowOf(false, x.children[0]); },
});

function arrowOf(left, body) {
  {
    const heavy = body.sourceString[0] === '=';
    const kind = body.children[0].ctorName.split('_').slice(1).join('_');
    const node = body.children[0];
    const shafts = node.children.slice(0, 3).map((c) => c.sourceString).join('').replace(/[^-=]/g, '').length;
    switch (kind) {
      case 'dbl_gt': return { a: { heavy, label: '', dir: left ? 'both' : 'out', mermaid: true } };
      case 'dbl': return { a: { heavy, label: '', dir: left ? 'in' : 'none', mermaid: left || shafts === 3 } };
      case 'gt': return { a: { heavy, label: '', dir: left ? 'both' : 'out', mermaid: false } };
      case 'bare': return { a: { heavy, label: '', dir: 'in', mermaid: false } };
      default: {
        const label = node.children[1].sourceString;
        const gt = node.children[2].children[0].ctorName === 'closer_gt';
        return { a: { heavy, label, dir: gt ? (left ? 'both' : 'out') : (left ? 'in' : 'none'), mermaid: false } };
      }
    }
  }
}

export const buildMs = performance.now() - t0;

function flow(s) {
  const m = G.flow.match(s, 'row');
  const items = S.flow(m).items();
  const parts = [''];
  const arrows = [];
  for (const it of items) {
    if (it.a) { arrows.push(it.a); parts.push(''); } else parts[parts.length - 1] += it.t;
  }
  return { parts, arrows };
}

function gantt(s) {
  return S.gantt(G.gantt.match(s, 'span')).span();
}

export const impl = {
  axis: axisWith(3),
  axisUncapped: axisWith(0),
  flow,
  gantt,
  value: (s) => (G.value.match(s, 'pill').succeeded() ? h.numberOf(s.trim()) : null),
  inline: (s) => S.inline(G.inline.match(s, 'start')).v(),
};

/** The library's own message for a value pill it refuses (errors.mjs). */
export function diagnose(s) {
  const m = G.value.match(s, 'pill');
  return m.succeeded() ? null : m.shortMessage;
}
