/**
 * lib/core/scene-resolve.mjs
 *
 * Resolve a narrated sentence's binding to the rendered parts it names.
 *
 * The chart narrator (`chart-narration.js` `narrateChartScript`) binds each sentence to an ACT and
 * a UNIT, addressed by ids: `{ act: 'visit', unit: 'point', id: { series: 0, cat: 'Feb 2026' } }`.
 * The component's manifest declares, in `scene.units`, how each unit is found in its own render:
 *
 *   "point": { "select": "circle.line-dot[data-series=\"{series}\"][data-label=\"{cat}\"]",
 *              "labels": "text.cart-cat[data-label=\"{cat}\"]" }
 *
 * A `select` may be a LIST, and the unit is every element any of them matches: a line's point is
 * its dot AND its own line, so a sentence about one point keeps the whole line it lies on.
 *
 * This file fills those templates and queries the slide. It is the ONE place a binding becomes
 * elements, shared by the Studio, the exported player and the corpus gate
 * (`test/unit/core/scene-binding.test.js`), so the three can never disagree on what a sentence
 * points at (HARD RULE #1; engineering/decisions/2026-09-27-delivery-styles-and-component-scenes.md §5).
 *
 * Pure DOM reads, no styles, no timers. ESM for the reason `resolve-delivery.mjs` gives.
 */

/**
 * A value inside a double-quoted CSS attribute selector. Every ASCII punctuation character is
 * backslash-escaped, which CSS reads as the character itself: a quote or a backslash would end or
 * break the string, and jsdom's selector engine (the corpus gate's) splits an unescaped ` + ` or
 * ` > ` inside a quoted value as a combinator, so "Sprig + Log" matched nothing there.
 */
