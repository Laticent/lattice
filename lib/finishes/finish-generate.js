/**
 * The finish generator: a structured layer RECIPE (wash / texture / mark / edge, the four
 * palette-blind layers the compositor in lib/base/base.finish.css blends) in, finish CSS out.
 *
 * ONE generator, two callers (engineering/decisions/2026-09-23-portable-packages.md §3.6):
 *
 *   - `generatePresetCss(name, recipe)` writes a SHIPPED preset's rule. The build
 *     (tools/build-packages-index.js) runs it over every lib/finishes/<name>/<name>.recipe.json
 *     and writes the result into the generated region of base.finish.css. The rule uses the
 *     shipped one-class selector `section.finish-<name>`, so a deck override such as
 *     `section.finish-meridian { --fin-mark-text: "Q3" }` still wins by source order, and it
 *     writes each full-bleed slot twice: the RICH screen value and an `--fin-*-opaque` mirror
 *     that base.finish.css's OPAQUE FLIP swaps in for print and `.lattice-exporting`.
 *   - `generateFinishCss(slug, recipe)` writes a Studio-fabricated finish:
 *     `section.finish.finish-<slug>` with the rich face, then the opaque face re-emitted under
 *     `@media print` and `.lattice-exporting` (docs/src/components/studio/finish-generate.ts
 *     re-exports this module with its types).
 *
 * Both faces obey: NO mask-image (Apple PDFKit drops it), NO url() (no exfil surface), NO hex
 * (HARD RULE #3: every color is a var() mix), NO margin (HARD RULE #20). The OPAQUE face also
 * obeys THE BOTTOM-LAYER RULE (base.finish.css): only the bottom full-bleed layer may end on the
 * solid canvas; every full-bleed layer above it ends on the canvas at zero opacity.
 *
 * Only clamped NUMBERS and fixed keywords reach the CSS. The slug is re-sanitized, and the one
 * caller string that is emitted, a mark glyph, goes through `sanitizeGlyph`, so a crafted recipe
 * cannot close the selector or inject a rule into the same-origin preview frame (HARD RULE #22).
 *
 * A CommonJS LEAF on purpose: it requires nothing, so the docs dev server can serve it to the
 * Studio (docs/src/plugins/vite-cjs-lib-dev.mjs) and the build can require it from Node.
 */

// ── The closed vocabulary: the only layer types the designer, the AI and a recipe speak. ──
const WASH_TYPES = Object.freeze(['none', 'corner-glow', 'duotone', 'spotlight', 'bands', 'mesh']);
const TEXTURE_TYPES = Object.freeze(['none', 'grid', 'dots', 'hatch', 'contour', 'rings', 'ruled', 'pinstripe', 'lattice']);
// `rule` is a thin margin rule (atrium's 0.47cqi); `bar` is the bold one (ledger's 1.1cqi).
const MARK_TYPES = Object.freeze(['none', 'monogram', 'tick', 'bar', 'rule', 'numeral']);
const EDGE_TYPES = Object.freeze(['none', 'vignette', 'margin-rule', 'fold', 'frame']);
const PLACEMENTS = Object.freeze(['top-left', 'top-right', 'bottom-left', 'bottom-right', 'center', 'left']);

// The transform-axis ranges, in ONE place (controls, coercion and tests share them).
const MARK_SCALE = Object.freeze({ min: 30, max: 200, default: 100 }); // % of the base ghost size
const MARK_ANGLE = Object.freeze({ min: -30, max: 30, default: 0 }); // degrees
const MARK_INSET = Object.freeze({ min: 0, max: 6, default: 1 }); // cqi, a corner-anchored glyph's side gap
const WASH_SPREAD = Object.freeze({ min: 50, max: 160, default: 100 }); // % of the default radius
const SPOT_RADIUS = Object.freeze({ min: 18, max: 70, default: 38 }); // spotlight window radius, % of slide
const RICH_INTENSITY = Object.freeze({ min: 3, max: 30 }); // an edge's hand-tuned screen-face accent %
const RICH_REACH = Object.freeze({ min: 30, max: 90 }); // an edge's hand-tuned screen-face fade stop %

const DEFAULT_RECIPE = Object.freeze({
  wash: Object.freeze({ type: 'corner-glow', intensity: 10 }),
  texture: Object.freeze({ type: 'grid', intensity: 7, scale: 38 }),
  mark: Object.freeze({ type: 'none', placement: 'bottom-right' }),
  edge: Object.freeze({ type: 'none', intensity: 6 }),
});

