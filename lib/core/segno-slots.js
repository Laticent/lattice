/**
 * SEGNO SLOTS — every place an inline-code span means something, as one Segno slot each.
 *
 * Segno phase 2 (engineering/decisions/2026-09-28-segno-unified-inline-notation.md § Plan):
 * every inline-code grammar Lattice reads goes through `@laticent/segno`, and a span's meaning
 * comes from the SLOT it sits in. Two kinds of slot live here:
 *
 *   CORE slots — the ones that work in any prose, on any slide: a state mark (`[x]`), a pill
 *   (`{BETA, tag, c4}`), a spark (`~{12 14 17, bar}`) and a callout (`@callout{{Peak, for=14}}`).
 *   Declared below, because they belong to no component.
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

/** Ordinal color slots c1–c12 (lib/plugins/pills/pills.inline.js says why ordinals, not names). */
const COLOR = { type: 'indexed', prefix: 'c', max: 12, label: 'a color' };
const SIZE = { type: 'oneOf', values: ['sm', 'md', 'lg'] };

/** The six state words, and the checkbox-style shortcuts that stand for them. */
const STATE_WORDS = ['done', 'partial', 'fail', 'unknown', 'todo', 'skip'];

/** The pill's eight shape words: a legend's plate takes exactly these (the plate IS the pill). */
const PLATE_SHAPES = ['pill', 'chip', 'tag', 'tag-bordered', 'circle', 'chevron-right', 'chevron-left', 'diamond'];

/** The marks a legend entry may name (lib/core/legend-mark.js draws them). */
const LEGEND_MARKS = ['swatch', 'outline', 'line', 'heavy', 'dashed', 'dotted'];

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
  // neither a label nor an icon is refused by lib/plugins/pills/pills.inline.js. `icon` is named-only: a
  // pill's first word is its label, so `{database}` must stay a pill that says "database".
  pill: {
    label: 'a pill',
    positional: [{ name: 'value', type: 'text', required: false }],
    params: {
      shape: { type: 'oneOf', values: PLATE_SHAPES },
      color: COLOR,
      size: SIZE,
      icon: { type: 'text', named: true },
    },
  },
  // THE LEGEND'S TWO ENTRY SLOTS, tried in order (engineering/decisions/2026-10-19-universal-legend.md
  // § 5, spike 2). `legend-entry` is the pill record plus the legend's named parameters, so
  // `{Poor, c1}` and `{LIVE, tag, c4}` read as they do for a pill. `legend-keyed` is asked only when
  // the entry slot refuses, and keeps every shipped `{1, Cold}` and `{dashed, Sent back}` a keyed pair.
  // ONE slot with two positionals was tried and rejected: Segno fills positionals before it binds by
  // type, so `{Cold, c1}` read as two texts and lost the color. The shape words are the pill's own
  // list, read off `pill` below, so a plate can never name a shape the pill cannot draw.
  'legend-entry': {
    label: 'a legend entry',
    positional: [{ name: 'text', type: 'text' }],
    params: {
      shape: { type: 'oneOf', values: PLATE_SHAPES },
      color: COLOR,
      size: SIZE,
      detail: { type: 'text', named: true },
      mark: { type: 'oneOf', values: LEGEND_MARKS, named: true },
      for: { type: 'text', named: true },
      // A cell of a grid, by its row and column labels: `{Dip, row="Feb 2026", col=M2}`. The two
      // words a reader already says ("the Feb row, the M2 column"), so nothing has to be typed between.
      row: { type: 'text', named: true },
      col: { type: 'text', named: true },
    },
  },
  'legend-keyed': {
    label: 'a keyed legend entry',
    positional: [{ name: 'key', type: 'text' }, { name: 'text', type: 'text' }],
    params: { detail: { type: 'text', named: true }, color: COLOR },
  },
  // The record around the entries: `{{Peak, for=14}}` or `{[{Poor, c1}, {Good, c3}], key}`. The
  // entries themselves are read one by one through the two slots above (lib/core/legend.js), because a
  // Segno list holds one type and a legend's list holds both shapes.
  legend: {
    label: 'a legend',
    params: { layout: { type: 'oneOf', values: ['key', 'anchored', 'along-path'] } },
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
      look: { type: 'oneOf', values: ['pigment', 'etch', 'tone'] },
      corners: { type: 'oneOf', values: ['square', 'rounded'] },
    },
  },
});

const cache = new Map();

/** A core slot by name: `state`, `pill`, `spark`, `legend-entry`, `legend-keyed`, `legend`. */
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

/**
 * Does one of this component's slots read `text`? A brace record is a pill AND the way a component
 * writes its own data (`{who=sales}` on a journey row), so the pill lint asks this before it calls a
 * span a broken pill: the component draws what it reads.
 *
 * A chart's row schema (a slot carrying `rows`, lib/core/chart-rows.js) counts only where the chart
 * draws the record today (`rows.legacy: "record"`: scatter, quadrant). Elsewhere the schema reads a
 * record the chart does not draw yet, so the span is still the pill lint's to judge, and lint
 * `chart-row-record-unread` says what the row loses.
 */
function componentReads(component, text) {
  const slots = CATALOG[component];
  if (!slots) return false;
  for (const name of Object.keys(slots)) {
    const rows = slots[name]?.rows;
    if (rows && rows.legacy !== 'record') continue;
    if (componentSlot(component, name)?.read(text).ok) return true;
  }
  return false;
}

module.exports = { coreSlot, componentSlot, componentReads, CORE, STATE_WORDS, PLATE_SHAPES, LEGEND_MARKS };
