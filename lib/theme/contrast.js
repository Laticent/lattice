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
 *
 * TWO PREDICATES, NOT ONE. Most rows are a WCAG contrast ratio between a canvas
 * and an ink (`evalPair`). A SEPARATION row is a different measurement — an OKLab
 * distance between two INKS, with no canvas in it at all (`evalSeparation`) — so
 * it is built by `separationPairs()` and carries `distance`, never `ratio`. Rows
 * of both kinds land in the same `results` array, tagged by `kind`, because the
 * point of the separation rows is that the surface a HUMAN reads shows them; a
 * parallel list nothing renders would reproduce the defect it exists to fix.
 * A consumer that only understands ratios can filter on `kind === 'contrast'`.
 */

const { contrastRatio, oklabDistance, AA, AA_LARGE } = require('./color.js');

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
 *
 * The `categorical-ink` rows are the same move for the same reason, one tier up
 * (#1457). `--cat-N-ink` is the slot's hue as LABEL TEXT on the two slide surfaces,
 * gated at AA on shipped palettes by `checkCatContrast` — which scans `themes/`, the
 * one population a derived theme never joins. Without these rows this audit could
 * not see the tier at all, so the browser-facing solver's whole "degrade rather than
 * throw" policy (lib/theme/cat-ink.js) reported a best-effort ink to nobody.
 */
function contractPairs() {
  const pairs = [];
  for (let i = 1; i <= 12; i++) pairs.push([`cat-${i}-fill`, 'cat-on-fill', AA, 'categorical-pale']);
  for (let i = 1; i <= 12; i++) pairs.push([`cat-${i}-mark`, 'cat-on-mark', AA, 'categorical-deep']);
  for (let i = 1; i <= 12; i++) pairs.push([`cat-${i}-mark`, 'bg', AA_LARGE, 'categorical-edge']);
  for (let i = 1; i <= 12; i++) pairs.push(['bg', `cat-${i}-ink`, AA, 'categorical-ink']);
  for (let i = 1; i <= 12; i++) pairs.push(['bg-alt', `cat-${i}-ink`, AA, 'categorical-ink']);
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
    // The inline-code chip ink. DELIBERATELY A LOWER BOUND, and the reason is worth stating
    // because a check that looks exact and isn't is how --cat-N-ink shipped: the chip does
    // not paint on `bg`/`bg-alt`, it paints on its OWN translucent wash over them
    // (`--code-inline-bg`, 10% currentColor), which is a computed color and not a token this
    // pair list can name. The real target is solved in derive.js `inkOnWash`, and it is
    // STRICTER than these two rows — so passing here does not prove the chip is legible,
    // while failing here proves it is not. Kept because the cheap direction still catches a
    // gross regression, not because it closes the question.
    ['bg', 'code-inline-fg', AA, 'code-chip'],
    ['bg-alt', 'code-inline-fg', AA, 'code-chip'],
  ];
}

/**
 * THE MUTED-TIER SEPARATION FLOOR — a CEILING on how close a de-emphasis ink may
 * sit to the body ink it exists to be quieter than.
 *
 * PINNED AS A LITERAL, deliberately not imported from `tools/check-ownership.js`
 * (`MUTED_SEPARATION_FLOOR`) even though the number is the same. A floor that moves
 * with its producer cannot fail for the reason that matters (#1720 §5). The
 * duplication is made safe by a test that asserts the two literals are equal —
 * `test/unit/palette/theme-contrast.test.js` reads both and compares them — so the
 * pair can be re-tuned together on purpose but never drift apart by accident.
 *
 * 0.030 is the shipped tree's worst committed separation with room to round:
 * cuoio/light sits at 0.0380 on `--text-muted` and 0.0384 on `--text-secondary`.
 * See engineering/decisions/2026-08-18-undeclared-color-tokens.md §3.
 */
const SEPARATION_FLOOR = 0.030;

/**
 * The de-emphasis pairs — `[quietToken, loudToken, floor, role]`. NOT contrast
 * pairs: there is no canvas in them. Each row asserts that an ink whose whole
 * contract is "quieter than body" is still perceptibly APART from body.
 *
 * WHY THIS EXISTS AT ALL. `checkMutedTierFloors` (tools/check-ownership.js) already
 * measures the muted row — but only over `themes/`, a population a theme fabricated
 * in the Studio never joins. This module is the meter the Studio actually shows, and
 * until now it had no separation concept: `lib/theme/derive.js` will manufacture
 * `--text-muted` byte-identical to `--text-body` from plausible essentials and every
 * row here stayed green (#1715 §9).
 *
 * WHY TWO ROWS AND NOT MORE. Measured across all 32 committed palettes x both modes,
 * and across `deriveTheme` output for the four STARTERS plus five hand-built
 * essential sets:
 *
 *   · muted^body      committed worst 0.0380 (cuoio/light) — clears the floor
 *                     everywhere; `deriveTheme` collapses it to 0.0000 on a palette
 *                     whose body already sits at its AA ceiling.  ROW.
 *   · secondary^body  committed worst 0.0384 (cuoio/light) — the same shape and
 *                     almost the same number, solved by the same AA repair a few
 *                     lines up in derive.js; `deriveTheme` emits it BYTE-IDENTICAL
 *                     to body on a near-ceiling essential set.  ROW.
 *   · muted^secondary committed worst 0.0021 (brina/light), and 0.0000-0.0049 on ALL
 *                     FOUR STARTERS in light mode. Both tiers land on the same
 *                     AA-repaired value by construction (`secondaryLight` is a mix of
 *                     body toward muted, then repaired to the same floor). A row here
 *                     would fire on everything the Studio ships. NOT A ROW.
 *   · muted-mark^muted exactly 0.0000 on 18 committed palette-modes, BY DESIGN —
 *                     derive.js keeps the author's value for the decoration tier
 *                     wherever it already clears 3:1.  NOT A ROW.
 *   · label^body      committed worst 0.0118 (cuoio/light). `--text-label` is
 *                     accent-hued and distinguished by HUE, not by a lightness step;
 *                     it is not a de-emphasis tier.  NOT A ROW.
 *
 * Present at BOTH audit levels: separation is a different predicate, not a stricter
 * contrast bar, so the gate/full split does not apply to it.
 */
