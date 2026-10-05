// @vitest-environment node
// Slots bind deterministically: positional first, then name=value, then each bare word to the
// ONE parameter whose type takes it. A schema that could bind a word two ways does not build.
import { describe, expect, it } from 'vitest';
import { consistency, type Use } from './consistency';
import { list, record, SchemaError, value } from './schema';
import { flag, id, indexed, named, number, oneOf, range, text, time } from './types';

const pill = record({
  label: 'a pill',
  positional: [{ name: 'value', type: text() }],
  params: {
    shape: oneOf(['pill', 'chip', 'tag', 'tag-bordered', 'circle', 'chevron-right', 'chevron-left', 'diamond']),
    color: indexed('c', { max: 12, label: 'a color' }),
    size: oneOf(['sm', 'md', 'lg']),
  },
});

const ok = <T>(r: { ok: boolean; value?: T; diagnostics?: readonly { message: string }[] }) => {
  if (!r.ok) throw new Error(r.diagnostics?.map((d) => d.message).join('; '));
  return r.value as T;
};
const codes = (r: { ok: boolean; diagnostics?: readonly { code: string }[] }) => (r.ok ? [] : r.diagnostics?.map((d) => d.code));

describe('a pill', () => {
  it('order of modifiers does not matter', () => {
    const a = ok(pill.read('{BETA, tag, c4}'));
    expect(a).toEqual({ value: 'BETA', shape: 'tag', color: 4 });
    expect(ok(pill.read('{BETA, c4, tag}'))).toEqual(a);
    expect(ok(pill.read('{BETA, shape=tag, color=c4}'))).toEqual(a);
  });
  it('a quoted label may hold anything', () => {
    expect(ok(pill.read('{"A, B", lg}'))).toEqual({ value: 'A, B', size: 'lg' });
  });
  it('errors never half-apply, and name what the slot takes', () => {
    const r = pill.read('{BETA, tag, bold}');
    expect(codes(r)).toEqual(['unknown-word']);
    if (!r.ok) expect(r.diagnostics[0].message).toMatch(/color \(a color c1–c12\)/);
    expect(codes(pill.read('{BETA, tag, c13}'))).toEqual(['out-of-range']);
    expect(codes(pill.read('{BETA, tag, chip}'))).toEqual(['given-twice']);
    expect(codes(pill.read('{BETA, weight=bold}'))).toEqual(['unknown-param']);
  });
  it('the color ceiling is the slot\'s', () => {
    const node = record({ positional: [{ name: 'name', type: text() }], params: { color: indexed('c', { max: 8, label: 'a color' }) } });
    expect(ok(node.read('{Api, c8}'))).toEqual({ name: 'Api', color: 8 });
    expect(codes(node.read('{Api, c9}'))).toEqual(['out-of-range']);
  });
});

describe('an axis line', () => {
  const axis = record({
    label: 'an axis',
    positional: [{ name: 'name', type: text() }],
    params: { domain: range(number()), target: number() },
  });
  const axes = list(axis, { max: 3, label: 'a quadrant axis line' });
  it('parts bind by type, so their order is free', () => {
    const r = ok(axes.read('[{Effort, 0..10, 5}, Reach]'));
    expect(r[0]?.name).toBe('Effort');
    expect(r[0]?.domain?.from.value).toBe(0);
    expect(r[0]?.target?.value).toBe(5);
    expect(r[1]).toEqual({ name: 'Reach' });
    expect(ok(axes.read('[{Effort, 5, 0..10}]'))).toEqual(ok(axes.read('[{Effort, 0..10, target=5}]')));
  });
  it('an empty member holds its place', () => {
    const r = ok(axes.read('[, Reach]'));
    expect(r[0]).toBe(null);
    expect(r[1]).toEqual({ name: 'Reach' });
  });
  it('knows its arity', () => expect(codes(axes.read('[a, b, c, d]'))).toEqual(['too-many']));
});

