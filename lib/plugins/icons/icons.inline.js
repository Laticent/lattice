/**
 * THE ICONS KERNEL, and the plugin's inline-code kind (`contributes.inline.icon`, sigil `^`):
 * `^{database, c3, lg}` read, resolved and built, in one place (HARD RULE #1). The host's dispatcher
 * (lib/core/inline-code-directives.js) asks this row after its own marks, pills and sparks, and
 * keeps the order and the escape; icons.services.js hands the same builders to a pill's `icon=`.
 * Design: engineering/decisions/2026-09-29-inline-icons.md (§ 5 the notation, § 6 the axes, § 7
 * rendering, § 8 accessibility).
 *
 * SHAPED LIKE lib/core/inline-sparks.js, ON PURPOSE. Pure: no DOM, no markdown-it, no fs.
 * `read()` is the one decision every path shares and it returns FIELDS, never markup. The
 * markdown-it path builds a string from them (`iconHtml`); the runtime builds real nodes
 * (`iconElement`) with `createElementNS`, because assigning markup inside an already-sanitized
 * preview frame is the post-sanitize injection HARD RULE #22 bars.
 *
 * TWO HALVES, AND ONLY ONE IS HEAVY. The VOCABULARY — names, aliases, the service-name coaching
 * table — is small, required here, and bundled wherever the dispatcher is (the linter, the
 * runtime), so a span reads and lints the same everywhere. The PATH DATA (icons.data.generated.js,
 * ~250 drawings) is never required: it comes through lib/plugins/plugin-data.js, so a deck with no
 * icon loads none (§ 6a "payload when used"). Until it is there, `read` still answers and the
 * builders return null, which leaves the span as the author wrote it.
 *
 * A SPAN THAT DOESN'T READ STAYS LITERAL, and nothing is guessed: the pill and spark rule, for
 * their reason. `diagnose()` says why, and for a vendor service name it names the role icon
 * (§ 4: `^{s3}` → "use `^{bucket}` and say S3 beside it").
 */

const { compileSlot } = require('../../core/segno-spec.js');
const { pluginData } = require('../plugin-data.js');
const VOCAB = require('./icons.vocab.generated.js');

const COLOR = { type: 'indexed', prefix: 'c', max: 12, label: 'a color' };
/** The three style axes, the same words and defaults as a spark's (lib/core/resolve-spark.js),
 *  and the same words the `icon:` register declares in the manifest. */
const FRAMES = Object.freeze(['framed', 'bare']);
const LOOKS = Object.freeze(['pigment', 'etching', 'tone']);
const CORNERS = Object.freeze(['square', 'rounded']);
const SIZES = Object.freeze(['sm', 'md', 'lg']);

/** The `^{…}` slot: the icon's name first, then any option words in any order. */
const SPEC = Object.freeze({
  label: 'an icon',
  tag: '^',
  positional: [{ name: 'name', type: { type: 'oneOf', values: VOCAB.NAMES, aliases: VOCAB.ALIASES } }],
  params: {
    color: COLOR,
    size: { type: 'oneOf', values: SIZES },
    frame: { type: 'oneOf', values: FRAMES },
    look: { type: 'oneOf', values: LOOKS },
    corners: { type: 'oneOf', values: CORNERS },
    label: { type: 'text', named: true },
  },
});

let slot = null;
const iconSlot = () => (slot ??= compileSlot(SPEC, 'icons.icon'));

/** Every canonical name and alias, lower case → the canonical name. */
const LOOKUP = new Map();
for (const n of VOCAB.NAMES) LOOKUP.set(n, n);
for (const [n, alts] of Object.entries(VOCAB.ALIASES)) for (const a of alts) LOOKUP.set(a, n);

/** The canonical icon for a name or alias, or null. */
function canonical(name) {
  return LOOKUP.get(String(name || '').trim().toLowerCase()) || null;
}

/** An icon's default accessible name: its own name in words (`load-balancer` → "load balancer"). */
const spoken = (name) => name.replace(/-/g, ' ');

