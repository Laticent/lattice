/**
 * Parsimmon (parser combinators: PEG semantics, grammar written as JS values). The
 * representative of the combinator family (arcsecond, parjs, …). No grammar language and
 * no build step: a parser is an ordinary value, so context is ordinary code — the parts
 * cap is a counter threaded through `.chain`, which is the most natural encoding of it in
 * the whole field. The price is that the grammar is only as readable as the JS around it.
 */
import P from 'parsimmon';
import * as h from '../shared.mjs';

export const name = 'parsimmon';
export const grammarFiles = ['impl/parsimmon.mjs'];

const t0 = performance.now();

const WS_CHARS = [9, 10, 11, 12, 13, 32, 0xa0, 0x1680, 0x2028, 0x2029, 0x202f, 0x205f, 0x3000, 0xfeff]
  .concat(Array.from({ length: 11 }, (_, i) => 0x2000 + i)).map((c) => String.fromCharCode(c)).join('');
const ws = P.oneOf(WS_CHARS).many();
const str = P.string;
const tie = (p) => p.many().tie();

// ── inline ──────────────────────────────────────────────────────────────────
const state = P.seq(str('['), P.oneOf(h.STATE_MARKERS), str(']'), P.eof).map(([, m]) => ({ kind: 'state', marker: m }));
const pill = P.seq(
  str('{'), tie(P.noneOf('}')), str('}'),
  P.seq(str(':'), tie(P.noneOf(':'))).map(([, m]) => m).many(),
  P.eof,
).map(([, v, , mods]) => h.pill(v, mods));
const direct = P.alt(state, pill, P.all.result(null));
const escaped = str('\\').then(P.all).chain((rest) => {
  const r = direct.parse(rest);
  return r.status && r.value ? P.succeed({ kind: 'escaped', text: rest }) : P.fail('escape');
});
const inlineP = P.alt(escaped, direct);

// ── gantt ───────────────────────────────────────────────────────────────────
const D = P.oneOf('0123456789');
const dn = (n) => D.times(n).tie();
const endAhead = P.lookahead(ws.then(P.eof));
const year = dn(4).skip(ws).map(Number);
const date = P.seq(dn(4), str('-'), dn(2), str('-'), dn(2)).skip(endAhead).map(([y, , m, , d]) => h.date(+y, +m, +d));
const quarter = P.seq(year.atMost(1), P.oneOf('qQ'), P.oneOf('1234')).map(([y, , q]) => h.quarter(y[0] ?? null, q));
const month = P.seq(year.atMost(1), P.regexp(/[A-Za-z]/).atLeast(1).tie()).skip(endAhead)
  .chain(([y, w]) => { const m = h.month(y[0] ?? null, w); return m ? P.succeed(m) : P.fail('month'); });
const point = P.seq(ws, P.alt(date, quarter, month), ws, P.eof).map(([, p]) => p);
const side = tie(P.notFollowedBy(str('..')).then(P.any));
const ptOf = (raw) => { const r = point.parse(raw); return r.status ? r.value : null; };
const ganttP = P.alt(
  P.seq(side, str('..'), P.all).map(([a, , b]) => ({ start: ptOf(a), end: ptOf(b) })),
  P.all.map((a) => ({ point: ptOf(a) })),
);

// ── value ───────────────────────────────────────────────────────────────────
const alpha = P.regexp(/[A-Za-z]/);
const sym = P.noneOf(`0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz_${WS_CHARS}`);
const valueP = P.seq(
  ws, P.oneOf('(+-\u2212').atMost(1), ws, sym.times(0, 3), ws, P.oneOf('-\u2212').atMost(1),
  D, P.oneOf('0123456789,.').many(), ws,
  P.alt(str('%'), str('\u2030'), alpha.times(1, 6)).atMost(1), ws, str(')').atMost(1), ws, P.eof,
);

// ── axis ────────────────────────────────────────────────────────────────────
const stop = P.alt(P.oneOf(',}]'), P.eof);
const quotedOf = (q) => str(q)
  .skip(P.lookahead(P.notFollowedBy(P.seq(str(q), ws, stop)).then(P.any).many().then(P.seq(str(q), ws, stop))))
  .then(tie(P.noneOf(q))).skip(str(q)).map((b) => `${q}${b}${q}`);
const quoted = P.alt(quotedOf('"'), quotedOf("'"));
const partOf = (stops) => P.seq(ws, quoted.atMost(1), tie(P.noneOf(stops)))
  .map(([, q, b]) => h.partValue((q.join('') + b).trimEnd(), q.length > 0));

