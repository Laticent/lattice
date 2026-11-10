/**
 * THE IMAGE PLUGIN's inline-code kind (`contributes.inline.image`, named-only: `@image{…}`; Markdown's `![title](src
 * "description")` is its alias). Kernel for the picture figure; engineering/decisions/2026-10-16-media-plugins.md §4.2, §4.5, §4.7.
 *
 * THE ADDRESS COMES FROM THE AUTHOR'S RECORD AND NOWHERE ELSE. This module reads one span's text, handed to it by the markdown-it
 * pass at parse time, and nothing else: no slide text, no `textContent`, no regex over a section's HTML. The kind is declared
 * `address`, so the host never dispatches it on the DOM path, where a plugin's own drawing (`<code>@image{https://attacker…}</code>`)
 * would be re-read. It is `block`: a picture is a figure, so the host promotes a span only when it is the whole paragraph.
 *
 * A PLUGIN DESCRIBES; THE LAYOUT PLACES (§4.7 rule 1). The record never says where the picture goes. Where it lands is the slide's:
 *
 *   an `image` slide        the layout's photo panel (`.lattice-bg`), the same markup the layout has always placed; `mirror` puts
 *                           it on the left
 *   a `bleed` slide         the slide's own background, behind its words
 *   any other slide         a figure in the slide's flow, on the shared display layer (lib/base/base.media.css)
 *
 * The record is Segno's: the address first, then `title=`, `description=`, `focus=` and the shared display words (size, frame,
 * finish, tone, show; lib/core/media-display.js). An address with `=` or `,` in it must be quoted. Pure: no DOM, no fs.
 */
const { compileSlot } = require('@laticent/segno/read');
const { escapeAttr: escAttr } = require('@laticent/markup');
/**
 * The record's slot. The display words are the shared layer's (`ctx.media`, lib/core/media-display.js), handed in by the host,
 * so `image` and `video` take the same words from one kernel.
 * @param {{ displayParams: (kind: string) => object }} media
 */
const specFor = (media) => Object.freeze({
  label: 'a picture',
  positional: [{ name: 'src', type: 'text', required: true }],
  params: {
    title: { type: 'text', named: true },
    description: { type: 'text', named: true },
    ...media.displayParams('image'),
  },
});

let slot = null;
const imageSlot = (ctx) => slot || (slot = compileSlot(specFor(ctx.media)));

/** `@image{…}` opens a picture record; the dispatcher hands it as the bare `{…}` once it has peeled the name. */
const RECORD_OPEN = '@image\\{';
const peel = (text) => (text.startsWith('@image{') ? text.slice(6) : text);

