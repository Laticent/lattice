/**
 * SEGNO SLOT SPECS — a slot schema written as JSON data, turned into a Segno slot.
 *
 * Segno (`@laticent/segno`, engineering/decisions/2026-09-28-segno-unified-inline-notation.md)
 * declares a slot with function calls: `record({ params: { color: indexed('c', { max: 12 }) } })`.
 * A component manifest is JSON, so it cannot hold those calls. It holds this DATA form instead,
 * and `compileSlot` makes the calls. The build compiles every manifest's specs once
 * (tools/build-stage-catalog.js), so a spec Segno refuses — an ambiguous bare word, a bad tag —
 * fails the build rather than a render.
 *
 *   { "label": "a pill", "tag": "~",
 *     "positional": [{ "name": "value", "type": "text" }],
 *     "params": {
 *       "shape": { "type": "oneOf", "values": ["pill", "tag"], "aliases": { "tag": ["label"] } },
 *       "color": { "type": "indexed", "prefix": "c", "max": 12, "label": "a color" },
 *       "after": { "type": "text", "named": true },
 *       "milestone": { "type": "flag", "word": "milestone" },
 *       "span":  { "type": "range", "of": "time" } },
 *     "shortcuts": { "[x]": "{done}" },
 *     "sigils": { "@": "who" } }
 *
 * A type is a string (`"text"`, `"number"`, `"time"`, `"id"`) or an object whose `type` names
 * one of: text, number, time, id, oneOf, flag, indexed, range, list, record. `"named": true` on
 * any of them wraps it in Segno's `named()` — it must then be written `name=value`.
 *
 * Pure and dependency-light (only Segno), so it bundles into the browser runtime: both render
 * paths and the linter read the same compiled slots (HARD RULE #1, #7).
 */

const S = require('@laticent/segno');

const SIMPLE = { text: S.text, number: S.number, time: S.time, id: S.id };

function fail(where, msg) {
  throw new Error(`segno spec ${where}: ${msg}`);
}

/** A type spec → a Segno Type (or, for `list` / `record`, a Slot). */
function compileType(t, where) {
  if (typeof t === 'string') {
    if (!SIMPLE[t]) fail(where, `unknown type "${t}"`);
    return SIMPLE[t]();
  }
  if (!t || typeof t !== 'object' || typeof t.type !== 'string') fail(where, 'a type is a name or an object with a "type"');
  let out;
  switch (t.type) {
    case 'text': case 'number': case 'time': case 'id':
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
      out = S.range(compileType(t.of, `${where}.of`));
      break;
    case 'list':
      out = S.list(compileType(t.of, `${where}.of`), { ...(t.max ? { max: t.max } : {}), ...(t.label ? { label: t.label } : {}) });
      break;
    case 'record':
      out = compileSlot(t, where);
      break;
    default:
      fail(where, `unknown type "${t.type}"`);
  }
  return t.named ? S.named(out) : out;
}

/** A record slot spec → a Segno record slot. Throws (with `where`) on a spec Segno refuses. */
function compileSlot(spec, where = 'slot') {
  if (!spec || typeof spec !== 'object') fail(where, 'a slot spec is an object');
  const positional = (spec.positional || []).map((p, k) => ({
    name: p.name,
    type: compileType(p.type, `${where}.positional[${k}]`),
    ...(p.required !== undefined ? { required: p.required } : {}),
  }));
  const params = {};
  for (const [name, t] of Object.entries(spec.params || {})) params[name] = compileType(t, `${where}.params.${name}`);
  try {
    return S.record({
      ...(spec.label ? { label: spec.label } : {}),
      ...(spec.tag ? { tag: spec.tag } : {}),
      positional,
      params,
      ...(spec.shortcuts ? { shortcuts: spec.shortcuts } : {}),
      ...(spec.sigils ? { sigils: spec.sigils } : {}),
    });
  } catch (e) {
    fail(where, e?.message ? e.message : String(e));
  }
}

module.exports = { compileSlot, compileType };
