/**
 * resolve-token-expr — evaluate a CSS custom-property value to a literal.
 *
 * The offline Mermaid bridge in lattice-emulator.js feeds Mermaid's
 * `themeVariables`, which wants literal colours, not CSS expressions. The
 * browser and the marp-vscode runtime resolve custom properties natively
 * (getComputedStyle); this module is the OFFLINE equivalent so all three
 * render paths agree (CLAUDE.md "three render paths must agree").
 *
 * It understands the three value forms the palette + base token layers use:
 *   - var(--name[, fallback])
 *   - light-dark(light, dark)              (collapsed per the deck's scheme)
 *   - color-mix(in <space>, c1 [p%], c2 [p%])   (oklab / srgb; transparent → rgba)
 * Anything else (a hex, a named colour, rgb()/rgba(), a non-colour length)
 * returns verbatim, so non-aliased tokens resolve byte-identically to the
 * former two-pass resolver this replaced.
 *
 * This is what lets a Mermaid bridge token resolve through arbitrary nesting —
 * e.g. var(--cat-1-fill) → light-dark(a,b) → hex, or a token that points at
 * another token — regardless of declaration order or nesting depth, where the
 * former "collapse light-dark, then chase one-level var()" passes could not.
 * See engineering/decisions/2026-06-11-universal-token-system.md.
 *
 * Pure: reuses lib/theme/color.js for the colour math (share, never
 * duplicate); no fs, no other repo requires — bundles cleanly into the
 * emulator via build-emulator.js's local-graph walk.
 */

const { mix: mixOklab, hexToRgb, rgbToHex, normalizeHex } = require('../theme/color.js');

/** Named colours used as color-mix() stops in the palette/base expressions. */
const NAMED_COLORS = { white: '#ffffff', black: '#000000' };

/** Split `s` on top-level commas, respecting nested parens. */
function splitTopLevelArgs(s) {
  const out = [];
  let depth = 0;
  let buf = '';
  for (const ch of s) {
    if (ch === '(') depth++;
    else if (ch === ')') depth--;
    if (ch === ',' && depth === 0) { out.push(buf.trim()); buf = ''; }
    else buf += ch;
  }
  if (buf.trim()) out.push(buf.trim());
  return out;
}

/** Match `name( … )` as the WHOLE string; returns its top-level arg list or null. */
function matchCall(expr, name) {
  const m = expr.match(new RegExp(`^${name}\\(([\\s\\S]*)\\)$`, 'i'));
  return m ? splitTopLevelArgs(m[1]) : null;
}

/** Component-wise gamma-sRGB mix of two hex colours; `t` is the weight of `b`. */
function mixSrgb(a, b, t) {
  const A = hexToRgb(a);
  const B = hexToRgb(b);
  return rgbToHex(A.map((c, i) => c + (B[i] - c) * t));
}

/** Read a value as a hex colour (#abc / #aabbcc / white / black); null if not. */
function asHex(v) {
  const s = String(v).trim().toLowerCase();
  if (NAMED_COLORS[s]) return NAMED_COLORS[s];
  try { return normalizeHex(s); } catch { return null; }
}

/**
 * Evaluate one CSS custom-property value to the literal a Mermaid theme
 * variable needs.
 * @param {string} expr    the raw value (e.g. `var(--cat-1-fill)`)
 * @param {Object} vars    raw { name: value } map of every declared token
 * @param {boolean} isDark collapse light-dark() to its dark branch
 * @param {Set} [seen]     alias-cycle guard (internal)
 * @returns {string} the resolved literal, or the input verbatim if unresolvable
 */
function resolveTokenExpr(expr, vars, isDark, seen = new Set()) {
  if (expr == null) return expr;
  const s = String(expr).trim();

  // var(--name) or var(--name, fallback)
  const varM = s.match(/^var\(\s*--([a-z0-9-]+)\s*(?:,([\s\S]+))?\)$/i);
  if (varM) {
    const name = varM[1];
    const fallback = varM[2];
    if (vars[name] !== undefined && !seen.has(name)) {
      return resolveTokenExpr(vars[name], vars, isDark, new Set(seen).add(name));
    }
    if (fallback !== undefined) return resolveTokenExpr(fallback, vars, isDark, seen);
    return s; // undefined var, no fallback — surfaced loudly by the consumer
  }

  // light-dark(light, dark)
  const ld = matchCall(s, 'light-dark');
  if (ld && ld.length === 2) {
    return resolveTokenExpr(isDark ? ld[1] : ld[0], vars, isDark, seen);
  }

  // color-mix(in <space>, c1 [p1%], c2 [p2%])
  const cm = matchCall(s, 'color-mix');
  if (cm && cm.length === 3) {
    const space = cm[0].replace(/^in\s+/i, '').trim().toLowerCase();
    const readStop = (arg) => {
      const pm = arg.match(/(-?\d*\.?\d+)\s*%/);
      const color = arg.replace(/(-?\d*\.?\d+)\s*%/, '').trim();
      return { color: resolveTokenExpr(color, vars, isDark, seen), pct: pm ? parseFloat(pm[1]) : null };
    };
    const a = readStop(cm[1]);
    const b = readStop(cm[2]);
    let p1 = a.pct;
    let p2 = b.pct;
    if (p1 == null && p2 == null) { p1 = 50; p2 = 50; }
    else if (p1 == null) p1 = 100 - p2;
    else if (p2 == null) p2 = 100 - p1;
    const sum = p1 + p2 || 100;
    const aT = a.color.trim().toLowerCase() === 'transparent';
    const bT = b.color.trim().toLowerCase() === 'transparent';
    const h1 = asHex(a.color);
    const h2 = asHex(b.color);
    // A transparent stop → the other colour carried at the reduced alpha.
    if (aT && h2) { const [r, g, bl] = hexToRgb(h2); return `rgba(${r},${g},${bl},${(p2 / sum).toFixed(3)})`; }
    if (bT && h1) { const [r, g, bl] = hexToRgb(h1); return `rgba(${r},${g},${bl},${(p1 / sum).toFixed(3)})`; }
    if (h1 && h2) return space.startsWith('srgb') ? mixSrgb(h1, h2, p2 / sum) : mixOklab(h1, h2, p2 / sum);
    return s; // a non-resolvable stop (e.g. currentColor) — pass through
  }

  return s; // literal hex / named colour / rgb()/rgba() / non-colour value
}

module.exports = { resolveTokenExpr, splitTopLevelArgs, matchCall, mixSrgb, asHex };
