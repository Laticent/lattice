/**
 * Nearley (Earley, context-free, scannerless here). Nearley is the only candidate that is
 * not a PEG or LL parser: it accepts ANY context-free grammar, ambiguity included, and
 * returns every parse. That generality is exactly the problem for these grammars, because
 * every one of them is defined by ORDERED choice ("try the arrow first", "the first `..`
 * splits", "a quote opens only if a partner exists") and a CFG has no order and no
 * lookahead. Each such rule is encoded one of two ways, both visible below:
 *
 *   - restructured so the language itself is unambiguous (gantt's first-`..` split, the
 *     axis member state machine after a `}`), or
 *   - a postprocessor that returns `reject` — Nearley's escape hatch, which is JS that
 *     looks outside the rule (a quote's partner, an arrow at a word start, the label cap).
 *
 * Grammars are compiled from .ne text at load with nearley's own compiler, so no build step.
 */
import { createRequire } from 'node:module';
import * as h from '../shared.mjs';

const require = createRequire(import.meta.url);
const nearley = require('nearley');
const compile = require('nearley/lib/compile');
const generate = require('nearley/lib/generate');
const bootstrapped = require('nearley/lib/nearley-language-bootstrapped');

export const name = 'nearley';
export const grammarFiles = ['impl/nearley.mjs'];

/** Per-parse context the postprocessors read (Nearley rules see only their own data). */
const H = { ...h, input: '' };

/** The JS nearleyc would write for a grammar — what a browser build would ship. */
export function compiledJs(src) {
  const p = new nearley.Parser(nearley.Grammar.fromCompiled(bootstrapped));
  p.feed(src);
  return generate(compile(p.results[0], {}), 'grammar');
}

function compileNe(src, starts) {
  const js = compiledJs(src);
  const mod = { exports: {} };
  new Function('module', 'require', 'H', js)(mod, require, H);
  const out = {};
  for (const s of starts) { const g = nearley.Grammar.fromCompiled(mod.exports); g.start = s; out[s] = g; }
  return out;
}

function run(g, s) {
  const p = new nearley.Parser(g);
  try { p.feed(s); } catch { return undefined; }
  return p.results.length ? p.results[0] : undefined;
}

const WSC = '\\t-\\r \\u00a0\\u1680\\u2000-\\u200a\\u2028\\u2029\\u202f\\u205f\\u3000\\ufeff';
const join = '(d) => d.flat(Infinity).join("")';

const INLINE = String.raw`
start -> "\\" direct {% (d) => (d[1] ? { kind: 'escaped', text: H.input.slice(1) } : null) %}
       | direct {% id %}
direct -> state {% id %} | pill {% id %}
state -> "[" ${h.MARKER_CLASS} "]" {% (d) => ({ kind: 'state', marker: d[1] }) %}
pill -> "{" label "}" mod:* {% (d) => H.pill(d[1], d[3]) %}
label -> [^}]:* {% ${join} %}
mod -> ":" [^:]:* {% (d) => d[1].join('') %}
`;

const GANTT = String.raw`
span -> side ".." rest {% (d) => ({ start: H.point(d[0]), end: H.point(d[2]) }) %}
      | nodots {% (d) => ({ point: H.point(d[0]) }) %}
# The FIRST .. splits: a side has no .. in it and does not end in a dot.
side -> sideItem:* {% ${join} %}
sideItem -> [^.] | "." [^.]
nodots -> sideItem:* ".":? {% ${join} %}
rest -> [\s\S]:* {% ${join} %}

point -> ws pt ws {% (d) => d[1] %}
pt -> date {% id %} | quarter {% id %} | month {% id %}
date -> d4 "-" d2 "-" d2 {% (d) => H.date(+d[0], +d[2], +d[4]) %}
quarter -> year:? [qQ] [1-4] {% (d) => H.quarter(d[0] ?? null, d[2]) %}
month -> year:? letters {% (d) => H.month(d[0] ?? null, d[1]) %}
year -> d4 ws {% (d) => +d[0] %}
letters -> [A-Za-z]:+ {% ${join} %}
d4 -> [0-9] [0-9] [0-9] [0-9] {% ${join} %}
d2 -> [0-9] [0-9] {% ${join} %}
ws -> [${WSC}]:*
`;

