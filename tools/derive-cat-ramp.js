#!/usr/bin/env node
/**
 * Re-place the `--cat-1..12-fill` / `--cat-1..12-mark` ramps so the twelve
 * categorical slots are actually tellable apart, and write the result back into
 * `themes/*.css`.
 *
 * WHY THIS EXISTS AS A COMMITTED TOOL. The 2026-07-16 recipe that produced today's
 * fill/mark values was run once and never committed
 * (`2026-07-15-categorical-token-contract.md` §"Shipped" describes it in prose, and
 * the script is gone). So the shipped ramps could be measured but not re-derived,
 * and the next person to move one had no instrument. This is that instrument.
 *
 * IT IS NOT WIRED INTO `npm run build`, and that is deliberate — unlike
 * `derive-cat-ink.js`, which owns its output outright. The fill/mark cycles stay
 * hand-authorable: this tool moves LIGHTNESS to satisfy a floor and touches nothing
 * else, so a designer can re-hue a slot and re-run it. What holds the line between
 * runs is `test/unit/palette/cat-adjacency-floor.test.js`, not this file.
 *
 * THE CONTRACT IT SOLVES FOR, per `2026-09-01-categorical-ramp-retune.md`:
 *   - WASH tier, all 66 pairs >= 0.0295 — the Mermaid pie paints the wash with no
 *     per-slot stroke, so it is the whole discrimination channel and slot 5 is
 *     compared against slot 10 as readily as against slot 6.
 *   - SATURATED tier, 11 adjacent pairs >= 0.1050 — all-pairs is unreachable there
 *     without re-hueing brand colors (five ramps fail; see the note).
 *   - Palettes whose categorical channel is TEXTURE, not hue (`a11y-*`, `onyx`,
 *     `concrete`), are exempt on the saturated tier only, per §6 of the contract.
 *     Their wash is held like everyone else's.
 *
 * BOTH FLOORS ARE THE REFERENCES' OWN. They are what `indaco` and `cuoio` already
 * reach, so this tool raises the catalog to Adam & Eve rather than to a number
 * somebody picked. It never moves a reference pair that is already at the floor,
 * which is what keeps the floor itself from drifting upward as the catalog improves.
 *
 * THE BANDS ARE CONTRAST FACTS, computed per slot from the palette's own tokens: a
 * mark may only go where it still clears `--bg` at 3:1 and `--cat-on-mark` at 4.5:1,
 * a fill only where it still clears `--cat-on-fill` at 4.5:1 — the same thresholds
 * `checkCatContrast` enforces. So a solved value cannot break that gate.
 *
 * AFTER RUNNING IT: `npm run build` regenerates the `--cat-N-ink` blocks from the
 * new marks (never hand-edit those), and the literal ramp mirrors in
 * `lib/core/accessibility-textures.js` must be re-synced — `npm test` fails loudly
 * if they drift, which is a gate this change added.
 *
 * Usage:
 *   node tools/derive-cat-ramp.js            # rewrite the ramps
 *   node tools/derive-cat-ramp.js --check    # verify the committed ramps meet the contract
 *   node tools/derive-cat-ramp.js --report   # print what it would do, write nothing
 */

const fs = require('node:fs');
const path = require('node:path');
const { resolveTokenExpr } = require('../lib/core/resolve-token-expr.js');
const { hexToOklab, oklabDistance, contrastRatio, withLightness } = require('../lib/theme/color.js');
const { solveRamp, requiredPairs, tierOf, FLOOR, SCOPE } = require('../lib/theme/cat-ramp.js');
const { solveInkArm } = require('../lib/theme/cat-ink.js');
const { mergedVars } = require('./composed-contrast.js');

const ROOT = path.join(__dirname, '..');
const THEMES = path.join(ROOT, 'themes');

/**
 * §6's texture-first identities: their categorical channel is `--cat-N-texture`,
 * not hue, so the saturated floor measures the wrong thing. Wash is NOT exempt —
 * that is the channel the pie paints.
 */
