/**
 * chart-form-state.js — whether the chart form kernel is placing the drawing in progress, and its canvas.
 *
 * A file of its own because the dispatch (lib/plugins/chart-family/chart-family.dispatch.js) sets it and the
 * dispatch ships in the startup engine bundle: the kernel itself (./chart-form.js) carries the text measurer and
 * its glyph table, which belong in the lazy chart kernels, not in startup. Pure, no requires.
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

module.exports = { FORM_W, withForm, formBox, formActive };
