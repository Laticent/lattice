/**
 * STATUS MARKS — the drawn shape a chart puts on a status mark, so a status is told by SHAPE as well as color.
 *
 * Every chart fill carries white text (one ink per slide), so color alone cannot tell a status bar from a category
 * bar of the same hue, and it cannot tell a colorblind reader done from blocked. A status mark therefore also
 * carries its shape, the same vocabulary the six state marks use (lib/core/state-marks.js): a check for done, a dash
 * for at risk, a cross for blocked, a slash for deferred. Live, pilot and decision carry no mark: they are neither
 * settled nor an exception. engineering/chart-styling.md §3.
 *
 * The paths are the `--mark-*-bold` tokens' own (base.tokens.css), on the same 24-unit box, so an SVG chart that
 * inlines them draws exactly what an HTML chart masks with the token. Pure: no DOM, no fs.
 */

/** Chart status word → mark name. */
const STATUS_MARK = Object.freeze({
  'on-track': 'check',
  done: 'check',
  pass: 'check',
  'at-risk': 'dash',
  warn: 'dash',
  blocked: 'x',
  fail: 'x',
  deferred: 'slash',
});

/** Each mark's path on a 24x24 box, and its stroke width there (the `-bold` tokens). */
const MARK_PATH = Object.freeze({
  check: { d: 'M6 12.6l4 4 8-9', w: 3.6 },
  dash: { d: 'M7 12h10', w: 3.8 },
  x: { d: 'M8 8l8 8M16 8l-8 8', w: 3.6 },
  slash: { d: 'M8 16L16 8', w: 3.6 },
});

/** The mark name for a status word, or null when the status carries none. */
function statusMarkName(status) {
  return STATUS_MARK[status] || null;
}

/**
 * The mark as an inline SVG path, `size` user units square, its left edge at `x` and centered on `cy`. It carries the
 * status (`data-s`), so the stylesheet strokes it in that status's text ink (`.chart-status-mark`), the ink the label
 * beside it wears. Returns '' for a status with no mark.
 */
function statusMarkSvg(status, { x, cy, size, className = 'chart-status-mark' }) {
  const name = statusMarkName(status);
  if (!name) return '';
  const { d, w } = MARK_PATH[name];
  const k = size / 24;
  return `<path class="${className}" data-s="${status}" data-mark-shape="${name}" aria-hidden="true" d="${d}" fill="none" ` +
    `stroke-width="${w}" stroke-linecap="round" stroke-linejoin="round" ` +
    `transform="translate(${x.toFixed(2)} ${(cy - size / 2).toFixed(2)}) scale(${k.toFixed(4)})"/>`;
}

module.exports = { STATUS_MARK, MARK_PATH, statusMarkName, statusMarkSvg };
