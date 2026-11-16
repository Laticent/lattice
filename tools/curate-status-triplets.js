#!/usr/bin/env node
/**
 * curate-status-triplets — solve each brand theme's status TRIPLET (fill, ink on it, edge) and write it into the theme.
 *
 * The contract (engineering/decisions/2026-11-16-status-triplets.md), per brand theme, per `marks:` intensity.
 *
 * THE LIGHT FACE curates a triplet:
 *   FILL   each status solid clears 4.5:1 AS PAINTED against every surface a status mark sits on: the slide, the
 *          card (`--bg-alt`), the hero tile (`--accent-soft`), its own status row tint (`--X-bg` over the slide) and a
 *          kanban card, keyline or washed in that status (computed per candidate fill, since the wash is the fill's),
 *          so it keeps 3:1 at the back of a lit hall (`npm run check:glance`).
 *   INK    the text and drawn mark ON the fill is the slide's own paper, and clears 4.5:1 on it.
 *   EDGE   the fill's border is the fill itself: it already clears 4.5:1 off every surface.
 *   HUE    each status takes the hue of the theme's own brand or chart color nearest its band (pass green, warn amber,
 *          fail red, info blue), so the trio reads as the theme's and not a stock traffic light.
 *   URGENCY  blocked is never quieter than at risk: fail stands off the slide at least as far as warn does, and is at
 *          least as saturated.
 *   RING   warn and fail wear a SIGNAL ring at the opposite lightness, >= 3.2:1 against both intensities' fill.
 *   Inside those limits it picks the lightness closest to a designed target (`TARGET`, L 0.44-0.52).
 *
 * THE DARK FACE is a chart solid like the categories beside it (the owner's call: one design language over back-row
 * reach), solved the way lib/theme/chart-solids.js `solveStatusSet` solves it: the one ink `--on-mark` at 4.6:1 on
 * the fill, 3:1 off the slide, each status at its `DARK_SPREAD` position (at risk lightest, done deepest, blocked
 * between and the most saturated), `STATUS_CHROMA` scaled by the palette's strength, the theme's hues held inside
 * `HUE_BAND`, a bright ring 2:1 off the fill and 3.2:1 off every dark surface, and an edge in the status ink `--X`.
 * Where the trio would keep too little colorblind separation or sit on the accent, done turns toward blue-green and
 * blocked toward red, the least total turn that holds.
 *
 * BOTH FACES:
 *   CVD    the pass / warn / fail fills keep at least `--keep` of their recorded colorblind separation, pair by pair,
 *          under every simulated deficiency (test/fixtures/status-fill-cvd-baseline.json; lib/theme/cvd.js). The default,
 *          1, is the ratchet test/unit/palette/cvd-trio-floor.test.js holds, so a rerun can never erode it. The
 *          2026-11-16 retune ran at `--keep=0.5` against the pre-triplet record, the owner's pick.
 *   ACCENT every status fill sits at least 0.08 (OKLab) from the theme's accent, so an at-risk pill cannot read as
 *          the gold of a KPI number beside it.
 *   SHADE  `--status-shade-mark`, what a mark ON a status solid steps toward, lies away from the status ink.
 *
 * The `a11y-*` palettes are never touched: they curate their own colorblind floors and keep the one ink.
 *
 * Usage:
 *   node tools/curate-status-triplets.js [theme...] [--keep=1] [--baseline=FILE] [--check]
 * Without `--check` it rewrites the triplet tokens in each theme's status block (the block must already carry the
 * triplet tokens, so the first adoption is a reviewed edit, not a silent insert). `--check` writes nothing and exits 1
 * when a theme's shipped values fall outside the contract above.
 */
const fs = require('node:fs');
const path = require('node:path');
const ROOT = path.join(__dirname, '..');
const { mergedVars, listAllThemes } = require('./composed-contrast.js');
const { resolveTokenExpr } = require('../lib/core/resolve-token-expr.js');
const { simulate } = require('../lib/theme/cvd.js');
const { oklabDistance, contrastRatio: cr, hexToOklch, oklchToHex } = require('../lib/core/color.js');
const { SIGNAL, toneUnderWhite, brightFill, DARK_SPREAD, STATUS_CHROMA, HUE_BAND, SIGNAL_BAND, SIGNAL_DARK_FILL, CAT_DARK } = require('../lib/theme/chart-solids.js');

