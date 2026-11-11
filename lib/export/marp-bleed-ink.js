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
const { picksBleedInk, bleedSampleRect, bleedInkOfPixels, modeForInk } = require('../core/bleed-ink');
const { readDirectiveComment } = require('../core/comment-directive');

const SAMPLE_W = 32;
const CLASS_ONLY = { known: new Set(['class']), flags: new Set() };

/** Each line of `text` with its offset. */
function linesOf(text) {
  const out = [];
  let at = 0;
  for (const line of text.split('\n')) {
    out.push({ line, at });
    at += line.length + 1;
  }
  return out;
}

/** A line that is a slide's own `<!-- _class: … -->` comment: its words, or null. */
function ownClassOf(line) {
  const dir = readDirectiveComment(line.trim(), CLASS_ONLY);
  return dir?.spot ? String(dir.value ?? '').trim() : null;
}

/** A line that is Marp's `![bg …](url …)`, at up to three spaces of indent: its address, or null. */
function bgUrlOf(line) {
  const t = line.replace(/^ {0,3}/, '');
  if (!t.startsWith('![bg') || ![']', ' ', '\t'].includes(t[4])) return null;
  const open = t.indexOf('](');
  if (open < 0) return null;
  let end = open + 2;
  while (end < t.length && t[end] !== ')' && t[end] !== ' ' && t[end] !== '\t') end++;
  return end > open + 2 ? t.slice(open + 2, end) : null;
}

/** The bleed slides that pick their ink: `{ start, end, own, ownAt, carried, url }` per slide, offsets into `md`. */
function bleedInkSlides(md) {
  const src = String(md ?? '');
  const fm = src.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n/);
  const deck = fm ? deckClassTokensFromFrontMatter(fm[1]) : [];
  const out = [];
  for (const span of slideClassSpans(src).spans) {
    const text = src.slice(span.start, span.end);
    let own = null;
    let ownAt = null;
    let url = null;
    for (const { line, at } of linesOf(text)) {
      const words = ownClassOf(line);
      if (words !== null) {
        own = words;
        ownAt = { start: span.start + at, end: span.start + at + line.length };
      }
      url ??= bgUrlOf(line);
    }
    const classes = [...String(span.slideClass || '').split(/\s+/).filter(Boolean), ...deck];
    if (!picksBleedInk(classes, own || '') || !url) continue;
    out.push({ start: span.start, end: span.end, own, ownAt, carried: span.slideClass || '', url });
  }
  return out;
}

/**
 * The Markdown with each slide's ink written into its own `_class`: appended to the slide's own comment, or, when it has
 * none, a new `_class` comment holding the class it had (a spot `_class` replaces a carried one) plus the ink's mode.
 * @param {string} md
 * @param {Map<string, 'light'|'dark'|null>} inkByUrl
 */
function withBleedInk(md, inkByUrl) {
  let out = String(md ?? '');
  // Back to front, so earlier offsets hold.
  for (const s of bleedInkSlides(out).reverse()) {
    const ink = inkByUrl.get(s.url);
    if (!ink) continue;
    const mode = modeForInk(ink);
    if (s.ownAt) {
      out = `${out.slice(0, s.ownAt.start)}<!-- _class: ${`${s.own} ${mode}`.trim()} -->${out.slice(s.ownAt.end)}`;
    } else {
      const line = `<!-- _class: ${`${s.carried} ${mode}`.trim()} -->\n\n`;
      out = `${out.slice(0, s.start)}${line}${out.slice(s.start)}`;
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
  const inkByUrl = new Map();
  for (const url of new Set(slides.map((s) => s.url))) {
    let ink = null;
    try {
      const photo = await host.readPhoto(url);
      const rect = photo ? bleedSampleRect(photo.width, photo.height, host.slideW || 16, host.slideH || 9) : null;
      if (rect) {
        const h = Math.max(1, Math.round((SAMPLE_W * rect.h) / rect.w));
        const px = await host.samplePixels(`data:${photo.mime};base64,${toBase64(photo.bytes)}`, rect, SAMPLE_W, h);
        ink = px ? bleedInkOfPixels(px) : null;
      }
    } catch {
      ink = null;
    }
    inkByUrl.set(url, ink);
  }
  return withBleedInk(md, inkByUrl);
}

/** Base64 of bytes in Node (a Buffer) or a browser (a Uint8Array / ArrayBuffer). */
function toBase64(bytes) {
  if (typeof Buffer !== 'undefined' && Buffer.isBuffer(bytes)) return bytes.toString('base64');
  const u8 = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  let s = '';
  for (let i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode(...u8.subarray(i, i + 0x8000));
  return btoa(s);
}

module.exports = { bleedInkSlides, withBleedInk, bakeBleedInk };
