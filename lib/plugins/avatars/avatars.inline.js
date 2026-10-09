/**
 * THE AVATARS KERNEL, and the plugin's inline-code kind (`contributes.inline.avatar`, sigil `!`):
 * `!{Ada Okafor, hair=coily, glasses=round, c3}` read, resolved and built, in one place (HARD RULE
 * #1). The host's dispatcher (lib/core/inline-code-directives.js) asks this row after its own marks,
 * pills and sparks, and keeps the order and the escape. Design:
 * engineering/decisions/2026-10-09-inline-avatars.md.
 *
 * SHAPED LIKE lib/plugins/icons/icons.inline.js, ON PURPOSE. Pure: no DOM, no markdown-it, no fs.
 * `read()` returns FIELDS, never markup; the markdown-it path builds a string from them
 * (`avatarHtml`), the runtime builds real nodes (`avatarElement`) with `createElementNS`, because
 * assigning markup inside an already-sanitized preview frame is the post-sanitize injection HARD
 * RULE #22 bars.
 *
 * THE NAME CHOOSES EVERY TRAIT THE AUTHOR DID NOT. A trait not written is drawn from its pool by a
 * hash of the name and the trait, so `!{Ada Okafor}` is the same face on every render and every
 * surface, and a roster of twelve is twelve short spans. `gender=` swaps the pools for hair, beard
 * and brows (a PRESET of defaults, never a lock: any trait written wins). Nothing is random.
 *
 * TWO HALVES, AND ONLY ONE IS HEAVY, as for icons. The VOCABULARY (trait names, options, pools) is
 * small and required here, so a span reads and lints the same everywhere. The DRAWINGS and colors
 * (avatars.data.generated.js) come through lib/plugins/plugin-data.js, so a deck with no avatar
 * loads none. Until they are here `read` still answers and the builders return null, which leaves
 * the span as the author wrote it.
 *
 * THE COLORS ARE IDENTITY, NOT PALETTE. Skin, hair, eyes and clothes are fixed colors from
 * traits.json, written as SVG paint attributes: a person's skin does not change with the theme. The
 * TILE behind them (background, border) is the deck's: chart color slots, in avatars.styles.css.
 */

const { compileSlot } = require('../../core/segno-spec.js');
const { pluginData } = require('../plugin-data.js');
const VOCAB = require('./avatars.vocab.generated.js');

const SIZES = Object.freeze(['sm', 'md', 'lg', 'xl']);
const SHAPES = Object.freeze(['circle', 'rounded', 'square']);
const FRAMES = Object.freeze(['framed', 'bare']);
/** Every trait, in the order the docs and `data-traits` list them. */
const TRAIT_ORDER = Object.freeze(['skin', 'hair', 'hair-color', 'face', 'eyes', 'eye-color', 'brows', 'nose', 'mouth', 'beard', 'glasses', 'top']);

/** The `!{…}` slot: the person's name first, then frame words bare and traits by name. */
const SPEC = Object.freeze({
  label: 'an avatar',
  tag: '!',
  positional: [{ name: 'name', type: 'text' }],
  params: {
    color: { type: 'indexed', prefix: 'c', max: 12, label: 'a color' },
    size: { type: 'oneOf', values: SIZES },
    shape: { type: 'oneOf', values: SHAPES },
    frame: { type: 'oneOf', values: FRAMES },
    border: { type: 'indexed', prefix: 'c', max: 12, label: 'a color', named: true },
    gender: { type: 'oneOf', values: VOCAB.GENDERS, named: true },
    ...Object.fromEntries(TRAIT_ORDER.map((t) => [t, { type: 'oneOf', values: VOCAB.TRAITS[t], named: true }])),
    label: { type: 'text', named: true },
  },
});

let slot = null;
const avatarSlot = () => (slot ??= compileSlot(SPEC, 'avatars.avatar'));

/**
 * FNV-1a, 32-bit, then murmur3's fmix32 finalizer: a stable, dependency-free hash.
 *
 * THE FINALIZER IS LOAD-BEARING. Bare FNV-1a's low bits depend only on the low bits of its input,
 * and `pick` reads the low bits (`% pool.length`). Every trait key shares the name as its tail, so
 * without the finalizer every 8-entry pool landed on the same index up to a fixed permutation: over
 * 2000 names the tile color equaled `c` + skin tone 2000 times out of 2000, and skin fixed the top
 * and the nose (HARD RULE #25 checker). fmix32 mixes every input bit into every output bit, so the
 * traits a name picks are independent. Changing this changes every default face.
 */
