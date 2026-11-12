/**
 * lib/core/placed-picture.mjs — IS THIS PICTURE THE SLIDE'S PLACED PHOTO? One rule, asked by every reader (HARD RULE #1).
 *
 * Since 2026-11-10 Markdown's picture is the `@image{…}` record's shortcut: a lone `![title](src "description")` on a slide
 * that places a picture is drawn as that slide's photo (an `image` slide's panel, a `bleed` slide's background) instead of as
 * a picture in the text (engineering/decisions/2026-10-16-media-plugins.md §9). Five readers need the same answer:
 *
 *   · the engine, which draws it (lib/integrations/markdown-it/plugins.js `inlinePills`)
 *   · Export-to-Marp, which writes it as `![bg]` (lib/plugins/image/shared/image-marp-export.js)
 *   · Compose's Placement control and badge (docs/src/lib/compose/image-objects.ts `placementAt`)
 *   · the Studio's photo finder (docs/src/components/studio/card-ink-pick.ts `photoAt`)
 *   · the image lint (lib/plugins/image/image.lint.js, `image-extra-panel`)
 *
 * Each of them used to spell the rule out by hand, and the inversion on #3126 found five places where one disagreed with the
 * engine (followups.d/3126-p2-one-placed-picture-rule.md). Now each asks this module, and
 * test/fixtures/placed-picture-cases.json holds every reader to the engine's answer.
 *
 * THE RULE. A picture is placed when all of these hold:
 *   1. the slide places a picture: its classes hold `image` or `bleed`, and not `collage` (which packs pictures as tiles);
 *   2. it is alone in a paragraph of the slide's own (level 0: never inside a list item or a quote);
 *   3. its alt is not a Marp keyword (`bg`, in any case): `![BG right](…)` is never a panel named "BG right";
 *   4. it is the slide's ONLY such picture: with two, neither is placed, because a slide places one photo;
 *   5. the slide does not place a photo another way: a `![bg]` picture anywhere on it, a `.lattice-bg` panel in its HTML, a
 *      lone `@image{…}` record, or a background image on the slide itself (a `backgroundImage` directive);
 *   6. the record's scheme allowlist accepts its address (lib/core/url-scheme.js): `http:` is refused, so it stays a picture.
 *
 * WHAT THIS DOES NOT DECIDE: which classes a slide has. Each reader resolves those its own way (the engine from its slide
 * token, the export from lib/core/slide-class-spans.js, the lint from its own directive scan, Compose from its document), and
 * the shared table pins them to the engine's answer. A deck-wide `class:` or a `backgroundImage` carried from an earlier slide
 * or the front matter is the caller's to pass in (`backgroundImage`): the engine and the export do; the Studio, which reads
 * one slide at a time, cannot yet (followups.d/3126-p3-studio-carried-class.md).
 *
 * THE PARSE IS THE CALLER'S. A reader that holds Markdown text hands in its parse (`md`, a markdown-it instance configured as
 * the engine's block stream: lib/core/boundary-parser.mjs), because the playground keeps the lint's parser instance apart
 * from the engine's (tools/build-playground.js `assertLintParserIsolated`), and a kernel both share may import neither.
 *
 * Pure ESM (the scheme allowlist and the directive reader), so the Studio imports it as is and the CommonJS readers load it
 * through `placed-picture.js`.
 */

import { readDirectiveComment } from './comment-directive.mjs';
import realDeclValueIsSafe from './decl-value-safe.js';
import urlScheme from './url-scheme.js';

