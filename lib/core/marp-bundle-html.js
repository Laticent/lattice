/**
 * lib/core/marp-bundle-html.js — the HTML an Export-to-Marp bundle lets Marp pass through: an
 * ALLOWLIST, not a denylist (engineering/decisions/2026-08-17-theme-css-is-a-preview-sink.md § 13).
 *
 * The bundle's `marp.config.cjs` used to set `html: true`, because the runtime arrives as
 * `<script>` tags at the end of the deck, and marp-core escapes every tag when `html` is off. That
 * flag passed the deck's own HTML through too, so the bundle strips what can run from the deck's
 * markdown (lib/core/live-author-html.js `withoutLiveAuthorHtml`). A strip is a denylist, and a
 * denylist breaks quietly on the tag nobody remembered (`<base>` nearly was one).
 *
 * So the config now sets marp-core's `html` option to an allowlist: the tags and attributes the
 * shipped decks write, plus the plain authoring set below. marp-core runs every raw-HTML token
 * through js-xss with it; a tag it does not name is shown as text and an attribute it does not
 * name is dropped. `<script>` is not on it. The runtime's own tags get through a marp-cli
 * `engine:` plugin (`latticeBundle`) that passes an `html_block` through ONLY when it is, byte
 * for byte, one of the bundle's trailing blocks: a runtime `<script src>` naming one of the
 * bundle's own files, or one of the two inert JSON data blocks (lib/core/data-block.js, whose
 * payload never holds a raw `<`). An author who writes the same block gets the same harmless tag.
 *
 * The strip stays in front. It is what protects a recipient who opens the deck in a tool that
 * does not read this config (VS Code's preview, with its own `enableHtml`), and it means the deck
 * file itself is unchanged by this module: only what marp-cli makes of it is.
 *
 * WHY THE VALUE FILTER. marp-core replaces js-xss's own attribute-value check with one that only
 * escapes, so an allowed `href` would carry `javascript:` straight through. Every URL attribute
 * here takes `safeUrl`, which drops a `javascript:`, `vbscript:` or non-image `data:` value
 * (after the entity decoding and invisible-character removal marp-core already did).
 *
 * The config is generated text, so the code it carries is written ONCE, here, as source
 * (`bundleConfig`, written out by `configSource`), and test/unit/core/marp-bundle-html.test.js
 * evaluates that same source to test it.
 */

// Attributes every allowed element may carry.
const GLOBAL = Object.freeze(['class', 'style', 'id', 'title', 'lang', 'dir', 'role', 'aria-label', 'aria-hidden', 'aria-describedby']);
// SVG presentation attributes the shipped decks' inline drawings use, and their close kin.
const SVG_PAINT = Object.freeze([
  'fill', 'fill-opacity', 'fill-rule', 'stroke', 'stroke-width', 'stroke-linecap', 'stroke-linejoin',
  'stroke-dasharray', 'stroke-dashoffset', 'stroke-opacity', 'stroke-miterlimit', 'opacity', 'transform',
  'clip-path', 'clip-rule', 'mask', 'marker-start', 'marker-mid', 'marker-end', 'vector-effect',
]);

/**
 * Tag → the attributes it may carry beyond `GLOBAL`. The measured set (every tag and attribute in
 * the raw HTML of the 422 shipped `marp: true` decks, through the bundle, on 2026-10-07) is a
 * subset; the rest is the plain authoring vocabulary a deck can reasonably write. Not here, on
 * purpose: `script`, `iframe`, `object`, `embed`, `form` and its controls, `base`, `meta`, `link`,
 * `style` (Marp reads a deck's `<style>` before render, so it never reaches this filter), SVG
 * `use`/`image`/`foreignObject`/`animate*` (each can load or run something), and any `on…`.
 */
