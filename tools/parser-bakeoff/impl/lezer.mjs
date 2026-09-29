/**
 * Lezer (LR(1) + GLR fallback, contextual DFA tokenizer; CodeMirror's parser). Included
 * because the Studio editor already runs on CodeMirror, so a Lezer grammar is the one
 * candidate that could ALSO drive editor highlighting and incremental re-parse for free.
 *
 * Lezer is built for editors: it never fails, it recovers and returns a tree with error
 * nodes, and its tokens are regular languages with no lookahead. So a "does this match"
 * question is asked by checking the tree for error nodes.
 *
 * TWO TARGETS ARE NOT IMPLEMENTED, and why is the finding:
 *   - axis: a quote opens only when a partner that ENDS A PART exists anywhere later in
 *     the list. That is neither regular (tokens) nor context-free (LR); Lezer's answer is
 *     an `@external tokenizer`, which is hand-written JS — the incumbent's own scan.
 *   - flow: an arrow must start at a word start and END at a word boundary, and its label
 *     stops at the FIRST valid closer within 61 characters. Tokens have no lookbehind, no
 *     lookahead and no bounded repetition, so the arrow token is again an external
 *     tokenizer — which would be `readArrow`, verbatim.
 * A grammar that delegates its only hard token to the incumbent is not a bake-off entry.
 */
import { buildParser } from '@lezer/generator';
import * as h from '../shared.mjs';

export const name = 'lezer';
export const grammarFiles = ['impl/lezer.mjs'];

const WS = '$[\\t-\\r \\u00a0\\u1680\\u2000-\\u200a\\u2028\\u2029\\u202f\\u205f\\u3000\\ufeff]';

const INLINE = String.raw`
@top Start { Escaped | State | Pill }
Escaped { Bs (State | Pill) }
State { "[" Marker "]" }
Pill { "{" Label? "}" Mod* }
Mod { ":" ModText? }
@tokens {
  Bs { "\\" }
  Marker { $${h.MARKER_CLASS} }
  Label { ![}]+ }
  ModText { ![:]+ }
  "[" "]" "{" "}" ":"
}`;

const GANTT = String.raw`
@top Span { Side? DotDot Rest? | Side? }
@top Point { Ws? (Date | Quarter | Month) Ws? }
Date { Year4 "-" Two "-" Two }
Quarter { (Year4 Ws?)? Q QDigit }
Month { (Year4 Ws?)? Letters }
@tokens {
  Side { (![.] | "." ![.])+ }
  DotDot { ".." }
  Rest { _+ }
  Year4 { @digit @digit @digit @digit }
  Two { @digit @digit }
  Q { $[qQ] }
  QDigit { $[1-4] }
  Letters { $[a-zA-Z]+ }
  Ws { ${WS}+ }
  "-"
  @precedence { Q, Letters }
}`;

// A value pill is a REGULAR language, so in Lezer it is one token: the DFA gives exactly
// the regex's semantics, which is why this is the one target where Lezer is the regex.
const VALUE = String.raw`
@top Value { Pill }
@tokens {
  w { ${WS} }
  sym { ![0-9A-Za-z_\t-\r    -     　﻿] }
  alpha { $[A-Za-z] }
  unit { "%" | "‰" | alpha (alpha (alpha (alpha (alpha alpha?)?)?)?)? }
  Pill { w* $[(+\-−]? w* (sym (sym sym?)?)? w* $[\-−]? @digit $[0-9,.]* w* unit? w* ")"? w* }
}`;

export const SOURCES = () => [INLINE, GANTT, VALUE];

const t0 = performance.now();
const P = {
  inline: buildParser(INLINE),
  span: buildParser(GANTT, { }),
  value: buildParser(VALUE),
};
P.point = P.span.configure({ top: 'Point' });
P.span = P.span.configure({ top: 'Span' });
export const buildMs = performance.now() - t0;

function ok(tree) {
  let bad = false;
  tree.iterate({ enter(n) { if (n.type.isError) bad = true; } });
  return !bad;
}
const kids = (tree) => { const out = []; const c = tree.topNode.firstChild; for (let n = c; n; n = n.nextSibling) out.push(n); return out; };

function inline(s) {
  const t = P.inline.parse(s);
  if (!ok(t)) return null;
  const top = t.topNode.firstChild;
  const read = (node, from) => {
    if (node.name === 'State') return { kind: 'state', marker: s.slice(node.from + 1, node.from + 2) };
    let v = '';
    const mods = [];
    for (let c = node.firstChild; c; c = c.nextSibling) {
      if (c.name === 'Label') v = s.slice(c.from, c.to);
      if (c.name === 'Mod') { const m = c.getChild('ModText'); mods.push(m ? s.slice(m.from, m.to) : ''); }
    }
    void from;
    return h.pill(v, mods);
  };
  if (top.name === 'Escaped') {
    const inner = top.lastChild;
    return read(inner) ? { kind: 'escaped', text: s.slice(1) } : null;
  }
  return read(top);
}

function point(raw) {
  const t = P.point.parse(raw);
  if (!ok(t)) return null;
  const body = kids(t).find((n) => n.name !== 'Ws');
  const txt = (n) => raw.slice(n.from, n.to);
  const year = body.getChild('Year4');
  const y = year ? +txt(year) : null;
  if (body.name === 'Date') { const [a, b] = body.getChildren('Two'); return h.date(y, +txt(a), +txt(b)); }
  if (body.name === 'Quarter') return h.quarter(y, txt(body.getChild('QDigit')));
  return h.month(y, txt(body.getChild('Letters')));
}

function gantt(s) {
  const t = P.span.parse(s);
  const ks = kids(t);
  const dd = ks.findIndex((n) => n.name === 'DotDot');
  if (dd < 0) return { point: point(s) };
  const at = ks[dd].from;
  return { start: point(s.slice(0, at)), end: point(s.slice(at + 2)) };
}

export const impl = {
  gantt,
  value: (s) => (ok(P.value.parse(s)) ? h.numberOf(s.trim()) : null),
  inline,
};

/** The library's own message for a value pill it refuses (errors.mjs). Lezer has none:
 *  it recovers, and the caller finds the error node's position in the tree. */
export function diagnose(s) {
  let at = null;
  P.value.parse(s).iterate({ enter(n) { if (n.type.isError && at === null) at = n.from; } });
  return at === null ? null : `(error node at offset ${at}; Lezer produces no message)`;
}
