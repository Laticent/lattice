#!/usr/bin/env node
/**
 * check-chart-responsiveness — the S4 responsiveness lint (#180).
 *
 * Lattice renders the slide DOM at its NATIVE pixel size, so `cqi` tracks real
 * pixels (1cqi = 12.8px @HD, 38.4px @4K) and a fixed-px CSS-box length is a
 * genuine jank vector: it pins while the cqi-driven type and slide grow around
 * it. The cqi-first conversions (radar/quadrant caps, hairlines, state-chart,
 * word-cloud) removed every such hazard from the chart family; this lint is the
 * guardrail that keeps it that way — it fails the build if a NEW fixed-px
 * layout-box length lands in any chart component's CSS.
 *
 * What it flags: a px literal on a LAYOUT-BOX property (see LAYOUT_PROPS) in
 * `lib/components/chart/**\/*.css`.
 *
 * What it does NOT flag — the three legitimate ways px appears in chart CSS:
 *   1. SVG-viewBox context — a rule that targets an SVG element/class or carries
 *      an SVG-only property (fill / stroke / text-anchor / …). Inside a viewBox,
 *      px ARE resolution-independent units that scale with the SVG, so px font
 *      sizes / geometry there are correct (the pie/radar/quadrant/funnel labels).
 *   2. A px inside `clamp(…)` — the sanctioned hairline idiom (a 1px rule should
 *      stay ~1px at every resolution, NOT scale to a chunky 3px at 4K).
 *   3. A `/* sanctioned: <reason> *\/` comment on the declaration — the explicit
 *      escape hatch for an intentional fixed-px floor (e.g. a swatch min-size so
 *      it never vanishes), matching the convention already in chart-family.css.
 *
 * Usage:
 *   node tools/check-chart-responsiveness.js [glob...]   # default: chart CSS
 * Exit 0 = clean; 1 = a fixed-px layout length needs cqi (or a sanctioned note).
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const ROOT = path.join(__dirname, '..');

// Layout-box properties whose px value pins a real CSS box — the hazard set.
// A CLOSED list: anything not here (border*, box-shadow, stroke-width, transform,
// background, border-radius, custom-prop tokens, …) is never flagged, so the
// lint can't false-fire on hairline/decoration px.
const LAYOUT_PROPS = new Set([
  'width', 'height',
  'min-width', 'max-width', 'min-height', 'max-height',
  'padding', 'padding-top', 'padding-right', 'padding-bottom', 'padding-left',
  'padding-block', 'padding-inline',
  'margin', 'margin-top', 'margin-right', 'margin-bottom', 'margin-left',
  'margin-block', 'margin-inline',
  'gap', 'row-gap', 'column-gap',
  'inset', 'top', 'right', 'bottom', 'left',
  'font-size', 'line-height', 'flex-basis',
]);

// SVG-only properties — their presence marks a rule as SVG-context, where px is
// a viewBox unit (legitimate). Matched against a rule's whole body.
const SVG_PROP_RE =
  /(?:^|[;{]|\s)(?:fill|stroke|stroke-width|stroke-dasharray|stroke-linecap|stroke-linejoin|text-anchor|dominant-baseline|alignment-baseline|paint-order|vector-effect|stop-color|stop-opacity|flood-color|marker-start|marker-mid|marker-end|d)\s*:/;

// SVG element names / class conventions in a selector — also marks SVG-context.
const SVG_SEL_RE =
  /(?:^|[\s,>+~(])(?:svg|text|tspan|line|circle|ellipse|rect|polygon|polyline|path|g|defs|marker)\b|-svg\b|\.wedge\b|\.wc-word\b|\.radar-(?:area|axis|grid|ring|spoke|label|dot)\b|\.quadrant-(?:label|dot|tick|axis)\b|\.funnel-(?:label|value|conv|seg)\b|\.map-(?:region|label|svg)\b/;

// A selector that targets the SVG's OWN BOX rather than something inside its
// viewBox: the `svg` element, or the `-svg` class convention the chart family
// uses for its root (`.radar-svg`, `.piechart-svg`, `.gantt-svg`, and modifier
// forms like `.radar-svg--mini`). Sizing THESE in px pins the diagram to a
// physical size; sizing anything inside the viewBox in px does not.
//
// Three `<svg>` roots predate the `-svg` convention and are named here, because
// a root the pattern misses is exempted wholesale — the #1184 hole, one name
// over.
const SVG_BOX_EXTRA = ['journey-curve', 'journey-face', 'state-chart-edges'];
const SVG_BOX_SEL_RE = new RegExp(
  `^(?:svg|[.#][\\w-]*-svg(?:--[\\w-]+)?|[.#](?:${SVG_BOX_EXTRA.join('|')}))`
  + '(?:[:.[][^\\s]*)?$',
);

/**
 * Does this selector target an `<svg>` element's own box?
 *
 * Tested against the LAST COMPOUND of each comma-separated selector — the
 * element the rule actually styles. Matching anywhere in the string called
 * `.radar-svg--mini .radar-axis-label` an svg box (it is a `<text>` INSIDE one),
 * which would then wrongly scan a legitimate viewBox-unit `height` on it.
 */