function axisParser(cap) {
  const bare = partOf(',');
  // The count of KEPT parts rides through `.chain`; once cap - 1 are kept the next part
  // absorbs commas, because a label is prose.
  const partsFrom = (kept) => partOf(cap && kept >= cap - 1 ? '}' : ',}').chain((v) => {
    const n = kept + (v ? 1 : 0);
    return P.alt(str(',').then(P.lazy(() => partsFrom(n))).map((r) => [v, ...r]), P.succeed([v]));
  });
  const braced = P.seq(ws, str('{'), partsFrom(0), P.alt(str('}'), P.eof), P.seq(ws, str(',')).atMost(1))
    .map(([, , ps]) => ps.filter(Boolean));
  const member = P.alt(braced, bare.skip(str(',')).map((p) => (p ? [p] : [])));
  const list = P.seq(member.many(), bare, P.eof).map(([ms, last]) => h.finalizeMembers([...ms, last ? [last] : []]));
  const outer = P.seq(ws, str('['), tie(P.notFollowedBy(P.seq(str(']'), ws, P.eof)).then(P.any)), str(']'), ws, P.eof)
    .map(([, , inner]) => inner);
  return (s) => {
    const o = outer.parse(s);
    if (!o.status) return null;
    const r = list.parse(o.value);
    return r.status ? r.value : null;
  };
}

// ── flow ────────────────────────────────────────────────────────────────────
const SP = ' \t\n\r';
const B = P.lookahead(P.alt(P.oneOf(SP), P.eof));
const gtB = str('>').skip(B);
const closer = (c) => str(c).then(P.alt(gtB.result(true), B.result(false)));
const labelOf = (c) => P.seq(
  P.noneOf(`${SP}>`),
  P.alt(
    P.seq(P.oneOf(' \t\r').atLeast(1).tie(), P.noneOf(`<>${SP}`)).tie(),
    P.notFollowedBy(closer(c)).then(P.noneOf(`<>${SP}`)),
  ).many().tie(),
).tie().chain((l) => (l.length <= h.LABEL_MAX + 1 ? P.succeed(l) : P.fail('label cap')));

const body = (left, c) => {
  const dir = (g) => (g ? (left ? 'both' : 'out') : (left ? 'in' : 'none'));
  return P.alt(
    // A doubled shaft commits: every later branch starts by refusing `c`.
    P.lookahead(str(c)).then(P.seq(str(c), str(c).atMost(1)))
      .chain(([, x]) => P.alt(gtB.result(true), B.result(false)).map((g) => ({ label: '', dir: dir(g), mermaid: g || left || x.length === 1 }))),
    gtB.result({ label: '', dir: left ? 'both' : 'out', mermaid: false }),
    B.chain(() => (left ? P.succeed({ label: '', dir: 'in', mermaid: false }) : P.fail('bare'))),
    P.notFollowedBy(str(c)).then(P.seq(labelOf(c), closer(c))).map(([label, g]) => ({ label, dir: dir(g), mermaid: false })),
  );
};
const arrow = P.seq(str('<').atMost(1), P.oneOf('-=')).chain(([l, c]) => body(l.length > 0, c)
  .map((r) => ({ a: { heavy: c === '=', label: r.label, dir: r.dir, mermaid: r.mermaid } })));
const text = (p) => p.map((t) => ({ t }));
const rowP = P.seq(
  arrow.atMost(1),
  P.alt(
    P.seq(text(P.oneOf(SP)), arrow.atMost(1)).map(([s, a]) => [s, ...a]),
    str('\\').then(P.oneOf(h.ASCII_PUNCT)).map((c) => [{ t: c === '&' ? h.ESC_AMP : c }]),
    text(P.any).map((x) => [x]),
  ).many(),
  P.eof,
).map(([a, rest]) => [...a, ...rest.flat()]);

function flow(s) {
  const r = rowP.parse(s);
  const parts = [''];
  const arrows = [];
  for (const it of r.value) {
    if (it.a) { arrows.push(it.a); parts.push(''); } else parts[parts.length - 1] += it.t;
  }
  return { parts, arrows };
}

export const buildMs = performance.now() - t0;

export const impl = {
  axis: axisParser(3),
  axisUncapped: axisParser(0),
  flow,
  gantt: (s) => ganttP.parse(s).value,
  value: (s) => (valueP.parse(s).status ? h.numberOf(s.trim()) : null),
  inline: (s) => inlineP.parse(s).value,
};

/** The library's own message for a value pill it refuses (errors.mjs). */
export function diagnose(s) {
  const r = valueP.parse(s);
  return r.status ? null : `offset ${r.index.offset}: expected ${r.expected.join(', ')}`;
}