const VALUE = String.raw`
pill -> ws lead:? ws syms ws inner:? [0-9] [0-9,.]:* ws unit:? ws ")":? ws {% () => true %}
lead -> [(+\-\u2212]
inner -> [\-\u2212]
syms -> null | sym | sym sym | sym sym sym
sym -> [^0-9A-Za-z_${WSC}]
unit -> "%" | "\u2030" | L | L L | L L L | L L L L | L L L L L | L L L L L L
L -> [A-Za-z]
ws -> [${WSC}]:*
`;

/** axis — like Ohm, one grammar per cap; the member sequence is a small state machine. */
function axisNe(cap) {
  const levels = [];
  if (cap > 0) {
    for (let k = 0; k < cap - 1; k++) {
      levels.push(`level${k} -> emptyP {% () => [] %} | emptyP "," level${k} {% (d) => d[2] %}
  | keptP {% (d) => [d[0]] %} | keptP "," level${k + 1} {% (d) => [d[0], ...d[2]] %}`);
    }
    levels.push(`level${cap - 1} -> cappedP {% (d) => (d[0] ? [d[0]] : []) %}`);
  } else {
    levels.push('level0 -> part {% (d) => (d[0] ? [d[0]] : []) %} | part "," level0 {% (d) => [...(d[0] ? [d[0]] : []), ...d[2]] %}');
  }
  return String.raw`
outer -> ws "[" innerAny "]" ws {% (d) => d[2] %}
innerAny -> [\s\S]:* {% ${join} %}

list -> Lstart {% (d) => H.finalizeMembers(d[0]) %}
Lstart -> bare "," Lstart {% (d) => [d[0] ? [d[0]] : [], ...d[2]] %}
        | braced Lafter {% (d) => [d[0], ...d[1]] %}
        | bare {% (d) => [d[0] ? [d[0]] : []] %}
        | bracedOpen {% (d) => [d[0]] %}
# After a closing brace ONE comma is its separator, not an empty member.
Lafter -> ws "," Lstart {% (d) => d[2] %}
        | bareNE "," Lstart {% (d) => [[d[0]].filter(Boolean), ...d[2]] %}
        | bareNE {% (d) => [[d[0]].filter(Boolean)] %}
        | braced Lafter {% (d) => [d[0], ...d[1]] %}
        | bracedOpen {% (d) => [d[0]] %}
        | ws {% () => [] %}
braced -> ws "{" level0 "}" {% (d) => d[2] %}
bracedOpen -> ws "{" level0 {% (d) => d[2] %}
${levels.join('\n')}

keptP -> part {% (d, l, reject) => (d[0] ? d[0] : reject) %}
emptyP -> part {% (d, l, reject) => (d[0] ? reject : null) %}

bare -> ws {% () => null %} | ws bareHead [^,]:* {% (d) => H.part(d[1], d[2]) %}
bareNE -> ws bareHead [^,]:* {% (d) => H.part(d[1], d[2]) %}
bareHead -> quoted {% id %} | head {% (d, l, reject) => (d[0] === '{' ? reject : d[0]) %}
part -> ws {% () => null %} | ws partHead [^,}]:* {% (d) => H.part(d[1], d[2]) %}
partHead -> quoted {% id %} | head {% (d, l, reject) => (d[0] === '}' ? reject : d[0]) %}
cappedP -> ws {% () => null %} | ws cappedHead [^}]:* {% (d) => H.part(d[1], d[2]) %}
cappedHead -> quoted {% id %} | head {% (d, l, reject) => (d[0] === '}' ? reject : d[0]) %} | "," {% id %}

# A quote opens only when a partner ending a part exists further on; otherwise it is text.
quoted -> "\"" [^"]:* "\"" {% (d, l, reject) => (H.partner(l, '"') ? { q: '"' + d[1].join('') + '"' } : reject) %}
        | "'" [^']:* "'" {% (d, l, reject) => (H.partner(l, "'") ? { q: "'" + d[1].join('') + "'" } : reject) %}
head -> [^,${WSC}] {% (d, l, reject) => ((d[0] === '"' || d[0] === "'") && H.partner(l, d[0]) ? reject : d[0]) %}
ws -> [${WSC}]:*
`;
}