const TAGS = Object.freeze({
  // Text.
  a: ['href', 'target', 'rel'], abbr: [], b: [], bdi: [], bdo: [], blockquote: ['cite'], br: [], cite: [],
  code: [], del: [], dfn: [], em: [], i: [], ins: [], kbd: [], mark: [], q: ['cite'], s: [], samp: [],
  small: [], span: [], strong: [], sub: [], sup: [], time: ['datetime'], u: [], var: [], wbr: [],
  // Blocks (`align` is legacy, and still how pasted HTML centers things).
  div: ['data-dock', 'align'], p: ['align'], pre: [], hr: [], center: [],
  h1: ['align'], h2: ['align'], h3: ['align'], h4: ['align'], h5: ['align'], h6: ['align'],
  figure: [], figcaption: [], details: ['open'], summary: [], section: [], header: [], footer: [],
  aside: [], ul: [], ol: ['start', 'reversed', 'type'], li: ['value'], dl: [], dt: [], dd: [],
  // Tables.
  table: ['align', 'width'], caption: [], colgroup: ['span', 'width'], col: ['span', 'width'], thead: [], tbody: [],
  tfoot: [], tr: ['align', 'valign'], th: ['colspan', 'rowspan', 'scope', 'abbr', 'align', 'valign', 'width'],
  td: ['colspan', 'rowspan', 'align', 'valign', 'width'],
  // Media. A web image is a feature in any Marp deck (§ 11, "What it does not do"), and so is a
  // video or a remote frame: what it loads runs in its own origin, not the deck's. A frame takes
  // an `https:` page only, and never `srcdoc`.
  img: ['src', 'srcset', 'sizes', 'alt', 'width', 'height', 'align', 'loading', 'decoding'],
  picture: [], source: ['src', 'srcset', 'sizes', 'type', 'media'],
  video: ['src', 'poster', 'width', 'height', 'controls', 'autoplay', 'muted', 'loop', 'playsinline', 'preload'],
  audio: ['src', 'controls', 'autoplay', 'muted', 'loop', 'preload'],
  iframe: ['src', 'width', 'height', 'allowfullscreen', 'loading', 'referrerpolicy', 'sandbox', 'frameborder'],
  // Inline SVG drawings, paint servers and clips included: Fabricate Motion keeps them on purpose
  // (docs/src/components/studio/motion/svg-intake.ts), and a gradient fill that points at a
  // missing <linearGradient> paints nothing at all.
  svg: ['viewbox', 'xmlns', 'width', 'height', 'preserveaspectratio', 'data-lattice-motion', ...SVG_PAINT],
  g: [...SVG_PAINT], title: [], desc: [], defs: [], symbol: ['viewbox', 'preserveaspectratio'],
  use: ['href', 'xlink:href', 'x', 'y', 'width', 'height', ...SVG_PAINT],
  path: ['d', 'pathlength', ...SVG_PAINT],
  circle: ['cx', 'cy', 'r', ...SVG_PAINT],
  ellipse: ['cx', 'cy', 'rx', 'ry', ...SVG_PAINT],
  rect: ['x', 'y', 'width', 'height', 'rx', 'ry', ...SVG_PAINT],
  line: ['x1', 'y1', 'x2', 'y2', ...SVG_PAINT],
  polyline: ['points', ...SVG_PAINT],
  polygon: ['points', ...SVG_PAINT],
  text: ['x', 'y', 'dx', 'dy', 'text-anchor', 'dominant-baseline', 'font-size', 'font-weight', 'font-family', 'letter-spacing', ...SVG_PAINT],
  tspan: ['x', 'y', 'dx', 'dy', 'text-anchor', 'dominant-baseline', 'font-size', 'font-weight', 'font-family', 'letter-spacing', ...SVG_PAINT],
  lineargradient: ['x1', 'y1', 'x2', 'y2', 'gradientunits', 'gradienttransform', 'spreadmethod'],
  radialgradient: ['cx', 'cy', 'r', 'fx', 'fy', 'fr', 'gradientunits', 'gradienttransform', 'spreadmethod'],
  stop: ['offset', 'stop-color', 'stop-opacity'],
  clippath: ['clippathunits', 'transform'],
  mask: ['x', 'y', 'width', 'height', 'maskunits', 'maskcontentunits'],
  pattern: ['x', 'y', 'width', 'height', 'patternunits', 'patterncontentunits', 'patterntransform', 'viewbox'],
  marker: ['viewbox', 'refx', 'refy', 'markerwidth', 'markerheight', 'markerunits', 'orient', 'preserveaspectratio'],
});