/**
 * Read one span's text as an icon.
 * @returns {{name:string, c:string|null, size:string, frame:string|null, look:string|null,
 *   corners:string|null, label:string}|null} null when it is not an icon at all (the O(1) reject)
 *   or is a broken one.
 */
function read(text) {
  if (typeof text !== 'string' || text.length < 4) return null;
  if (text.charCodeAt(0) !== 0x5e /* ^ */ || text.charCodeAt(1) !== 0x7b /* { */) return null;
  const r = iconSlot().read(text);
  if (!r.ok) return null;
  const v = r.value;
  return {
    name: v.name,
    c: v.color ? `c${v.color}` : null,
    size: v.size || 'md',
    frame: v.frame || null,
    look: v.look || null,
    corners: v.corners || null,
    // A blank `label=""` (or one of spaces) would leave an image role with no name: use the icon's.
    label: (v.label && String(v.label).trim()) || spoken(v.name),
  };
}

/** The nearest canonical names to `word`, for a "did you mean" (bounded, deterministic). */
function nearest(word, max = 2) {
  const w = String(word).toLowerCase();
  const scored = [];
  for (const n of LOOKUP.keys()) {
    const d = distance(w, n, 2);
    if (d <= 2) scored.push([d, n]);
  }
  scored.sort((a, b) => a[0] - b[0] || a[1].localeCompare(b[1]));
  return [...new Set(scored.map(([, n]) => LOOKUP.get(n)))].slice(0, max);
}

function distance(a, b, max) {
  if (Math.abs(a.length - b.length) > max) return max + 1;
  let prev = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    let low = i;
    for (let j = 1; j <= b.length; j++) {
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
      low = Math.min(low, cur[j]);
    }
    if (low > max) return max + 1;
    prev = cur;
  }
  return prev[b.length];
}

/**
 * Why a name is not an icon, coached (§ 4): a vendor service name gets its role icon, a typo
 * its nearest names. Shared with the pill's `icon=` so both say the same thing.
 */
function unknownName(word) {
  const w = String(word || '').trim().toLowerCase();
  const role = Object.hasOwn(VOCAB.SERVICES, w) ? VOCAB.SERVICES[w] : null;
  if (role) return `"${word}" is a service, not an icon — use the role icon \`${role}\` and put ${word} in the text beside it`;
  const near = nearest(w);
  return `"${word}" is not an icon${near.length ? ` — did you mean ${near.map((n) => `\`${n}\``).join(' or ')}?` : ' — the set is in lib/plugins/icons/icons.docs.md'}`;
}

/**
 * Why a span that opens like an icon (`^{` then a non-space) does not render as one, for
 * `lint:deck` and the escape; null when it renders, or is not an icon attempt at all.
 */
/**
 * AN ICON ATTEMPT starts with a word that could be a name: a letter, then at least one more name
 * character, before the first separator — and holds no backslash. Anything else after `^{` is
 * someone else's braces: TeX's accents and superscripts (`\^{o}`, `^{2}`, `^{\alpha}`), a regex.
 * The spark row draws the same line for `\~{n}`. Without it an escaped TeX accent lost its
 * backslash and `^{2}` drew an `icon-literal` warning (HARD RULE #25 red team).
 */
const ATTEMPT = /^\^\{[A-Za-z][A-Za-z0-9-]+\s*(?:[,}]|$)/;

function diagnose(text) {
  if (typeof text !== 'string' || !ATTEMPT.test(text) || text.includes('\\')) return null;
  const r = iconSlot().read(text);
  if (r.ok) return null;
  const d = r.diagnostics[0];
  // An unknown NAME is the common mistake; Segno would list all ~250 words, so coach instead.
  if (d.code === 'wrong-type' && d.from <= 2) return unknownName(text.slice(d.from, d.to).replace(/^"|"$/g, ''));
  return d.message;
}

/**
 * The icon NAME this span spells, as Segno reports it (the canonical name and the alias or name
 * written), for `lint:deck`'s one-spelling-per-deck rule (Segno decision 7): `^{db}` beside
 * `^{database}` is one icon written two ways. [] when the span is not an icon.
 */
