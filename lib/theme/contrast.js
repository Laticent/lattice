/**
 * The Theme Studio's contrast meter / auditor — pure, fs-free.
 *
 * Runs the SAME WCAG AA pair checks the palette gate asserts
 * (test/unit/palette/contrast.test.js), but over an in-memory token map rather
 * than a file on disk, so the Workbench can show a live meter while an author
 * edits and the derivation can prove its output is contrast-clean before it
 * ever becomes an asset. The predicate is `lib/theme/color.js`'s
 * `contrastRatio` — the gate's own function — so a pass here means a pass
 * there.
 *
 * Tokens are supplied as a flat `{ name: value }` map (names WITHOUT the `--`
 * prefix), values either concrete hex or `light-dark(<light>, <dark>)` /
 * `var(--other)` — resolved here per mode, exactly as the gate's parser does.
 * `color-mix(…)` values are left unresolved and any pair that needs one is
 * reported as `skipped` (the gate skips them too).
 */

const { contrastRatio, AA, AA_LARGE } = require('./color.js');

/** Resolve `light-dark()` + `var()` chains for one mode. Returns a new map. */
function resolveVars(vars, mode = 'light') {
  const out = { ...vars };
  for (const k of Object.keys(out)) {
    const ld = String(out[k]).match(/^light-dark\(\s*([^,]+?)\s*,\s*(.+?)\s*\)$/i);
    if (ld) out[k] = (mode === 'dark' ? ld[2] : ld[1]).trim();
  }
  for (let pass = 0; pass < 8; pass++) {
    let changed = false;
    for (const k of Object.keys(out)) {
      const ref = String(out[k]).match(/^var\(--([a-z0-9-]+)\)$/i);
      if (ref && out[ref[1]] && out[ref[1]] !== out[k]) {
        out[k] = out[ref[1]];
        changed = true;
      }
    }
    if (!changed) break;
  }
  return out;
}

const isHex = v => typeof v === 'string' && /^#?[0-9a-f]{3}([0-9a-f]{3})?$/i.test(v.trim());

/**
 * The contract pairs the gate enforces — `[fillToken, inkToken, threshold, role]`
 * (the 4th element is a short role label used in reporting; see evalPair).
 * The 12 categorical slots are generated; the heading/surface pairs are
 * explicit. These mirror LIGHT_PAIRS / DEEP_PAIRS / the heading assertions in
 * test/unit/palette/contrast.test.js one-for-one, PLUS the
 * categorical-edge graphical pair (① mark vs bg ≥ 3, WCAG 1.4.11) that the
 * three-layer contract requires and checkCatContrast enforces on shipped themes —
 * so a DERIVED (Fabricate) theme is held to the same edge floor as a hand-authored
 * one, in both canvas modes. (Its absence let derived themes ship ~2.7:1 dark-mode
 * marks while this audit stayed green.)
 */
function contractPairs() {
  const pairs = [];
  for (let i = 1; i <= 12; i++) pairs.push([`cat-${i}-fill`, 'cat-on-fill', AA, 'categorical-pale']);
  for (let i = 1; i <= 12; i++) pairs.push([`cat-${i}-mark`, 'cat-on-mark', AA, 'categorical-deep']);
  for (let i = 1; i <= 12; i++) pairs.push([`cat-${i}-mark`, 'bg', AA_LARGE, 'categorical-edge']);
  pairs.push(['bg', 'text-heading', AA, 'heading']);
  pairs.push(['bg-alt', 'text-heading', AA, 'heading']);
  // (Retired in #1181: the ['diagram-critical','cat-on-mark','alarm'] pair. Its only
  // renderer was the mermaid parse-error box, which now uses the gated error-chip
  // pair — --bg text on the --fail fill (recorded in tools/contrast-audit.js as
  // ['bg','fail'], whose convention is [fgToken, bgToken], NOT this module's
  // [fillToken, inkToken]). So --cat-on-mark no longer needs to clear
  // --diagram-critical, and forcing that coupled the alarm to the categorical-mark
  // tier in a way the achromatic diagram ramps couldn't satisfy.)
  return pairs;
}

/**
 * Extra content-tier pairs the *contract prose* (design/theming.md) requires
 * AA on but the current gate file does not yet assert — body / secondary /
 * label on the canvases, and the accent-container inks. Reported separately so
 * a caller can hold the studio to the stricter, fuller bar without conflating
 * it with what the shipped gate checks.
 */
function contentPairs() {
  return [
    ['bg', 'text-body', AA, 'body'],
    ['bg-alt', 'text-body', AA, 'body'],
    ['bg', 'text-secondary', AA, 'secondary'],
    ['bg-alt', 'text-secondary', AA, 'secondary'],
    ['bg', 'text-label', AA, 'label'],
    ['accent', 'on-accent', AA, 'on-accent'],
    ['accent-soft', 'on-accent-soft', AA, 'on-accent-soft'],
    ['accent-soft', 'accent-soft-body', AA, 'accent-soft-body'],
    ['bg', 'accent', AA, 'accent-text'],
  ];
}

/** Evaluate one `[fill, ink, threshold, role]` pair against a resolved map. */
function evalPair(resolved, [fill, ink, threshold, role]) {
  const fillHex = resolved[fill];
  const inkHex = resolved[ink];
  if (fillHex == null || inkHex == null) {
    return { fill, ink, role, threshold, status: 'missing', ratio: null };
  }
  if (!isHex(fillHex) || !isHex(inkHex)) {
    return { fill, ink, role, threshold, status: 'skipped', ratio: null, fillHex, inkHex };
  }
  const ratio = contrastRatio(fillHex, inkHex);
  return {
    fill,
    ink,
    role,
    threshold,
    fillHex,
    inkHex,
    ratio,
    status: ratio >= threshold ? 'pass' : 'fail',
  };
}

/**
 * Audit a token map for one mode. `level: 'gate'` (default) checks only what
 * the shipped contrast gate asserts; `level: 'full'` adds the content-tier and
 * accent-container pairs.
 *
 * Returns `{ mode, level, results, failures, missing, passed, total, ok }`.
 */
function auditVars(vars, { mode = 'light', level = 'gate' } = {}) {
  const resolved = resolveVars(vars, mode);
  const pairs = level === 'full' ? [...contractPairs(), ...contentPairs()] : contractPairs();
  const results = pairs.map(p => evalPair(resolved, p));
  const failures = results.filter(r => r.status === 'fail');
  const missing = results.filter(r => r.status === 'missing');
  const passed = results.filter(r => r.status === 'pass');
  return {
    mode,
    level,
    results,
    failures,
    missing,
    passed: passed.length,
    total: results.length,
    ok: failures.length === 0 && missing.length === 0,
  };
}

/** Audit both canvas modes; `ok` is true only if both pass. */
function auditBoth(vars, { level = 'gate' } = {}) {
  const light = auditVars(vars, { mode: 'light', level });
  const dark = auditVars(vars, { mode: 'dark', level });
  return { light, dark, ok: light.ok && dark.ok };
}

/**
 * A single foreground/background reading for the live meter — the numbers the
 * Workbench paints beside each editable pair.
 */
function meter(fgHex, bgHex) {
  const ratio = contrastRatio(fgHex, bgHex);
  return {
    ratio,
    rounded: Math.round(ratio * 100) / 100,
    AA: ratio >= 4.5,
    AALarge: ratio >= 3,
    AAA: ratio >= 7,
  };
}

module.exports = {
  resolveVars,
  contractPairs,
  contentPairs,
  auditVars,
  auditBoth,
  meter,
};