describe('coordinates, journey, gantt — the shapes the old grammars disagreed on', () => {
  it('a point is one record: x, y, then a named or bare size', () => {
    const point = record({ positional: [{ name: 'x', type: number() }, { name: 'y', type: number(), required: true }], params: { size: number() } });
    expect(ok(point.read('{3, 70, 12}'))).toMatchObject({ x: { value: 3 }, y: { value: 70 }, size: { value: 12 } });
    expect(ok(point.read('{$1.2M, 70, size=12}'))).toMatchObject({ x: { value: 1200000 } });
  });
  it('journey keeps @ as a sigil for who=', () => {
    // Two number parameters could each take a bare `4`, so that schema does not build —
    // and the fix is to require their names, which is what the owner chose for journey.
    expect(() => record({ params: { who: text(), mood: number(), volume: number() } })).toThrow(SchemaError);
    const task = record({ params: { who: text(), mood: named(number()), volume: named(number()) }, sigils: { '@': 'who' } });
    expect(ok(task.read('{who=Customer, mood=4, volume=120}'))).toMatchObject({ who: 'Customer', mood: { value: 4 } });
    expect(task.read('{@Customer, 4}').ok).toBe(false);
    expect(ok(task.bindItems?.([
      { name: null, value: { kind: 'scalar', text: '@Customer', quoted: false, from: 0, to: 9 }, from: 0, to: 9 },
    ]) ?? { ok: false })).toEqual({ who: 'Customer' });
  });
  it('gantt: a range of time, and named items spread over separate spans', () => {
    const span = value(range(time()));
    expect(ok(span.read('Q1..Q3'))).toEqual({ from: { kind: 'q', year: null, idx: 0 }, to: { kind: 'q', year: null, idx: 2 } });
    const task = record({ params: { span: range(time()), after: text(), milestone: flag('milestone') } });
    expect(() => task).not.toThrow();
  });
});

describe('schemas that could bind a word two ways do not build', () => {
  it('two enums sharing a word', () => {
    expect(() => record({ params: { a: oneOf(['x', 'y']), b: oneOf(['y', 'z']) } })).toThrow(/"y" would bind to both/);
  });
  it('two numbers, or two ids, as bare parameters', () => {
    expect(() => record({ params: { a: number(), b: number() } })).toThrow(SchemaError);
    expect(() => record({ params: { a: id(), b: id() } })).toThrow(SchemaError);
  });
  it('an alias that collides', () => {
    expect(() => oneOf(['done', 'fail'], { aliases: { done: ['ok'], fail: ['ok'] } })).toThrow(/alias of both/);
  });
});

describe('aliases, shortcuts, and one spelling per deck', () => {
  const STATES = ['done', 'partial', 'fail', 'unknown', 'todo', 'skip'] as const;
  const state = record({
    label: 'a state mark',
    params: { state: oneOf(STATES, { aliases: { done: ['yes', 'pass'], fail: ['no'] } }) },
    shortcuts: { '[x]': '{done}', '[-]': '{partial}', '[!]': '{fail}', '[?]': '{unknown}', '[ ]': '{todo}', '[/]': '{skip}' },
  });
  it('shortcuts and aliases mean the canonical value', () => {
    expect(ok(state.read('[x]'))).toEqual({ state: 'done' });
    expect(ok(state.read('{yes}'))).toEqual({ state: 'done' });
    expect(ok(state.read('{DONE}'))).toEqual({ state: 'done' });
    expect(ok(state.read('[ ]'))).toEqual({ state: 'todo' });
  });
  it('a shortcut that expands to something the slot rejects does not build', () => {
    expect(() => record({ params: { s: oneOf(['a']) }, shortcuts: { '[x]': '{b}' } })).toThrow(SchemaError);
  });
  it('a deck mixing spellings gets one warning per minority use, with a fix', () => {
    const uses: Use[] = [];
    ['[x]', '[x]', '{done}', '[x]', '{yes}'].forEach((s, k) => {
      const r = state.read(s);
      if (r.ok) for (const sp of r.spellings) uses.push({ ...sp, slot: 'state', where: `line ${k + 1}` });
    });
    const bad = consistency(uses);
    expect(bad.map((b) => [b.use.where, b.use.written, b.preferred])).toEqual([
      ['line 3', 'done', '[x]'],
      ['line 5', 'yes', '[x]'],
    ]);
    // `{done}` becomes `[x]` as a whole span, never `{[x]}`.
    expect(bad[0].diagnostic.fix).toEqual({ from: 0, to: 6, insert: '[x]' });
  });
  it('a shortcut rewritten to a preferred word gets braces; a word swap stays in place', () => {
    const uses: Use[] = [];
    ['{done}', '{done}', '[x]', '{yes}'].forEach((s, k) => {
      const r = state.read(s);
      if (r.ok) for (const sp of r.spellings) uses.push({ ...sp, slot: 'state', where: String(k) });
    });
    const fixes = consistency(uses).map((b) => b.diagnostic.fix);
    expect(fixes).toEqual([{ from: 0, to: 3, insert: '{done}' }, { from: 1, to: 4, insert: 'done' }]);
  });
  it('no fix when a shortcut swap would drop the record\'s other items', () => {
    const tagged = record({
      params: { state: oneOf(STATES), note: named(text()) },
      shortcuts: { '[x]': '{done}' },
    });
    const uses: Use[] = [];
    ['[x]', '[x]', '{done, note=Shipped}'].forEach((s, k) => {
      const r = tagged.read(s);
      if (r.ok) for (const sp of r.spellings) uses.push({ ...sp, slot: 'state', where: String(k) });
    });
    const bad = consistency(uses);
    expect(bad).toHaveLength(1);
    expect(bad[0].diagnostic.fix).toBeUndefined();
  });
});

