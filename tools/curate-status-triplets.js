#!/usr/bin/env node
/**
 * curate-status-triplets — solve each brand theme's status TRIPLET (fill, ink on it, edge) and write it into the theme.
 *
 * The contract (engineering/decisions/2026-11-16-status-triplets.md), per brand theme, per face, per `marks:` intensity:
 *
 *   FILL   each status solid clears 4.5:1 against its slide AS PAINTED, so it keeps 3:1 at the back of a lit hall
 *          (`npm run check:glance`). Deep on the light face, glowing on the dark one.
 *   INK    the text and drawn mark ON the fill is the slide's own paper (light) or night (dark), and clears 4.5:1 on it.
 *   EDGE   the fill's border is the fill itself: it already clears 4.5:1 off the slide, so it needs no darker rim.
 *   HUE    each status takes the hue of the theme's own brand or chart color nearest its band (pass green, warn amber,
 *          fail red, info blue), so the trio reads as the theme's and not a stock traffic light.
 *   CVD    the pass / warn / fail fills keep at least `--keep` of their recorded colorblind separation, pair by pair,
 *          under every simulated deficiency (test/fixtures/status-fill-cvd-baseline.json; lib/theme/cvd.js). The default,
 *          1, is the ratchet test/unit/palette/cvd-trio-floor.test.js holds, so a rerun can never erode it. The
 *          2026-11-16 retune ran at `--keep=0.5` against the pre-triplet record, the owner's pick.
 *   URGENCY  blocked is never quieter than at risk: on every face fail stands off the slide at least as far as warn
 *          does, and is at least as saturated (an inversion review found warn the loudest mark on every dark face).
 *   ACCENT every status fill sits at least 0.08 (OKLab) from the theme's accent, so an at-risk pill cannot read as
 *          the gold of a KPI number beside it.
 *   RING   warn and fail wear a SIGNAL ring at the opposite lightness, >= 3.2:1 against both intensities' fill; on the
 *          dark face the deep ring also clears 2:1 off the slide (lib/theme/chart-solids.js `deepRing`), so a dark fail
 *          fill too deep to hold such a ring is not a candidate.
 *
 * Inside those limits it picks the lightness closest to a designed target (light: fills near L 0.44-0.52; dark: near
 * L 0.70-0.82). The `a11y-*` palettes are never touched: they curate their own colorblind floors and keep the one ink.
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
const { deepRing, SIGNAL } = require('../lib/theme/chart-solids.js');

const TYPES = ['protanopia', 'deuteranopia', 'tritanopia', 'achromatopsia'];
const TRIO = ['pass', 'warn', 'fail'];
const ALL = ['pass', 'warn', 'fail', 'info', 'mute'];
const FILL_MIN = 4.5;
const INK_MIN = 4.5;
/** Centre hue and half-width of each status's band, in OKLCH degrees. */
const BAND = { pass: [150, 40], warn: [75, 25], fail: [22, 25], info: [250, 55] };
const TARGET = { light: { pass: 0.46, warn: 0.52, fail: 0.44, info: 0.46, mute: 0.5 }, dark: { pass: 0.74, warn: 0.7, fail: 0.78, info: 0.76, mute: 0.72 } };
const ACCENT_MIN = 0.08;
/**
 * A face where the accent floor cannot be met with the rest of the contract, named with the floor it does meet and why.
 * Not a waiver: the audit holds the face to its own floor, so it can only improve. Fails on a stale entry.
 */