function hash(s) {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  h ^= h >>> 16;
  h = Math.imul(h, 0x85ebca6b);
  h ^= h >>> 13;
  h = Math.imul(h, 0xc2b2ae35);
  h ^= h >>> 16;
  return h >>> 0;
}

/** The key a name hashes under: case, spacing and Unicode form do not change the face. */
const nameKey = (name) => String(name).normalize('NFC').trim().replace(/\s+/g, ' ').toLowerCase();

/**
 * One trait's default for a name: its pool, hashed. The gender preset's pool first, then the deep
 * pool when the skin is one of the deeper tones (so a default is never a rare pairing), then the
 * shared one. `skin` resolves first (TRAIT_ORDER), so it is known by the time hair color is picked.
 */
function pick(key, trait, gender, skin) {
  const deep = skin && VOCAB.DEEP.skin.includes(skin) ? VOCAB.DEEP.pools[trait] : null;
  const pool = VOCAB.PRESETS[gender]?.[trait] || deep || VOCAB.POOLS[trait];
  return pool[hash(`${trait}\u0000${key}`) % pool.length];
}

/**
 * Read one span's text as an avatar, with every trait resolved.
 * @returns {{name:string, label:string, size:string, shape:string|null, frame:string|null,
 *   c:string, border:string|null, gender:string, traits:Record<string,string>}|null} null when it is
 *   not an avatar at all (the O(1) reject) or is a broken one.
 */
function read(text) {
  if (typeof text !== 'string' || text.length < 4) return null;
  if (text.charCodeAt(0) !== 0x21 /* ! */ || text.charCodeAt(1) !== 0x7b /* { */) return null;
  const r = avatarSlot().read(text);
  if (!r.ok) return null;
  const v = r.value;
  const name = String(v.name || '').trim();
  if (!name) return null;
  const key = nameKey(name);
  const gender = v.gender || 'neutral';
  const traits = {};
  for (const t of TRAIT_ORDER) traits[t] = v[t] || pick(key, t, gender, traits.skin);
  return {
    name,
    // A blank `label=""` would leave an image role with no name: use the person's.
    label: (v.label && String(v.label).trim()) || name,
    size: v.size || 'md',
    shape: v.shape || null,
    frame: v.frame || null,
    c: v.color ? `c${v.color}` : pick(key, 'color', gender),
    border: v.border ? `c${v.border}` : null,
    gender,
    traits,
  };
}

/**
 * AN AVATAR ATTEMPT is `!{`, optional spaces, then something that is not a space, a `}` or a
 * backslash: a name can start with any letter in any script, so the gate is looser than an icon's.
 * The optional spaces let `!{ Ada}` be diagnosed (Segno wants the value right after the brace)
 * rather than left as code in silence. Nothing in a deck wrote `!{` before this plugin existed.
 */
const ATTEMPT = /^!\{\s*[^\s}\\]/;

/** Why a span that opens like an avatar does not render as one; null when it renders, or is not an attempt. */
function diagnose(text) {
  if (typeof text !== 'string' || !ATTEMPT.test(text) || text.includes('\\')) return null;
  const r = avatarSlot().read(text);
  if (r.ok) return String(r.value.name || '').trim() ? null : 'an avatar needs the person\'s name first — `!{Ada Okafor}`';
  return r.diagnostics[0].message;
}

/** No trait has an alias, so a deck cannot spell one avatar two ways. */
const spellings = () => [];

