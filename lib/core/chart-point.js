/**
 * chart-point.js — a chart POINT as an author writes it: one record, `{3, 70}`,
 * `{$4.2M, 62%}`, `{0.4, 0.55, size=12}`.
 *
 * Quadrant and scatter both place a labeled point at (x, y) and may size it. They used to spell
 * it two ways — quadrant ONE pill `` `3, 70` ``, scatter THREE pills `` `$4.2M` `62%` `140` `` —
 * and parse it two ways, with a third copy in the narrator. Segno phase 2 (decision 10 of
 * engineering/decisions/2026-09-28-segno-unified-inline-notation.md) makes it one record read by
 * one slot (`point`, lib/core/segno-slots.js), so the two charts, the narrator and lint agree.
 *
 * The numbers come from Segno's number type — the reader every chart shares
 * (lib/core/chart-values.js) — so `$4.2M` is 4,200,000 and `1,25M` is 1.25M. A value that holds a
 * separator is quoted (`{"$1,200", 62%}`). The RAW text of each coordinate is kept beside its
 * number, because a chart prints what the author typed (`$4.2M`), not the parse.
 *
 * Pure: strings in, plain data out (HARD RULE #1).
 */

const { parse } = require('@laticent/segno');
const { coreSlot } = require('./segno-slots.js');

let slot = null;
const pointSlot = () => (slot ??= coreSlot('point'));

/** One record item's text as typed: quoted text unquoted, anything else raw. */
function rawOf(src, it) {
  const v = it.value;
  if (v.kind === 'scalar' && v.quoted) return v.text;
  return v.kind === 'scalar' ? v.text : src.slice(v.from, v.to).trim();
}

/**
 * Read one point span (the inline code's text, entity-decoded).
 * @returns {{x:number, y:number, size:number, xRaw:string, yRaw:string, sizeRaw:string}|null}
 *   null when the span is not a point — a record that is not two numbers and a named size.
 */
function readPoint(text) {
  const src = String(text ?? '').trim();
  if (src.charCodeAt(0) !== 0x7b /* { */) return null; // O(1) reject
  const p = parse(src);
  if (!p.ok || p.item.tag || p.item.name !== null || p.item.value.kind !== 'record') return null;
  const b = pointSlot().bind(p.item.value);
  if (!b.ok) return null;
  const items = p.item.value.items;
  const sizeItem = items.find((it) => it.name === 'size');
  const positional = items.filter((it) => it.name === null);
  return {
    x: b.value.x.value,
    y: b.value.y.value,
    size: b.value.size ? b.value.size.value : NaN,
    xRaw: rawOf(src, positional[0]),
    yRaw: rawOf(src, positional[1]),
    sizeRaw: sizeItem ? rawOf(src, sizeItem) : '',
  };
}

module.exports = { readPoint };