/** A background-image url() safe inside an inline style (the rule every picture panel uses). */
const URL_UNSAFE = { "'": '%27', '"': '%22', '<': '%3C', '>': '%3E', '(': '%28', ')': '%29', '\\': '%5C' };
const cssUrl = (u) => String(u).replace(/['"<>()\\]/g, (c) => URL_UNSAFE[c]).replace(/\s/g, '%20');

/**
 * Read the record: `{src, …}`. Null when it is not a picture record, or when its display words contradict each other.
 * @returns {{src: string, title: string, description: string, display: object}|null}
 */
function read(text, _off, probe, ctx) {
  if (typeof text !== 'string') return null;
  text = peel(text);
  if (text.charCodeAt(0) !== 0x7b /* { */) return null;
  const r = imageSlot(ctx).read(text);
  if (!r.ok) return null;
  const src = String(r.value.src || '').trim();
  if (!src) return null;
  const { display: d, problem } = ctx.media.readRecordDisplay(r.value);
  if (problem) return null;
  if (probe) return true;
  return { src, title: String(r.value.title || '').trim(), description: String(r.value.description || '').trim(), display: d };
}

/** Why an attempt does not draw, or null. Only the full spelling is ever asked: a bare `{…}` is a pill's. */
function diagnose(text, ctx) {
  if (typeof text !== 'string' || !text.startsWith('@image{')) return null;
  const r = imageSlot(ctx).read(peel(text));
  if (!r.ok) return r.diagnostics?.[0]?.message || 'not a picture record';
  if (!String(r.value.src || '').trim()) return 'a picture record needs an address first';
  return ctx.media.readRecordDisplay(r.value).problem;
}

/** The tone and finish layers over the picture (the shared layer draws them). */
const layers = (d) =>
  (d.tone ? '<span class="lat-media-tone" aria-hidden="true"></span>' : '') + (d.finish ? '<span class="lat-media-finish" aria-hidden="true"></span>' : '');

/** Where the slide seats a picture record: `panel` (an `image` slide), `background` (a `bleed` slide) or `flow`. */
function seatOf(classes, display) {
  const host = display.hostFor('image', classes || []);
  if (host && (host.places === 'panel' || host.places === 'background')) return host;
  if ((classes || []).includes('bleed') && !host) return { name: 'bleed', places: 'background', kinds: ['image'], show: 'none', ignores: ['size', 'frame'] };
  return host;
}

/**
 * The picture, as the slide seats it. `where` is what the markdown-it pass knows about the slide (plugins.js `mediaWhere`): its
 * classes and `resolve`, the media sources' resolution of the address the author wrote (null when the scheme allowlist refuses
 * it, which draws nothing: the record stays code).
 */
function figureHtml(f, where = {}, ctx) {
  const display = ctx.media;
  // No resolver, no picture: the resolver is where the scheme allowlist is asked (plugins.js `mediaWhere`), so a caller that
  // skips it must not get the author's raw address written into a page.
  const url = typeof where.resolve === 'function' ? where.resolve(f.src) : null;
  if (!url) return null;
  const classes = where.classes || [];
  const host = seatOf(classes, display);
  const d = display.resolveDisplay('image', f.display || {}, { classes, host });
  const text = { title: f.title, description: f.description };
  const attrs = display.displayAttrs('image', d, text);
  // A picture with no title is decorative (§4.7): a screen reader skips it rather than reading a file name.
  const alt = escAttr(f.title || '');
  // The tooltip carries the DESCRIPTION only: the title is already the picture's name (`alt`, `aria-label`), and a `title`
  // attribute holding both made a screen reader read the title twice (the trio on slice 3; §4.7's own test).
  const tip = f.description ? ` title="${escAttr(f.description)}"` : '';
  if (host && host.places === 'tiles') {
    // A layout that packs tiles (collage) reads the picture itself, as it reads Markdown's `![…](…)`: the bare image, named.
    return `<img src="${escAttr(url)}" alt="${alt}"${tip}${display.displayAttrs('image', d, text)}>`;
  }
  if (host && (host.places === 'panel' || host.places === 'background')) {
    // The layout's panel, the same markup the `image` layout and a `bleed` slide place. A panel is a picture with no words on it,
    // so its name is `role="img"` + `aria-label` (or nothing, when decorative). The style value is percent-encoded AND
    // attribute-escaped: an author's `&#39;` must stay text inside `url('…')`, never decode to a quote (the red team on slice 3).
    const name = f.title ? ` role="img" aria-label="${alt}"` : ' aria-hidden="true"';
    const side = host.places === 'panel' && classes.includes('mirror') ? 'left' : 'full';
    return `<div class="lattice-bg lattice-bg-${side}"${attrs}${name}${tip} style="background-image:url('${escAttr(cssUrl(url))}')">${layers(d)}</div>`;
  }
  // The box before the bytes (§4.11): a host that reads the picture's header hands its size in, and the figure carries the
  // aspect as a number the shared layer sizes the frame from, so a cold and a warm render lay out the same.
  const dim = typeof where.size === 'function' ? where.size(url, f.src) : null;
  const ar = dim && dim.w > 0 && dim.h > 0 ? Math.round((dim.w / dim.h) * 10000) / 10000 : null;
  const box = ar ? ` style="--lat-media-ar:${ar}"` : '';
  const wh = ar ? ` width="${Math.round(dim.w)}" height="${Math.round(dim.h)}"` : '';
  return (
    `<figure class="lat-media"${attrs}${box}>` +
    `<span class="lat-media-frame"><span class="lat-media-pic"${tip}>` +
    // The description is the picture's accessible DESCRIPTION when the slide does not show it, so a screen reader hears it
    // once, after the name (§4.7); shown, the caption carries it.
    `<img src="${escAttr(url)}" alt="${alt}"${f.description && d.show !== 'all' ? ` aria-description="${escAttr(f.description)}"` : ''}${wh}>${layers(d)}` +
    `</span></span>` +
    display.captionHtml(d, text, { titleIsName: true }) +
    `</figure>`
  );
}

function blockHtml(text, off, where, ctx) {
  const f = read(text, off, false, ctx);
  return f ? figureHtml(f, where, ctx) : null;
}

/** The plugin's inline-code kind. `html` is null: a picture record is a block, and `blockHtml` is what the paragraph pass calls. */
const inline = (ctx) => Object.freeze({
  image: Object.freeze({
    resolve: (text, off, probe) => read(text, off, probe, ctx),
    html: () => null,
    element: () => null,
    diagnose: (text) => diagnose(text, ctx),
    blockHtml: (text, off, where) => blockHtml(text, off, where, ctx),
    block: true,
  }),
});

module.exports = { inline, read, diagnose, figureHtml, blockHtml, seatOf, specFor, RECORD_OPEN, peel };