/** flow — a row is chunks separated by single spaces; an arrow is a whole chunk. */
const FLOW = String.raw`
row -> chunk rest:* {% (d) => [d[0], ...d[1].flat()].flat() %}
rest -> sp chunk {% (d) => [{ t: d[0] }, d[1]] %}
sp -> [ \t\n\r] {% id %}
chunk -> null {% () => [] %} | arrow {% (d) => [d[0]] %} | word {% id %}

# A word starting where an arrow parses is not a word: ordered choice, spelled as a reject.
word -> wordBody {% (d, l, reject) => (H.arrowAt(l) ? reject : d[0]) %}
wordBody -> item:+ bsTail:? {% (d) => [...d[0], ...(d[1] ? [d[1]] : [])] %}
          | bsTail {% (d) => [d[0]] %}
item -> "\\" punct {% (d) => ({ t: d[1] === '&' ? '\u0001' : d[1] }) %}
      | "\\" [^!-/:-@\[-\u0060{-~ \t\n\r] {% (d) => ({ t: '\\' + d[1] }) %}
      | [^\\ \t\n\r] {% (d) => ({ t: d[0] }) %}
bsTail -> "\\" {% () => ({ t: '\\' }) %}
punct -> [!-/:-@\[-\u0060{-~] {% id %}

# Nearley macros must be defined before use.
right[C] -> $C $C $C:? ">" {% (d) => ({ k: 'dblgt' }) %}
          | $C $C $C:? {% (d) => ({ k: 'dbl', n: d[2] ? 3 : 2 }) %}
          | $C ">" {% () => ({ k: 'gt' }) %}
          | $C label $C ">" {% (d, l, reject) => H.labelOk(d, reject, true) %}
          | $C label $C {% (d, l, reject) => H.labelOk(d, reject, false) %}
left[C] -> $C $C $C:? ">" {% () => ({ k: 'dblgt' }) %}
         | $C $C $C:? {% () => ({ k: 'dbl', n: 0 }) %}
         | $C ">" {% () => ({ k: 'gt' }) %}
         | $C {% () => ({ k: 'bare' }) %}
         | $C label $C ">" {% (d, l, reject) => H.labelOk(d, reject, true) %}
         | $C label $C {% (d, l, reject) => H.labelOk(d, reject, false) %}
arrow -> right["-"] {% (d) => H.arrow(false, '-', d[0]) %} | right["="] {% (d) => H.arrow(false, '=', d[0]) %}
       | "<" left["-"] {% (d) => H.arrow(true, '-', d[1]) %} | "<" left["="] {% (d) => H.arrow(true, '=', d[1]) %}
label -> [^ \t\n\r>] lrest:* {% ${join} %}
lrest -> [^<>\n] {% id %}

arrowPrefix -> arrow | arrow [ \t\n\r] [\s\S]:*
`;

export const SOURCES = () => [INLINE, GANTT, VALUE, axisNe(3), axisNe(0), FLOW];

const t0 = performance.now();
const G = {
  inline: compileNe(INLINE, ['start']).start,
  ...(() => { const g = compileNe(GANTT, ['span', 'point']); return { gantt: g.span, point: g.point }; })(),
  value: compileNe(VALUE, ['pill']).pill,
  ...(() => { const g = compileNe(axisNe(3), ['outer', 'list']); return { outer3: g.outer, list3: g.list }; })(),
  ...(() => { const g = compileNe(axisNe(0), ['outer', 'list']); return { outer0: g.outer, list0: g.list }; })(),
  ...(() => { const g = compileNe(FLOW, ['row', 'arrowPrefix']); return { flow: g.row, arrowPrefix: g.arrowPrefix }; })(),
};
export const buildMs = performance.now() - t0;

