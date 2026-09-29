// @vitest-environment node
// Metamorphic tests: no oracle says what `{checkout, beta, 25%}` should bind to, but the
// notation makes promises about how RELATED spans relate, and those can be checked on
// thousands of generated records. Each property below is a sentence from the notation's
// contract (engineering/decisions/2026-09-28-segno-unified-inline-notation.md § The notation):
//   - bare items bind by type, so their order does not matter;
//   - space after a comma, around `=`, before a closer, changes nothing;
//   - a bare word and its `name=value` spelling mean the same;
//   - an alias, a different letter case, or quoting a text value means the same;
//   - quoting any string reads back that exact string;
//   - a shortcut means exactly its expansion;
//   - a leading `\` turns a directive off, and turns nothing else on;
//   - the parser reads left to right in one pass, so text APPENDED to a valid span can never
//     move an error into the part that was valid (the LL(1) prefix property).
// Seeded, so a failure reproduces.
import { describe, expect, it } from 'vitest';
import { compile } from './grammar';
import { isDirective, parse } from './notation';
import { notationSpec } from './notation-grammar';
import { record } from './schema';
import { flag, id, named, number, oneOf, range, text, time } from './types';

function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const R = rng(2462);
const pick = <T>(xs: readonly T[]): T => xs[Math.floor(R() * xs.length)];
const shuffle = <T>(xs: readonly T[]): T[] => {
  const out = [...xs];
  for (let i = out.length - 1; i > 0; i--) { const j = Math.floor(R() * (i + 1)); [out[i], out[j]] = [out[j], out[i]]; }
  return out;
};

// A rollout rule: one of every class a bare word can bind to (vocab, id, number, time, range),
// plus a flag, a positional text value and a named-only text value.
const rollout = record({
  label: 'a rollout rule',
  positional: [{ name: 'feature', type: text() }],
  params: {
    stage: oneOf(['alpha', 'beta', 'ga'], { aliases: { ga: ['stable'] } }),
    share: number(),
    window: range(time()),
    owner: id(),
    urgent: flag('urgent', { aliases: ['asap'] }),
    note: named(text()),
  },
});

// One generated rule: its parts, each with every spelling a property may swap in.
interface Part { key: string; bare: string; named?: string; variants: string[] }
const FEATURES = ['checkout', 'new-search', 'Dark mode', 'v2 api'];
function generate(): { feature: string; parts: Part[] } {
  const parts: Part[] = [];
  if (R() < 0.8) { const s = pick(['alpha', 'beta', 'ga']); parts.push({ key: 'stage', bare: s, named: `stage=${s}`, variants: s === 'ga' ? ['GA', 'stable', 'Stable'] : [s.toUpperCase()] }); }
  if (R() < 0.8) { const n = pick(['25%', '0.5', '$1.2M', '-3', '(12k)', '140kg']); parts.push({ key: 'share', bare: n, named: `share=${n}`, variants: [] }); }
  if (R() < 0.6) { const w = pick(['Jan..Mar', '2026 Q1..2026 Q3', '2026-02-01..2026-02-14']); parts.push({ key: 'window', bare: w, named: `window=${w}`, variants: [] }); }
  if (R() < 0.6) { const o = pick(['#api', '#web-team', '#ops2']); parts.push({ key: 'owner', bare: o, named: `owner=${o}`, variants: [o.toUpperCase()] }); }
  if (R() < 0.5) parts.push({ key: 'urgent', bare: 'urgent', variants: ['URGENT', 'asap', 'Asap'] });
  if (R() < 0.5) { const n = pick(['ship it', 'a, b', 'say "hi"', 'back\\slash']); parts.push({ key: 'note', bare: `note=${quote(n)}`, named: `note=${quote(n)}`, variants: [] }); }
  return { feature: pick(FEATURES), parts };
}
const quote = (s: string) => `"${s.replace(/["\\]/g, '\\$&')}"`;
const bareFeature = (f: string) => (/[ ,]/.test(f) ? quote(f) : f);
const span = (feature: string, items: string[]) => `{${[feature, ...items].join(', ')}}`;

const value = (s: string) => {
  const r = rollout.read(s);
  if (!r.ok) throw new Error(`${s}: ${r.diagnostics.map((d) => d.message).join('; ')}`);
  return r.value;
};

const CASES = Array.from({ length: 2000 }, generate);

