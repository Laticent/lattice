/**
 * segno-spec-core.js — the JSON-spec → Segno-slot compiler, REQUIRE-FREE: it is handed Segno's reader (`S`) instead
 * of requiring it, so a browser source in docs/src can import it (the dev server's CJS shim serves only a CommonJS
 * file that requires nothing; docs/src/plugins/vite-cjs-lib-dev.test.ts) with Segno's ESM reader. Node callers keep
 * using lib/core/segno-spec.js, which wires in the CommonJS reader. The spec format is that file's header.
 */

/** @param {typeof import('@laticent/segno/read')} S  Segno's reader */
function specCompiler(S) {
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

  return { compileSlot, compileType };
}

module.exports = { specCompiler };