// The attributes whose value is a URL, per tag, and the filter each takes instead of `true`:
// `safeUrl` (nothing that can run), `safeSrcset` (the same, per candidate), `httpsOnly` (a frame's
// page) and `localRef` (an SVG `<use>` points inside the document, never at a file or a URL).
const URL_ATTRS = Object.freeze({
  a: { href: 'safeUrl' }, blockquote: { cite: 'safeUrl' }, q: { cite: 'safeUrl' },
  img: { src: 'safeUrl', srcset: 'safeSrcset' }, source: { src: 'safeUrl', srcset: 'safeSrcset' },
  video: { src: 'safeUrl', poster: 'safeUrl' }, audio: { src: 'safeUrl' },
  iframe: { src: 'httpsOnly' }, use: { href: 'localRef', 'xlink:href': 'localRef' },
});

/** The allowlist as data: tag → attribute names (GLOBAL included), sorted. */
const MARP_HTML_ALLOWLIST = Object.freeze(Object.fromEntries(Object.entries(TAGS).map(
  ([tag, attrs]) => [tag, Object.freeze([...new Set([...GLOBAL, ...attrs])].sort())],
)));

/**
 * The config's code: given the allowlist, the URL filters and the runtime's file names, return
 * the `html` option marp-core reads and the marp-cli functional `engine`. SELF-CONTAINED — it
 * names nothing outside its own body — because `configSource` writes it into the bundle's
 * `marp.config.cjs` as source (`bundleConfig.toString()`), where it runs with nothing but marp-cli
 * installed. The unit tests call this same function.
 * @param {Record<string, string[]>} allowlist  tag → attribute names
 * @param {Record<string, Record<string, string>>} urlAttrs  tag → attribute → filter name
 * @param {string[]} runtimeSrcs  the bundle's runtime files, the only `<script src>` let through
 */