const KEYWORD_ALT = /^bg(?:\s|$)/i;
const PANEL_HTML = /class="lattice-bg/;
const RECORD = /^@image\{/;
// The `backgroundImage` directive, spot or global, as the engine reads it (lib/engine/slides.js).
const BG_DIRECTIVE = { known: new Set(['backgroundImage']), flags: new Set() };

/** Is this alt text one of Marp's retired keywords (`bg`, `bg right`, `BG left:40%`)? */
export function isMarpKeywordAlt(alt) {
  return KEYWORD_ALT.test(String(alt ?? '').trim());
}

/** Does a slide of these classes place a picture (`image`, `bleed`; never a `collage`)? */
export function slidePlacesPicture(classes) {
  const c = Array.isArray(classes) ? classes : String(classes ?? '').split(/\s+/);
  return !c.includes('collage') && (c.includes('image') || c.includes('bleed'));
}

/** Does the record's scheme allowlist accept this address as the author wrote it? */
export function addressOk(raw) {
  const v = String(raw ?? '').trim();
  return !!v && urlScheme.urlVerdict(v).ok;
}

/** The address of a markdown-it `image` token: the one the author wrote when a rule kept it (`asset:`), else markdown-it's. */
export function pictureAddress(pic) {
  return pic?.meta?.authoredSrc ?? pic?.attrGet?.('src') ?? '';
}

/** Is token `i` a picture alone in a paragraph of the slide's own, with an alt that is not a Marp keyword? */
function lonePictureAt(tokens, i) {
  const t = tokens[i];
  return t?.type === 'inline' && t.children?.length === 1 && t.children[0].type === 'image'
    && tokens[i - 1]?.type === 'paragraph_open' && tokens[i + 1]?.type === 'paragraph_close'
    // The slide's own paragraph. The engine's slide tokens wrap the parsed stream without re-levelling it
    // (lib/engine/slides.js), so a top-level paragraph is level 0 there as in a parse of the slide alone.
    && tokens[i - 1].level === 0
    && !isMarpKeywordAlt(t.children[0].content);
}

/** Does token `k` place a photo another way: a `![bg]` picture, a `.lattice-bg` panel, or a lone `@image{…}` record? */
function placesPhotoAt(tokens, k) {
  const t = tokens[k];
  if ((t.type === 'html_block' || t.type === 'html_inline') && PANEL_HTML.test(t.content || '')) return true;
  if (t.type !== 'inline' || !t.children) return false;
  if (t.children.some((c) => c.type === 'image' && isMarpKeywordAlt(c.content))) return true;
  if (t.children.some((c) => c.type === 'html_inline' && PANEL_HTML.test(c.content || ''))) return true;
  const bare = t.children.filter((c) => c.type !== 'softbreak' && !(c.type === 'text' && !c.content.trim()));
  return bare.length === 1 && bare[0].type === 'code_inline' && RECORD.test(bare[0].content.trim());
}

/**
 * Does a `backgroundImage` directive with this value give the slide a background photo? Exactly when the engine's style sink
 * writes it (lib/engine/slides.js): the scheme allowlist accepts it, the sink judges it safe, and it is not `none`.
 */
export function backgroundImagePlaces(value) {
  const v = String(value ?? '').trim();
  return !!v && v.toLowerCase() !== 'none' && urlScheme.cssUrlVerdict(v).ok && realDeclValueIsSafe(v);
}

/** The `backgroundImage` directive a comment token carries, as `{ value, spot }`, or null. */
export function backgroundDirectiveOf(content) {
  const dir = readDirectiveComment(content, BG_DIRECTIVE);
  return dir ? { value: String(dir.value ?? ''), spot: !!dir.spot } : null;
}

/** Does token `k` set the slide's background image (`<!-- _backgroundImage: url(…) -->`, spot or global)? */
function setsBackgroundAt(tokens, k) {
  const t = tokens[k];
  if (t.type !== 'html_block') return false;
  const dir = backgroundDirectiveOf(t.content);
  return !!dir && backgroundImagePlaces(dir.value);
}

/**
 * What the slide holds, for a reader that wants more than the verdict (the lint): the indexes of its lone pictures, and
 * whether it places a photo another way.
 *
 * @param {object[]} tokens  a markdown-it token stream
 * @param {number} from  the slide's first token
 * @param {number} to  one past its last
 * @returns {{ lone: number[], placesPhoto: boolean }}
 */
export function slidePictureCensus(tokens, from = 0, to = tokens.length) {
  const lone = [];
  let placesPhoto = false;
  for (let k = from; k < to; k++) {
    if (lonePictureAt(tokens, k)) lone.push(k);
    else if (placesPhotoAt(tokens, k) || setsBackgroundAt(tokens, k)) placesPhoto = true;
  }
  return { lone, placesPhoto };
}

/**
 * THE RULE, on a token stream: the index of the `inline` token holding the slide's placed picture, or -1.
 *
 * @param {object[]} tokens  a markdown-it token stream (the engine's, or a parse of the slide alone)
 * @param {number} from  the slide's first token
 * @param {number} to  one past its last
 * @param {string[]|string} classes  the slide's resolved classes
 * @param {{ backgroundImage?: boolean }} [opts]  `backgroundImage`: the slide already has a background image of its own
 */
export function placedPictureIndex(tokens, from, to, classes, opts = {}) {
  if (!slidePlacesPicture(classes) || opts.backgroundImage) return -1;
  const { lone, placesPhoto } = slidePictureCensus(tokens, from, to);
  if (placesPhoto || lone.length !== 1) return -1;
  return addressOk(pictureAddress(tokens[lone[0]].children[0])) ? lone[0] : -1;
}

/** Parse with the caller's markdown-it; refuse to guess one. */
function parseWith(md, text) {
  if (!md || typeof md.parse !== 'function') throw new TypeError('placed-picture: pass the markdown-it instance to parse with (`md`)');
  return md.parse(String(text ?? ''), {});
}

/**
 * THE RULE, on one slide's Markdown: the placed picture, or null. `line` is the picture's 0-based line in `text`; `ordinal`
 * counts the pictures before it on the slide, in document order, so a reader holding its own tree (Compose) can find it.
 *
 * @param {string} text  the slide's source (its directives may be in it)
 * @param {string[]|string} classes  the slide's resolved classes
 * @param {{ md: { parse: Function }, backgroundImage?: boolean }} opts  `md`: the parser (lib/core/boundary-parser.mjs)
 * @returns {{ src: string, alt: string, title: string|null, line: number, lines: number, ordinal: number } | null}  `lines`: how
 *   many source lines the picture's paragraph spans
 */
export function placedPictureInSlide(text, classes, opts) {
  if (!slidePlacesPicture(classes) || opts?.backgroundImage) return null;
  const tokens = parseWith(opts?.md, text);
  const at = placedPictureIndex(tokens, 0, tokens.length, classes, opts);
  if (at < 0) return null;
  let ordinal = 0;
  for (let k = 0; k < at; k++) {
    for (const c of tokens[k].children || []) if (c.type === 'image') ordinal++;
  }
  const pic = tokens[at].children[0];
  const map = tokens[at].map;
  return { src: pictureAddress(pic), alt: pic.content, title: pic.attrGet('title'), line: map?.[0] ?? -1, lines: map ? map[1] - map[0] : 1, ordinal };
}

/** One slide's census from its Markdown (the lint's entry point): its lone pictures' 0-based lines, and whether it places a
 *  photo another way. `md`: the parser, as for `placedPictureInSlide`. */
export function slidePictureLines(text, md) {
  const tokens = parseWith(md, text);
  const { lone, placesPhoto } = slidePictureCensus(tokens);
  return { lone: lone.map((i) => tokens[i].map?.[0] ?? -1), placesPhoto };
}