function separationPairs() {
  return [
    ['text-muted', 'text-body', SEPARATION_FLOOR, 'muted-separation'],
    ['text-secondary', 'text-body', SEPARATION_FLOOR, 'secondary-separation'],
  ];
}

/**
 * Evaluate one `[quiet, loud, floor, role]` separation pair against a resolved map.
 *
 * Mirrors `evalPair`'s status vocabulary exactly — `missing` / `skipped` / `pass` /
 * `fail` — so every consumer that partitions on `status` keeps working. It carries
 * `distance` (OKLab dE) and holds `ratio` at `null`: putting a dE in the `ratio`
 * field would send a non-ratio number to every consumer that formats one.
 */
function evalSeparation(resolved, [quiet, loud, floor, role]) {
  const quietHex = resolved[quiet];
  const loudHex = resolved[loud];
  if (quietHex == null || loudHex == null) {
    return { kind: 'separation', quiet, loud, role, floor, status: 'missing', ratio: null, distance: null };
  }
  // `resolveVars` leaves `color-mix(...)` (and anything else it cannot reduce)
  // verbatim. A pair standing on one of those is SKIPPED, never silently passed —
  // the same call the contrast rows make, for the same reason. It also keeps
  // unreadable values away from `oklabDistance`, which THROWS rather than returning
  // NaN; an exception here takes out the Studio's whole audit panel, not one row.
  if (!isHex(quietHex) || !isHex(loudHex)) {
    return { kind: 'separation', quiet, loud, role, floor, status: 'skipped', ratio: null, distance: null, quietHex, loudHex };
  }
  const distance = oklabDistance(quietHex, loudHex);
  return {
    kind: 'separation',
    quiet,
    loud,
    role,
    floor,
    quietHex,
    loudHex,
    distance,
    ratio: null,
    // FAIL CLOSED — see evalPair. Unreachable behind the `isHex` gate above, and kept
    // as insurance for the day that gate widens; the reachable half of the contract
    // ("nothing unmeasurable becomes a pass, and nothing throws") is pinned as a
    // property test rather than by this line.
    status: Number.isFinite(distance) && distance >= floor ? 'pass' : 'fail',
  };
}

/** Evaluate one `[fill, ink, threshold, role]` pair against a resolved map. */
function evalPair(resolved, [fill, ink, threshold, role]) {
  const fillHex = resolved[fill];
  const inkHex = resolved[ink];
  if (fillHex == null || inkHex == null) {
    return { kind: 'contrast', fill, ink, role, threshold, status: 'missing', ratio: null };
  }
  if (!isHex(fillHex) || !isHex(inkHex)) {
    return { kind: 'contrast', fill, ink, role, threshold, status: 'skipped', ratio: null, fillHex, inkHex };
  }
  const ratio = contrastRatio(fillHex, inkHex);
  return {
    kind: 'contrast',
    fill,
    ink,
    role,
    threshold,
    fillHex,
    inkHex,
    ratio,
    // FAIL CLOSED, explicitly. `NaN >= threshold` is already false, but a check that
    // relies on that is one refactor away from `!(ratio < threshold)` and a silent
    // pass on an unreadable operand.
    status: Number.isFinite(ratio) && ratio >= threshold ? 'pass' : 'fail',
  };
}

/**
 * Audit a token map for one mode. `level: 'gate'` (default) checks only what
 * the shipped contrast gate asserts; `level: 'full'` adds the content-tier and
 * accent-container pairs.
 *
 * Returns `{ mode, level, results, separation, failures, missing, passed, total, ok }`.
 * `results` holds BOTH row kinds (see the module header); `separation` is a view
 * over the `kind === 'separation'` subset of the same rows.
 */
function auditVars(vars, { mode = 'light', level = 'gate' } = {}) {
  const resolved = resolveVars(vars, mode);
  const pairs = level === 'full' ? [...contractPairs(), ...contentPairs()] : contractPairs();
  // Separation rows go LAST so a consumer reading `results` in order sees the
  // contrast contract first, exactly as it did before this tier existed.
  const results = [
    ...pairs.map(p => evalPair(resolved, p)),
    ...separationPairs().map(p => evalSeparation(resolved, p)),
  ];
  const failures = results.filter(r => r.status === 'fail');
  const missing = results.filter(r => r.status === 'missing');
  const passed = results.filter(r => r.status === 'pass');
  return {
    mode,
    level,
    results,
    // The separation rows on their own, for a caller that wants the tier without
    // re-deriving the `kind` filter. They are ALSO in `results` — this is a view,
    // not a second population, so `ok` counts each row exactly once.
    separation: results.filter(r => r.kind === 'separation'),
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
  separationPairs,
  SEPARATION_FLOOR,
  auditVars,
  auditBoth,
  meter,
};