const TEXTURE_FIRST = new Set(['a11y-base', 'onyx', 'concrete']);
/**
 * Ramps that cannot reach their floor, with the value they DO reach. Each one is a
 * measured conflict between this floor and another contract, not a rounding excuse,
 * and `--check` fails on a stale entry as well as an eroded one — so an entry cannot
 * outlive the reason for it.
 *
 * `a11y-base` declares FLAT hex, so one mark ramp serves both canvases and owes a
 * legible `--cat-N-ink` arm on both. Reaching 0.0295 needs the ramp to span L
 * 0.200–0.562, and `derive-cat-ink` cannot separate twelve inks clear of the #000000
 * canvas over that span. 0.0285 is the widest ramp whose ink arm still solves — a
 * 58% improvement on the shipped 0.018, one thousandth short of the floor.
 *
 * `concrete`'s dark marks lost the same veto at EVERY rung, so that ramp is shipped
 * untouched at 0.0013: its dark canvas and its `--bg-alt` sit close enough together
 * that widening the marks at all costs the ink arm. Its LIGHT fills — the ramp the
 * Mermaid pie actually paints on the light canvas — did take §6's spread.
 */
const SANCTIONED_SHORTFALLS = {
  'a11y-base light mark wash': 0.0285,
  'a11y-base dark mark wash': 0.0285,
  'concrete dark mark wash': 0.0013,
};
/** The contrast thresholds `checkCatContrast` holds; the bands mirror them exactly. */
const EDGE_FLOOR = 3.0;
const TEXT_FLOOR = 4.5;
/**
 * `checkCatContrast` fails a slot whose fill and mark are under 1.25:1 apart — the
 * fill==mark collapse. Hold a margin over it, because solving to exactly 1.25 lands
 * on the wrong side once the value rounds to hex (`onyx` slot 12 came back at 1.2499
 * on the first run) — but hold a SMALL one. At 1.30 the margin was stricter than the
 * gate, so it declared shipped values infeasible; the band then had no interval
 * containing the shipped lightness, and the fallback moved the mark to the far side
 * of its own fill. A margin that rejects the tree it is measuring is too big.
 */
const COLLAPSE_FLOOR = 1.26;
const SLOTS = 12;

/** Palettes that declare their own cycle. The `-dark` faces just @import and flip scheme. */
function cycleOwners() {
  return fs.readdirSync(THEMES)
    .filter((f) => f.endsWith('.css'))
    .map((f) => f.replace(/\.css$/, ''))
    .filter((n) => /--cat-1-mark\s*:/.test(fs.readFileSync(path.join(THEMES, `${n}.css`), 'utf8')))
    .sort();
}

/**
 * Where slot `hex` may go and still satisfy the contrast contract, as [lo, hi].
 *
 * The `a11y-*` family skips the hue-contract layers here, mirroring
 * `checkCatContrast` (`tools/check-ownership.js`, `if (/^a11y-/.test(name)) continue`).
 * That is not a courtesy: `a11y-base` pins `color-scheme: light` at `:root` and
 * declares FLAT inks, so resolving it against a dark canvas asks it to satisfy a
 * contract it never ships under — and the two halves of that phantom contract
 * (white ink on the mark, mark on black) squeeze the band to nothing.
 *
 * SKIPPING ①–③ IS NOT THE SAME AS NO BOUND. Layer ④ still binds the family — it
 * binds the derived INK, which must clear 4.5:1 against the canvas on all twelve
 * slots at once. An early cut of this file left the a11y band fully open, the ramp
 * spent its new range downward (slot 1 walked from #2e2e2e to #141414, a hair off the
 * #000000 canvas), and `derive-cat-ink` threw in strict mode. What holds it back is
 * the collapse floor below, not a special case: with each mark kept clear of its own
 * fill, the ramp settles at L 0.239–0.564, and the ink arm solves there with room
 * (measured by walking the ramp's bottom down against `solveInkArm` — it stays green
 * to 0.239 and the shipped bottom is 0.301).
 */