const TYPES = ['protanopia', 'deuteranopia', 'tritanopia', 'achromatopsia'];
const TRIO = ['pass', 'warn', 'fail'];
const ALL = ['pass', 'warn', 'fail', 'info', 'mute'];
const FILL_MIN = 4.5;
const INK_MIN = 4.5;
/** Centre hue and half-width of each status's band, in OKLCH degrees. */
const BAND = { pass: [150, 40], warn: [75, 25], fail: [22, 25], info: [250, 55] };
/** Blocked is RED on both faces, whatever the theme's nearest color: a raspberry or a magenta reads as a category, and
 * an orange as at risk, so the theme's hue is held inside this range (the meaning outranks the family match here). */
const FAIL_RED = [20, 32];
/** The dark face's colorblind turn may take blocked a few degrees deeper toward crimson, never past this. */
const FAIL_TURN_FLOOR = 17;
const clampRed = (h) => Math.min(FAIL_RED[1], Math.max(FAIL_RED[0], ((h + 180) % 360) - 180));
/** On the light face at risk sits at least this much lighter than blocked, so the two exceptions never read as one
 * heavy mass (the order the dark face takes from `DARK_SPREAD`, and `main`'s light bars, where at risk is lightest). */
const LIGHT_SPREAD = 0.06;
/** On the light face blocked must READ red, not maroon or brown: a deep, saturated fill reads as a dark earth tone. */
const LIGHT_RED = { L: 0.38, C: 0.14 };
/** A light face that cannot take the full spread, named with the spread it does take and why; held by the audit. */
const SPREAD_EXEMPT = {
  concrete: { spread: 0.02, why: 'concrete\'s light slide is a mid-gray (#B8B8B5), and its row tint darkens it further, so a fill that '
    + 'clears 4.5:1 against every surface sits at L 0.35 or deeper; under that ceiling a trio 0.03 apart or more keeps '
    + 'less than half its colorblind separation. 0.02 is the reachable maximum.' },
};
const spreadFor = (theme) => SPREAD_EXEMPT[theme]?.spread ?? LIGHT_SPREAD;
const TARGET = { light: { pass: 0.46, warn: 0.52, fail: 0.44, info: 0.46, mute: 0.5 } };
const ACCENT_MIN = 0.08;
/**
 * A face where the accent floor cannot be met with the rest of the contract, named with the floor it does meet and why.
 * Not a waiver: the audit holds the face to its own floor, so it can only improve. Fails on a stale entry.
 */
const ACCENT_EXEMPT = Object.fromEntries(['burgundy', 'cuoio', 'mustard'].map((t) => [`${t}:light`, { floor: 0.04,
  why: 'cuoio and mustard: at risk sits beside a gold accent, and at the full 0.08 floor it could only stay apart by going '
    + 'darker, so blocked had to sink below it and read maroon-black rather than red. Burgundy: its accent is a deep red, '
    + 'so a blocked that reads red (LIGHT_RED) sits 0.048 from it. At 0.04 both exceptions read as themselves; the drawn '
    + 'mark and the pill still set a status apart from a decorative accent.' }]));
const accentFloor = (theme, face) => ACCENT_EXEMPT[`${theme}:${face}`]?.floor ?? ACCENT_MIN;
/** A dark-face status fill off its slide: the chart solid's floor (lib/theme/chart-solids.js `darkTone`). */
const DARK_OFF_SLIDE = 3.05;
const VIVID_BOOST = 1.35;
/** The recorded table carries four decimals; at the ratchet (`--keep=1`) this absorbs that rounding and nothing more,
 * the same tolerance test/unit/palette/cvd-trio-floor.test.js applies (`EROSION_TOLERANCE`). */
const TABLE_ROUNDING = 0.002;
const WINDOW = 0.16;

const hueDist = (a, b) => { const d = Math.abs(a - b) % 360; return d > 180 ? 360 - d : d; };
const ok = (L, C, h) => oklchToHex({ L, C, h }).toUpperCase();

function parseArgs(argv) {
  const o = { themes: [], keep: 1, baseline: path.join(ROOT, 'test/fixtures/status-fill-cvd-baseline.json'), check: false };
  for (const a of argv) {
    if (a.startsWith('--keep=')) o.keep = Number(a.slice(7));
    else if (a.startsWith('--baseline=')) o.baseline = path.resolve(a.slice(11));
    else if (a === '--check') o.check = true;
    else o.themes.push(a);
  }
  if (!(o.keep >= 0 && o.keep <= 1)) throw new Error('--keep is a share of the recorded separation, 0..1');
  return o;
}