// ── postprocessor helpers ───────────────────────────────────────────────────
H.point = (raw) => { const r = run(G.point, raw); return r === undefined ? null : r; };
// A head is a character, or a { q } object when it opened a quote.
H.part = (head, rest) => {
  const quoted = typeof head === 'object';
  return h.partValue(((quoted ? head.q : head) + rest.join('')).trimEnd(), quoted);
};
H.partner = (at, q) => {
  const s = H.input;
  for (let j = at + 1; j < s.length; j++) {
    if (s[j] !== q) continue;
    let k = j + 1;
    while (k < s.length && h.isWsCh(s[k])) k++;
    if (k >= s.length || s[k] === ',' || s[k] === '}') return true;
  }
  return false;
};
H.arrowAt = (at) => {
  const c = H.input[at];
  if (c !== '-' && c !== '=' && c !== '<') return false;
  return run(G.arrowPrefix, H.input.slice(at)) !== undefined;
};
H.labelOk = (d, reject, gt) => {
  const c = [d[0]].flat(Infinity).join(''); // a macro argument arrives wrapped
  const label = d[1];
  // readArrow: the first char is not the shaft, the label is capped, it ends on a
  // non-space, and it holds no EARLIER valid closer (a shaft after a non-space, then a space).
  if (label[0] === c || label.length > h.LABEL_MAX + 1 || h.isSpace(label[label.length - 1])) return reject;
  for (let j = 1; j < label.length; j++) {
    if (label[j] === c && !h.isSpace(label[j - 1]) && j + 1 < label.length && h.isSpace(label[j + 1])) return reject;
  }
  return { k: 'label', label, gt };
};
H.arrow = (left, c, r) => {
  const heavy = c === '=';
  switch (r.k) {
    case 'dblgt': return { a: { heavy, label: '', dir: left ? 'both' : 'out', mermaid: true } };
    case 'dbl': return { a: { heavy, label: '', dir: left ? 'in' : 'none', mermaid: left || r.n === 3 } };
    case 'gt': return { a: { heavy, label: '', dir: left ? 'both' : 'out', mermaid: false } };
    case 'bare': return { a: { heavy, label: '', dir: 'in', mermaid: false } };
    default: return { a: { heavy, label: r.label, dir: r.gt ? (left ? 'both' : 'out') : (left ? 'in' : 'none'), mermaid: false } };
  }
};

function axisWith(cap) {
  return (s) => {
    H.input = s;
    const inner = run(cap ? G.outer3 : G.outer0, s);
    if (inner === undefined) return null;
    H.input = inner;
    const r = run(cap ? G.list3 : G.list0, inner);
    return r === undefined ? null : r;
  };
}

function flow(s) {
  H.input = s;
  const items = run(G.flow, s) || [];
  const parts = [''];
  const arrows = [];
  for (const it of items) {
    if (it.a) { arrows.push(it.a); parts.push(''); } else parts[parts.length - 1] += it.t;
  }
  return { parts, arrows };
}

export const impl = {
  axis: axisWith(3),
  axisUncapped: axisWith(0),
  flow,
  gantt: (s) => run(G.gantt, s),
  value: (s) => (run(G.value, s) ? h.numberOf(s.trim()) : null),
  inline: (s) => { H.input = s; const r = run(G.inline, s); return r === undefined ? null : r; },
};

/** The library's own message for a value pill it refuses (errors.mjs). */
export function diagnose(s) {
  const p = new nearley.Parser(G.value);
  try { p.feed(s); } catch (e) { return e.message.split('\n').slice(0, 3).join(' / '); }
  return p.results.length ? null : 'Unexpected end of input (no complete parse)';
}
