/**
 * chart-form-state.js — whether the chart form kernel is placing the drawing in progress, and its canvas.
 *
 * A file of its own because the phone path (./chart-phone.js, called from chart-family.dispatch.js) sets it and every
 * kind reads it, while the kernel itself (./chart-form.js) carries the text measurer and its glyph table: a kind that
 * only asks whether the kernel is running should not pull in the table. Pure, no requires.
 */

// The canvas's width in drawing units on a phone page: the family's 320, so every kind's own constants (a bar's
// widest column, a marker's radius) keep the meaning they have on a landscape slide.
const FORM_W = 320;

let active = null;

/** Run `fn` with the kernel active on a canvas of `box` drawing units. */
function withForm(box, fn) {
  const prev = active;
  active = { box: { w: box.w, h: box.h } };
  try { return fn(); } finally { active = prev; }
}

/** The canvas a kind on the kernel draws in, in drawing units, or null when the kernel is not running. */
const formBox = () => (active ? { ...active.box } : null);
/** Whether the drawing in progress is placed by the kernel. */
const formActive = () => !!active;

// The body face the chart's text paints in, for the text measurer (./text-measure.js): 'clean' (Outfit) by default,
// 'inter' where the slide's type set paints chart text in Inter (`typography: ledger | poster | festival`,
// lib/core/resolve-typography.js), 'hand' under the sketch finish (lib/base/base.sketch.css): chart text reads
// `--font-body`, which both re-point. Set by shared/chart-phone.js around a phone-page drawing.
let body = 'clean';

/** Run `fn` with the chart's body face set to `face`. */
function withBodyFace(face, fn) {
  const prev = body;
  body = face;
  try { return fn(); } finally { body = prev; }
}

/** The body face the drawing in progress paints its text in. */
const bodyFace = () => body;

module.exports = { FORM_W, withForm, formBox, formActive, withBodyFace, bodyFace };