// Split on the given separators, but only at paren depth 0 — a comma or a space
// inside `:is(…)` / `:not(…)` belongs to that functional pseudo-class, not to
// the selector list or the descendant chain.
function splitTopLevel(selector, seps) {
  const parts = [];
  let depth = 0, cur = '';
  for (const ch of selector) {
    if (ch === '(') depth++;
    else if (ch === ')') depth--;
    if (depth === 0 && seps.includes(ch)) { parts.push(cur); cur = ''; continue; }
    cur += ch;
  }
  parts.push(cur);
  return parts.map((p) => p.trim()).filter(Boolean);
}

function targetsSvgBox(selector) {
  return splitTopLevel(selector, ',').some((part) => {
    const compounds = splitTopLevel(part, ' \t\n>+~');
    const last = compounds[compounds.length - 1] || '';
    // Unwrap a trailing `:is(…)` / `:where(…)` so `:is(.radar-svg, .x-svg)` is
    // read as the alternatives it stands for.
    const inner = last.match(/^:(?:is|where)\((.*)\)$/);
    if (inner) return targetsSvgBox(inner[1]);
    return SVG_BOX_SEL_RE.test(last);
  });
}

// The properties that size the svg's OUTER box. Only these are still checked on
// an svg-box rule; a px font-size or padding in the same rule is a viewBox unit.
const SVG_BOX_PROPS = new Set([
  'width', 'height', 'min-width', 'max-width', 'min-height', 'max-height',
]);

const PX_RE = /-?\d*\.?\d+px/;

/**
 * Find fixed-px layout violations in one CSS source. Pure + fs-free so the unit
 * test can exercise it directly. Returns [{ line, prop, value, selector }].
 *
 * Strategy: a depth-aware single pass that, for each top-level rule, captures
 * its selector + full body first (so SVG-context detection sees the WHOLE rule,
 * not just the current line — the `--magic`/`--zone` quadrant labels carry
 * `fill` on a sibling line), then scans the body's declarations.
 */