const ACCENT_EXEMPT = {
  'cuoio:dark': { floor: 0.045, why: 'cuoio\'s dark accent is a gold at L 0.72, and URGENCY puts warn in the same lightness '
    + 'band, just under fail; no trio that also keeps half its colorblind separation gets warn further than 0.060 (muted) '
    + 'or 0.047 (vivid) from it, and turning warn\'s hue off the gold moves it only ~0.03. The floor is the reachable '
    + 'maximum for both intensities, half again the 0.030 the inversion review flagged on mustard.' },
};
const accentFloor = (theme, face) => ACCENT_EXEMPT[`${theme}:${face}`]?.floor ?? ACCENT_MIN;
const RING_OFF_SLIDE = 2;
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
function themeFacts(theme) {
  const V = mergedVars(theme);
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
  return { get, anchor, light: { bg: get('bg', false), text: get('bg', false), accent: get('accent', false) }, dark: { bg: get('bg', true), text: get('bg', true), accent: get('accent', true) } };
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

const ringCache = new Map();
function canRing(fill, bg) {
  const k = fill + bg;
  if (!ringCache.has(k)) {
    const o = hexToOklch(fill);
    try { deepRing(o.h, 0.17, fill, SIGNAL, o.L - 0.02, [bg]); ringCache.set(k, true); } catch { ringCache.set(k, false); }
  }
  return ringCache.get(k);
}

/** Solve one theme: { light: { muted, vivid }, dark: { muted, vivid } }, each a status -> fill map. */
function solve(theme, facts, baseline, keep) {
  const out = {};
  for (const face of ['light', 'dark']) {
    const { bg, text } = facts[face];
    out[face] = {};
    for (const [intensity, boost] of [['muted', 1], ['vivid', VIVID_BOOST]]) {
      // Fail keeps its anchored HUE but is never less saturated than warn (URGENCY): a muted brand red would otherwise
      // read calmer than the amber beside it.
      const chroma = (s) => (s === 'fail' ? Math.max(facts.anchor.fail.c, facts.anchor.warn.c) : facts.anchor[s].c);
      const C = (s) => Math.min(0.24, chroma(s) * (s === 'mute' ? 1 : boost));
      const hueOf = (s) => (s === 'warn' ? facts.anchor.warn.h + warnShift : facts.anchor[s].h);
      const cands = (s) => {
        const list = [];
        for (let L = 0.2; L <= 0.96; L += 0.005) {
          const f = ok(L, C(s), hueOf(s));
          if (cr(f, bg) >= FILL_MIN && cr(text, f) >= INK_MIN) list.push([L, f]);
        }
        return list.filter(([L]) => Math.abs(L - TARGET[face][s]) <= WINDOW);
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
      for (const s of TRIO) R[s] = cands(s).filter(([, f]) => face === 'light' || s === 'pass' || canRing(f, bg));
      for (const p of R.pass) for (const w of R.warn) for (const f of R.fail) {
        const fills = { pass: p[1], warn: w[1], fail: f[1] };
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
  const darkRing = (fills, bg) => {
    const darker = fills.slice().sort((a, b) => cr(a, '#000000') - cr(b, '#000000'))[0];
    const o = hexToOklch(darker);
    const r = deepRing(o.h, 0.17, darker, SIGNAL, o.L - 0.02, [bg]).toUpperCase();
    if (fills.some((f) => cr(r, f) < SIGNAL)) throw new Error('the deep ring misses one fill');
    return r;
  };
  const out = {};
  for (const s of ['warn', 'fail']) {
    const L = sol.light, D = sol.dark;
    out[s] = [brightRing([L.muted[s], L.vivid[s]], hexToOklch(L.muted[s]).h), darkRing([D.muted[s], D.vivid[s]], facts.dark.bg)];
  }
  return out;
}

/** Every token the triplet owns in a theme, as [light, dark] pairs. */
function tokens(sol, facts) {
  const v = {};
  for (const s of ALL) {
    v[`${s}-mark`] = [sol.light.muted[s], sol.dark.muted[s]];
    v[`${s}-edge-mark`] = v[`${s}-mark`];
    v[`${s}-on-mark`] = [facts.light.text, facts.dark.text];
  }
  for (const s of ['pass', 'warn', 'fail', 'info']) {
    v[`${s}-vivid-mark`] = [sol.light.vivid[s], sol.dark.vivid[s]];
    v[`${s}-vivid-edge-mark`] = v[`${s}-vivid-mark`];
  }
  const r = rings(sol, facts);
  v['status-shade-mark'] = ['#000000', '#FFFFFF'];
  v['warn-signal-mark'] = r.warn;
  v['fail-signal-mark'] = r.fail;
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
        if (cr(f, bg) < FILL_MIN) bad.push(`${face} ${intensity} --${tok(s)} ${cr(f, bg).toFixed(2)}:1 off the slide (floor ${FILL_MIN})`);
        if (cr(ink, f) < INK_MIN) bad.push(`${face} ${intensity} --${s}-on-mark ${cr(ink, f).toFixed(2)}:1 on its fill (floor ${INK_MIN})`);
      }
      if (TRIO.every((s) => fills[s]) && !separationOk(theme, intensity, face, fills, baseline, keep)) bad.push(`${face} ${intensity}: the trio keeps less than ${keep} of its recorded colorblind separation`);
      if (TRIO.every((s) => fills[s]) && !urgent(fills, bg)) bad.push(`${face} ${intensity}: fail is quieter than warn (${cr(fills.fail, bg).toFixed(2)} vs ${cr(fills.warn, bg).toFixed(2)} off the slide, or less saturated)`);
      const af = accentFloor(theme, face);
      for (const s of TRIO) if (fills[s] && facts[face].accent && oklabDistance(fills[s], facts[face].accent) < af) bad.push(`${face} ${intensity} --${tok(s)} sits ${oklabDistance(fills[s], facts[face].accent).toFixed(3)} from the accent (floor ${af})`);
      for (const s of ALL) {
        const e = pick(intensity === 'vivid' && s !== 'mute' ? `${s}-vivid-edge-mark` : `${s}-edge-mark`, dark);
        if (e !== fills[s]) bad.push(`${face} ${intensity} the edge of --${tok(s)} is not the fill itself (${e} vs ${fills[s]})`);
      }
    }
    for (const s of ['warn', 'fail']) {
      const ring = pick(`${s}-signal-mark`, dark);
      for (const t of [`${s}-mark`, `${s}-vivid-mark`]) {
        const f = pick(t, dark);
        if (ring && f && cr(ring, f) < SIGNAL) bad.push(`${face} --${s}-signal-mark ${cr(ring, f).toFixed(2)}:1 on --${t} (floor ${SIGNAL})`);
      }
      if (dark && ring && cr(ring, bg) < RING_OFF_SLIDE) bad.push(`dark --${s}-signal-mark ${cr(ring, bg).toFixed(2)}:1 off the slide (floor ${RING_OFF_SLIDE})`);
    }
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
  if (o.check && failed) process.exit(1);
}

module.exports = { themeFacts, solve, tokens, audit, BAND, TARGET, FILL_MIN, INK_MIN, ACCENT_MIN, ACCENT_EXEMPT };

if (require.main === module) main();
