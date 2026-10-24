/**
 * THE VIDEO PLUGIN's inline-code kind (`contributes.inline.video`, named-only: `@video{…}`, no sigil).
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
const { compileSlot } = require('../../core/segno-spec.js');
const { detectProvider } = require('../../core/video-providers.mjs');

const SPEC = Object.freeze({
  label: 'a video',
  positional: [{ name: 'url', type: 'text', required: true }],
  params: {
    title: { type: 'text', named: true },
    description: { type: 'text', named: true },
    poster: { type: 'text', named: true },
  },
});

let slot = null;
const videoSlot = () => slot || (slot = compileSlot(SPEC));

/** Text escapes `& < >` like the QR-card kernel the old pass used (byte-identical captions); an attribute also escapes `"`. */
const esc = (v) => String(v).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const escAttr = (v) => esc(v).replace(/"/g, '&quot;');
/** A background-image url() safe to drop into an inline style (the old video pass's rule, moved with it). */
const safeUrl = (s) => String(s).replace(/["'()\\\s]/g, (m) => (m.trim() ? '' : '%20'));

/**
 * Read the record the host hands over after it peels `@video`: `{…}`. Null when it is not a video record, or when
 * its address is not one of the provider table's hosts (the PARSED host is matched, never a substring).
 * @returns {{provider: object, title: string, description: string, poster: string}|null}
 */
function read(text, _off, probe) {
  if (typeof text !== 'string' || text.charCodeAt(0) !== 0x7b /* { */) return null;
  const r = videoSlot().read(text);
  if (!r.ok) return null;
  const provider = detectProvider(String(r.value.url || ''));
  if (!provider) return null;
  if (probe) return true;
  return { provider, title: String(r.value.title || '').trim(), description: String(r.value.description || '').trim(), poster: String(r.value.poster || '').trim() };
}

/** Why an attempt does not draw, or null: the record does not read (Segno's own message), or the host is not one we know. */
function diagnose(text) {
  // The lint reader hands a named-only kind its own spelling, `@video{…}` (and only that: it never asks about a bare `{…}`, which is a
  // pill's); the dispatcher hands the bare record after it has peeled the name.
  if (typeof text === 'string' && text.startsWith('@video{')) text = text.slice(6);
  if (typeof text !== 'string' || text.charCodeAt(0) !== 0x7b) return null;
  const r = videoSlot().read(text);
  if (!r.ok) return r.diagnostics?.[0]?.message || 'not a video record';
  if (!detectProvider(String(r.value.url || ''))) return 'not an address Lattice can show as a video (YouTube, Vimeo, TikTok, Instagram)';
  return null;
}

/**
 * The poster figure. The address rides on the figure as `data-lattice-media-url`, written here from the author's
 * record; the layout's pass re-runs `detectProvider` on it before it builds anything from it (§ 4.5, rule 3).
 */
function figureHtml(f) {
  const { provider } = f;
  const style = f.poster ? ` style="background-image:url('${escAttr(safeUrl(f.poster))}')"` : '';
  const cls = f.poster ? 'video-poster' : 'video-poster is-placeholder';
  const meta = (f.title ? ` data-lattice-title="${escAttr(f.title)}"` : '') + (f.description ? ` data-lattice-description="${escAttr(f.description)}"` : '');
  return (
    `<figure class="video-embed" data-lattice-media="video" data-provider="${provider.key}" data-lattice-media-url="${escAttr(provider.url)}"` +
    `${f.poster ? ` data-lattice-poster="${escAttr(f.poster)}"` : ''}${meta}>` +
    `<a class="${cls}" href="${escAttr(provider.url)}" target="_blank" rel="noreferrer noopener"${style} data-provider="${provider.key}">` +
    `<span class="video-play" aria-hidden="true"></span>` +
    `<span class="video-provider">Watch on ${esc(provider.label)}</span>` +
    `</a>` +
    `<div class="video-aside">${f.title ? `<figcaption>${esc(f.title)}</figcaption>` : ''}</div>` +
    `</figure>`
  );
}

function blockHtml(text, off) {
  const f = read(text, off);
  return f ? figureHtml(f) : null;
}

/** The plugin's inline-code kind. `html` is null: a video is a block, and `blockHtml` is what the paragraph pass calls. */
const inline = Object.freeze({
  video: Object.freeze({ resolve: read, html: () => null, element: () => null, diagnose, blockHtml, block: true }),
});

module.exports = { inline, read, diagnose, figureHtml, blockHtml, SPEC };
