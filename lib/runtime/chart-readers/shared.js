/**
 * What every chart READER shares (lib/runtime/chart-redraw.js): escaping a value read off the page, the
 * text of a label split into `<tspan>` lines, and the refusals no kind can read back.
 *
 * A reader rebuilds a chart's source list from its rendered marks, so the fluid viewer can redraw the
 * chart for a new box with nothing added to the export. It returns the source as the kernel reads it (a list, a table, or an axis line before a list), or
 * null to keep the exported drawing. Every value it reads is a DECODED string (an attribute, a text node),
 * so each goes back through `esc` (HARD RULE #22). A reader only reads a mark's identity, through
 * `dataset` or `getAttribute`; it never writes one.
 */

const ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ESC[c]);

/** A label as the author wrote it: an SVG `<text>` splits a wrapped label into `<tspan>` lines. */
function textOf(el) {
  const spans = el.querySelectorAll('tspan');
  const parts = spans.length ? [...spans].map((t) => t.textContent) : [el.textContent];
  return parts.map((p) => p.trim()).filter(Boolean).join(' ');
}

/**
 * What no reader can carry, on any kind: a callout (`@callout`, drawn as the legend layer's target and
 * text) and a `_focus` (marks classed `lat-focus` / `lat-recede`). A redraw from the marks alone drops
 * both (the checker's repro on examples/callouts-bars.md and focus-chart-marks.md), so the chart keeps
 * its exported drawing.
 */
const UNCARRIED = '.legend-target, .legend-text, .lat-focus, .lat-recede';
const uncarried = (body) => !!body.querySelector(UNCARRIED);

/** A name the export shortened (an ellipsis) cannot be read back whole. */
const shortened = (s) => String(s).includes('\u2026');

/** A note placeholder: the redraw swaps the exported `<template class="chart-detail">` node in by mark. */
const NOTE = '<ul><li>.</li></ul>';
const noteFor = (body, i) => (body.querySelector(`template.chart-detail[data-mark="${i}"]`) ? NOTE : '');

module.exports = { esc, textOf, uncarried, shortened, noteFor, NOTE, UNCARRIED };