function attrValue(v) {
  // `&` is left bare: jsdom reads `\&` as a miss, and an ampersand ends nothing in a quoted value.
  return String(v).replace(/[\n\r\f]/g, ' ').replace(/[!-%'-/:-@[-`{-~]/g, '\\$&');
}

/**
 * Fill `{key}` placeholders from `id`. Null when the template names a key `id` does not carry,
 * so a half-filled selector can never match more than the sentence named.
 */
export function fillSelector(template, id = {}) {
  if (!template) return null;
  if (Array.isArray(template)) {
    const parts = template.map((t) => fillSelector(t, id));
    return parts.every(Boolean) ? parts.join(', ') : null;
  }
  let missing = false;
  const out = template.replace(/\{(\w+)\}/g, (_, k) => {
    if (id[k] === undefined || id[k] === null) {
      missing = true;
      return '';
    }
    return attrValue(id[k]);
  });
  return missing ? null : out;
}

/**
 * The same template with every id condition removed: the selector for ALL units of this kind.
 * `[data-series="{series}"]` becomes `[data-series]`, and a positional `:nth-child({n})` is dropped.
 */
export function anySelector(template) {
  if (!template) return null;
  if (Array.isArray(template)) return template.map(anySelector).join(', ');
  return template
    .replace(/\[([\w-]+)[\^$*~|]?="[^"\]]*\{\w+\}[^"\]]*"\]/g, '[$1]')
    .replace(/:nth-(child|of-type)\(\{\w+\}\)/g, '');
}

/** Drawn parts only: never the hidden screen-reader table, never an inert `<template>` payload. */
function drawn(el) {
  return el.tagName.toLowerCase() !== 'template' && !el.closest('.chart-sr-only, template');
}

function queryAll(root, selector) {
  if (!selector) return [];
  try {
    return [...root.querySelectorAll(selector)].filter(drawn);
  } catch {
    return [];
  }
}

/**
 * The parts a binding names, and their peers, inside `root` (the slide's section).
 *
 *   unit        the elements the sentence names (a line's path and its dots; one bar)
 *   labels      the text that names them (a category tick, a value label)
 *   peers       every other unit of the same kind
 *   peerLabels  the labels of those peers
 *   fallback    true when `select` matched nothing and the unit's `fallback` selector answered
 *   mark        the unit's OWN mark: what the first entry of a `select` list matched (a line
 *               point's dot, not the line it lies on), for ink that points at one thing
 *
 * Null when the component declares no such unit or nothing on the slide matches: the caller then
 * falls back to reading the words, and the corpus gate reports it.
 */
export function resolveUnit(root, units, ref) {
  const spec = ref?.unit && units ? units[ref.unit] : null;
  if (!root || !spec) return null;
  let unit = queryAll(root, fillSelector(spec.select, ref.id));
  // A variant that draws the unit as part of a shared shape (radar `benchmark` folds every
  // competitor into one envelope band) names it by that shape instead.
  const fallback = !unit.length && !!spec.fallback;
  if (fallback) unit = queryAll(root, fillSelector(spec.fallback, ref.id));
  if (!unit.length) return null;
  const labels = queryAll(root, fillSelector(spec.labels, ref.id)).filter((el) => !unit.includes(el));
  // A list's first entry is the mark itself; the rest ride along for the focus.
  const mark = Array.isArray(spec.select) && !fallback ? queryAll(root, fillSelector(spec.select[0], ref.id)) : unit;
  const own = new Set([...unit, ...labels]);
  const peers = queryAll(root, anySelector(spec.select)).filter((el) => !own.has(el));
  const peerLabels = queryAll(root, anySelector(spec.labels)).filter((el) => !own.has(el));
  return { unit, labels, peers, peerLabels, fallback, mark: mark.length ? mark : unit };
}

/** The acts that name a unit a scene can dwell on (a `note` names the unit of the act before it). */
const NAMING_ACTS = new Set(['enter', 'visit', 'compare', 'peak']);

/**
 * The index, in `refs`, of the scene's KEY beat: the one act the slide is about. `rule` is the
 * manifest's `scene.key`:
 *
 *   'largest'   the naming ref with the largest `value` (a tie keeps the first)
 *   'first'     the first naming ref
 *   'last'      the last naming ref
 *   'act:<a>'   the first ref whose act is <a>, else the first naming ref
 *
 * `largest`, `first` and `last` take an optional unit, `largest:series`, so a rule compares like
 * with like: on a line, a series' move and a point's value are different quantities, and the
 * largest of both together picked a point (measured, 2026-09-27).
 *
 * -1 when no ref names a unit.
 */
export function keyIndex(refs, rule = 'first') {
  const [head, unitOnly] = String(rule).startsWith('act:') ? [rule, null] : String(rule).split(':');
  rule = head;
  const naming = refs.map((r, i) => [r, i]).filter(([r]) => r.unit && NAMING_ACTS.has(r.act) && (!unitOnly || r.unit === unitOnly));
  if (!naming.length) return -1;
  if (rule === 'last') return naming[naming.length - 1][1];
  if (rule === 'largest') {
    let best = null;
    for (const [r, i] of naming) if (Number.isFinite(r.value) && (!best || r.value > best[0].value)) best = [r, i];
    return (best || naming[0])[1];
  }
  if (typeof rule === 'string' && rule.startsWith('act:')) {
    const hit = naming.find(([r]) => r.act === rule.slice(4));
    return (hit || naming[0])[1];
  }
  return naming[0][1];
}

/**
 * A component's effective gesture: its manifest `gesture` over its archetype's defaults
 * (`lib/core/gesture-archetypes.json`). The component's own units come first, so a chart's named
 * units (`stage`, `point`) lead the archetype's generic ones, and a unit of the same name replaces
 * the archetype's. Null when `own` names no archetype `archetypes` holds.
 *
 * The one merge: `lib/core/gesture.js` (the build and the gates) and the Guide (which ships the
 * archetypes once and each component's override, not 71 merged copies) both call it.
 * engineering/decisions/2026-09-27-guide-storyboards.md §7.
 */
export function mergeGesture(own, archetypes) {
  const base = own && Object.hasOwn(archetypes, own.archetype) && !own.archetype.startsWith('$') ? archetypes[own.archetype] : null;
  if (!base) return null;
  const units = { ...own.units };
  for (const [name, spec] of Object.entries(base.units)) if (!Object.hasOwn(units, name)) units[name] = spec;
  return { archetype: own.archetype, units, key: own.key || base.key };
}
