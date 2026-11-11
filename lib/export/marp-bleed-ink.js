/**
 * lib/export/marp-bleed-ink.js — a `bleed` slide's automatic ink, baked into an Export-to-Marp bundle's Markdown.
 *
 * In a bundle, a `bleed` slide's photo is Marp's own background (`![bg](assets/…)`), and the bundle's runtime pass
 * (lib/transformers/bleed-ink.js) cannot read its pixels: marp-cli and a double-clicked `.html` load the deck over `file://`,
 * where a page may not read a local picture's pixels. So both producers of the bundle (tools/export-marp.js and the Studio's
 * deck-export.js) decide at export time, from the photo they are bundling, and write the color mode that carries the winning
 * ink into the slide's own `_class`. The decision is lib/core/bleed-ink.mjs's; the slide then carries the class as its
 * author's, so the runtime pass leaves it alone.
 *
 * Each producer hands in how to read and sample a photo (the same host shape as lib/export/bleed-ink-stamp.js):
 * `readPhoto(url)` → `{ bytes, mime, width, height }` or null, and `samplePixels(dataUri, rect, w, h)` → RGBA pixels or null.
 */
const { slideClassSpans } = require('../core/slide-class-spans');
const { deckClassTokensFromFrontMatter } = require('../core/deck-class-register');
const { picksBleedInk, bleedBandFor, bleedSampleRect, bleedInkOfPixels, modeForInk } = require('../core/bleed-ink');
const { readDirectiveComment } = require('../core/comment-directive');

const SAMPLE_W = 32;
const CLASS_ONLY = { known: new Set(['class']), flags: new Set() };

/** Each `<!-- … -->` comment in `text`, with its offsets: a line may hold several directives, each its own comment. */
function commentsOf(text) {
  const out = [];
  for (let at = text.indexOf('<!--'); at >= 0; at = text.indexOf('<!--', at + 4)) {
    const end = text.indexOf('-->', at + 4);
    if (end < 0) break;
    out.push({ start: at, end: end + 3, raw: text.slice(at, end + 3) });
    at = end;
  }
  return out;
}

/** A line that is Marp's `![bg …](url …)`, at up to three spaces of indent: its address, or null. */
function bgUrlOf(line) {
  const t = line.replace(/^ {0,3}/, '');
  if (!t.startsWith('![bg') || ![']', ' ', '\t'].includes(t[4])) return null;
  const open = t.indexOf('](');
  if (open < 0) return null;
  let end = open + 2;
  while (end < t.length && t[end] !== ')' && t[end] !== ' ' && t[end] !== '\t' && t[end] !== '\r') end++;
  return end > open + 2 ? t.slice(open + 2, end) : null;
}

/** The key a decision is kept under: the band the slide's words sit in, and the photo. */
const keyOf = (classes, url) => `${bleedBandFor(classes).top}|${url}`;

/**
 * The bleed slides that pick their ink: `{ start, end, own, ownAt, carried, deck, classes, url }` per slide, offsets into `md`.
 * The author's word is the slide's own-or-carried `class` (what the engine stamps as `data-class`): a carried
 * `<!-- class: … dark -->` is as much the author's choice as a spot one.
 */
function bleedInkSlides(md) {
  const src = String(md ?? '');
  const fm = src.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n/);
  const deck = fm ? deckClassTokensFromFrontMatter(fm[1]) : [];
  const out = [];
  for (const span of slideClassSpans(src).spans) {
    const text = src.slice(span.start, span.end);
    // The slide's own spot `_class`, read per comment: a line may hold several directives (`<!-- _paginate: false --> <!-- _class: … -->`).
    let ownAt = null;
    let own = null;
    for (const c of commentsOf(text)) {
      const dir = readDirectiveComment(c.raw, CLASS_ONLY);
      if (dir?.spot) {
        own = String(dir.value ?? '').trim();
        ownAt = { start: span.start + c.start, end: span.start + c.end };
      }
    }
    const carried = own ?? String(span.slideClass || '').trim();
    const classes = [...carried.split(/\s+/).filter(Boolean), ...deck];
    if (!picksBleedInk(classes, carried)) continue;
    let url = null;
    for (const line of text.split('\n')) url ??= bgUrlOf(line);
    if (!url) continue;
    // A new spot `_class` goes where the slide's first words start, after the blank lines a `---` leaves.
    const lead = text.length - text.trimStart().length;
    out.push({ start: span.start + lead, end: span.end, own, ownAt, carried, deck, classes, url });
  }
  return out;
}

/**
 * The Markdown with each slide's ink written into its own `_class`: appended inside the slide's own `_class` comment (only that
 * comment changes, whatever shares its line), or, when it has none, a new spot `_class` holding the class the slide had (its
 * carried class, else the deck's `class:` register (the tokens the engine admits there), since a spot `_class` replaces both in
 * Marp) plus the ink's mode.
 * @param {string} md
 * @param {Map<string, 'light'|'dark'|null>} inkByKey  keyed by `keyOf(classes, url)`
 */
function withBleedInk(md, inkByKey) {
  let out = String(md ?? '');
  // Back to front, so earlier offsets hold.
  for (const s of bleedInkSlides(out).reverse()) {
    const ink = inkByKey.get(keyOf(s.classes, s.url));
    if (!ink) continue;
    const mode = modeForInk(ink);
    if (s.ownAt) {
      out = `${out.slice(0, s.ownAt.start)}<!-- _class: ${`${s.own} ${mode}`.trim()} -->${out.slice(s.ownAt.end)}`;
    } else {
      const base = s.carried || s.deck.join(' ');
      const nl = out.slice(s.start, s.end).includes('\r\n') ? '\r\n' : '\n';
      out = `${out.slice(0, s.start)}<!-- _class: ${`${base} ${mode}`.trim()} -->${nl}${nl}${out.slice(s.start)}`;
    }
  }
  return out;
}

/**
 * Decide each qualifying slide's ink from its photo and write it in.
 * @param {string} md
 * @param {{ readPhoto: Function, samplePixels: Function, slideW?: number, slideH?: number }} host
 * @returns {Promise<string>}
 */
async function bakeBleedInk(md, host) {
  const slides = bleedInkSlides(md);
  if (!slides.length) return md;
  const inkByKey = new Map();
  for (const s of slides) {
    const key = keyOf(s.classes, s.url);
    if (inkByKey.has(key)) continue;
    let ink = null;
    try {
      const photo = await host.readPhoto(s.url);
      const rect = photo ? bleedSampleRect(photo.width, photo.height, host.slideW || 16, host.slideH || 9, bleedBandFor(s.classes)) : null;
      if (rect) {
        const h = Math.max(1, Math.round((SAMPLE_W * rect.h) / rect.w));
        const px = await host.samplePixels(`data:${photo.mime};base64,${toBase64(photo.bytes)}`, rect, SAMPLE_W, h);
        ink = px ? bleedInkOfPixels(px) : null;
      }
    } catch {
      ink = null;
    }
    inkByKey.set(key, ink);
  }
  return withBleedInk(md, inkByKey);
}

/** Base64 of bytes in Node (a Buffer) or a browser (a Uint8Array / ArrayBuffer). */
function toBase64(bytes) {
  if (typeof Buffer !== 'undefined' && Buffer.isBuffer(bytes)) return bytes.toString('base64');
  const u8 = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  let s = '';
  for (let i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode(...u8.subarray(i, i + 0x8000));
  return btoa(s);
}

module.exports = { bleedInkSlides, withBleedInk, bakeBleedInk, keyOf };