describe('what the checker found', () => {
  const STATES = ['done', 'todo'] as const;
  const state = record({ params: { state: oneOf(STATES) }, shortcuts: { '[x]': '{done}' } });
  it('a record nested in a list is never rewritten to a shortcut', () => {
    const marks = list(state);
    const uses: Use[] = [];
    for (const [k, s] of ['[x]', '[x]'].entries()) {
      const r = state.read(s);
      if (r.ok) for (const sp of r.spellings) uses.push({ ...sp, slot: 'state', where: String(k) });
    }
    const r = marks.read('[{done}, {todo}]');
    if (r.ok) for (const sp of r.spellings) uses.push({ ...sp, param: 'state', slot: 'state', where: 'list' });
    const bad = consistency(uses);
    expect(bad).toHaveLength(1);
    expect(bad[0].diagnostic.fix).toBeUndefined();
  });
  it('two sub-slot parameters of one shape do not build', () => {
    const sub = record({ positional: [{ name: 'p', type: text() }] });
    expect(() => record({ positional: [{ name: 'x', type: text() }], params: { a: sub, b: sub } })).toThrow(/both take a record/);
  });
  it('the words of a nested slot are grouped under its parent', () => {
    const outer = record({ positional: [{ name: 'x', type: text() }], params: { mark: state } });
    const r = outer.read('{X, {done}}');
    expect(r.ok && r.spellings.map((sp) => sp.param)).toEqual(['mark.state']);
  });
  it('a parameter name an author cannot write does not build', () => {
    expect(() => record({ params: { afterDate: text() } })).toThrow(SchemaError);
  });
  it('a parameter named like an Object member binds like any other', () => {
    const r = record({ params: { constructor: named(text()) } }).read('constructor=x');
    expect(r.ok && r.value).toEqual({ constructor: 'x' });
  });
  it('an alias that cannot be typed bare is refused when declared', () => {
    expect(() => oneOf(['a'], { aliases: { a: ['b, c'] } })).toThrow(/cannot be written/);
  });
});

describe('spellings name their parameter plainly', () => {
  it('words in a list under a parameter report that parameter', () => {
    const rule = record({ positional: [{ name: 'flag', type: text() }], params: { regions: list(oneOf(['eu', 'us'])) } });
    const r = rule.read('{x, [eu, us]}');
    expect(r.ok && r.spellings.map((sp) => sp.param)).toEqual(['regions', 'regions']);
  });
});

describe('indexed slots', () => {
  const c = indexed('c', { max: 12, label: 'a color' });
  it('reads c1 to the ceiling, case-insensitively, and nothing else', () => {
    expect([c.read('c1', false), c.read('C12', false), c.read('c13', false), c.read('c0', false), c.read('c04', false), c.read('c', false), c.read('x4', false), c.read('c4', true)])
      .toEqual([1, 12, undefined, undefined, undefined, undefined, undefined, undefined]);
    expect(c.describe).toBe('a color c1–c12');
  });
  it('any prefix, and a prefix an author could not type is refused', () => {
    expect(indexed('step', { max: 5 }).read('step3', false)).toBe(3);
    expect(() => indexed('c-', { max: 3 })).toThrow();
    expect(() => indexed('c', { max: 0 })).toThrow();
  });
});