/** The theme's own colors, its slides and its paper / night: what the triplet is anchored on. */
// The kanban card, as lib/plugins/chart-family/kinds/kanban/kanban.styles.css paints it (`.kanban-card` and the washed
// `[data-s]` rule), over `--state-X-fill` from chart-family.styles.css. Keep these mixes in step with those two files;
// test/unit/tools/curate-status-triplets.test.js fails when they drift.
const KANBAN = {
  lift: 'color-mix(in oklab, var(--bg-alt) 88%, white)',
  keyline: { light: 'color-mix(in oklab, var(--bg-alt) 92%, var(--border))', dark: 'color-mix(in oklab, var(--bg-alt) 72%, var(--border))' },
  wash: { light: 'color-mix(in oklab, var(--cstx-hue) 24%, var(--bg))', dark: 'color-mix(in oklab, var(--cstx-hue) 50%, black)' },
  mute: { light: 'color-mix(in oklab, var(--cstx-hue) 22%, var(--bg))', dark: 'color-mix(in oklab, var(--cstx-hue) 46%, black)' },
  card: { light: 'color-mix(in oklab, var(--cstx-wash) 55%, var(--bg-alt))', dark: 'color-mix(in oklab, var(--cstx-wash) 26%, var(--cstx-lift))' },
};