function spellings(text) {
  if (!read(text)) return [];
  const r = iconSlot().read(text);
  return r.ok ? r.spellings.filter((sp) => sp.param === 'name') : [];
}

// ── Building ──────────────────────────────────────────────────────────────────────────────
const SVG_NS = 'http://www.w3.org/2000/svg';
const ESCAPES = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' };
const esc = (v) => String(v).replace(/[&<>"]/g, (ch) => ESCAPES[ch]);
const attrString = (pairs) => pairs.map(([k, v]) => ` ${k}="${esc(v)}"`).join('');

/** The drawing's nodes, or null when the data is not on this surface yet. */
function nodesOf(name) {
  const data = pluginData('icons');
  const nodes = data?.icons && Object.hasOwn(data.icons, name) ? data.icons[name] : null;
  return Array.isArray(nodes) ? nodes : null;
}

/** The `<svg>` of one icon as a string; `cls` names it for its host (an inline icon, a pill). */
function svgHtml(name, cls) {
  const nodes = nodesOf(name);
  if (!nodes) return null;
  const body = nodes.map(([tag, attrs]) => `<${tag}${attrString(Object.entries(attrs))}/>`).join('');
  return `<svg${attrString([['class', cls], ['viewBox', '0 0 24 24'], ['aria-hidden', 'true'], ['focusable', 'false']])}>${body}</svg>`;
}

/** The same `<svg>` as real nodes. */
function svgElement(doc, name, cls) {
  const nodes = nodesOf(name);
  if (!nodes) return null;
  const svg = doc.createElementNS(SVG_NS, 'svg');
  for (const [k, v] of [['class', cls], ['viewBox', '0 0 24 24'], ['aria-hidden', 'true'], ['focusable', 'false']]) svg.setAttribute(k, v);
  for (const [tag, attrs] of nodes) {
    const el = doc.createElementNS(SVG_NS, tag);
    for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, String(v));
    svg.appendChild(el);
  }
  return svg;
}

/**
 * The host span's attributes. `data-src` is the author's span, as on a spark, so an editor can
 * find it. Only what the author wrote on THIS icon becomes `data-frame` / `data-look` /
 * `data-corners`; the slide class and the `icon:` register fill in the rest in CSS.
 * An inline icon names itself (`role="img"`, § 8): it may stand where a word would.
 */
function hostAttrs(f, text) {
  const a = [['class', 'lat-icon'], ['data-icon', f.name], ['data-size', f.size], ['role', 'img'], ['aria-label', f.label], ['data-src', text]];
  if (f.c) a.push(['data-c', f.c]);
  if (f.frame) a.push(['data-frame', f.frame]);
  if (f.look) a.push(['data-look', f.look]);
  if (f.corners) a.push(['data-corners', f.corners]);
  return a;
}

/** Render to an HTML string — the markdown-it path. */
function iconHtml(text) {
  const f = read(text);
  if (!f) return null;
  const svg = svgHtml(f.name, 'lat-icon-svg');
  return svg ? `<span${attrString(hostAttrs(f, text))}>${svg}</span>` : null;
}

/** Build the icon as real nodes — the runtime's DOM path. Attributes only, never markup. */
function iconElement(doc, text) {
  const f = read(text);
  if (!f) return null;
  const svg = svgElement(doc, f.name, 'lat-icon-svg');
  if (!svg) return null;
  const host = doc.createElement('span');
  for (const [k, v] of hostAttrs(f, text)) host.setAttribute(k, String(v));
  host.appendChild(svg);
  return host;
}

/** The plugin's inline-code kind, as the manifest declares it. */
const inline = Object.freeze({
  icon: Object.freeze({ resolve: read, html: iconHtml, element: iconElement, diagnose, spellings }),
});

module.exports = {
  inline,
  read, diagnose, spellings, iconHtml, iconElement, svgHtml, svgElement, canonical, unknownName,
  SPEC, FRAMES, LOOKS, CORNERS, SIZES, NAMES: VOCAB.NAMES,
};
