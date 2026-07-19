/**
 * Theme Studio — the AI tier's PURE pieces (Faculty 1, Phase 2). Building the
 * model prompt and coercing the model's reply into a valid essential set are
 * deterministic and `fs`-free, so they live here (bundled into the browser core
 * and unit-tested with a fake reply / MockBackend) while the actual model call
 * stays in the controller. The model only ever PROPOSES an essential set; the
 * deterministic derivation + contrast gate still dispose (lib/theme/derive.js).
 *
 * ONE conversational surface, not two: `askMessages(current, prompt)` always
 * sends the current palette as context plus the author's words. The model
 * returns a full redesign when the words describe a new look, or an adjustment
 * when they ask for a change — the UI doesn't make the author pick "seed" vs
 * "refine". `coerceEssentials` is forgiving — snake_case / aliased keys, and
 * anything missing or malformed falls back — so a partial tweak keeps the
 * untouched colours and an off reply still yields a derivable set.
 */

const { ESSENTIAL_KEYS, RAMP_STRATEGIES, normalizeStrategy, CATEGORICAL_COUNT, requiredTokenList } = require('./derive.js');
const { normalizeHex, AA_LARGE } = require('./color.js');

const KEY_DESCRIPTIONS = {
  bg: 'light page canvas, near-white',
  bgAlt: 'slightly darker card / alternate surface (still light)',
  textHeading: 'near-black heading ink',
  textBody: 'dark grey body ink',
  textMuted: 'mid grey, decorative',
  accent: 'the brand colour, saturated and distinct',
  accentSoft: 'a very pale wash of the accent',
  pass: 'success green',
  warn: 'warning amber',
  fail: 'error red',
};

/**
 * Distilled canon (themes/README.md) so the model's essentials ANTICIPATE the
 * deterministic OKLCH derivation downstream. We do not ask the model to author
 * the derived tokens — we tell it how its 10 choices fan out, so it picks
 * well (e.g. an accent with enough chroma to read as a saturated diagram stroke
 * AND to seed the categorical ramp). `indaco` is the worked example.
 *
 * The FALSIFIABLE facts — the full token-contract size, the categorical slot
 * count, and the graphical-edge threshold — are interpolated from the engine's
 * own source (`requiredTokenList`, `CATEGORICAL_COUNT`, `AA_LARGE`), so the
 * numbers the model is told can never drift from what the derivation emits. The
 * teaching prose (the three-layer flipping model) is hand-written; a drift test
 * (test/unit/palette/theme-canon.test.js) holds both true to source.
 */
const THEME_CANON =
  'HOW LATTICE THEMES WORK (so you choose well):\n' +
  `• Your 10 colours are ESSENTIALS. The engine derives the rest of the ` +
  `${requiredTokenList().length}-token contract from them in OKLCH and repairs ` +
  'every pair to WCAG AA in BOTH light and dark canvases — you never hand-author ' +
  'the rest. Pick essentials that derive cleanly.\n' +
  '• Categorical data-viz uses a THREE-LAYER, mode-flipping contract keyed off the ' +
  `accent HUE: each of ${CATEGORICAL_COUNT} slots is one hue drawn as a fill + a ` +
  'mark (its border). Light canvas = pale fill + deep mark; dark canvas = deep ' +
  '"jewel" fill + pale mark; the label ink flips with the fill so it stays legible, ' +
  `and the mark always clears ${AA_LARGE}:1 against the canvas. The engine derives ` +
  'and AA-repairs all of it — so pick an accent that is saturated and distinctly ' +
  'hued.\n' +
  '• A dark canvas band is derived from the accent hue at low lightness; ink is ' +
  'lifted to stay readable. Choose a textBody that lightens gracefully.\n' +
  '• Worked example (indaco): bg #f7f8fb, bgAlt #eef1f6, textHeading #0f1b2d, ' +
  'textBody #243244, textMuted #6b7787, accent #1f5fb0, accentSoft #e6eefb, ' +
  'pass #1f7a4d, warn #b26a00, fail #c0392b.\n';

const ASK_SYSTEM =
  'You are a palette designer for the Lattice slide engine. You will be given ' +
  'the CURRENT palette (as JSON) and a request. If the request describes a new ' +
  'look, return a complete new palette; if it asks for a change (e.g. "cooler", ' +
  '"more contrast", "navy accent"), adjust the current palette accordingly.\n\n' +
  THEME_CANON +
  '\nOutput ONLY a compact JSON object — no prose, no markdown — with EXACTLY ' +
  'these keys. The first ten are 6-digit hex colours (e.g. "#1a2b3c"):\n' +
  ESSENTIAL_KEYS.map(k => `  "${k}": ${KEY_DESCRIPTIONS[k]}`).join('\n') +
  `\n  "rampStrategy": the categorical/chart hue layout — one of ${RAMP_STRATEGIES.map(s => `"${s}"`).join(', ')}. ` +
  'Pick the one that fits the brief: "spectrum" broad & distinct, "analogous" ' +
  'calm & cohesive, "triad" balanced & lively, "complementary" high-contrast ' +
  'pairs, "brand-mono" restrained single-hue.\n' +
  '  "name": a short lowercase slug naming THIS palette (a–z, 0–9, hyphens; ' +
  'start with a letter), evocative of the look — e.g. "harbor-slate", ' +
  '"terracotta-warm". Not a generic word like "theme" or "palette".\n' +
  '  "description": ONE plain sentence describing the palette\'s character and ' +
  'best use — it becomes the theme\'s caption in the export header and README.\n' +
  'Rules: bg and bgAlt must be light (a slide canvas); textHeading and ' +
  'textBody must be dark enough to read on them; accent is saturated; ' +
  'accentSoft is a pale tint of the accent. Output the full JSON object with ' +
  'all keys.';