function themeFacts(theme, V = mergedVars(theme)) {
  const get = (t, dark) => { const v = resolveTokenExpr(V[t], V, dark); return /^#[0-9a-f]{6}$/i.test(String(v).trim()) ? String(v).trim().toUpperCase() : null; };
  const anchors = Object.keys(V).filter((k) => /^brand-|^accent$|^chart-cat[1-8]$/.test(k)).map((k) => [k, get(k, false)]).filter((x) => x[1]);
  const anchor = {};
  for (const [s, [center, half]] of Object.entries(BAND)) {
    let best = null;
    for (const [k, h] of anchors) {
      const o = hexToOklch(h);
      if (o.C < 0.05) continue;
      const d = hueDist(o.h, center);
      if (d <= half && (!best || d < best.d)) best = { d, from: k, h: o.h, c: o.C };
    }
    anchor[s] = best ? { from: best.from, h: best.h, c: Math.min(0.18, Math.max(0.1, best.c)) } : { from: 'band', h: center, c: 0.13 };
  }
  anchor.mute = { from: 'neutral', h: anchor.info.h, c: 0.03 };
  // Every surface a status mark sits on, by name: the slide, the card, the hero tile, its own row tint over the slide,
  // and a kanban card, plain (lifted on dark) or washed in the status's own fill. A surface that does not resolve is an
  // error, never a silent skip: a dropped surface would let `--check` pass a fill it never measured.
  const hex = (v) => (/^#[0-9a-f]{6}$/i.test(String(v)) ? String(v).toUpperCase() : null);
  const over = (expr, dark, bg) => {
    const v = String(resolveTokenExpr(V[expr], V, dark) || '');
    if (hex(v)) return hex(v);
    const m = v.match(/^rgba\((\d+),\s*(\d+),\s*(\d+),\s*([\d.]+)\)$/);
    if (!m) throw new Error(`${theme}: --${expr} resolves to "${v}" on the ${dark ? 'dark' : 'light'} face; status fills cannot be checked against it`);
    const a = Number(m[4]), b = [1, 3, 5].map((i) => parseInt(bg.slice(i, i + 2), 16));
    return `#${[1, 2, 3].map((i, k) => Math.round(Number(m[i]) * a + b[k] * (1 - a)).toString(16).padStart(2, '0')).join('')}`.toUpperCase();
  };
  const kanbanCard = (st, fill, dark) => {
    const k = dark ? 'dark' : 'light';
    const W = { ...V, 'cstx-hue': fill, 'cstx-lift': KANBAN.lift, 'cstx-wash': (st === 'mute' ? KANBAN.mute : KANBAN.wash)[k] };
    const v = hex(resolveTokenExpr(KANBAN.card[k], W, dark));
    if (!v) throw new Error(`${theme}: the washed kanban card for ${st} does not resolve on the ${k} face`);
    return v;
  };
  // The light face: every surface a status fill is held against.
  const face = (dark) => {
    const bg = hex(get('bg', dark));
    if (!bg) throw new Error(`${theme}: --bg does not resolve to a hex on the ${dark ? 'dark' : 'light'} face`);
    const fixed = [['the slide', bg], ['--bg-alt', over('bg-alt', dark, bg)], ['--accent-soft', over('accent-soft', dark, bg)]];
    fixed.push(['a keyline kanban card', hex(resolveTokenExpr(KANBAN.keyline.light, V, false))]);
    const ground = Object.fromEntries(['pass', 'warn', 'fail'].map((st) => [st, over(`${st}-bg`, dark, bg)]));
    // Named surfaces, first name wins where two tokens paint the same color.
    const surfaces = (st, fill) => {
      const all = [...fixed, ...(ground[st] ? [[`--${st}-bg over the slide`, ground[st]]] : []), [`its washed kanban card`, kanbanCard(st, fill, dark)]];
      const seen = new Set();
      return all.filter(([, h]) => !seen.has(h) && seen.add(h)).map(([name, h]) => ({ name, hex: h }));
    };
    return { bg, text: get('bg', dark), accent: get('accent', dark), surfaces };
  };
  // The palette's strength, as tools/curate-chart-solids.js reads it: the mean chroma of its first six categories
  // against a typical palette's. A muted palette's status stays muted beside its categories, a rich one's rich.
  const catC = [1, 2, 3, 4, 5, 6].map((i) => get(`chart-cat${i}`, false)).filter((v) => /^#[0-9a-f]{6}$/i.test(v)).map((v) => hexToOklch(v).C);
  const strength = Math.min(1.2, Math.max(0.75, catC.reduce((a, c) => a + c, 0) / catC.length / 0.11));
  // The dark face: a chart solid is held against the slide alone, and its ring against every dark surface (as
  // chart-solids holds it); the cards are where a ring sits nearest the slide's lightness.
  const darkBg = hex(get('bg', true));
  if (!darkBg) throw new Error(`${theme}: --bg does not resolve to a hex on the dark face`);
  const dark = { bg: darkBg, accent: get('accent', true), ink: get('on-mark', true), ringGrounds: [darkBg, over('bg-alt', true, darkBg)] };
  return { get, anchor, strength, light: face(false), dark };
}

function separationOk(theme, intensity, face, fills, baseline, keep) {
  for (let i = 0; i < 3; i++) {
    for (let j = i + 1; j < 3; j++) {
      for (const ty of TYPES) {
        const was = baseline[`${theme}|${intensity}|${face}|${TRIO[i]}^${TRIO[j]}|${ty}`];
        if (was == null) continue;
        const floor = keep === 1 ? was - TABLE_ROUNDING : was * keep;
        if (oklabDistance(simulate(fills[TRIO[i]], ty), simulate(fills[TRIO[j]], ty)) < floor) return false;
      }
    }
  }
  return true;
}

/** Blocked is never quieter than at risk: at least as far off the slide, and at least as saturated. */
const urgent = (fills, bg) => cr(fills.fail, bg) >= cr(fills.warn, bg) && hexToOklch(fills.fail).C >= hexToOklch(fills.warn).C - 0.005;
/** No status fill reads as the theme's accent. */
const offAccent = (fills, accent, floor = ACCENT_MIN) => !accent || Object.values(fills).every((f) => oklabDistance(f, accent) >= floor);

/** Solve one theme: { light: { muted, vivid }, dark: { muted, vivid } }, each a status -> fill map. */
/**
 * THE DARK FACE IS A CHART SOLID (the owner's call, 2026-11-16): a status fill sits in the band the category fills sit
 * in, under the one ink, so a status chart and a category chart read as one design language. It is solved the way
 * lib/theme/chart-solids.js `solveStatusSet` solves it (white at 4.6:1, 3:1 off the slide, each status at its
 * `DARK_SPREAD` position: done deepest, at risk lightest, blocked between and the most saturated), with the theme's own
 * status hues and its palette's strength. A mark keeps an edge in its status ink, which stands it off a tinted row or a
 * card (2026-10-24-status-is-one-system.md §3), so the fill is held to the slide alone.
 */
const darkHue = (facts, s) => {
  const [lo, hi] = s === 'fail' ? FAIL_RED : HUE_BAND[s];
  const h = facts.anchor[s].h;
  const inside = lo <= h && h <= hi;
  if (inside) return h;
  const d = (x) => Math.min(Math.abs(x - h), 360 - Math.abs(x - h));
  return d(lo) <= d(hi) ? lo : hi;
};

function solveDark(theme, facts, baseline, keep) {
  const bg = facts.dark.bg;
  const clears = (h, C, bar) => cr(toneUnderWhite(h, C, bar), bg) >= 3.05;
  const tone = (h, C, s) => {
    let lo = CAT_DARK;
    let hi = 21;
    if (!clears(h, C, lo)) hi = lo;
    while (hi - lo > 0.02) {
      const mid = (lo + hi) / 2;
      if (clears(h, C, mid)) lo = mid; else hi = mid;
    }
    return toneUnderWhite(h, C, CAT_DARK + DARK_SPREAD[s] * (lo - CAT_DARK)).toUpperCase();
  };
  const set = (hue) => {
    const o = {};
    for (const intensity of ['muted', 'vivid']) {
      o[intensity] = {};
      for (const s of ['pass', 'warn', 'fail', 'info']) o[intensity][s] = tone(hue[s], STATUS_CHROMA[intensity][s] * facts.strength, s);
      o[intensity].mute = tone(facts.anchor.mute.h, 0.012, 'mute');
    }
    return o;
  };
  // Start from the theme's own hues. Where the trio would keep less than `keep` of its colorblind separation, step done
  // toward blue-green and blocked toward red (the band's far ends, where `main` sat), the least total turn that keeps
  // it: the theme's hue wherever it can hold, the band's spacing where it cannot.
  const base = Object.fromEntries(['pass', 'warn', 'fail', 'info'].map((s) => [s, darkHue(facts, s)]));
  let out = null;
  for (let turn = 0; turn <= 60 && !out; turn += 5) {
    for (let p = 0; p <= turn && !out; p += 5) {
      const hue = { ...base, pass: Math.min(HUE_BAND.pass[1], base.pass + p), fail: Math.max(FAIL_TURN_FLOOR, Math.min(base.fail, base.fail - (turn - p))) };
      const o = set(hue);
      const trio = (i) => Object.fromEntries(TRIO.map((s) => [s, o[i][s]]));
      if (['muted', 'vivid'].every((i) => separationOk(theme, i, 'dark', o[i], baseline, keep)
        && offAccent(trio(i), facts.dark.accent, accentFloor(theme, 'dark')))) out = o;
    }
  }
  if (!out) throw new Error(`${theme} dark: no hue turn inside the status bands keeps ${keep} of the colorblind separation and clears the accent`);
  // The ring: the status hue in its signal band, bright, 2:1 off its mid-tone fill and 3:1 off the slide.
  out.rings = {};
  for (const s of ['warn', 'fail']) {
    const [lo, hi] = SIGNAL_BAND[s];
    const h = Math.min(hi, Math.max(lo, facts.anchor[s].h));
    const C = 0.17 * facts.strength;
    const fill = out.muted[s];
    let ring = brightFill(h, C, fill, SIGNAL_DARK_FILL, hexToOklch(fill).L);
    if (cr(ring, out.vivid[s]) < SIGNAL_DARK_FILL) ring = brightFill(h, C, out.vivid[s], SIGNAL_DARK_FILL, hexToOklch(ring).L);
    for (const g of facts.dark.ringGrounds) if (cr(ring, g) < SIGNAL) ring = brightFill(h, C, g, SIGNAL, hexToOklch(ring).L);
    out.rings[s] = ring.toUpperCase();
  }
  return out;
}

function solve(theme, facts, baseline, keep) {
  const out = { dark: solveDark(theme, facts, baseline, keep) };
  for (const face of ['light']) {
    const { bg, text } = facts[face];
    out[face] = {};
    for (const [intensity, boost] of [['muted', 1], ['vivid', VIVID_BOOST]]) {
      // Fail keeps its anchored HUE but is never less saturated than warn (URGENCY): a muted brand red would otherwise
      // read calmer than the amber beside it.
      const chroma = (s) => (s === 'fail' ? Math.max(facts.anchor.fail.c, facts.anchor.warn.c) : facts.anchor[s].c);
      const C = (s) => Math.min(0.24, Math.max(s === 'fail' ? LIGHT_RED.C : 0, chroma(s)) * (s === 'mute' ? 1 : boost));
      const hueOf = (s) => (s === 'warn' ? facts.anchor.warn.h + warnShift : s === 'fail' ? clampRed(facts.anchor.fail.h) : facts.anchor[s].h);
      const cands = (s) => {
        const list = [];
        for (let L = 0.2; L <= 0.96; L += 0.005) {
          const f = ok(L, C(s), hueOf(s));
          if (facts[face].surfaces(s, f).every((x) => cr(f, x.hex) >= FILL_MIN) && cr(text, f) >= INK_MIN) list.push([L, f]);
        }
        return list.filter(([L, f]) => Math.abs(L - TARGET[face][s]) <= WINDOW && (s !== 'fail' || theme in SPREAD_EXEMPT || (L >= LIGHT_RED.L && hexToOklch(f).C >= LIGHT_RED.C - 0.01)));
      };
      let best = null;
      // Warn keeps the theme's own hue; only where no trio can then clear the accent floor does it step off the accent's
      // hue, 5 degrees at a time and never past its band (cuoio's dark face, whose warn IS its accent, is the one case).
      let warnShift = 0;
      const accentH = facts[face].accent ? hexToOklch(facts[face].accent).h : facts.anchor.warn.h;
      const away = Math.sign(facts.anchor.warn.h - accentH) || 1;
      for (const step of [0, 5, 10, 15]) {
      warnShift = away * step;
      if (hueDist(facts.anchor.warn.h + warnShift, BAND.warn[0]) > BAND.warn[1]) break;
      const R = {};
      for (const s of TRIO) R[s] = cands(s);
      for (const p of R.pass) for (const w of R.warn) for (const f of R.fail) {
        const fills = { pass: p[1], warn: w[1], fail: f[1] };
        if (w[0] - f[0] < spreadFor(theme) - 1e-9) continue;
        if (!urgent(fills, bg) || !offAccent(fills, facts[face].accent, accentFloor(theme, face))) continue;
        if (!separationOk(theme, intensity, face, fills, baseline, keep)) continue;
        const t = TARGET[face];
        const dev = Math.abs(p[0] - t.pass) + Math.abs(w[0] - t.warn) + Math.abs(f[0] - t.fail);
        if (!best || dev < best.dev) best = { dev, fills };
      }
      if (best) break;
      }
      if (!best) throw new Error(`${theme} ${face} ${intensity}: no trio meets the contract at --keep=${keep}`);
      const one = (s) => {
        const ok2 = cands(s).filter(([, f]) => offAccent({ [s]: f }, facts[face].accent, accentFloor(theme, face)));
        const list = ok2.length ? ok2 : cands(s);
        return list.sort((a, b) => Math.abs(a[0] - TARGET[face][s]) - Math.abs(b[0] - TARGET[face][s]))[0][1];
      };
      out[face][intensity] = { ...best.fills, info: one('info'), mute: one('mute') };
    }
  }
  return out;
}

/** The two signal rings per face, at the opposite lightness to both intensities' fill. */
function rings(sol, facts) {
  const brightRing = (fills, h) => {
    let best = null;
    for (let L = 0.6; L <= 0.97; L += 0.002) {
      const c = ok(L, 0.17, h);
      if (fills.some((f) => cr(c, f) < SIGNAL)) continue;
      const d = Math.abs(L - 0.84);
      if (!best || d < best.d) best = { d, c };
    }
    if (!best) throw new Error('no bright ring clears both fills');
    return best.c;
  };
  const out = {};
  for (const s of ['warn', 'fail']) {
    const L = sol.light;
    out[s] = [brightRing([L.muted[s], L.vivid[s]], hexToOklch(L.muted[s]).h), null];
  }
  return out;
}

/** Every token the triplet owns in a theme, as [light, dark] pairs. */
function tokens(sol, facts) {
  const v = {};
  // Light: the fill is its own edge, the ink the slide's paper. Dark: a chart solid under the one ink, edged in its
  // status ink.
  for (const s of ALL) {
    v[`${s}-mark`] = [sol.light.muted[s], sol.dark.muted[s]];
    v[`${s}-edge-mark`] = [sol.light.muted[s], `var(--${s})`];
    v[`${s}-on-mark`] = [facts.light.text, facts.dark.ink];
  }
  for (const s of ['pass', 'warn', 'fail', 'info']) {
    v[`${s}-vivid-mark`] = [sol.light.vivid[s], sol.dark.vivid[s]];
    v[`${s}-vivid-edge-mark`] = [sol.light.vivid[s], `var(--${s})`];
  }
  const r = rings(sol, facts);
  // What a mark ON a status solid steps toward, away from its ink: the ink is light on both faces, so black on both.
  v['status-shade-mark'] = ['#000000', '#000000'];
  v['warn-signal-mark'] = [r.warn[0], sol.dark.rings.warn];
  v['fail-signal-mark'] = [r.fail[0], sol.dark.rings.fail];
  return v;
}

/** The shipped values against the contract (not against this solver's choice): what --check reports. */
function audit(theme, facts, baseline, keep) {
  const bad = [];
  const pick = (t, dark) => facts.get(t, dark);
  for (const [face, dark] of [['light', false], ['dark', true]]) {
    const bg = facts[face].bg;
    for (const [intensity, tok] of [['muted', (s) => `${s}-mark`], ['vivid', (s) => (s === 'mute' ? 'mute-mark' : `${s}-vivid-mark`)]]) {
      const fills = {};
      for (const s of ALL) {
        const f = pick(tok(s), dark), ink = pick(`${s}-on-mark`, dark);
        fills[s] = f;
        if (!f || !ink) { bad.push(`${face} ${intensity} --${tok(s)} or --${s}-on-mark does not resolve`); continue; }
        // Dark is a chart solid: 3:1 off the slide (its status-ink edge stands it off rows and cards), the one ink at 4.6:1.
        const grounds = dark ? [{ name: 'the slide', hex: bg }] : facts[face].surfaces(s, f);
        const floor = dark ? DARK_OFF_SLIDE : FILL_MIN;
        for (const x of grounds) if (cr(f, x.hex) < floor) bad.push(`${face} ${intensity} --${tok(s)} ${cr(f, x.hex).toFixed(2)}:1 against ${x.name} ${x.hex} (floor ${floor})`);
        const inkMin = dark ? CAT_DARK : INK_MIN;
        if (cr(ink, f) < inkMin) bad.push(`${face} ${intensity} --${s}-on-mark ${cr(ink, f).toFixed(2)}:1 on its fill (floor ${inkMin})`);
        if (dark && ink !== facts.dark.ink) bad.push(`dark --${s}-on-mark is ${ink}, not the one ink ${facts.dark.ink}`);
      }
      if (TRIO.every((s) => fills[s]) && !separationOk(theme, intensity, face, fills, baseline, keep)) bad.push(`${face} ${intensity}: the trio keeps less than ${keep} of its recorded colorblind separation`);
      if (!dark && TRIO.every((s) => fills[s])) {
        const gap = hexToOklch(fills.warn).L - hexToOklch(fills.fail).L;
        if (gap < spreadFor(theme) - 0.006) bad.push(`light ${intensity}: at risk sits ${gap.toFixed(3)} above blocked in lightness (floor ${spreadFor(theme)})`);
      }
      if (!dark && TRIO.every((s) => fills[s]) && !urgent(fills, bg)) bad.push(`${face} ${intensity}: fail is quieter than warn (${cr(fills.fail, bg).toFixed(2)} vs ${cr(fills.warn, bg).toFixed(2)} off the slide, or less saturated)`);
      if (fills.fail) {
        const h = ((hexToOklch(fills.fail).h + 180) % 360) - 180;
        const lo = dark ? FAIL_TURN_FLOOR : FAIL_RED[0];
        if (h < lo - 1.5 || h > FAIL_RED[1] + 1.5) bad.push(`${face} ${intensity} --${tok('fail')} hue ${h.toFixed(0)} is outside the red range ${lo}-${FAIL_RED[1]}`);
      }
      const af = accentFloor(theme, face);
      for (const s of TRIO) if (fills[s] && facts[face].accent && oklabDistance(fills[s], facts[face].accent) < af) bad.push(`${face} ${intensity} --${tok(s)} sits ${oklabDistance(fills[s], facts[face].accent).toFixed(3)} from the accent (floor ${af})`);
      for (const s of ALL) {
        const e = pick(intensity === 'vivid' && s !== 'mute' ? `${s}-vivid-edge-mark` : `${s}-edge-mark`, dark);
        const want = dark ? pick(s, true) : fills[s];
        if (e !== want) bad.push(`${face} ${intensity} the edge of --${tok(s)} is not ${dark ? `its status ink --${s}` : 'the fill itself'} (${e} vs ${want})`);
      }
    }
    for (const s of ['warn', 'fail']) {
      const ring = pick(`${s}-signal-mark`, dark);
      for (const t of [`${s}-mark`, `${s}-vivid-mark`]) {
        const f = pick(t, dark);
        const onFill = dark ? SIGNAL_DARK_FILL : SIGNAL;
        if (ring && f && cr(ring, f) < onFill) bad.push(`${face} --${s}-signal-mark ${cr(ring, f).toFixed(2)}:1 on --${t} (floor ${onFill})`);
      }
      if (dark && ring) for (const g of facts.dark.ringGrounds) if (cr(ring, g) < SIGNAL) bad.push(`dark --${s}-signal-mark ${cr(ring, g).toFixed(2)}:1 off ${g === bg ? 'the slide' : `--bg-alt ${g}`} (floor ${SIGNAL})`);
    }
  }
  // SHADE: what a mark ON a status solid steps toward lies away from the status ink, so a chip or a critical band never
  // steps toward its own text (the red team's state-chart finding).
  for (const [face, dark] of [['light', false], ['dark', true]]) {
    const shade = pick('status-shade-mark', dark), ink = pick('pass-on-mark', dark);
    if (!shade || !ink) { bad.push(`${face} --status-shade-mark or --pass-on-mark does not resolve`); continue; }
    if (cr(shade, ink) < 7) bad.push(`${face} --status-shade-mark ${shade} sits ${cr(shade, ink).toFixed(2)}:1 from the status ink ${ink}; it must step away from it (floor 7)`);
  }
  return bad;
}

function patch(theme, values) {
  const p = path.join(ROOT, 'themes', theme, `${theme}.css`);
  let css = fs.readFileSync(p, 'utf8');
  for (const [k, [a, b]] of Object.entries(values)) {
    const re = new RegExp(`(\\n\\s*--${k}:\\s*)[^;]+;`);
    if (!re.test(css)) throw new Error(`${theme}: --${k} is not in the status block (the first adoption is a reviewed edit)`);
    css = css.replace(re, `$1light-dark(${a}, ${b});`);
  }
  fs.writeFileSync(p, css);
}

function main() {
  const o = parseArgs(process.argv.slice(2));
  const baseline = JSON.parse(fs.readFileSync(o.baseline, 'utf8'));
  const brand = listAllThemes().filter((t) => !t.startsWith('a11y-') && !t.endsWith('-dark'));
  const themes = o.themes.length ? o.themes : brand;
  let failed = 0;
  for (const theme of themes) {
    if (!brand.includes(theme)) throw new Error(`${theme} is not a brand palette (the a11y palettes keep their own floors)`);
    const facts = themeFacts(theme);
    if (o.check) {
      const bad = audit(theme, facts, baseline, o.keep);
      failed += bad.length;
      console.log(`${theme.padEnd(11)} ${bad.length ? `FAIL\n  ${bad.join('\n  ')}` : 'ok'}`);
      continue;
    }
    const values = tokens(solve(theme, facts, baseline, o.keep), facts);
    patch(theme, values);
    console.log(`${theme.padEnd(11)} written (${Object.keys(values).length} tokens; hues from ${['pass', 'warn', 'fail', 'info'].map((s) => `${s} ${facts.anchor[s].from}`).join(', ')})`);
  }
  if (o.check && !o.themes.length) {
    for (const key of Object.keys(ACCENT_EXEMPT)) {
      const [theme, face] = key.split(':');
      const facts = themeFacts(theme);
      const dark = face === 'dark';
      const near = Math.min(...TRIO.flatMap((s) => [`${s}-mark`, `${s}-vivid-mark`]).map((t) => oklabDistance(facts.get(t, dark), facts[face].accent)));
      if (near >= ACCENT_MIN) { failed++; console.log(`ACCENT_EXEMPT ${key} is stale: the face now sits ${near.toFixed(3)} from its accent, past the full floor`); }
    }
  }
  if (o.check && !o.themes.length) {
    for (const [theme, { spread }] of Object.entries(SPREAD_EXEMPT)) {
      const facts = themeFacts(theme);
      const gap = Math.min(...[['pass-mark', 'warn-mark', 'fail-mark'], ['pass-vivid-mark', 'warn-vivid-mark', 'fail-vivid-mark']]
        .map(([, w, f]) => hexToOklch(facts.get(w, false)).L - hexToOklch(facts.get(f, false)).L));
      if (gap >= LIGHT_SPREAD) { failed++; console.log(`SPREAD_EXEMPT ${theme} is stale: its light face now spreads ${gap.toFixed(3)}, the full ${LIGHT_SPREAD}`); }
      else if (gap < spread - 0.006) { failed++; console.log(`SPREAD_EXEMPT ${theme} spreads ${gap.toFixed(3)}, below its named ${spread}`); }
    }
  }
  if (o.check && failed) process.exit(1);
}

module.exports = { themeFacts, solve, tokens, audit, BAND, TARGET, FILL_MIN, INK_MIN, ACCENT_MIN, ACCENT_EXEMPT, SPREAD_EXEMPT, FAIL_RED, KANBAN };

if (require.main === module) main();