/**
 * The author's own glyph for a monogram/numeral mark, safe inside CSS `content:"…"`. Quotes,
 * backslashes, angle brackets and rule punctuation are dropped, whitespace collapsed, and the
 * result kept to 3 characters. An empty or absent glyph yields "" and the mark paints nothing:
 * a deck-wide finish never shows a baked placeholder.
 */
function sanitizeGlyph(input) {
  if (typeof input !== 'string') return '';
  return input
    .replace(/["'\\<>{};]/g, '')
    .replace(/\s+/g, '')
    .slice(0, 3);
}

// ── Coercion: clamp or snap any input (a control, a recipe file, an AI reply) to the vocabulary. ──
// Returns the VOCABULARY string, never the raw input: `['top-left']` stringifies to a member
// but is not a string, and a caller that trusted it crashed on `.startsWith`.
const oneOf = (opts, v, fallback) => opts.find((o) => o === String(v)) ?? fallback;
const clampInt = (v, lo, hi, fallback) => {
  const n = Math.round(Number(v));
  return Number.isFinite(n) ? Math.max(lo, Math.min(hi, n)) : fallback;
};
// Clamps only a value that is PRESENT: an absent axis returns undefined so the caller falls back.
const optInt = (v, lo, hi) => (v === undefined || v === null || v === '' ? undefined : clampInt(v, lo, hi, lo));
const isOn = (v) => v === true || /^(on|true|yes)$/i.test(String(v ?? ''));

/** A coarse placement keyword → the glyph center (x%, y%) it stands for. */
function placementXY(p) {
  switch (p) {
    case 'top-left':
      return { x: 12, y: 16 };
    case 'top-right':
      return { x: 88, y: 16 };
    case 'bottom-left':
      return { x: 12, y: 84 };
    case 'center':
      return { x: 50, y: 50 };
    case 'left':
      return { x: 8, y: 50 };
    default:
      return { x: 88, y: 84 }; // bottom-right
  }
}
// A wash type's natural hotspot, where its single source sits before the user moves it.
const washHotspot = (type) => (type === 'spotlight' ? { x: 50, y: 42 } : { x: 100, y: 0 });
/** Only these washes have one movable hotspot; the designer hides the joystick for the rest. */
const washHasHotspot = (type) => type === 'corner-glow' || type === 'spotlight';

/**
 * Coerce an arbitrary object into a full, in-vocabulary recipe. Never throws. The optional
 * details (`wash.hairline`, `mark.anchor`, `mark.inset`, `edge.rich`) survive only when set, so a
 * recipe that leaves them out stays exactly as written.
 */
function coerceRecipe(input) {
  const o = input && typeof input === 'object' ? input : {};
  const w = o.wash ?? {};
  const t = o.texture ?? {};
  const m = o.mark ?? {};
  const e = o.edge ?? {};
  const markPlacement = oneOf(PLACEMENTS, m.placement, 'bottom-right');
  const markHome = placementXY(markPlacement);
  const washType = oneOf(WASH_TYPES, w.type, 'none');
  const washHome = washHotspot(washType);
  const inset = optInt(m.inset, MARK_INSET.min, MARK_INSET.max);
  return {
    wash: {
      type: washType,
      intensity: clampInt(w.intensity, 3, 20, 10),
      x: optInt(w.x, 0, 100) ?? washHome.x,
      y: optInt(w.y, 0, 100) ?? washHome.y,
      spread: optInt(w.spread, WASH_SPREAD.min, WASH_SPREAD.max) ?? WASH_SPREAD.default,
      ...(isOn(w.hairline) ? { hairline: true } : {}),
    },
    texture: { type: oneOf(TEXTURE_TYPES, t.type, 'none'), intensity: clampInt(t.intensity, 3, 18, 7), scale: clampInt(t.scale, 12, 64, 38) },
    mark: {
      type: oneOf(MARK_TYPES, m.type, 'none'),
      placement: markPlacement,
      ...(typeof m.glyph === 'string' && m.glyph.trim() ? { glyph: m.glyph } : {}),
      x: optInt(m.x, 0, 100) ?? markHome.x,
      y: optInt(m.y, 0, 100) ?? markHome.y,
      scale: optInt(m.scale, MARK_SCALE.min, MARK_SCALE.max) ?? MARK_SCALE.default,
      angle: optInt(m.angle, MARK_ANGLE.min, MARK_ANGLE.max) ?? MARK_ANGLE.default,
      ...(m.anchor === 'corner' ? { anchor: 'corner' } : {}),
      ...(inset !== undefined ? { inset } : {}),
    },
    edge: { type: oneOf(EDGE_TYPES, e.type, 'none'), intensity: clampInt(e.intensity, 3, 20, 6), ...coerceRich(e.rich) },
    ...coerceBackdrop(o.backdrop),
  };
}

// An edge's hand-tuned screen face: `{ intensity?, reach? }`, each present-only, or nothing.
function coerceRich(input) {
  const r = input && typeof input === 'object' ? input : {};
  const intensity = optInt(r.intensity, RICH_INTENSITY.min, RICH_INTENSITY.max);
  const reach = optInt(r.reach, RICH_REACH.min, RICH_REACH.max);
  const out = { ...(intensity !== undefined ? { intensity } : {}), ...(reach !== undefined ? { reach } : {}) };
  return Object.keys(out).length ? { rich: out } : {};
}

// The baked backdrop layer, `{ strength?: 0–1, clearance?: true, spotlight? }`, or dropped when
// nothing non-default is set. A default value drops its axis, so a `finish-override:` that resets
// an axis (`strength: 1`, `clearance: off`) merges to nothing baked.
function coerceBackdrop(input) {
  const b = input && typeof input === 'object' ? input : {};
  const out = {};
  const s = Number.parseFloat(String(b.strength));
  if (Number.isFinite(s) && Math.min(1, Math.max(0, s)) !== 1) out.strength = Math.min(1, Math.max(0, s));
  if (isOn(b.clearance)) out.clearance = true;
  const spot = coerceSpotlight(b.spotlight);
  if (spot) out.spotlight = spot;
  return Object.keys(out).length ? { backdrop: out } : {};
}

// The spotlight window, `{ x, y, radius }` clamped, from an object or the front-matter triple
// `x y radius` (`spotlight: 84 30 40`). Only finite numbers survive (HARD RULE #22).
function coerceSpotlight(v) {
  let x;
  let y;
  let r;
  if (typeof v === 'string') {
    if (!v.trim()) return undefined;
    const p = v.trim().split(/[\s,]+/).map(Number);
    [x, y, r] = [p[0], p[1], p[2]];
  } else if (v && typeof v === 'object') {
    x = Number(v.x);
    y = Number(v.y);
    r = Number(v.radius ?? v.r);
  } else {
    return undefined;
  }
  if (![x, y, r].every(Number.isFinite)) return undefined;
  return {
    x: Math.max(0, Math.min(100, Math.round(x))),
    y: Math.max(0, Math.min(100, Math.round(y))),
    radius: Math.max(SPOT_RADIUS.min, Math.min(SPOT_RADIUS.max, Math.round(r))),
  };
}

// ── Tokens. The engine's presets read the bare slots, which base.finish.css always declares on
// `section`; a Studio finish carries fallbacks so its CSS reads sensibly on its own. ──
const ENGINE_TOKENS = Object.freeze({ accent: 'var(--field-accent)', canvas: 'var(--fin-canvas)' });
const STUDIO_TOKENS = Object.freeze({ accent: 'var(--field-accent, var(--accent))', canvas: 'var(--fin-canvas, var(--bg))' });

/**
 * The gradient builders, bound to one token set. A FACE decides the fade end of every
 * full-bleed gradient: 'opaque' (export) mixes the accent into the canvas and ends on it;
 * 'rich' (screen) mixes into `transparent`, which the browser composites cleanly.
 */
function painter(tok) {
  const mix = (pct, face) => `color-mix(in srgb, ${tok.accent} ${Math.round(pct)}%, ${face === 'rich' ? 'transparent' : tok.canvas})`;
  // The end stop of a full-bleed fade. ONLY the bottom full-bleed layer may use the solid canvas.
  const fadeEnd = (face) => (face === 'rich' ? 'transparent' : tok.canvas);
  // A fade ABOVE the bottom layer ends on the canvas at zero opacity: a solid canvas stop there
  // paints the slide color over every layer below it, and `transparent` (black at zero opacity)
  // fades through gray in a PDF rasterizer.
  const fadeClear = (face) => (face === 'rich' ? 'transparent' : `rgb(from ${tok.canvas} r g b / 0)`);
  // The alpha falloff makes a screen fade read fainter than the same mix over an opaque canvas,
  // so the rich face lifts the accent: +3 for a wash, +2 for a texture's hairlines and dots
  // (what the shipped presets were tuned to), capped so text on the canvas keeps AA.
  const lift = (pct, face) => (face === 'rich' ? Math.min(22, pct + 3) : pct);
  const liftTexture = (pct, face) => (face === 'rich' ? Math.min(22, pct + 2) : pct);
  const solid = `linear-gradient(${tok.accent}, ${tok.accent})`;

  // --fin-wash (z1). corner-glow and spotlight read their movable hotspot from x/y and scale
  // their reach by `spread`; duotone, bands and mesh are directional or multi-source.
  function washImage(type, i, face, x = 100, y = 0, spread = 100) {
    const a = lift(i, face);
    const end = fadeEnd(face);
    const sp = spread / 100;
    const at = `at ${clampInt(x, 0, 100, 50)}% ${clampInt(y, 0, 100, 50)}%`;
    switch (type) {
      case 'corner-glow':
        return [`radial-gradient(ellipse ${Math.round(120 * sp)}% ${Math.round(90 * sp)}% ${at}, ${mix(a, face)} 0%, ${end} ${face === 'rich' ? '60%' : '55%'})`];
      case 'duotone':
        return [`linear-gradient(118deg, ${mix(a, face)} 0%, ${end} 42%, ${mix(lift(Math.max(3, i * 0.6), face), face)} 100%)`];
      case 'spotlight':
        return [`radial-gradient(${Math.round(80 * sp)}% ${Math.round(70 * sp)}% ${at}, ${mix(a, face)} 0%, ${end} 60%)`];
      case 'bands':
        return [`linear-gradient(180deg, ${mix(a, face)} 0%, ${end} 30%, ${end} 70%, ${mix(lift(Math.max(3, i * 0.8), face), face)} 100%)`];
      case 'mesh': {
        // Three overlapping blooms and a fainter counter-bloom. Only the LAST is the bottom
        // layer, so only it may end on the solid canvas; the three above it end clear.
        const hi = mix(a, face);
        const mid = mix(lift(Math.max(3, i * 0.7), face), face);
        const lo = mix(lift(Math.max(3, i * 0.5), face), face);
        const clear = fadeClear(face);
        return [
          `radial-gradient(60% 60% at 12% 18%, ${hi} 0%, ${clear} 60%)`,
          `radial-gradient(58% 58% at 88% 24%, ${mid} 0%, ${clear} 58%)`,
          `radial-gradient(64% 64% at 78% 90%, ${lo} 0%, ${clear} 62%)`,
          `radial-gradient(50% 50% at 28% 88%, ${lo} 0%, ${end} 58%)`,
        ];
      }
      default:
        return [];
    }
  }

  // The HAIRLINE wash strip (strata's): a solid accent line across the top that bleeds out to
  // the right. Sized to a strip (HAIRLINE_SIZE), so its solid end covers only the strip, and it
  // is exempt from the bottom-layer rule the way a corner fold is.
  function hairlineImage(face) {
    return face === 'rich'
      ? `linear-gradient(90deg, ${tok.accent} 0%, ${mix(35, face)} 55%, transparent 100%)`
      : `linear-gradient(90deg, ${tok.accent} 0%, ${mix(35, face)} 60%, ${tok.canvas} 100%)`;
  }

  // --fin-texture (z2). Uniform, faint patterns: an opaque line or dot, then a transparent GAP
  // (a hard stop, never an area fade), so both faces bake clean.
  function textureImage(type, i, s, face) {
    const c = mix(liftTexture(i, face), face);
    switch (type) {
      case 'grid':
        return [`repeating-linear-gradient(0deg, ${c} 0 1px, transparent 1px ${s}px)`, `repeating-linear-gradient(90deg, ${c} 0 1px, transparent 1px ${s}px)`];
      case 'dots':
        return [`radial-gradient(${c} 0 1.3px, transparent 1.7px)`];
      case 'hatch':
        return [`repeating-linear-gradient(-45deg, ${c} 0 1px, transparent 1px ${s}px)`];
      case 'contour':
        return [`repeating-linear-gradient(-4deg, transparent 0 ${s - 1}px, ${c} ${s - 1}px ${s}px)`];
      case 'rings':
        return [`repeating-radial-gradient(circle at 50% 42%, transparent 0 ${s - 1}px, ${c} ${s - 1}px ${s}px)`];
      case 'ruled':
        return [`repeating-linear-gradient(180deg, transparent 0 ${s - 1}px, ${c} ${s - 1}px ${s}px)`];
      case 'pinstripe':
        return [`repeating-linear-gradient(90deg, ${c} 0 1px, transparent 1px ${s}px)`];
      case 'lattice':
        return [`repeating-linear-gradient(45deg, ${c} 0 1px, transparent 1px ${s}px)`, `repeating-linear-gradient(-45deg, ${c} 0 1px, transparent 1px ${s}px)`];
      default:
        return [];
    }
  }

  // --fin-edge (z4). The edge pseudo paints above the whole backdrop, so a FULL-BLEED edge (the
  // vignette) ends clear; the fold is a corner patch and keeps its solid end. `rich` hand-tunes
  // the fold's screen face (ledger's 22% to 65%) where the formula would give 19% to 60%.
  function edgeImage(edge, face) {
    const { type, intensity: i } = edge;
    switch (type) {
      case 'vignette': {
        const rim =
          face === 'rich'
            ? `color-mix(in srgb, var(--text-heading) ${Math.round(Math.min(22, i + 2))}%, transparent)`
            : `color-mix(in srgb, var(--text-heading) ${Math.round(i)}%, ${tok.canvas})`;
        const center = face === 'rich' ? 'transparent 60%' : `${fadeClear(face)} 62%`;
        return `radial-gradient(78% 78% at 50% 50%, ${center}, ${rim} 100%)`;
      }
      case 'fold': {
        const tuned = face === 'rich' ? edge.rich || {} : {};
        const a = tuned.intensity ?? lift(i, face);
        const reach = tuned.reach ?? 60;
        return `linear-gradient(225deg, ${mix(a, face)} 0%, ${fadeEnd(face)} ${reach}%)`;
      }
      case 'margin-rule':
        return solid;
      default:
        // `frame` draws a solid inset keyline on the SECTION (--fin-frame), not a gradient.
        return 'none';
    }
  }

  return { mix, solid, washImage, hairlineImage, textureImage, edgeImage };
}

const HAIRLINE_SIZE = '100% 0.31cqi';
// The matching background-size for a texture (dots tile to a square; the rest cover the box).
const textureSize = (type, s) => (type === 'dots' ? `${s}px ${s}px` : 'auto');

/** Where a placement keyword puts a small solid mark (the tick). */
function markPos(p) {
  switch (p) {
    case 'top-left':
      return 'top 2.7cqi left 3.1cqi';
    case 'top-right':
      return 'top 2.7cqi right 3.1cqi';
    case 'bottom-left':
      return 'bottom 2.7cqi left 3.1cqi';
    case 'left':
      return 'left center';
    case 'center':
      return 'center';
    default:
      return 'bottom 2.7cqi right 3.1cqi';
  }
}

// A corner-anchored glyph's flex alignment: align-items is the vertical axis of the mark's
// ::before, justify-content the horizontal one.
function cornerAlign(p) {
  const v = p.startsWith('top') ? 'flex-start' : p.startsWith('bottom') ? 'flex-end' : 'center';
  const h = p.endsWith('left') ? 'flex-start' : p.endsWith('right') ? 'flex-end' : 'center';
  return { align: v, justify: h };
}

// A TEXT mark (monogram / numeral) is the big ghost glyph, `scale`% of a 30cqi base.
//   FREE (the default): centered in the full-bleed ::before, then translated to (x%, y%) of the
//     slide and tilted by `angle`. This is what the Studio's joystick and drag write.
//   CORNER (`anchor: "corner"`): seated in the placement's corner by flex alignment, `inset` cqi
//     in from the side, the way the shipped meridian, savile and gallery set their glyph. A glyph
//     of any width then keeps its edge on the slide edge, which a centered translate cannot.
const MARK_TEXT_BASE_CQI = 30;
function markTextSlots(r, mixPct, p) {
  const scale = clampInt(r.mark.scale ?? MARK_SCALE.default, MARK_SCALE.min, MARK_SCALE.max, MARK_SCALE.default);
  const angle = clampInt(r.mark.angle ?? MARK_ANGLE.default, MARK_ANGLE.min, MARK_ANGLE.max, MARK_ANGLE.default);
  const fs = Math.max(6, Math.round((MARK_TEXT_BASE_CQI * scale) / 100));
  const head = ['--fin-mark:none', `--fin-mark-text:"${sanitizeGlyph(r.mark.glyph)}"`, `--fin-mark-color:${p.mix(mixPct, 'opaque')}`, `--fin-mark-fs:${fs}cqi`];
  if (r.mark.anchor === 'corner') {
    const { align, justify } = cornerAlign(r.mark.placement);
    const inset = clampInt(r.mark.inset ?? MARK_INSET.default, MARK_INSET.min, MARK_INSET.max, MARK_INSET.default);
    return [...head, `--fin-mark-pad:0 ${inset}cqi`, `--fin-mark-align:${align}`, `--fin-mark-justify:${justify}`, ...(angle ? [`--fin-mark-transform:rotate(${angle}deg)`] : [])];
  }
  const x = clampInt(r.mark.x ?? placementXY(r.mark.placement).x, 0, 100, 50);
  const y = clampInt(r.mark.y ?? placementXY(r.mark.placement).y, 0, 100, 50);
  // translate % is relative to the ::before's own box (the slide), so (x-50, y-50) moves the
  // centered glyph's center to (x%, y%); rotate after translate tilts it in place.
  return [...head, '--fin-mark-align:center', '--fin-mark-justify:center', '--fin-mark-pad:0', `--fin-mark-transform:translate(${x - 50}%, ${y - 50}%) rotate(${angle}deg)`];
}

/**
 * Every layer of a recipe in one face, as structured values: each background slot is a LIST of
 * layers, so a caller can print it on one line (the Studio) or one layer per line (the build).
 */
function layerPlan(r, face, tok) {
  const p = painter(tok);
  // The hairline strip sits on top of the wash layers; it may stand alone over a `none` wash.
  const hair = r.wash.hairline ? [p.hairlineImage(face)] : [];
  const washBody = p.washImage(r.wash.type, r.wash.intensity, face, r.wash.x, r.wash.y, r.wash.spread);
  const wash = [...hair, ...washBody];
  const texture = p.textureImage(r.texture.type, r.texture.intensity, r.texture.scale, face);

  // The aux slots line up with the compositor's one background-image list: every texture
  // layer, then every wash layer. An empty texture or wash still holds one no-op entry.
  const texSize = textureSize(r.texture.type, r.texture.scale);
  const texEntries = Math.max(1, texture.length);
  const washSizes = [...hair.map(() => HAIRLINE_SIZE), ...washBody.map(() => 'cover')];
  const size = [...Array(texEntries).fill(texSize), ...(washSizes.length ? washSizes : ['auto'])];
  const repeat = [...Array(texEntries).fill(texture.length ? 'repeat' : 'no-repeat'), ...Array(Math.max(1, washSizes.length)).fill('no-repeat')];

  // z3 — the mark: small solid shapes or an opaque ghost glyph, never an area fade, so it is
  // the same in both faces.
  let mark;
  switch (r.mark.type) {
    case 'bar':
      mark = { image: [p.solid], slots: ['--fin-mark-position:left center', '--fin-mark-size-bg:1.1cqi 100%'] };
      break;
    case 'rule':
      mark = { image: [p.solid], slots: ['--fin-mark-position:left center', '--fin-mark-size-bg:0.47cqi 100%'] };
      break;
    case 'tick': {
      const at = markPos(r.mark.placement);
      mark = { image: [p.solid, p.solid], slots: [`--fin-mark-position:${at}, ${at}`, '--fin-mark-size-bg:2.65cqi 0.16cqi, 0.16cqi 2.65cqi', '--fin-mark-repeat:no-repeat, no-repeat'] };
      break;
    }
    case 'monogram':
    case 'numeral':
      mark = { image: [], text: markTextSlots(r, 9, p) };
      break;
    default:
      mark = { image: [], slots: [] };
  }

  // z4 — the edge.
  const edge = p.edgeImage(r.edge, face);
  let edgeSlots = [];
  if (r.edge.type === 'vignette') edgeSlots = ['--fin-edge-position:center', '--fin-edge-size:cover'];
  else if (r.edge.type === 'fold') edgeSlots = ['--fin-edge-position:top right', '--fin-edge-size:9.4cqi 9.4cqi'];
  else if (r.edge.type === 'margin-rule') edgeSlots = ['--fin-edge-position:right center', '--fin-edge-size:0.47cqi 100%'];
  else if (r.edge.type === 'frame') {
    // An inset museum FRAME: two stacked solid inset box-shadows on the SECTION (the engine
    // reserves ::after for the paginator), a canvas-colored mat and then an accent keyline.
    // Opaque and blur-free, so identical in both faces. In the SECTION's own cqi (--_sec-1cqi):
    // a bare cqi on the section resolves against its container, not the slide.
    const c = `color-mix(in srgb, ${tok.accent} ${Math.round(Math.min(48, 26 + r.edge.intensity))}%, ${tok.canvas})`;
    edgeSlots = [`--fin-frame:inset 0 0 0 calc(2.6 * var(--_sec-1cqi, 1cqi)) ${tok.canvas}, inset 0 0 0 calc(2.82 * var(--_sec-1cqi, 1cqi)) ${c}`];
  }
  return { wash, texture, size, repeat, mark, edge, edgeSlots };
}

const list = (layers) => (layers.length ? layers.join(', ') : 'none');

/**
 * The slot declarations (no selector) for a recipe in one FACE, as the Studio emits them.
 * 'rich' fades full-bleed layers to transparent (screen); 'opaque' ends them on the canvas.
 */
function recipeSlots(recipe, face = 'opaque', tok = STUDIO_TOKENS) {
  const r = coerceRecipe(recipe);
  const plan = layerPlan(r, face, tok);
  const decls = [`--fin-wash:${list(plan.wash)}`, `--fin-texture:${list(plan.texture)}`, `--fin-size:${plan.size.join(', ')}`, `--fin-repeat:${plan.repeat.join(', ')}`];
  if (plan.mark.text) decls.push(...plan.mark.text);
  else if (plan.mark.image.length) decls.push(`--fin-mark:${list(plan.mark.image)}`, ...plan.mark.slots);
  else decls.push('--fin-mark:none', '--fin-mark-text:""');
  decls.push(`--fin-edge:${plan.edge}`, ...plan.edgeSlots);
  return decls;
}

// The slots whose VALUE differs between faces, so a Studio finish's export override re-emits
// them opaque. The aux slots and the marks are face-invariant.
const OPAQUE_OVERRIDE_SLOTS = ['--fin-wash', '--fin-texture', '--fin-edge'];
function opaqueOverrideDecls(r) {
  const out = recipeSlots(r, 'opaque').filter((d) => OPAQUE_OVERRIDE_SLOTS.some((s) => d.startsWith(`${s}:`)));
  // A baked clearance mask flips to its hard-edged mirror in THIS finish's own export rules:
  // base.finish.css flips it only at `section.finish` (0,1,1), lower than this finish's
  // (0,2,1) rich setter, so that flip would lose and the feathered mask would gray in the PDF.
  if (r.backdrop?.clearance || r.backdrop?.spotlight) out.push('--fin-backdrop-mask: var(--fin-backdrop-mask-opaque, none)');
  return out;
}

/** Sanitize arbitrary text to a class slug fragment (`[a-z0-9-]`), or 'custom'. */
function safeFinishSlug(name) {
  return (
    String(name)
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 40)
      .replace(/-+$/, '') || 'custom'
  );
}

// The BAKED backdrop layer, the finish's fifth, as `--fin-backdrop-*` tokens. Spotlight (reveal
// one window) wins over clearance (clear the center); both ship a rich feather and a hard opaque
// mirror. Clamped numbers and fixed tokens only (HARD RULE #22).
function backdropSlots(r) {
  const out = [];
  const s = r.backdrop?.strength;
  if (s != null && s < 1) out.push(`--fin-backdrop-strength: ${Math.min(1, Math.max(0, s)).toFixed(2)}`);
  const spot = r.backdrop?.spotlight;
  if (spot) {
    out.push(`--fin-backdrop-mask: ${spotlightMask(spot, 'rich')}`);
    out.push(`--fin-backdrop-mask-opaque: ${spotlightMask(spot, 'opaque')}`);
  } else if (r.backdrop?.clearance) {
    out.push('--fin-backdrop-mask: var(--backdrop-clear-mask)');
    out.push('--fin-backdrop-mask-opaque: var(--backdrop-clear-mask-opaque)');
  }
  return out;
}

// The SPOTLIGHT mask: a canvas overlay that reveals the finish in one window and hides it
// elsewhere. RICH feathers the edge; OPAQUE is one hard stop (a feathered fade grays in a PDF).
function spotlightMask(spot, face) {
  const x = spot.x.toFixed(0);
  const y = spot.y.toFixed(0);
  const rr = spot.radius.toFixed(0);
  return face === 'opaque'
    ? `radial-gradient(ellipse ${rr}% ${rr}% at ${x}% ${y}%, transparent 70%, var(--fin-canvas, var(--bg)) 70%)`
    : `radial-gradient(ellipse ${rr}% ${rr}% at ${x}% ${y}%, transparent 42%, var(--fin-canvas, var(--bg)) 96%)`;
}

/**
 * A Studio-fabricated finish's CSS: `section.finish.finish-<slug>` with the rich face, then the
 * opaque face under `@media print` (the CLI's vector PDF) and `.lattice-exporting` (the Studio's
 * raster). The slug is re-sanitized here, so a crafted name cannot escape the selector.
 */
function generateFinishCss(slug, recipe) {
  const safe = safeFinishSlug(slug);
  const r = coerceRecipe(recipe);
  const sel = `section.finish.finish-${safe}`;
  const rich = `${sel} {\n  ${[...recipeSlots(r, 'rich'), ...backdropSlots(r)].join(';\n  ')};\n}`;
  const opaqueBody = opaqueOverrideDecls(r).join(';\n  ');
  const print = `@media print {\n  ${sel} {\n  ${opaqueBody};\n  }\n}`;
  // The export class matches an ANCESTOR (the capture root) OR the section itself, which the
  // Studio's html-to-image raster needs: it clones only the section, not its ancestors.
  const exporting = `:where(.lattice-exporting) ${sel},\n${sel}.lattice-exporting {\n  ${opaqueBody};\n}`;
  return `${rich}\n${print}\n${exporting}`;
}

/**
 * Apply a deck's `finish-override:` map (a PARTIAL recipe nested by layer) to a finish's recipe:
 * each present layer is shallow-merged over the finish's, then `coerceRecipe` clamps the result
 * and drops reset-to-default axes. Regenerate with `generateFinishCss(slug, merged)`.
 */
function mergeFinishOverride(recipe, override) {
  const merged = { ...recipe };
  for (const layer of Object.keys(override || {})) {
    const b = recipe[layer];
    merged[layer] = b && typeof b === 'object' ? { ...b, ...override[layer] } : override[layer];
  }
  return coerceRecipe(merged);
}

/**
 * A small picker-chip background for a recipe: its most salient layer, bumped for visibility at
 * ~16px. Chips are on-screen UI, so they use the opaque face on a known background.
 */
function generateSwatch(recipe) {
  const r = coerceRecipe(recipe);
  const p = painter(STUDIO_TOKENS);
  if (r.wash.type !== 'none') return { background: p.washImage(r.wash.type, Math.min(40, r.wash.intensity * 3.5), 'opaque').join(', ') };
  if (r.texture.type !== 'none') {
    const s = Math.max(6, Math.round(r.texture.scale / 4));
    return { background: p.textureImage(r.texture.type, Math.min(40, r.texture.intensity * 3), s, 'opaque').join(', '), backgroundSize: textureSize(r.texture.type, s) };
  }
  if (r.edge.type !== 'none') return { background: p.edgeImage({ type: r.edge.type, intensity: Math.min(40, r.edge.intensity * 3) }, 'opaque') };
  return { background: 'var(--fin-canvas, var(--bg))' };
}

module.exports = {
  WASH_TYPES,
  TEXTURE_TYPES,
  MARK_TYPES,
  EDGE_TYPES,
  PLACEMENTS,
  MARK_SCALE,
  MARK_ANGLE,
  MARK_INSET,
  WASH_SPREAD,
  SPOT_RADIUS,
  DEFAULT_RECIPE,
  sanitizeGlyph,
  placementXY,
  washHasHotspot,
  coerceRecipe,
  recipeSlots,
  safeFinishSlug,
  generateFinishCss,
  // For lib/finishes/preset-css.js (the build's preset writer), not for the Studio.
  _presetInternals: { layerPlan, ENGINE_TOKENS, list },
  mergeFinishOverride,
  generateSwatch,
};
