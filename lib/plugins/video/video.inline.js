/**
 * THE VIDEO PLUGIN's inline-code kind (`contributes.inline.video`: `>{…}`, or in full `@video{…}`; §8 decision 3).
 * Kernel for the poster figure; engineering/decisions/2026-10-16-media-plugins.md § 4.3 and § 4.5.
 *
 * THE ADDRESS COMES FROM THE AUTHOR'S RECORD AND NOWHERE ELSE. This module reads one span's text, handed to it
 * by the markdown-it pass at parse time, and nothing else: no slide text, no `textContent`, no regex over a
 * section's HTML. The kind is declared `address`, so the host never dispatches it on the DOM path, which is where a
 * plugin's own drawing (`<code>@video{https://attacker…}</code>`) would be re-read. It is also `block`: it draws a
 * figure, so the host promotes it only when it is the whole paragraph (lib/integrations/markdown-it/plugins.js);
 * a span in running text stays code, with a diagnostic.
 *
 * The record is Segno's: the address first, then `title=`, `description=`, `poster=`. An address with `=` or `,` in
 * it must be quoted (`"https://youtu.be/x?t=90"`); Segno says so and offers the fix. Pure: no DOM, no fs.
 */
const { compileSlot } = require('@laticent/segno/read');
// The provider table is this plugin's own data (`contributes.providers` in its manifest); matching an address against it
// is a trust check, so the host does it and hands the matcher in the ctx (`ctx.provider`), the last argument below.

/**
 * The record's slot. The display words are the shared layer's (`ctx.media`, lib/core/media-display.js: size, frame, finish,
 * tone, show), handed in by the host, so `image` and `video` take the same words from one kernel.
 * @param {{ displayParams: (kind: string) => object }} media
 */
const specFor = (media) => Object.freeze({
  label: 'a video',
  positional: [{ name: 'url', type: 'text', required: true }],
  params: {
    title: { type: 'text', named: true },
    description: { type: 'text', named: true },
    poster: { type: 'text', named: true },
    ...media.displayParams('video'),
  },
});

/** `@video{…}` and `>{…}` both open a video record; this is the one place that spells both (lint, export and probes read it). */
const RECORD_OPEN = '(?:@video|>)\\{';
/** The record `{…}` from either spelling, or the text unchanged when it opens with neither. */
const peel = (text) => (text.startsWith('@video{') ? text.slice(6) : text.startsWith('>{') ? text.slice(1) : text);

let slot = null;
const videoSlot = (ctx) => slot || (slot = compileSlot(specFor(ctx.media)));

