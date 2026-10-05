/**
 * SEGNO SLOTS — every place an inline-code span means something, as one Segno slot each.
 *
 * Segno phase 2 (engineering/decisions/2026-09-28-segno-unified-inline-notation.md § Plan):
 * every inline-code grammar Lattice reads goes through `@laticent/segno`, and a span's meaning
 * comes from the SLOT it sits in. Two kinds of slot live here:
 *
 *   CORE slots — the ones that work in any prose, on any slide: a state mark (`[x]`), a pill
 *   (`{BETA, tag, c4}`) and a spark (`~{12 14 17, bar}`). Declared below, because they belong
 *   to no component.
 *
 *   COMPONENT slots — a gantt task's pills, a quadrant's coordinate. Declared in each
 *   component manifest's `segno` field and read from lib/core/segno-slots.generated.js
 *   (tools/build-stage-catalog.js compiles every one at build time, so a slot Segno refuses
 *   fails the build).
 *
 * Every slot is compiled on first use and cached: both render paths, the narrator and the
 * linter share the same compiled slot (HARD RULE #1). Pure, no fs, so it bundles into the
 * browser runtime.
 */

const { compileSlot } = require('./segno-spec.js');
const CATALOG = require('./segno-slots.generated.js');

/** Ordinal color slots c1–c12 (inline-pills.js says why ordinals, not names). */
const COLOR = { type: 'indexed', prefix: 'c', max: 12, label: 'a color' };
const SIZE = { type: 'oneOf', values: ['sm', 'md', 'lg'] };

/** The six state words, and the checkbox-style shortcuts that stand for them. */
const STATE_WORDS = ['done', 'partial', 'fail', 'unknown', 'todo', 'skip'];

const CORE = Object.freeze({
  // A chart point (quadrant, scatter): `{3, 70}`, `{$4.2M, 62%, size=140}` — decision 10 of the
  // Segno note. Two numbers by position; the size is named, because a bare third number could
  // as well be a typo for a fourth axis.
  point: {
    label: 'a point',
    positional: [{ name: 'x', type: 'number' }, { name: 'y', type: 'number', required: true }],
    params: { size: { type: 'number', named: true } },
  },
  state: {
    label: 'a state mark',
    params: { state: { type: 'oneOf', values: STATE_WORDS } },
    shortcuts: { '[x]': '{done}', '[-]': '{partial}', '[!]': '{fail}', '[?]': '{unknown}', '[ ]': '{todo}', '[/]': '{skip}' },
  },
  // The label is optional only so `{icon=database}` (an icon with no words) binds; a pill with
  // neither a label nor an icon is refused by lib/core/inline-pills.js. `icon` is named-only: a
  // pill's first word is its label, so `{database}` must stay a pill that says "database".
  pill: {
    label: 'a pill',
    positional: [{ name: 'value', type: 'text', required: false }],
    params: {
      shape: { type: 'oneOf', values: ['pill', 'chip', 'tag', 'tag-bordered', 'circle', 'chevron-right', 'chevron-left', 'diamond'] },
      color: COLOR,
      size: SIZE,
      icon: { type: 'text', named: true },
    },
  },
  spark: {
    label: 'a spark',
    tag: '~',
    positional: [{ name: 'data', type: 'text' }],
    params: {
      type: { type: 'oneOf', values: ['line', 'area', 'bar', 'step', 'winloss', 'ring', 'bullet'] },
      size: SIZE,
      color: COLOR,
      end: { type: 'flag', word: 'end' },
      minmax: { type: 'flag', word: 'minmax' },
      fill: { type: 'flag', word: 'fill' },
      zero: { type: 'flag', word: 'zero' },
      frame: { type: 'oneOf', values: ['framed', 'bare'] },
      look: { type: 'oneOf', values: ['pigment', 'etching', 'tone'] },
      corners: { type: 'oneOf', values: ['square', 'rounded'] },
    },
  },
});

const cache = new Map();

/** A core slot by name: `state`, `pill`, `spark`. */
function coreSlot(name) {
  const key = `core:${name}`;
  let s = cache.get(key);
  if (!s) {
    const spec = CORE[name];
    if (!spec) throw new Error(`segno-slots: no core slot "${name}"`);
    s = compileSlot(spec, `core.${name}`);
    cache.set(key, s);
  }
  return s;
}

/** A component's slot (`componentSlot('gantt', 'task')`), or null when it declares none. */
function componentSlot(component, name) {
  const key = `${component}:${name}`;
  if (cache.has(key)) return cache.get(key);
  const spec = CATALOG[component]?.[name];
  const s = spec ? compileSlot(spec, `${component}.segno.${name}`) : null;
  cache.set(key, s);
  return s;
}

module.exports = { coreSlot, componentSlot, CORE, STATE_WORDS };