function findViolations(css) {
  const violations = [];
  const n = css.length;

  // `blanked` is css with every block comment replaced by spaces of the SAME
  // length (newlines preserved), so brace/selector/declaration parsing never
  // trips over a `{`, `}`, `;`, or property name that lives inside a comment —
  // while line numbers and original-index lookups stay exact. The raw `css`
  // is still used for the per-declaration `sanctioned:` check.
  const blanked = css.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '));

  // Collect rules as { selector, body, bodyStart } via a depth-aware walk.
  const rules = [];
  const braceStack = [];
  let selStart = 0;
  for (let i = 0; i < n; i++) {
    const c = blanked[i];
    if (c === '{') {
      braceStack.push({ selector: blanked.slice(selStart, i).trim(), bodyStart: i + 1 });
      selStart = i + 1;
    } else if (c === '}') {
      const frame = braceStack.pop();
      if (frame) rules.push({ ...frame, body: blanked.slice(frame.bodyStart, i) });
      selStart = i + 1;
    } else if (c === ';' && braceStack.length === 0) {
      selStart = i + 1;
    }
  }

  const lineAt = (idx) => css.slice(0, idx).split('\n').length;

  for (const rule of rules) {
    if (rule.selector.startsWith('@')) continue;     // @media / @supports wrapper
    if (rule.body.includes('{')) continue;            // a wrapper (its inner rules are captured separately)
    // SVG context exempts px because inside a viewBox, px IS a user unit. But
    // that exemption must stop at the SVG's OWN BOX: `width`/`height` on the
    // <svg> element are CSS pixels in the PAGE, so they pin the diagram to a
    // fixed physical size and it stops tracking its container — the exact
    // defect this lint exists to catch (#1184: `.radar-svg--mini` sat at
    // 188px, ~14.7cqi at HD collapsing to ~4.9cqi at 4K while the type around
    // it grew 3×). The blanket `-svg` exemption is why it slipped through.
    // So an svg-BOX rule is still scanned, for width/height only.
    const svgCtx = SVG_SEL_RE.test(rule.selector) || SVG_PROP_RE.test(rule.body);
    const svgBox = targetsSvgBox(rule.selector);
    if (svgCtx && !svgBox) continue;                       // viewBox units
    const onlyBoxProps = svgCtx && svgBox;                 // scan width/height only

    // Walk declarations (split on ; — `blanked` has no comment-embedded ;).
    let declStart = rule.bodyStart;
    const bodyEnd = rule.bodyStart + rule.body.length;
    for (let j = rule.bodyStart; j <= bodyEnd; j++) {
      if (j === bodyEnd || blanked[j] === ';') {
        scanDecl(declStart, j, onlyBoxProps);
        declStart = j + 1;
      }
    }
  }

  function scanDecl(start, end, onlyBoxProps) {
    const decl = blanked.slice(start, end);                 // comment-free
    const m = decl.match(/^\s*(-?[a-zA-Z][\w-]*)\s*:\s*([\s\S]*)$/);
    if (!m) return;
    const prop = m[1].toLowerCase();
    const value = m[2].trim();
    if (!LAYOUT_PROPS.has(prop)) return;
    // An SVG-context rule that targets the svg BOX is scanned for its box size
    // only — everything else in it (font-size, padding…) is still viewBox units.
    if (onlyBoxProps && !SVG_BOX_PROPS.has(prop)) return;
    // Drop `var(--token, …)` fallbacks before testing: a px there is the
    // fallback if the (resolution-stable) token is undefined, not the live
    // value — e.g. `width: var(--chart-spine-w, 2px)` rides the clamp token.
    const primary = value.replace(/var\([^()]*\)/g, '');
    if (!PX_RE.test(primary)) return;
    if (/clamp\s*\(/.test(value)) return;                   // hairline idiom
    // Escape hatch: a `/* sanctioned: reason */` anywhere on the declaration's
    // line(s) in the raw source (so it can sit after the semicolon).
    const lineLo = css.lastIndexOf('\n', start) + 1;
    let lineHi = css.indexOf('\n', end);
    if (lineHi < 0) lineHi = css.length;
    if (/sanctioned\s*:/.test(css.slice(lineLo, lineHi))) return;
    violations.push({
      line: lineAt(start + (decl.length - decl.trimStart().length)),
      prop,
      value,
    });
  }

  return violations;
}

function defaultGlob() {
  // `chart/*/*.css` already covers `chart/_chart-family/chart-family.css`.
  const out = execSync('ls lib/components/chart/*/*.css', { cwd: ROOT, encoding: 'utf8' });
  return [...new Set(out.trim().split('\n').filter(Boolean))];
}

function main() {
  const args = process.argv.slice(2).filter((a) => !a.startsWith('-'));
  const files = args.length ? args : defaultGlob();
  let total = 0;
  for (const rel of files) {
    const abs = path.isAbsolute(rel) ? rel : path.join(ROOT, rel);
    const css = fs.readFileSync(abs, 'utf8');
    const violations = findViolations(css);
    for (const v of violations) {
      console.error(
        `✗ ${path.relative(ROOT, abs)}:${v.line}  ${v.prop}: ${v.value}` +
        `  — fixed-px layout length; use cqi, wrap a hairline in clamp(), or add /* sanctioned: <reason> */`,
      );
    }
    total += violations.length;
  }
  if (total) {
    console.error(`\ncheck-chart-responsiveness FAILED — ${total} fixed-px layout length(s) in chart CSS. See #180.`);
    process.exit(1);
  }
  console.log(`check-chart-responsiveness OK — no unsanctioned fixed-px layout lengths in ${files.length} chart CSS files.`);
  process.exit(0);
}

if (require.main === module) main();

module.exports = { findViolations, LAYOUT_PROPS };
