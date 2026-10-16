/**
 * The flowchart row grammar's test kit: the readers and generators the bake-off and the unit test
 * share. The grammar itself is lib/core/flowchart-row-grammar.js (Segno phase 3 moved it there
 * when it replaced `splitRow`'s hand-written scan), re-exported here so both callers import one
 * module.
 *
 *   rowFromNodes   compile()'s tree as splitRow's parts and arrows (the interpreter runtime;
 *                  the shipped runtime is the generated parser `splitRow` itself reads)
 *   flowFuzz       short rows over the characters that matter, and labels around the cap
 *   segFuzz        segment lists (text, code spans, escaped spans), for splitRow's carried state
 *   encodeRow      splitRow's result in the compact shape test/unit/tools/fixtures/
 *                  flow-rows.frozen.json stores (freeze-flow-rows.mjs wrote it)
 */
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
export const { makeRowGrammar, SPACE, BOUNDARY, LABEL_MAX, PUNCT } = require('../../lib/core/flowchart-row-grammar.js');

/** One arrow node (from either runtime) as the kernel's arrow record. */
function arrowOf(s, a) {
  const shaftNode = a.kids[0]; // dash | eq
  const left = s[a.from] === '<';
  const heavy = shaftNode.kind === 'eq';
  const sub = shaftNode.kids.find((k) => k.kind === 'doubled' || k.kind === 'labeled');
  const headed = (n) => n.kids.some((k) => k.kind === 'head');
  if (sub?.kind === 'labeled') {
    const has = headed(sub);
    return { heavy, label: s.slice(sub.from, a.to - (has ? 2 : 1)), dir: has ? (left ? 'both' : 'out') : (left ? 'in' : 'none'), mermaid: false };
  }
  if (sub?.kind === 'doubled') {
    if (headed(sub)) return { heavy, label: '', dir: left ? 'both' : 'out', mermaid: true };
    if (left) return { heavy, label: '', dir: 'in', mermaid: true };
    return { heavy, label: '', dir: 'none', mermaid: sub.kids.some((k) => k.kind === 'third') };
  }
  return { heavy, label: '', dir: headed(shaftNode) ? (left ? 'both' : 'out') : 'in', mermaid: false };
}

/** compile()'s tree as splitRow's parts and arrows: text between arrows, an escape's backslash
 *  dropped (`\&` becomes U+0001, as the kernel's ESC_AMP). */
export function rowFromNodes(s, top) {
  const parts = [];
  const arrows = [];
  let text = '';
  let at = 0;
  const visit = (n) => {
    if (n.kind === 'arrow') { text += s.slice(at, n.from); parts.push(text); text = ''; at = n.to; arrows.push(arrowOf(s, n)); return; }
    if (n.kind === 'esc') { text += s.slice(at, n.from - 1) + (s[n.from] === '&' ? '\u0001' : s[n.from]); at = n.to; return; }
    for (const k of n.kids) visit(k);
  };
  for (const n of top) visit(n);
  parts.push(text + s.slice(at));
  return { parts, arrows };
}

/** The bake-off's fuzz: short rows over the characters that matter, and labels around the cap. */
export function flowFuzz(count = 200_000, seed = 0x2462) {
  // `\r` too: it is a label space and a boundary (`isSpace`), and without it a grammar that
  // dropped `\r` from either passed (the PR's second checker).
  const ALPHA = ['-', '=', '<', '>', ' ', 'a', 'b', '\\', '&', '\t', '\n', '\r', 'x', '-', '-', '>', '='];
  let st = seed;
  const rand = () => { st = (st * 1103515245 + 12345) & 0x7fffffff; return st / 0x7fffffff; };
  const out = [];
  for (let n = 0; n < count; n++) {
    let t = '';
    const len = 1 + Math.floor(rand() * 24);
    for (let k = 0; k < len; k++) t += ALPHA[Math.floor(rand() * ALPHA.length)];
    out.push(t);
  }
  for (let L = 55; L <= 70; L++) {
    for (const c of ['-', '=']) out.push(`A ${c}${'y'.repeat(L)}${c}> B`, `A <${c}${'y'.repeat(L)}${c} B`, `A ${c}${'y '.repeat(L >> 1)}y${c}>`);
  }
  return out;
}

/** Segment lists as `inlineSegments` hands them to `splitRow`: text runs around code spans and
 *  escaped `\{literal}` spans. `splitRow` carries one bit across segments (whether the next text
 *  starts a word), so the runs are short and land next to each other in every order. */
export function segFuzz(count = 20_000, seed = 0x2519) {
  const TEXT = ['-', '=', '<', '>', ' ', 'a', '\\', '&', '\t', '\n', 'x', '-', '>', ' '];
  let st = seed;
  const rand = () => { st = (st * 1103515245 + 12345) & 0x7fffffff; return st / 0x7fffffff; };
  const run = (alpha, max) => {
    let t = '';
    const len = Math.floor(rand() * max);
    for (let k = 0; k < len; k++) t += alpha[Math.floor(rand() * alpha.length)];
    return t;
  };
  const out = [];
  for (let n = 0; n < count; n++) {
    const segs = [];
    const len = 1 + Math.floor(rand() * 4);
    for (let k = 0; k < len; k++) {
      const r = rand();
      if (r < 0.6) segs.push({ kind: 'text', value: run(TEXT, 10) });
      else if (r < 0.8) segs.push({ kind: 'code', value: run(['a', 'b', ' ', '#'], 4) });
      else segs.push({ kind: 'literal', value: run(['a', '&', '-', '>', ' ', '{'], 5) });
    }
    out.push(segs);
  }
  return out;
}

/** How many fuzz rows one frozen digest covers (freeze-flow-rows.mjs). */
export const FROZEN_BLOCK = 100;

/** `splitRow`'s result in a compact, comparable shape: each part as [text, spans] and each arrow
 *  as [shaft and direction, label], e.g. `->` is ['->', ''] and Mermaid's `-->` is ['->m', '']. */
export function encodeRow({ parts, arrows }) {
  const dir = { out: '>', in: '<', both: '<>', none: '' };
  return [parts.map((p) => [p.text, p.spans]), arrows.map((a) => [`${a.heavy ? '=' : '-'}${dir[a.dir]}${a.mermaid ? 'm' : ''}`, a.label])];
}
