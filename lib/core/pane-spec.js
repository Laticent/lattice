/**
 * Pane spec — the authoring contract of a panes slide, in ONE pure leaf that the carve
 * (lib/core/panes.js) and the linter (lib/authoring/lint-core.js) both read, so the render
 * and `lint:deck` can never disagree about what a marker, a ratio or a pane's budget means
 * (HARD RULE #1, #7). No requires, no DOM, no fs: it runs in the browser lint as well.
 *
 * Contract (engineering/decisions/2026-09-25-panes-two-components-one-slide.md §1):
 *   `<!-- pane: X -->`           — where component X's body begins; two per slide
 *   `<!-- panes: 40/60 stack no-rule -->` — optional layout: a 25–75 ratio in 5% steps,
 *                                   `stack` (default side by side), `no-rule` (no spine)
 *
 * Each component's `pane` manifest field decides whether it may go in a pane and how much it
 * holds there. The carve and the linter take that field as plain data (a catalog, a vocab), so
 * this module never loads a manifest.
 */

/** A pane marker, alone on its line (trimmed). */
const PANE_RE = /^<!--\s*pane:\s*([a-z][\w-]*)\s*-->$/;
/** The optional layout comment. No quantifier may overlap its neighbor: `\s*([^<>]*?)\s*`
 *  backtracked cubically on an unclosed comment (3 KB of spaces took 3.8s in a render), so the
 *  capture is `[^<>]*` and callers trim it. */
const PANES_RE = /^<!--\s*panes:([^<>]*)-->$/;

/** The 25–75 range in 5% steps: past 75/25 the narrow pane is too thin to read. */
const RATIO_MIN = 25;
const RATIO_MAX = 75;
const RATIO_STEP = 5;
/** The least share side by side a `fit: wide` component reads at (a table, a gantt). */
const WIDE_MIN = 65;
/** The share a `pane.budget.side` is declared at, by fit. A stack is budgeted at 50/50. */
const BUDGET_BASIS = { half: 50, wide: WIDE_MIN };

/** `{ direction, a, b, rule, error? }` from a `panes:` spec (null → 50/50 side, ruled). */
function parseLayout(spec) {
  const out = { direction: 'side', a: 50, b: 50, rule: true };
  if (!spec) return out;
  const words = spec.replace(/\s*\/\s*/g, '/').split(/\s+/).filter(Boolean);
  for (const word of words) {
    if (word === 'stack' || word === 'side') out.direction = word;
    else if (word === 'no-rule' || word === 'rule') out.rule = word === 'rule';
    else if (/^\d+\/\d+$/.test(word)) {
      const [a, b] = word.split('/').map(Number);
      const ok = a + b === 100 && a >= RATIO_MIN && a <= RATIO_MAX && a % RATIO_STEP === 0;
      if (ok) Object.assign(out, { a, b });
      else out.error = `panes ratio ${word}: use ${RATIO_STEP}% steps from ${RATIO_MIN}/${RATIO_MAX} to ${RATIO_MAX}/${RATIO_MIN}`;
    } else out.error = `panes: unknown word "${word}" — use a ratio like 40/60, optionally with "stack" or "no-rule"`;
  }
  return out;
}

/** A component's pane spec, `{ fit, stack }`, from a `{ name → { fit, stack? } }` map (the
 *  pane catalog, or the lint vocab). No row — an installed package — is a `half` that stacks. */
function specOf(specs, cls) {
  const row = specs && Object.hasOwn(specs, cls) ? specs[cls] : null;
  return { fit: row?.fit || 'half', stack: row?.stack !== false };
}

/**
 * The warning a pane of `cls` earns at position `i` of `layout`, or null. Warn, never refuse:
 * an opted-out component still renders — as `content` — and a narrow or stacked one renders
 * as authored, where the export's overflow probe will mark it if it clips.
 */
function paneFitWarning(spec, cls, layout, i) {
  if (spec.fit === 'none') return `panes: "${cls}" opts out of panes (it claims the whole slide); rendered as content`;
  if (layout.direction === 'stack' && !spec.stack) {
    return `panes: "${cls}" does not fit a stacked band (one element already clips there); put the panes side by side`;
  }
  const share = i === 0 ? layout.a : layout.b;
  if (spec.fit === 'wide' && layout.direction === 'side' && share < WIDE_MIN) {
    return `panes: "${cls}" needs at least a ${WIDE_MIN}% share side by side, or a stack; it has ${share}%`;
  }
  return null;
}

/**
 * The `{ sweet, hard }` a pane holds at position `i` of `layout`, from the component's
 * `pane.budget`, or null when it declares none for this direction. `side` is declared at the
 * fit's basis share (50% half, 65% wide) and `stack` at 50/50. A pane SMALLER than its basis
 * scales the counts down in proportion; a larger one keeps them, never up (the declared number
 * is the one measured or judged; a larger box is headroom, not a promise).
 */
function paneBudgetLimit(budget, spec, layout, i) {
  const counts = layout.direction === 'stack' ? budget?.stack : budget?.side;
  if (!counts) return null;
  const share = i === 0 ? layout.a : layout.b;
  const basis = layout.direction === 'stack' ? 50 : BUDGET_BASIS[spec.fit] || 50;
  const k = Math.min(1, share / basis);
  const scale = (n) => Math.max(1, Math.floor(n * k));
  return { sweet: scale(counts.sweet), hard: scale(counts.hard) };
}

/**
 * The panes of one slide's markdown, or null when it has fewer than two markers: `{ layout,
 * markers, panes: [{ cls, markdown, line }] }` (`markers` counts every marker, a third included). Line-level, skipping fenced code, for the linter's
 * instant feedback — the carve works on the parsed tokens instead, and agrees with this on
 * every slide `test/unit/core/panes.test.js` renders. A third marker folds into the second
 * pane, as the carve folds it.
 */
function splitPaneMarkdown(slide) {
  const lines = String(slide || '').split('\n');
  let fence = null;
  const markers = [];
  let spec = null;
  lines.forEach((raw, n) => {
    const line = raw.trim();
    const f = line.match(/^(`{3,}|~{3,})/);
    if (f) {
      if (!fence) fence = f[1][0];
      else if (f[1][0] === fence) fence = null;
      return;
    }
    if (fence) return;
    const m = line.match(PANE_RE);
    if (m) markers.push({ cls: m[1], line: n });
    const l = line.match(PANES_RE);
    if (l) spec = l[1].trim();
  });
  if (markers.length < 2) return null;
  const body = (from, to) => lines.slice(from + 1, to).join('\n');
  return {
    layout: parseLayout(spec),
    markers: markers.length,
    panes: [
      { cls: markers[0].cls, line: markers[0].line, markdown: body(markers[0].line, markers[1].line) },
      { cls: markers[1].cls, line: markers[1].line, markdown: body(markers[1].line, lines.length) },
    ],
  };
}

module.exports = {
  PANE_RE, PANES_RE, RATIO_MIN, RATIO_MAX, RATIO_STEP, WIDE_MIN, BUDGET_BASIS,
  parseLayout, specOf, paneFitWarning, paneBudgetLimit, splitPaneMarkdown,
};