function bundleConfig(allowlist, urlAttrs, runtimeSrcs) {
  // A URL that can run nothing: no javascript:, vbscript: or non-image data: (marp-core has
  // already decoded entities and removed invisible characters from an attribute value).
  const safeUrl = (value) => {
    // biome-ignore lint/suspicious/noControlCharactersInRegex: the URL parser drops them, so must we.
    const v = String(value).replace(/[\u0000-\u0020]/g, '').toLowerCase();
    if (/^(?:javascript|vbscript):/.test(v)) return '';
    if (v.startsWith('data:') && !/^data:image\/(?:png|jpe?g|gif|webp|avif)[;,]/.test(v)) return '';
    return value;
  };
  const filters = {
    safeUrl,
    safeSrcset: (value) => (String(value).split(',').every((c) => safeUrl(c.trim()) !== '') ? value : ''),
    httpsOnly: (value) => (/^https:\/\//i.test(String(value).trim()) ? value : ''),
    localRef: (value) => (/^#[\w.:-]+$/.test(String(value).trim()) ? value : ''),
  };
  const html = {};
  for (const [tag, attrs] of Object.entries(allowlist)) {
    html[tag] = {};
    for (const a of attrs) html[tag][a] = filters[(urlAttrs[tag] || {})[a]] || true;
  }
  // The bundle's own trailing blocks, the only raw HTML that skips the allowlist: the runtime's
  // <script src> tags and the two inert JSON data blocks (a payload with no raw "<"). Matched a
  // LINE at a time from the END of a block, because an author's unclosed <pre> or <textarea> on the
  // last slide runs on to the first line holding a closing tag, and so swallows a runtime line.
  const esc = (t) => t.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&');
  const trusted = [
    new RegExp(`^<script src="(?:${runtimeSrcs.map(esc).join('|')})"></script>$`),
    /^<script type="application\/lattice-(?:front-matter|export-settings)">[^<]*<\/script>$/,
  ];
  // NOTE: marp-core typesets math itself (MathJax), and its output does NOT pass the HTML allowlist
  // above — it is emitted by the math renderer, not an `html_block` token. That is a pre-existing
  // injection surface (MathJax commands like `\style`/`\unicode` write an unescaped `"` into an
  // attribute), unchanged by this bundle on `main`, and it is NOT addressed here: a regex guard was
  // tried and a red team defeated it (a `/`-separated handler, a CSS `url()` beacon). The complete
  // fix — baking math to sanitized SVG at export, or a parser-based cleaner on every surface — is a
  // separate change, tracked in followups.d/2589-p3-marp-bundle-math-style-breakout-in-vscode.md.
  function latticeBundle(md) {
    const sanitized = md.renderer.rules.html_block;
    md.renderer.rules.html_block = (tokens, idx, ...rest) => {
      const token = tokens[idx];
      const lines = token.content.replace(/\n$/, '').split('\n');
      let cut = lines.length;
      while (cut > 0 && trusted.some((t) => t.test(lines[cut - 1]))) cut--;
      if (cut === lines.length) return sanitized(tokens, idx, ...rest);
      const own = `${lines.slice(cut).join('\n')}\n`;
      if (cut === 0) return own;
      const whole = token.content;
      token.content = `${lines.slice(0, cut).join('\n')}\n`;
      try {
        return sanitized(tokens, idx, ...rest) + own;
      } finally {
        token.content = whole;
      }
    };
  }
  return { html, engine: ({ marp }) => marp.use(latticeBundle) };
}

/**
 * The config's code, as the source the bundle's `marp.config.cjs` carries: defines `html` and
 * `engine`.
 * @param {readonly string[]} runtimeSrcs  the bundle's runtime files (marp-bundle.js RUNTIME_SCRIPT_SRCS)
 */
function configSource(runtimeSrcs) {
  return `const { html, engine } = (${bundleConfig.toString()})(
  ${JSON.stringify(MARP_HTML_ALLOWLIST)},
  ${JSON.stringify(URL_ATTRS)},
  ${JSON.stringify([...runtimeSrcs])},
);
`;
}

/**
 * What the allowlist will refuse in this deck, so the producer can SAY so at export rather than
 * leave the recipient to find a tag printed as text, or a drawing gone blank because its gradient
 * was dropped (the inversion pass's strongest point). Reads the deck the way the strip does
 * (lib/core/live-author-html.js: code blanked, one forward tag scan). `<style>` is left out (Marp
 * reads it before the filter), and so are the tags the strip already removes and reports.
 * @param {string} markdown  the deck, without the bundle's trailing block
 * @returns {{ tags: Record<string, number>, attrs: Record<string, number> }}  `tag` → count, `tag[attr]` → count
 */
function refusedHtml(markdown) {
  const { _internal: { scanTags, maskMarkdown, ATTR } } = require('./live-author-html');
  const src = String(markdown ?? '');
  const tags = {};
  const attrs = {};
  if (!src.includes('<')) return { tags, attrs };
  const mask = maskMarkdown(src);
  for (const t of scanTags(src, mask)) {
    if (t.name === 'style' || t.name === 'script' || t.name === 'base' || t.name === 'meta') continue;
    const allowed = MARP_HTML_ALLOWLIST[t.name];
    if (!allowed) {
      tags[t.name] = (tags[t.name] || 0) + 1;
      continue;
    }
    for (const a of t.attrs.matchAll(ATTR)) {
      const n = a[1].toLowerCase();
      if (/^on[a-z]+$/.test(n) || n === 'srcdoc' || n === '/') continue;
      if (!allowed.includes(n)) attrs[`${t.name}[${n}]`] = (attrs[`${t.name}[${n}]`] || 0) + 1;
    }
  }
  return { tags, attrs };
}

/** The CLI's line for `refusedHtml`, or `''` when the deck writes nothing the list refuses. */
function formatRefusedHtml({ tags, attrs }) {
  // A name is the deck's own text: no control character reaches the terminal (no escape codes).
  // biome-ignore lint/suspicious/noControlCharactersInRegex: matching them is the point.
  const shown = (k) => k.replace(/[\u0000-\u001f\u007f-\u009f]/g, '?');
  const t = Object.entries(tags).map(([k, n]) => `<${shown(k)}>${n > 1 ? ` ×${n}` : ''}`);
  const a = Object.entries(attrs).map(([k, n]) => `${shown(k)}${n > 1 ? ` ×${n}` : ''}`);
  if (!t.length && !a.length) return '';
  return `  marp-cli will show ${t.length ? `these tags as text: ${t.join(', ')}` : ''}${t.length && a.length ? '; and drop ' : a.length ? 'drop ' : ''}${a.length ? `these attributes: ${a.join(', ')}` : ''}.`
    + ' They are outside the bundle\'s HTML list (marp.config.cjs). VS Code\'s preview still shows them.';
}

module.exports = { MARP_HTML_ALLOWLIST, URL_ATTRS, bundleConfig, configSource, refusedHtml, formatRefusedHtml };