// ── Building ──────────────────────────────────────────────────────────────────────────────
const SVG_NS = 'http://www.w3.org/2000/svg';
/** The crop: the head and shoulders of the 100-unit drawing, so the face fills the tile. */
const VIEWBOX = '14 14 72 72';
const ESCAPES = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' };
const esc = (v) => String(v).replace(/[&<>"]/g, (ch) => ESCAPES[ch]);
const attrString = (pairs) => pairs.map(([k, v]) => ` ${k}="${esc(v)}"`).join('');

/** The color behind each paint role, for one person. */
function rolesFor(p, t) {
  const skin = p.skin[t.skin];
  const hair = p['hair-color'][t['hair-color']];
  return {
    ...p.fixed,
    skin: skin.base,
    lip: skin.lip,
    hair: hair.base,
    brow: hair.brow,
    eye: p['eye-color'][t['eye-color']],
    top: p.top[t.top],
  };
}

/** The drawing as [tag, attrs] pairs with every role resolved, in paint order; null without data. */
function nodesFor(f) {
  const data = pluginData('avatars');
  if (!data?.drawings || !data.palettes) return null;
  const d = data.drawings;
  const t = f.traits;
  const hair = d.hair[t.hair] || {};
  const layers = [hair.back, d.body, hair.mid, d.face[t.face], d.nose[t.nose], d.beard[t.beard],
    d.mouth[t.mouth], d.eyes[t.eyes], d.brows[t.brows], hair.front, d.glasses[t.glasses]];
  const roles = rolesFor(data.palettes, t);
  const out = [];
  for (const layer of layers) {
    for (const [tag, attrs] of layer || []) {
      const a = {};
      for (const [k, v] of Object.entries(attrs)) a[k] = v.charCodeAt(0) === 0x24 /* $ */ ? roles[v.slice(1)] : v;
      out.push([tag, a]);
    }
  }
  return out;
}

const svgAttrs = (cls) => [['class', cls], ['viewBox', VIEWBOX], ['aria-hidden', 'true'], ['focusable', 'false']];

/** The resolved traits, written back as the notation, so an author can pin a face they like. */
const traitsText = (f) => [`gender=${f.gender}`, ...TRAIT_ORDER.map((t) => `${t}=${f.traits[t]}`)].join(' ');

/**
 * The host span's attributes. `data-src` is the author's span, as on a spark and an icon, so an
 * editor can find it. Only what the author wrote on THIS avatar becomes `data-shape` /
 * `data-frame`; the slide class and the `avatar:` register fill in the rest in CSS. The tile color
 * is always stamped, written or hashed, so a roster reads as one designed wall.
 */
function hostAttrs(f, text) {
  const a = [['class', 'lat-avatar'], ['data-size', f.size], ['data-c', f.c], ['role', 'img'], ['aria-label', f.label],
    ['data-traits', traitsText(f)], ['data-src', text]];
  if (f.shape) a.push(['data-shape', f.shape]);
  if (f.frame) a.push(['data-frame', f.frame]);
  if (f.border) a.push(['data-border', f.border]);
  return a;
}

/** The `<svg>` of one avatar as a string, or null until the data is here. */
function svgHtml(f, cls = 'lat-avatar-svg') {
  const nodes = nodesFor(f);
  if (!nodes) return null;
  const body = nodes.map(([tag, attrs]) => `<${tag}${attrString(Object.entries(attrs))}/>`).join('');
  return `<svg${attrString(svgAttrs(cls))}>${body}</svg>`;
}

/** The same `<svg>` as real nodes. */
function svgElement(doc, f, cls = 'lat-avatar-svg') {
  const nodes = nodesFor(f);
  if (!nodes) return null;
  const svg = doc.createElementNS(SVG_NS, 'svg');
  for (const [k, v] of svgAttrs(cls)) svg.setAttribute(k, v);
  for (const [tag, attrs] of nodes) {
    const el = doc.createElementNS(SVG_NS, tag);
    for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, String(v));
    svg.appendChild(el);
  }
  return svg;
}

/** Render to an HTML string — the markdown-it path. */
function avatarHtml(text) {
  const f = read(text);
  if (!f) return null;
  const svg = svgHtml(f);
  return svg ? `<span${attrString(hostAttrs(f, text))}>${svg}</span>` : null;
}

/** Build the avatar as real nodes — the runtime's DOM path. Attributes only, never markup. */
function avatarElement(doc, text) {
  const f = read(text);
  if (!f) return null;
  const svg = svgElement(doc, f);
  if (!svg) return null;
  const host = doc.createElement('span');
  for (const [k, v] of hostAttrs(f, text)) host.setAttribute(k, String(v));
  host.appendChild(svg);
  return host;
}

/** The plugin's inline-code kind, as the manifest declares it. */
const inline = Object.freeze({
  avatar: Object.freeze({ resolve: read, html: avatarHtml, element: avatarElement, diagnose, spellings }),
});

module.exports = {
  inline,
  read, diagnose, spellings, avatarHtml, avatarElement, svgHtml, svgElement, nameKey,
  SPEC, SIZES, SHAPES, FRAMES, TRAIT_ORDER, VIEWBOX,
};
