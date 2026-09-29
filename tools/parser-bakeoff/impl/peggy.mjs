/**
 * Peggy (PEG, generated recursive descent). Grammars in grammars/peggy/*.peggy; policy
 * from shared.mjs is handed in through `options`, which is how a Peggy grammar reaches
 * code outside itself without a build step.
 */
import { readFileSync } from 'node:fs';
import peggy from 'peggy';
import * as h from '../shared.mjs';

const src = (n) => readFileSync(new URL(`../grammars/peggy/${n}.peggy`, import.meta.url), 'utf8');

export const name = 'peggy';
export const grammarFiles = ['axis', 'flow', 'gantt', 'value', 'inline'].map((n) => `grammars/peggy/${n}.peggy`);

const t0 = performance.now();
const P = {
  axis: peggy.generate(src('axis'), { allowedStartRules: ['Outer', 'Inner'] }),
  flow: peggy.generate(src('flow')),
  gantt: peggy.generate(src('gantt'), { allowedStartRules: ['Span', 'Point'] }),
  value: peggy.generate(src('value')),
  inline: peggy.generate(src('inline')),
};
export const buildMs = performance.now() - t0;

const H = {
  ...h,
  part: (raw, quoted) => h.partValue(raw.trimEnd(), quoted),
  finalize: h.finalizeMembers,
};

const tryParse = (p, s, opts) => { try { return p.parse(s, opts); } catch { return null; } };

function axisWith(maxParts) {
  const opts = { h: H, maxParts, inner: (inner) => P.axis.parse(inner, { startRule: 'Inner', h: H, maxParts }) };
  return (s) => tryParse(P.axis, s, { ...opts, startRule: 'Outer' });
}

function build(items) {
  const parts = [''];
  const arrows = [];
  for (const it of items) {
    if (it.a) { arrows.push(it.a); parts.push(''); } else parts[parts.length - 1] += it.t;
  }
  return { parts, arrows };
}

const point = (raw) => tryParse(P.gantt, raw, { startRule: 'Point', h });

export const impl = {
  axis: axisWith(3),
  axisUncapped: axisWith(0),
  flow: (s) => P.flow.parse(s, { build }),
  gantt: (s) => P.gantt.parse(s, { startRule: 'Span', h, point }),
  value: (s) => tryParse(P.value, s, { h }),
  inline: (s) => P.inline.parse(s, { h }),
};

/** The library's own message for a value pill it refuses (errors.mjs). */
export function diagnose(s) {
  try { P.value.parse(s, { h }); return null; } catch (e) { return e.message; }
}