// Text escapes `& < >` like the QR-card kernel the old pass used (byte-identical captions); an attribute also escapes `"`.
const { escapeHtml: esc, escapeAttr: escAttr } = require('@laticent/markup');
/** A background-image url() safe to drop into an inline style (the old video pass's rule, moved with it). */
const safeUrl = (s) => String(s).replace(/["'()\\\s]/g, (m) => (m.trim() ? '' : '%20'));

/**
 * Read the record the host hands over: `>{…}` (the dispatcher's spelling) or `{…}`. Null when it is not a video record, when
 * its address is not one of the provider table's hosts (the PARSED host is matched, never a substring), or when its display
 * words contradict each other (two finishes).
 * @returns {{provider: object, title: string, description: string, poster: string, display: object}|null}
 */
function read(text, _off, probe, ctx) {
  // The dispatcher hands the sigil spelling (`>{…}`, which `@video{…}` is rewritten to); a reader that peeled it hands `{…}`.
  if (typeof text === 'string' && text.charCodeAt(0) === 0x3e /* > */) text = text.slice(1);
  if (typeof text !== 'string' || text.charCodeAt(0) !== 0x7b /* { */) return null;
  const r = videoSlot(ctx).read(text);
  if (!r.ok) return null;
  const provider = ctx.provider(String(r.value.url || ''));
  if (!provider) return null;
  const { display: d, problem } = ctx.media.readRecordDisplay(r.value);
  if (problem) return null;
  if (probe) return true;
  return { provider, title: String(r.value.title || '').trim(), description: String(r.value.description || '').trim(), poster: String(r.value.poster || '').trim(), display: d };
}

/** Why an attempt does not draw, or null: the record does not read (Segno's own message), or the host is not one we know. */
function diagnose(text, ctx) {
  // Either spelling: the full `@video{…}` or the sigil `>{…}` (the dispatcher's); never a bare `{…}`, which is a pill's.
  if (typeof text !== 'string' || peel(text) === text) return null;
  text = peel(text);
  const r = videoSlot(ctx).read(text);
  if (!r.ok) return r.diagnostics?.[0]?.message || 'not a video record';
  if (!ctx.provider(String(r.value.url || ''))) return 'not an address Lattice can show as a video (YouTube, Vimeo, TikTok, Instagram)';
  return ctx.media.readRecordDisplay(r.value).problem;
}

/**
 * The poster figure, on the shared display layer's anatomy (lib/base/base.media.css): a frame around the poster, the poster as
 * the picture, the tone and finish layers over it, the record's words below as `show=` decides. The address rides on the figure
 * as `data-lattice-media-url`, written here from the author's record; a layout that builds anything from it re-runs
 * `detectProvider` first (§ 4.5, rule 3).
 *
 * `where` is what the markdown-it pass knows about the slide (lib/integrations/markdown-it/plugins.js `mediaWhere`): its classes,
 * which name a host layout and carry the deck's `video:` register, and `resolve`, the media sources' resolution of the poster
 * the author wrote. A poster the scheme allowlist refuses draws the stand-in.
 */
function figureHtml(f, where = {}, ctx) {
  const { provider } = f;
  const display = ctx.media;
  const d = display.resolveDisplay('video', f.display || {}, { classes: where.classes, host: display.hostFor('video', where.classes) });
  const text = { title: f.title, description: f.description };
  // No resolver, no poster: the resolver is where the scheme allowlist is asked (plugins.js `mediaWhere`).
  const url = f.poster && typeof where.resolve === 'function' ? where.resolve(f.poster) : null;
  const style = url ? ` style="background-image:url('${escAttr(safeUrl(url))}')"` : '';
  const cls = url ? 'video-poster lat-media-pic' : 'video-poster lat-media-pic is-placeholder';
  const layers = (d.tone ? '<span class="lat-media-tone" aria-hidden="true"></span>' : '') + (d.finish ? '<span class="lat-media-finish" aria-hidden="true"></span>' : '');
  return (
    `<figure class="video-embed lat-media"${display.displayAttrs('video', d, text)} data-provider="${provider.key}" data-lattice-media-url="${escAttr(provider.url)}"` +
    `${url ? ` data-lattice-poster="${escAttr(f.poster)}"` : ''}>` +
    `<span class="lat-media-frame">` +
    `<a class="${cls}" href="${escAttr(provider.url)}" target="_blank" rel="noreferrer noopener"${style}${f.description ? ` title="${escAttr(f.description)}"` : ''} data-provider="${provider.key}">` +
    layers +
    `<span class="video-play" aria-hidden="true"></span>` +
    `<span class="video-provider">Watch on ${esc(provider.label)}</span>` +
    `</a>` +
    `</span>` +
    `<div class="video-aside">${display.captionHtml(d, text)}</div>` +
    `</figure>`
  );
}

function blockHtml(text, off, ctx, where) {
  const f = read(text, off, false, ctx);
  return f ? figureHtml(f, where, ctx) : null;
}

/** The plugin's inline-code kind. `html` is null: a video is a block, and `blockHtml` is what the paragraph pass calls. */
const inline = (ctx) => Object.freeze({
  video: Object.freeze({
    resolve: (text, off, probe) => read(text, off, probe, ctx),
    html: () => null,
    element: () => null,
    diagnose: (text) => diagnose(text, ctx),
    blockHtml: (text, off, where) => blockHtml(text, off, ctx, where),
    block: true,
  }),
});

module.exports = { inline, read, diagnose, figureHtml, blockHtml, specFor, RECORD_OPEN, peel };