describe('metamorphic: related spellings bind to the same value', () => {
  it('order of the bare items does not matter', () => {
    for (const { feature, parts } of CASES) {
      const base = value(span(bareFeature(feature), parts.map((p) => p.bare)));
      expect(value(span(bareFeature(feature), shuffle(parts).map((p) => p.bare)))).toEqual(base);
    }
  });

  it('space after commas, around `=` and before the closer changes nothing', () => {
    for (const { feature, parts } of CASES) {
      const items = parts.map((p) => p.bare);
      const base = value(span(bareFeature(feature), items));
      const spaced = `{${[bareFeature(feature), ...items.map((x) => x.replace(/^(\w+)=/, `$1${pick(['', ' '])}=${pick(['', ' ', '  '])}`))].join(pick([',', ', ', ',  ', ',\t']))}${pick(['', ' ', '  '])}}`;
      expect(value(spaced)).toEqual(base);
    }
  });

  it('a bare word and its name=value spelling mean the same', () => {
    for (const { feature, parts } of CASES) {
      const base = value(span(bareFeature(feature), parts.map((p) => p.bare)));
      expect(value(span(bareFeature(feature), parts.map((p) => (p.named && R() < 0.5 ? p.named : p.bare))))).toEqual(base);
    }
  });

  it('an alias or another letter case means the same', () => {
    let swapped = 0;
    for (const { feature, parts } of CASES) {
      const base = value(span(bareFeature(feature), parts.map((p) => p.bare)));
      const items = parts.map((p) => {
        if (!p.variants.length) return p.bare;
        swapped++;
        return pick(p.variants);
      });
      expect(value(span(bareFeature(feature), items))).toEqual(base);
    }
    expect(swapped).toBeGreaterThan(1000);
  });

  it('quoting the text value means the same', () => {
    for (const { feature, parts } of CASES) {
      if (/[ ,]/.test(feature)) continue; // it has to be quoted already
      expect(value(span(quote(feature), parts.map((p) => p.bare)))).toEqual(value(span(feature, parts.map((p) => p.bare))));
    }
  });

  it('quoting any string reads back that exact string', () => {
    const CH = ['a', 'Z', ' ', ',', '"', '\\', '{', '}', '[', ']', '=', '\t', 'é', '\u{1F600}', '`', '..'];
    for (let k = 0; k < 5000; k++) {
      let s = '';
      for (let j = 0, n = Math.floor(R() * 12); j < n; j++) s += pick(CH);
      const r = parse(quote(s));
      expect(r.ok && r.item.value.kind === 'scalar' && r.item.value.text, JSON.stringify(s)).toBe(s);
      expect(value(`{x, note=${quote(s)}}`).note).toBe(s);
    }
  });
});

describe('metamorphic: shortcuts and escapes', () => {
  const STATES = ['done', 'partial', 'fail', 'unknown', 'todo', 'skip'] as const;
  const SHORT = { '[x]': '{done}', '[-]': '{partial}', '[!]': '{fail}', '[?]': '{unknown}', '[ ]': '{todo}', '[/]': '{skip}' };
  const state = record({ params: { state: oneOf(STATES, { aliases: { done: ['yes'] } }), note: named(text()) }, shortcuts: SHORT });

  it('every shortcut means exactly its expansion, and its canonical and alias spellings', () => {
    for (const [short, long] of Object.entries(SHORT)) {
      const a = state.read(short);
      const b = state.read(long);
      expect(a.ok && b.ok && a.value).toEqual(b.ok && b.value);
      expect(b.ok && state.read(long.toUpperCase()).ok && (state.read(long.toUpperCase()) as { value: unknown }).value).toEqual(b.ok && b.value);
    }
    expect((state.read('{yes}') as { value: unknown }).value).toEqual((state.read('[x]') as { value: unknown }).value);
  });

  it('a leading \\ turns a directive off, and turns nothing else on', () => {
    const CH = ['{', '}', ' ', 'a', '\\', '\t', '[', ','];
    for (let k = 0; k < 20000; k++) {
      let s = '';
      for (let j = 0, n = Math.floor(R() * 5); j < n; j++) s += pick(CH);
      const before = isDirective(s);
      const after = isDirective(`\\${s}`);
      if (before === 'directive') expect(after, JSON.stringify(s)).toBe('escaped');
      else expect(after, JSON.stringify(s)).toBeNull();
    }
  });
});

describe('metamorphic: the LL(1) prefix property', () => {
  const grammar = compile(notationSpec);
  it('appending text to a valid span never moves an error into the valid part', () => {
    const TAIL = ['}', ']', '{', '[', ',', '"', '=', ' ', 'a', '\\', '..', '#'];
    let valid = 0;
    let broken = 0;
    let notationValid = 0;
    for (const { feature, parts } of CASES) {
      const s = span(bareFeature(feature), parts.map((p) => p.bare));
      for (const base of [s, `[${parts.map((p) => p.bare).join(', ')}]`]) {
        if (!grammar.parse(base).ok) continue;
        valid++;
        let t = '';
        for (let j = 0, n = 1 + Math.floor(R() * 4); j < n; j++) t += pick(TAIL);
        const g = grammar.parse(base + t);
        if (!g.ok) { broken++; expect(g.error.at, JSON.stringify(base + t)).toBeGreaterThanOrEqual(base.length); }
        if (!parse(base).ok) continue; // a list may not hold name=value: grammatical, not valid notation
        notationValid++;
        const p = parse(base + t);
        if (!p.ok) expect(p.diagnostic.from, JSON.stringify(base + t)).toBeGreaterThanOrEqual(base.length);
      }
    }
    expect(valid).toBeGreaterThan(3900);
    expect(broken).toBeGreaterThan(1000);
    expect(notationValid).toBeGreaterThan(2500);
  });
});