function bandFor(hex, kind, { bg, onFill, onMark }, unbound, counterpart) {
  const contrastOk = kind === 'fill'
    ? (h) => contrastRatio(onFill, h) >= TEXT_FLOOR
    : (h) => contrastRatio(h, bg) >= EDGE_FLOOR && contrastRatio(onMark, h) >= TEXT_FLOOR;
  // The slot's OTHER tier, if it is already placed. This one is not a floor on a
  // ratio against a fixed ink — it is a hole punched in the middle of the band,
  // because a lightness NEAR the counterpart's collapses the two tiers into one
  // color. So the band is scanned as intervals and the one holding the shipped
  // value is returned, rather than [min, max] spanning straight across the hole.
  const ok = (h) => (unbound || contrastOk(h))
    && (!counterpart || contrastRatio(h, counterpart) >= COLLAPSE_FLOOR);

  const shippedL = hexToOklab(hex).L;
  const intervals = [];
  let open = null;
  for (let L = 0.02; L <= 0.99; L += 0.002) {
    if (ok(withLightness(hex, L))) { if (open === null) open = L; }
    else if (open !== null) { intervals.push([open, L - 0.002]); open = null; }
  }
  if (open !== null) intervals.push([open, 0.99]);
  if (!intervals.length) return null;
  const holding = intervals.find(([lo, hi]) => shippedL >= lo - 1e-9 && shippedL <= hi + 1e-9);
  if (holding) return holding;
  // The shipped value sits in a hole — usually a hair outside the collapse margin.
  // Take the NEAREST interval, not the widest: the widest is often on the far side
  // of the counterpart tier, and moving a mark across its own fill to gain range
  // inverts the slot's two tiers to satisfy a rounding margin.
  const distance = ([lo, hi]) => (shippedL < lo ? lo - shippedL : shippedL - hi);
  return intervals.reduce((a, b) => (distance(b) < distance(a) ? b : a));
}

