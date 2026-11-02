/**
 * spec.ts — a slot schema written as plain DATA, compiled into a Segno record slot (`compileSlot`, exported from
 * `@laticent/segno/read`, so the compiler ships in the same entry as the reader it builds on: one copy of each).
 *
 * A schema in this shape is JSON a manifest can carry and a host can read without running code:
 *
 *   { label: 'a pill', positional: [{ name: 'value', type: 'text' }],
 *     params: { shape: { type: 'oneOf', values: ['pill', 'tag'] }, color: { type: 'indexed', prefix: 'c', max: 12 } } }
 *
 * Types are a name (`text` `number` `time` `id`) or an object: `oneOf` (values, aliases), `flag` (word, aliases),
 * `indexed` (prefix, max, label), `range` (of), `list` (of, max, label), `record` (a nested slot). Any type may set
 * `named: true`. `compileSlot` throws, naming where, on a spec Segno refuses.
 */

import { list, record } from './schema.js';
import { flag, id, indexed, named, number, oneOf, range, text, time } from './types.js';

// The reader's constructors under one name, as the compiler below reads them.
const S = { flag, id, indexed, list, named, number, oneOf, range, record, text, time };

// biome-ignore lint/suspicious/noExplicitAny: a spec is untyped data by design; each branch checks its own fields.
type Spec = any;

function fail(where: string, msg: string): never {
  throw new Error(`segno spec ${where}: ${msg}`);
}

const SIMPLE: Record<string, () => unknown> = { text: S.text, number: S.number, time: S.time, id: S.id };

/** A type spec → a Segno Type (or, for `list` / `record`, a Slot). */
export function compileType(t: Spec, where: string): unknown {
  if (typeof t === 'string') {
    if (!SIMPLE[t]) fail(where, `unknown type "${t}"`);
    return SIMPLE[t]();
  }
  if (!t || typeof t !== 'object' || typeof t.type !== 'string') fail(where, 'a type is a name or an object with a "type"');
  let out: unknown;
  switch (t.type) {
    case 'text':
    case 'number':
    case 'time':
    case 'id':
      out = SIMPLE[t.type]();
      break;
    case 'oneOf':
      if (!Array.isArray(t.values) || !t.values.length) fail(where, 'oneOf needs "values"');
      out = S.oneOf(t.values, t.aliases ? { aliases: t.aliases } : {});
      break;
    case 'flag':
      if (typeof t.word !== 'string') fail(where, 'flag needs "word"');
      out = S.flag(t.word, t.aliases ? { aliases: t.aliases } : {});
      break;
    case 'indexed':
      if (typeof t.prefix !== 'string' || !Number.isInteger(t.max)) fail(where, 'indexed needs "prefix" and an integer "max"');
      out = S.indexed(t.prefix, { max: t.max, ...(t.label ? { label: t.label } : {}) });
      break;
    case 'range':
      out = S.range(compileType(t.of, `${where}.of`) as never);
      break;
    case 'list':
      out = S.list(compileType(t.of, `${where}.of`) as never, { ...(t.max ? { max: t.max } : {}), ...(t.label ? { label: t.label } : {}) });
      break;
    case 'record':
      out = compileSlot(t, where);
      break;
    default:
      fail(where, `unknown type "${t.type}"`);
  }
  return t.named ? S.named(out as never) : out;
}

/** A record slot spec → a Segno record slot. Throws (with `where`) on a spec Segno refuses. */
export function compileSlot(spec: Spec, where = 'slot'): ReturnType<typeof S.record> {
  if (!spec || typeof spec !== 'object') fail(where, 'a slot spec is an object');
  const positional = (spec.positional || []).map((p: Spec, k: number) => ({
    name: p.name,
    type: compileType(p.type, `${where}.positional[${k}]`),
    ...(p.required !== undefined ? { required: p.required } : {}),
  }));
  const params: Record<string, unknown> = {};
  for (const [name, t] of Object.entries(spec.params || {})) params[name] = compileType(t, `${where}.params.${name}`);
  try {
    return S.record({
      ...(spec.label ? { label: spec.label } : {}),
      ...(spec.tag ? { tag: spec.tag } : {}),
      positional,
      params,
      ...(spec.shortcuts ? { shortcuts: spec.shortcuts } : {}),
      ...(spec.sigils ? { sigils: spec.sigils } : {}),
    } as never);
  } catch (e) {
    fail(where, e instanceof Error ? e.message : String(e));
  }
}