describe('binding, at its edges', () => {
  it('a quoted value is never a sigil', () => {
    const r = record({ params: { who: text() }, sigils: { '@': 'who' } });
    expect(ok(r.read('{@Customer}'))).toEqual({ who: 'Customer' });
    expect(ok(r.read('{"@Customer"}'))).toEqual({ who: '@Customer' });
  });
  it('a required positional left empty is an error', () => {
    const r = record({ positional: [{ name: 'x', type: number() }, { name: 'y', type: number(), required: true }] });
    expect(codes(r.read('{1}'))).toEqual(['missing']);
    expect(ok(r.read('{1, 2}'))).toEqual({ x: { value: 1, signed: false, unit: '' }, y: { value: 2, signed: false, unit: '' } });
  });
  it('the shared result of a shortcut is frozen, so no caller can change the next [x]', () => {
    const state = record({ params: { state: oneOf(['done', 'todo']) }, shortcuts: { '[x]': '{done}' } });
    const r = state.read('[x]');
    expect(r.ok && Object.isFrozen(r.value)).toBe(true);
    expect(() => { (r as { value: { state: string } }).value.state = 'todo'; }).toThrow(TypeError);
    expect(ok(state.read('[x]'))).toEqual({ state: 'done' });
  });
  it('a quoted word is text, never a declared word', () => {
    const r = record({ positional: [{ name: 'name', type: text() }], params: { stage: oneOf(['beta']), urgent: flag('urgent'), window: range(time()) } });
    expect(codes(r.read('{x, stage="beta"}'))).toEqual(['wrong-type']);
    expect(codes(r.read('{x, urgent="urgent"}'))).toEqual(['wrong-type']);
    expect(codes(r.read('{x, window=Jan..soon}'))).toEqual(['wrong-type']);
    expect(ok(r.read('{x, window=Jan..Mar}')).window).toEqual({ from: { kind: 'm', year: null, idx: 0 }, to: { kind: 'm', year: null, idx: 2 } });
  });
});

describe('one spelling per document, at its edges', () => {
  const use = (written: string, slot = 'state', where = written): Use => ({ param: 'state', canonical: 'done', written, from: 0, to: written.length, shortcut: false, slot, where });
  it('the most common spelling wins, wherever it first appears', () => {
    const bad = consistency([use('yes', 'state', '1'), use('done', 'state', '2'), use('done', 'state', '3')]);
    expect(bad.map((b) => [b.use.where, b.preferred])).toEqual([['1', 'done']]);
  });
  it('two slots are two vocabularies: their spellings never mix', () => {
    expect(consistency([use('yes', 'a'), use('done', 'b')])).toEqual([]);
  });
});

