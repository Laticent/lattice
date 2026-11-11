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
const { deckColorModeToken } = require('../core/resolve-color-mode');
const { settingsBlockAt, foldSettingsBlock } = require('../core/settings-block-fold');
const { boundaryParser } = require('../core/boundary-parser');
const { picksBleedInk, bleedBandFor, bleedSampleRect, bleedInkOfPixels, classesWithInk } = require('../core/bleed-ink');
const { readDirectiveComment } = require('../core/comment-directive');

const SAMPLE_W = 32;
const CLASS_ONLY = { known: new Set(['class']), flags: new Set() };
const FRONT_MATTER = /^---[ \t]*\r?\n([\s\S]*?)\r?\n---[ \t]*(?:\r?\n|$)/;

/** Each `<!-- … -->` comment in `text`, with its offsets: a line may hold several, back to back. */
function commentsOf(text) {
  const out = [];
  let at = text.indexOf('<!--');
  while (at >= 0) {
    const end = text.indexOf('-->', at + 4);
    if (end < 0) break;
    out.push({ start: at, end: end + 3, raw: text.slice(at, end + 3) });
    at = text.indexOf('<!--', end + 3);
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

/** The offset where each line of `text` starts. */
function lineStarts(text) {
  const out = [0];
  for (let i = 0; i < text.length; i++) if (text[i] === '\n') out.push(i + 1);
  return out;
}

/** The lines of `text` inside a fenced or indented code block (markdown-it's own reading): neither Marp nor the engine reads a
 * directive or a background there, so this rewrite does not either. */
function codeLines(text) {
  const out = new Set();
  for (const t of boundaryParser.parse(text, {})) {
    if ((t.type === 'fence' || t.type === 'code_block') && Array.isArray(t.map)) for (let l = t.map[0]; l < t.map[1]; l++) out.add(l);
  }
  return out;
}

/**
 * The slide's own spot `_class`, read per comment and outside code: `{ value, at: { start, end }, single }` offsets into `text`,
 * or null. A comment that holds several directives (`<!--\n_class: bleed\n_paginate: false\n-->`) is read per line, and only
 * the `_class:` line is the span the rewrite replaces.
 */
function ownClassOf(text, starts, code) {
  let found = null;
  const lineOf = (off) => { let l = 0; while (l + 1 < starts.length && starts[l + 1] <= off) l++; return l; };
  for (const c of commentsOf(text)) {
    if (code.has(lineOf(c.start))) continue;
    if (!c.raw.includes('\n')) {
      const dir = readDirectiveComment(c.raw, CLASS_ONLY);
      if (dir?.spot) found = { value: String(dir.value ?? '').trim(), at: { start: c.start, end: c.end }, single: true };
      continue;
    }
    let off = c.start;
    for (const line of c.raw.split('\n')) {
      const m = /^([ \t]*(?:<!--[ \t]*)?)_class[ \t]*:(.*)$/.exec(line.replace(/\r$/, ''));
      if (m && !m[2].includes('-->')) {
        const start = off + m[1].length;
        found = { value: unquote(m[2].trim()), at: { start, end: start + line.replace(/\r$/, '').length - m[1].length }, single: false };
      }
      off += line.length + 1;
    }
  }
  return found;
}

/** A YAML scalar's quotes taken off: `"a b"` or `'a b'` reads as `a b`. */
function unquote(v) {
  return v.length > 1 && (v[0] === '"' || v[0] === "'") && v.endsWith(v[0]) ? v.slice(1, -1) : v;
}

/** The deck's own classes as Lattice reads a bundle: the settings block folded into the front matter (its `class:` register and
 * its `color-mode:` as a class), so a `print` deck or a deck-wide `bleed` written into the block is seen. */
function deckClassesOf(src) {
  const fm = foldSettingsBlock(src).match(FRONT_MATTER);
  if (!fm) return [];
  const mode = deckColorModeToken(fm[1]);
  return [...deckClassTokensFromFrontMatter(fm[1]), ...(mode ? [mode] : [])];
}

/** Where a new spot `_class` may go in the slide that starts at `start`: never above the bundle's settings block, which must sit
 * directly under the front matter (lib/core/settings-block-fold.js `settingsBlockAt`). */
function afterSettingsBlock(src, start) {
  const at = settingsBlockAt(src);
  if (!at) return start;
  const starts = lineStarts(src);
  let off = at.end + 1 < starts.length ? starts[at.end + 1] : src.length;
  while (off < src.length && (src[off] === '\n' || src[off] === '\r')) off++;
  return Math.max(start, off);
}

/** The key a decision is kept under: the band the slide's words sit in, and the photo. */
const keyOf = (classes, url) => `${bleedBandFor(classes).top}|${url}`;

/**
 * The bleed slides that pick their ink: `{ start, end, own, carried, classes, url }` per slide, offsets into `md`. The author's
 * word is the slide's own-or-carried `class` (what the engine stamps as `data-class`): a carried `<!-- class: … dark -->` is as
 * much the author's choice as a spot one.
 */
function bleedInkSlides(md) {
  const src = String(md ?? '');
  const deck = deckClassesOf(src);
  const out = [];
  for (const span of slideClassSpans(src).spans) {
    const text = src.slice(span.start, span.end);
    const starts = lineStarts(text);
    const code = codeLines(text);
    const own = ownClassOf(text, starts, code);
    const carried = own ? own.value : String(span.slideClass || '').trim();
    const classes = [...carried.split(/\s+/).filter(Boolean), ...deck];
    if (!picksBleedInk(classes, carried)) continue;
    let url = null;
    text.split('\n').forEach((line, i) => { if (!url && !code.has(i)) url = bgUrlOf(line); });
    if (!url) continue;
    // A new spot `_class` goes where the slide's first words start, after the blank lines a `---` leaves, and below a settings block.
    const lead = text.length - text.trimStart().length;
    out.push({
      start: afterSettingsBlock(src, span.start + lead),
      end: span.end,
      own: own ? { ...own, at: { start: span.start + own.at.start, end: span.start + own.at.end } } : null,
      carried,
      classes,
      url,
    });
  }
  return out;
}

/**
 * The Markdown with each slide's ink written into its own `_class`: the slide's own `_class` (only that comment, or that line of
 * a comment holding several directives, changes), or, when it has none, a new spot `_class` holding its carried class. In a
 * bundle the deck's classes live in the settings block and the runtime adds them to every slide, a slide's own mode evicting
 * the deck's (lib/core/color-mode.js `slidePinEvictsDeckToken`), so the spot class carries only what Marp itself would lose.
 * Either way the ink is applied as `classesWithInk` applies it: any other color-mode token taken off.
 * @param {string} md
 * @param {Map<string, 'light'|'dark'|null>} inkByKey  keyed by `keyOf(classes, url)`
 */
function withBleedInk(md, inkByKey) {
  let out = String(md ?? '');
  // Back to front, so earlier offsets hold.
  for (const s of bleedInkSlides(out).reverse()) {
    const ink = inkByKey.get(keyOf(s.classes, s.url));
    if (!ink) continue;
    if (s.own) {
      const value = classesWithInk(s.own.value, ink).join(' ');
      const text = s.own.single ? `<!-- _class: ${value} -->` : `_class: ${value}`;
      out = `${out.slice(0, s.own.at.start)}${text}${out.slice(s.own.at.end)}`;
    } else {
      const nl = out.slice(s.start, s.end).includes('\r\n') ? '\r\n' : '\n';
      out = `${out.slice(0, s.start)}<!-- _class: ${classesWithInk(s.carried, ink).join(' ')} -->${nl}${nl}${out.slice(s.start)}`;
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
