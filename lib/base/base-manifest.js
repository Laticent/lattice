/**
 * lib/base/base-manifest.js — reads lib/base/base.manifest.json into the modifier groups the rest
 * of the engine uses (`MODIFIER_GROUPS` in lib/components/index.js).
 *
 * The manifest lists every class word a slide accepts without a component declaring it. Where an
 * engine resolver owns a word list (the `rule:` register's `rule-*` words live in
 * lib/core/resolve-rule.js, because the engine stamps them), the manifest names the list with
 * `{ "source": "<key>" }` instead of copying it, and the caller passes the lists in `sources`. So
 * the manifest is the one place that says which groups exist, what each holds and acts on, and in
 * what order completion offers them; no word list lives in two places.
 *
 * Pure: no fs, no requires of the resolvers (the caller supplies them), so it bundles anywhere.
 * engineering/decisions/2026-11-19-deterministic-authoring-audit.md W5.
 */

/** Spread `items` (literals and `{ source }` references) into a flat word list. */
function words(items, sources, where) {
  // A Set keeps the first spelling's place, so a group can list its offering order first and
  // then name the source that holds the rest (`decoration`: the classic six, then every tint).
  const out = new Set();
  for (const item of items) {
    if (typeof item === 'string') {
      out.add(item);
      continue;
    }
    const list = sources[item.source];
    if (!Array.isArray(list)) throw new Error(`base manifest: ${where} names an unknown source '${item.source}'`);
    for (const w of list) out.add(w);
  }
  return [...out];
}

/** An `axes` field: each entry is a list of items, or one `{ source }` that names a list of axes. */
function axesOf(axes, sources, where) {
  const out = [];
  for (const axis of axes) {
    if (Array.isArray(axis)) out.push(words(axis, sources, where));
    else {
      const list = sources[axis.source];
      if (!Array.isArray(list) || !list.every(Array.isArray)) throw new Error(`base manifest: ${where} names an unknown axes source '${axis.source}'`);
      out.push(...list.map((a) => [...a]));
    }
  }
  return out;
}

/**
 * The modifier groups, in manifest order. `sources` maps a source key to its word list (or, for an
 * `…:axes` key, to a list of axes); `expand` maps an `{ "expand": key }` entry to the groups it
 * stands for (the plugins' declared registers).
 * @param {object} manifest  lib/base/base.manifest.json
 * @param {{ sources: Record<string, string[]|string[][]>, expand?: Record<string, object[]> }} opts
 */
function modifierGroups(manifest, { sources, expand = {} }) {
  const out = [];
  for (const entry of manifest.groups) {
    if (entry.expand) {
      const groups = expand[entry.expand];
      if (!Array.isArray(groups)) throw new Error(`base manifest: unknown expansion '${entry.expand}'`);
      out.push(...groups);
      continue;
    }
    const where = `group '${entry.name}'`;
    const axes = entry.axes ? axesOf(entry.axes, sources, where) : null;
    const tokens = entry.tokens ? words(entry.tokens, sources, where) : axes.flat();
    const g = { name: entry.name, label: entry.label, tokens };
    if (entry.exclusive) g.exclusive = true;
    if (entry.surface) g.surface = entry.surface;
    if (axes) g.axes = axes;
    if (entry.follows) g.follows = entry.follows;
    if (entry.offer === false) g.offer = false;
    out.push(g);
  }
  return out;
}

module.exports = { modifierGroups };