describe('the adversarial review, pinned', () => {
  it('a word is not swapped for a shortcut that expands to more than that word', () => {
    const r = record({ params: { state: oneOf(['done', 'todo']), size: oneOf(['sm', 'lg']) }, shortcuts: { '[x]': '{done, sm}' } });
    const uses: Use[] = [];
    ['[x]', '[x]', '{done}'].forEach((s, k) => {
      const b = r.read(s);
      if (b.ok) for (const sp of b.spellings) uses.push({ ...sp, slot: 's', where: String(k) });
    });
    const bad = consistency(uses).filter((b) => b.use.where === '2');
    expect(bad.length).toBe(1);
    expect(bad[0].diagnostic.fix).toBeUndefined(); // `[x]` would add size=sm
  });
  it('a shortcut rewritten to a word keeps the name when its expansion was named', () => {
    const r = record({ params: { state: named(oneOf(['done', 'todo'])), finished: flag('done') }, shortcuts: { '[x]': '{state=done}' } });
    const uses: Use[] = [];
    ['{state=done}', '{state=done}', '[x]'].forEach((s, k) => {
      const b = r.read(s);
      if (b.ok) for (const sp of b.spellings) uses.push({ ...sp, slot: 's', where: String(k) });
    });
    const fix = consistency(uses).find((b) => b.use.where === '2')?.diagnostic.fix;
    expect(fix?.insert).toBe('{state=done}');
    // and the fixed span means what the shortcut meant
    expect(ok(r.read(fix?.insert ?? ''))).toEqual(ok(r.read('[x]')));
  });
  it('a sigil that starts a declared word, or a number, does not build', () => {
    expect(() => record({ params: { who: text(), place: oneOf(['@home', 'office']) }, sigils: { '@': 'who' } })).toThrow(/starts the word "@home"/);
    expect(() => record({ params: { who: text(), cost: number() }, sigils: { $: 'who' } })).toThrow(/can start a number/);
    expect(() => record({ params: { who: text(), cost: named(number()) }, sigils: { $: 'who' } })).not.toThrow();
  });
  it('a flag word must be typeable bare', () => {
    expect(() => flag('a, b')).toThrow(/cannot be written as a bare word/);
  });
  it('an indexed ceiling is capped', () => {
    expect(() => indexed('c', { max: 1e9 })).toThrow(/from 1 to 1000/);
    expect(() => indexed('c', { max: 1000 })).not.toThrow();
  });
  it('building a schema never freezes an object a custom type returned', () => {
    const shared = { v: 1 };
    const t = { cls: 'vocab' as const, describe: 'a thing', words: ['thing'], read: (s: string) => (s.toLowerCase() === 'thing' ? shared : undefined) };
    const r = record({ params: { t }, shortcuts: { '[t]': '{thing}' } });
    expect(Object.isFrozen(shared)).toBe(false);
    const b = r.read('[t]');
    expect(b.ok && Object.isFrozen(b.value)).toBe(true); // the shared cache is frozen, the caller's object is not
  });
});

describe('tags: a slot can require its span to open with a tag character', () => {
  const spark = record({ label: 'a spark', tag: '~', positional: [{ name: 'data', type: text() }], params: { type: oneOf(['line', 'bar']) } });
  it('binds a span with its tag', () => {
    expect(ok(spark.read('~{12 14 17, bar}'))).toEqual({ data: '12 14 17', type: 'bar' });
  });
  it('refuses a span without its tag, with a fix that adds it', () => {
    const r = spark.read('{12 14 17}');
    expect(!r.ok && [r.diagnostics[0].code, r.diagnostics[0].fix]).toEqual(['missing-tag', { from: 0, to: 0, insert: '~' }]);
  });
  it('a slot with no tag refuses a tagged span, with a fix that removes it', () => {
    const r = pill.read('^{BETA, tag}');
    expect(!r.ok && [r.diagnostics[0].code, r.diagnostics[0].fix]).toEqual(['unexpected-tag', { from: 0, to: 1, insert: '' }]);
  });
  it('a slot with a different tag refuses it', () => {
    expect(spark.read('^{12 14}').ok).toBe(false);
  });
  it('a tag that is not one of the notation\'s tag characters does not build', () => {
    expect(() => record({ tag: '@', positional: [{ name: 'x', type: text() }] })).toThrow(SchemaError);
    expect(() => record({ tag: '~~', positional: [{ name: 'x', type: text() }] })).toThrow(SchemaError);
  });
});

describe('a word past an indexed ceiling names the limit', () => {
  it('c13 on a twelve-color slot', () => {
    const r = pill.read('{BETA, c13}');
    expect(!r.ok && [r.diagnostics[0].code, r.diagnostics[0].message]).toEqual(['out-of-range', '"c13" is past the limit — this takes c1–c12']);
  });
  it('c9 on an eight-color slot', () => {
    const flow = record({ positional: [{ name: 'id', type: text() }], params: { color: indexed('c', { max: 8 }) } });
    const r = flow.read('{a, c9}');
    expect(!r.ok && r.diagnostics[0].message).toBe('"c9" is past the limit — this takes c1–c8');
  });
  it('a word that is not the prefix is still unknown', () => {
    const r = pill.read('{BETA, zz9}');
    expect(!r.ok && r.diagnostics[0].code).toBe('unknown-word');
  });
});