/** Everything one palette needs, per canvas mode. */
function readMode(palette, isDark) {
  const vars = mergedVars(palette);
  const at = (name) => String(resolveTokenExpr(vars[name], vars, isDark)).trim();
  const cycle = (kind) => Array.from({ length: SLOTS }, (_, i) => at(`cat-${i + 1}-${kind}`));
  const fill = cycle('fill');
  const mark = cycle('mark');
  if ([...fill, ...mark].some((h) => !/^#[0-9a-f]{6}$/i.test(h))) return null;
  return {
    fill,
    mark,
    saturated: tierOf(fill, mark),
    surfaces: { bg: at('bg'), onFill: at('cat-on-fill'), onMark: at('cat-on-mark') },
  };
}

/** Solve one palette's four ramps (fill/mark x light/dark). */
function solvePalette(palette) {
  const out = { palette, ramps: [], errors: [], shortfalls: [] };
  // A FLAT-HEX palette declares one value per token instead of `light-dark(L, D)`,
  // so a single ramp serves BOTH canvases and owes a legible ink arm on both. Every
  // other palette solves its two canvases as separate ramps, and vetoing a light-mode
  // ramp against the dark canvas judges it on a render that never happens — which
  // cost `onyx` 0.0026 of separation before this was split out.
  const flat = !/--cat-1-fill:\s*light-dark\(/.test(fs.readFileSync(path.join(THEMES, `${palette}.css`), 'utf8'));
  for (const isDark of [false, true]) {
    const read = readMode(palette, isDark);
    if (!read) { out.errors.push(`${palette} ${isDark ? 'dark' : 'light'}: a categorical slot did not resolve to a color.`); continue; }
    // SATURATED FIRST, then the wash against the saturated tier's SOLVED values. The
    // fill-vs-mark collapse floor couples the two ramps, and solving them in this
    // order makes the coupling exact instead of approximate: the saturated tier is
    // the more constrained of the two, so it moves first and the wash gives way.
    const order = read.saturated === 'fill' ? ['fill', 'mark'] : ['mark', 'fill'];
    const placed = {};
    for (const kind of order) {
      const tier = read.saturated === kind ? 'sat' : 'wash';
      const hexes = read[kind];
      if (tier === 'sat' && TEXTURE_FIRST.has(palette)) {
        placed[kind] = hexes;
        out.ramps.push({ mode: isDark ? 'dark' : 'light', kind, tier, hexes, exempt: true, moved: 0 });
        continue;
      }
      const other = kind === 'fill' ? placed.mark : placed.fill;
      const bands = hexes.map((h, i) => bandFor(h, kind, read.surfaces, /^a11y-/.test(palette), other?.[i]));
      if (bands.some((b) => !b)) {
        out.errors.push(`${palette} ${isDark ? 'dark' : 'light'} ${kind}: a slot has no lightness that satisfies the contrast contract — the hue itself has to change.`);
        continue;
      }
      // Rounded to the same 4dp the solver reports, so an untouched ramp cannot trip
      // the anti-erosion guard below on a float tail.
      const before = +Math.min(...requiredPairs(SCOPE[tier], SLOTS).map(([i, j]) => oklabDistance(hexes[i], hexes[j]))).toFixed(4);
      // A MARK RAMP OWES A LEGIBLE INK ARM. `--cat-N-ink` is derived from the mark by
      // `derive-cat-ink.js`, which in strict mode refuses a ramp it cannot lift clear
      // of the canvas while keeping twelve inks apart — and a ramp that widens itself
      // to clear this floor can walk into exactly that. Veto such a ramp HERE, so the
      // solve drops a rung of margin and tries again, instead of leaving a build that
      // only fails two tools later with no way back.
      const canvases = flat ? [false, true] : [isDark];
      const accept = kind !== 'mark' ? null : (candidate) => {
        const vars = mergedVars(palette);
        for (const dark of canvases) {
          try {
            solveInkArm({
              marks: candidate,
              bg: String(resolveTokenExpr(vars.bg, vars, dark)).trim(),
              bgAlt: String(resolveTokenExpr(vars['bg-alt'], vars, dark)).trim(),
              strict: true,
              label: palette,
              arm: dark ? 'dark' : 'light',
            });
          } catch { return false; }
        }
        return true;
      };
      const r = solveRamp(hexes, { floor: FLOOR[tier], scope: SCOPE[tier], bandLo: bands.map((b) => b[0]), bandHi: bands.map((b) => b[1]), accept });
      // A CONSTRAINT SET WITH NO SOLUTION STILL RETURNS A RAMP, and cyclic projection
      // under infeasibility settles on a compromise that can be WORSE than where it
      // started — `a11y-base` came back at 0.016 against a shipped 0.018 while the
      // band was over-tight. A re-tune that erodes the thing it is re-tuning is worse
      // than no re-tune, so the shipped ramp wins any tie it would lose.
      if (r.worst < before - 1e-9) {
        out.errors.push(`${palette} ${isDark ? 'dark' : 'light'} ${kind} (${tier}): the solve came back at ${r.worst}, below the shipped ${before} — refusing to erode it. The band is too tight for the ${FLOOR[tier]} floor; widen it or exempt the tier.`);
        placed[kind] = hexes;
        out.ramps.push({ mode: isDark ? 'dark' : 'light', kind, tier, hexes, before, worst: before, worstPair: '-', moved: 0, ok: false });
        continue;
      }
      const key = `${palette} ${isDark ? 'dark' : 'light'} ${kind} ${tier}`;
      if (r.vetoed && !(key in SANCTIONED_SHORTFALLS)) out.errors.push(`${key}: no ramp that clears the floor leaves --cat-N-ink solvable. Shipping the ramp untouched at ${r.worst}; sanction it with its reason, or widen the canvas contrast it is fighting.`);
      else if (r.vetoed) out.shortfalls.push(`${key}: shipped untouched at ${r.worst} — every wider ramp costs the ink arm (sanctioned).`);
      else if (!r.ok) out.shortfalls.push(`${palette} ${isDark ? 'dark' : 'light'} ${kind} (${tier}): ${before} -> ${r.worst}, still ${(FLOOR[tier] - r.worst).toFixed(4)} short of the ${FLOOR[tier]} floor on pair ${r.worstPair}.`);
      placed[kind] = r.hexes;
      out.ramps.push({ mode: isDark ? 'dark' : 'light', kind, tier, hexes: r.hexes, before, ...r });
    }
  }
  return out;
}

/** Rewrite one declaration's value, preserving layout, spacing and hex case. */
function spliceValue(css, slot, kind, light, dark, flat) {
  const re = new RegExp(`(--cat-${slot}-${kind}:\\s*)(light-dark\\(\\s*#[0-9a-fA-F]{6}\\s*,\\s*#[0-9a-fA-F]{6}\\s*\\)|#[0-9a-fA-F]{6})`);
  const m = css.match(re);
  if (!m) return { css, ok: false };
  const upper = /[A-F]/.test(m[2]);
  const cased = (h) => (upper ? h.toUpperCase() : h.toLowerCase());
  const value = flat ? cased(light) : `light-dark(${cased(light)}, ${cased(dark)})`;
  return { css: css.replace(re, `$1${value}`), ok: true };
}

function main() {
  const mode = process.argv.includes('--check') ? 'check' : process.argv.includes('--report') ? 'report' : 'write';
  const errors = [];
  const shortfalls = [];
  const committed = new Map();
  let wrote = 0;
  let movedTotal = 0;
  const rows = [];

  for (const palette of cycleOwners()) {
    const solved = solvePalette(palette);
    errors.push(...solved.errors);
    shortfalls.push(...solved.shortfalls);
    const file = path.join(THEMES, `${palette}.css`);
    let css = fs.readFileSync(file, 'utf8');
    const flat = !/--cat-1-fill:\s*light-dark\(/.test(css);
    let moved = 0;

    for (const kind of ['fill', 'mark']) {
      const light = solved.ramps.find((r) => r.mode === 'light' && r.kind === kind);
      const dark = solved.ramps.find((r) => r.mode === 'dark' && r.kind === kind);
      if (!light || !dark) continue;
      if (flat && light.hexes.some((h, i) => h.toLowerCase() !== dark.hexes[i].toLowerCase())) {
        errors.push(`${palette}: ${kind} is declared as a flat hex (one value for both canvases) but the two modes solved to different values — the palette would need light-dark() to carry this.`);
        continue;
      }
      for (let i = 0; i < SLOTS; i += 1) {
        const next = spliceValue(css, i + 1, kind, light.hexes[i], dark.hexes[i], flat);
        if (!next.ok) { errors.push(`${palette}: could not find a --cat-${i + 1}-${kind} declaration to rewrite.`); continue; }
        if (next.css !== css) moved += 1;
        css = next.css;
      }
    }

    movedTotal += moved;
    for (const r of solved.ramps) {
      if (r.exempt) continue;
      committed.set(`${palette} ${r.mode} ${r.kind} ${r.tier}`, r.before);
      rows.push(`${palette.padEnd(11)} ${r.mode.padEnd(5)} ${r.kind.padEnd(4)} ${r.tier.padEnd(4)} ${String(r.before).padEnd(7)} -> ${String(r.worst).padEnd(7)} (floor ${FLOOR[r.tier]}, worst pair ${r.worstPair}, ${r.moved}/12 slots)`);
    }

    if (mode === 'write' && moved) { fs.writeFileSync(file, css); wrote += 1; }
  }

  // `--check` asks whether the COMMITTED ramps meet the contract, not whether
  // re-running this tool reproduces them byte for byte. The distinction matters
  // because the fill/mark cycles stay hand-authorable (see the header): a designer
  // who re-hues a slot and re-solves lands somewhere slightly different from a
  // designer who re-solves from the already-solved values, and neither is wrong. What
  // has to hold is the floor.
  if (mode === 'check') {
    for (const [key, reached] of Object.entries(SANCTIONED_SHORTFALLS)) {
      const seen = committed.get(key);
      if (seen === undefined) errors.push(`${key} is listed as a sanctioned shortfall but no such ramp was measured — the entry is stale.`);
      else if (seen >= FLOOR[key.endsWith('sat') ? 'sat' : 'wash']) errors.push(`${key} is listed as a sanctioned shortfall but now reaches ${seen}, at or above its floor — delete the entry.`);
      else if (seen < reached - 1e-9) errors.push(`${key} eroded: sanctioned at ${reached}, now ${seen}.`);
    }
    for (const [key, seen] of committed) {
      const tier = key.endsWith('sat') ? 'sat' : 'wash';
      if (seen < FLOOR[tier] && !(key in SANCTIONED_SHORTFALLS)) {
        errors.push(`${key} sits at ${seen}, below the ${FLOOR[tier]} floor, and is not a sanctioned shortfall. Run \`node tools/derive-cat-ramp.js\`, or add the entry with its reason.`);
      }
    }
  }
  if (mode !== 'check') console.log(rows.join('\n'));
  // A SHORTFALL IS NOT AN ERROR. A palette can be improved as far as its own
  // contract allows and still not reach the floor; saying so is the point, and
  // burying it in an exit code would just get the tool switched off.
  if (shortfalls.length) {
    console.log(`\nshort of the floor, improved as far as the palette allows:\n  ${shortfalls.join('\n  ')}`);
  }
  if (errors.length) {
    console.error(`\nderive-cat-ramp: ${errors.length} problem(s)\n  ${errors.join('\n  ')}`);
    process.exit(1);
  }
  if (mode === 'check') console.log(`derive-cat-ramp: ${cycleOwners().length} palettes meet the ramp contract.`);
  else if (mode === 'write') console.log(`\nderive-cat-ramp: rewrote ${movedTotal} value(s) across ${wrote} palette(s).`);
  else console.log(`\nderive-cat-ramp: would rewrite ${movedTotal} value(s).`);
}

if (require.main === module) main();
module.exports = { solvePalette, cycleOwners, bandFor, FLOOR, SCOPE, TEXTURE_FIRST, SANCTIONED_SHORTFALLS };