/**
 * Messages for ONE conversational request — works for both originate
 * ("warm editorial, terracotta") and adjust ("cooler"). The current palette
 * is threaded as context so a relative tweak has a baseline.
 */
function askMessages(current, prompt) {
  return [
    { role: 'system', content: ASK_SYSTEM },
    { role: 'assistant', content: JSON.stringify(current || {}) },
    { role: 'user', content: String(prompt || '').trim() || 'a clean, professional palette' },
  ];
}

/**
 * Turn arbitrary model text into a valid engine theme slug (`^[a-z][a-z0-9-]*$`),
 * or '' when nothing usable remains (caller falls back to a derived name).
 * Mirrors the docs-site `slugify` (theme-library.ts) so the kernel and the UI
 * agree on what a theme name looks like.
 */
function slugifyName(text) {
  const s = String(text || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .replace(/^[^a-z]+/, ''); // a theme name must START with a letter
  return s.slice(0, 40).replace(/-+$/, '');
}

// Collapse a model's description to one clean, length-capped sentence.
function cleanDescription(text) {
  const s = String(text || '').replace(/\s+/g, ' ').trim();
  return s.slice(0, 160);
}

// Normalize a key (snake/kebab/space → lowercase alnum) for forgiving matching.
const norm = k => String(k).toLowerCase().replace(/[^a-z0-9]/g, '');
const KEY_BY_NORM = (() => {
  const m = {};
  for (const k of ESSENTIAL_KEYS) m[norm(k)] = k;
  // common aliases a model might emit
  Object.assign(m, {
    background: 'bg', canvas: 'bg', surface: 'bg',
    bgalt: 'bgAlt', backgroundalt: 'bgAlt', card: 'bgAlt', surfacealt: 'bgAlt',
    heading: 'textHeading', headingink: 'textHeading', textheading: 'textHeading', ink: 'textHeading',
    body: 'textBody', textbody: 'textBody', bodyink: 'textBody',
    muted: 'textMuted', textmuted: 'textMuted',
    accentsoft: 'accentSoft', accentsoftfill: 'accentSoft',
    success: 'pass', warning: 'warn', error: 'fail', danger: 'fail',
  });
  return m;
})();

function safeParse(s) {
  try {
    return JSON.parse(s);
  } catch {
    const m = String(s).match(/\{[\s\S]*\}/);
    if (m) {
      try {
        return JSON.parse(m[0]);
      } catch {
        /* fall through */
      }
    }
    return null;
  }
}

/**
 * Coerce a model reply (object, or JSON string) into a valid essential set.
 * Unknown/malformed/missing values fall back to `fallback`. Returns
 * `{ essentials, rampStrategy, name, description, filled, applied, ok }` —
 * `filled` lists keys taken from the fallback, `applied` lists keys the model
 * actually set, `ok` = nothing missing AND at least one key applied (so a
 * no-model floor that echoes the fallback reads as not-ok). `rampStrategy` is
 * normalized to a known strategy (DEFAULT_STRATEGY when absent/unknown) — it is
 * advisory and never blocks `ok`. `name` is a slugified suggestion (or '' when
 * the model gave nothing usable) and `description` a one-sentence caption (or
 * '') — both advisory metadata the UI seeds and the author can edit, captured
 * in the model so export can stamp the theme header/README.
 */
function coerceEssentials(raw, fallback) {
  const obj = (typeof raw === 'string' ? safeParse(raw) : raw) || {};
  const rampStrategy = normalizeStrategy(
    obj.rampStrategy ?? obj.ramp_strategy ?? obj.ramp ?? obj.strategy,
  );
  const name = slugifyName(obj.name ?? obj.slug ?? obj.title);
  const description = cleanDescription(obj.description ?? obj.desc ?? obj.caption ?? obj.summary);
  const remapped = {};
  for (const [k, v] of Object.entries(obj)) {
    const canonical = KEY_BY_NORM[norm(k)];
    if (canonical) remapped[canonical] = v;
  }
  const essentials = {};
  const filled = []; // keys taken from the fallback (missing/malformed)
  const applied = []; // keys the model set with a valid hex
  for (const key of ESSENTIAL_KEYS) {
    if (key in remapped) {
      try {
        essentials[key] = normalizeHex(remapped[key]);
        applied.push(key);
        continue;
      } catch {
        /* malformed — fall through to fallback */
      }
    }
    essentials[key] = fallback[key];
    filled.push(key);
  }
  return { essentials, rampStrategy, name, description, filled, applied, ok: filled.length === 0 && applied.length > 0 };
}

module.exports = { ASK_SYSTEM, THEME_CANON, askMessages, coerceEssentials };
