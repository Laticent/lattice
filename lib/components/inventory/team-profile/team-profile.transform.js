/**
 * team-profile kernel — turn an authored people list into portrait cards.
 *
 * The author writes the house card shape (HARD RULE #5) — the person's NAME is
 * the top-level bullet, everything about them nests under it:
 *
 *   - Ada Okafor
 *     - ![Ada Okafor](ada.jpg)      ← portrait (optional)
 *     - `Chief Executive`           ← role (the backticked line)
 *     - Fifteen years scaling ops.  ← note (any remaining plain line)
 *
 * Markdown renders that as `<li>Ada Okafor<ul><li><img></li>…</ul></li>` — a bare
 * text node followed by a nested list, in the order the author typed rather than
 * the order the card reads (portrait above the name). CSS alone cannot fix that:
 * an anonymous text node is not an element, so it takes no `order`, and the parts
 * that WOULD reorder are one level deeper than the parts they must interleave
 * with. So this kernel rebuilds each item into a flat, named card:
 *
 *   <li class="person">
 *     <span class="person-figure"><img class="person-photo" src alt=""></span>
 *     <span class="person-text">
 *       <span class="person-name">Ada Okafor</span>
 *       <span class="person-role">Chief Executive</span>
 *       <span class="person-note">Fifteen years scaling ops.</span>
 *     </span>
 *   </li>
 *
 * The `.person-text` wrapper is not decoration: it is what lets one DOM serve
 * five compositions. A portrait CARD stacks figure over text, a portrait ROW sets
 * them side by side — with the words in their own box that is one flex-direction
 * per design, and without it every row layout would have to re-lay the name, the
 * role and the note individually against the figure.
 *
 * WHY A MONOGRAM. The second job is the one that makes the component shippable.
 * Most decks that need this slide have headshots for one side of the room and
 * none for the other — the QBR "your team" half is nearly always photo-less. A
 * roster where half the cards have a face and half have a hole reads as broken,
 * so a person with no portrait gets a MONOGRAM instead: their initials, drawn in
 * a categorical palette fill. Deriving initials needs the name, which is why this
 * is a transform and not CSS — `attr()` cannot slice a string. The color is
 * OURS (`--cat-N-fill` / `--cat-N-ink`, the three-layer contrast contract), the
 * same argument logo-marks makes for masking a logo: a token re-tones per theme
 * and per color-mode, a supplied asset does not.
 *
 * Pure string-in/string-out (and a mirrored DOM arm) — no fs, no globals — so the
 * one implementation runs on all three render paths (HARD RULE #1): the engine
 * (playground + emulator) via `applyToRenderedHtml`, and the live runtime via
 * `applyToDom`. Idempotent: a rebuilt section has no bare `<li>` text left to
 * parse and is short-circuited by its `team-roster` marker class, so the engine
 * pass and a runtime refresh can both fire on the same DOM.
 */

const { mapSections } = require('../../../core/section-walk');
const { parseTopLevelLis, extractFirstList } = require('../../../core/html-lists');
const { topLevelElements } = require('../../../core/coda');
const { resolveAssetUrl } = require('../../../core/bg-image');

const SECTION_CLASS = 'team-profile';
const MARKER = 'team-roster';

/** The named entities markdown output actually carries, decoded in ONE pass. */
const ENTITIES = Object.freeze({
  amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', '#39': "'",
});

/**
 * A person's name as plain text — for the initials, and for "is there anything
 * here at all". NOT a sanitizer, and written so nobody can mistake it for one.
 *
 * TAGS come off with a SCANNER, not a regex, and the reason is worth the ten
 * lines. Three shapes were tried here and the first two are both wrong:
 *
 *   `replace(/<[^>]*>/g, '')` alone — the classic incomplete multi-character
 *   sanitization, and CodeQL flags it (alerts 241, 243). It also leaves an
 *   UNCLOSED `<script`, which has no `>` to match.
 *
 *   The same replace run to a FIXPOINT — passes the analyzer, and an independent
 *   checker then proved the loop never does any work: `String.replace` with a
 *   `/g` regex is leftmost-first, so after one pass no `<` can still be followed
 *   by a `>`. Exhaustively searched to length 9 over `{<,>,a,b}`, it never
 *   reached a second useful iteration, and deleting it left every one of its own
 *   tests passing. A loop that exists to satisfy a static analyzer, carrying a
 *   comment describing a mechanism that does not occur, is worse than no loop.
 *
 * So: walk the string once and copy only what is outside a tag. Depth-counted, so
 * `<<b>b>` is consumed whole rather than reforming a tag behind the cursor, and an
 * unclosed `<script` swallows the rest. `<` and `>` are never emitted at all,
 * which is the property both the analyzer and the initials actually need, and it
 * is true by construction rather than by argument. Iterating the string yields
 * whole code points, so an astral character survives intact.
 *
 * ENTITIES are decoded in ONE pass over that text, never as a chain of
 * `.replace()` calls. Chained, `&amp;` → `&` runs first and its output is re-read
 * by the later rules, so `&amp;lt;` decodes to `&lt;` and then to `<` — a
 * double-unescape that manufactures a character the author never wrote (alert
 * 242). One regex with a lookup can only consume each entity once.
 */
function textOf(html) {
  let text = '';
  let depth = 0;
  for (const ch of String(html)) {
    if (ch === '<') { depth++; continue; }
    if (ch === '>') { if (depth > 0) depth--; continue; }
    if (depth === 0) text += ch;
  }
  return text
    .replace(/&(amp|lt|gt|quot|apos|nbsp|#0*39);/g, (_m, name) =>
      ENTITIES[name.replace(/^#0+/, '#')] ?? ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function escapeAttr(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

/**
 * Initials for the monogram: the first letter of the first word plus the first
 * letter of the LAST word, uppercased — "Ada Okafor" → AO, "Marcus van der Berg"
 * → MB, "Prince" → P. `Array.from` rather than `[0]` so a name that opens on an
 * astral character (an emoji, some CJK extensions) yields the whole code point
 * instead of half a surrogate pair. A parenthetical or a suffix after a comma is
 * dropped first — "Okafor, PhD" must not initial as "OP".
 */
function initialsOf(name) {
  const cleaned = textOf(name)
    .replace(/\([^)]*\)/g, ' ')
    .split(',')[0]
    .replace(/[^\p{L}\p{N}\s'’-]/gu, ' ')
    .trim();
  const words = cleaned.split(/\s+/).filter(Boolean);
  if (!words.length) return '';
  const head = Array.from(words[0])[0] || '';
  const tail = words.length > 1 ? Array.from(words[words.length - 1])[0] || '' : '';
  return (head + tail).toLocaleUpperCase();
}

/** An `<li>` whose whole content is one `<code>` is the ROLE line. */
const ONLY_CODE_RE = /^\s*<code[^>]*>([\s\S]*?)<\/code>\s*$/i;
/** A class token in a `class="…"` attribute — not a bare substring (see the guard). */
// The leading `\s` is load-bearing: without it the pattern also matches
// `data-class="…"`, the RAW `_class:` payload rather than the resolved list (#1358).
const MARKER_RE = new RegExp(`\\sclass="[^"]*\\b${MARKER}\\b`);
/** The first `<img …>` in a fragment, with its attribute run captured. */
const IMG_RE = /<img\b([^>]*?)\/?>/i;

/**
 * Read one attribute off an open tag. BOTH quote styles: markdown-it always emits
 * double quotes, but the engine runs `html: true`, so an author can hand-write
 * `<img src='ada.svg'>` — and a double-quote-only read returned '' for it, which
 * sent a person with a perfectly good portrait down the monogram path and dropped
 * the image with no warning.
 */
function readAttr(attrs, name) {
  const m = String(attrs).match(new RegExp(`\\s${name}\\s*=\\s*("([^"]*)"|'([^']*)')`, 'i'));
  if (!m) return '';
  return m[2] !== undefined ? m[2] : m[3];
}

/**
 * Strip ONE wrapping `<p>`. A LOOSE list — any blank line inside an item — makes
 * markdown-it wrap each item's content in a paragraph, so `- \`Executive Sponsor\``
 * arrives as `<p><code>…</code></p>`. Without this the role failed the exact-code
 * test and fell through to the notes as a raw inline-code chip: the pill the docs
 * say this component is deliberately NOT, and the name arrived as a `<p>` nested
 * inside a `<span>`. The `</p>` guard keeps two real paragraphs from being fused.
 */
function unwrapParagraph(html) {
  const m = String(html).match(/^\s*<p\b[^>]*>([\s\S]*?)<\/p>\s*$/);
  return m && m[1].indexOf('</p>') === -1 ? m[1] : String(html);
}

/**
 * Split one person's authored `<li>` content into its parts. The lead text (up
 * to the nested list) is the name; the nested items are classified by SHAPE, not
 * by position, so an author can order them however reads naturally:
 *   an item carrying an <img>        → portrait
 *   an item that is exactly <code>   → role
 *   anything else with text          → a note line
 */
function parsePerson(liInner) {
  const nested = extractFirstList(liInner);
  const lead = nested ? liInner.slice(0, nested.start) : liInner;
  const parts = { name: unwrapParagraph(lead).trim(), photo: null, role: '', notes: [] };
  if (!nested) return parts;

  for (const raw of parseTopLevelLis(nested.inner)) {
    const item = unwrapParagraph(raw);
    // A bullet can carry BOTH — `- ![](ada.svg) \`Sponsor\`` is one line an author
    // writes. Classifying it as the portrait and moving on silently dropped the
    // role, so each shape is tested against the same item rather than in an
    // if/continue chain.
    const img = item.match(IMG_RE);
    if (img && !parts.photo) parts.photo = { src: readAttr(img[1], 'src'), alt: readAttr(img[1], 'alt') };
    const rest = img ? item.replace(IMG_RE, '') : item;
    const code = rest.match(ONLY_CODE_RE);
    if (code) {
      if (!parts.role) parts.role = code[1].trim();
      continue;
    }
    if (img) continue;
    if (textOf(item)) parts.notes.push(item.trim());
  }
  return parts;
}

/**
 * The portrait cell. A supplied photo is a real `<img>` (not a CSS mask — a
 * face is content, and masking it would erase it) cropped square by
 * `object-fit`, with `alt=""` because the name is right beside it and a screen
 * reader announcing it twice is noise. With no photo we draw the monogram, and
 * mark it `aria-hidden` for the same reason.
 */
function figureHtml(person, baseUrl) {
  if (person.photo?.src) {
    // NOT `loading="lazy"`. Every render path here lays the whole deck out as one
    // document, so a portrait on slide 7 is far off-screen and a lazy image never
    // loads at all — the export's "settle swapped images" watchdog then waits the
    // full 90s and Chrome comes back wedged, which is how the gallery build failed
    // the first time this shipped. Eager is also simply correct for a deck: there
    // is no scroll to defer the cost to.
    // Resolve the portrait against the deck's base, the same rule inline images and
    // logo-wall marks follow (lib/core/bg-image.js). The engine emits the author's
    // deck-relative `ada.jpg` verbatim, which is right for the CLI (it renders against
    // the on-disk deck dir, and no baseUrl is passed, so this is a no-op there and the
    // exported bytes are untouched) and WRONG in a preview iframe, whose srcdoc has no
    // deck-dir base: the portrait 404s and every face becomes a broken-image icon.
    // Caught on the real docs-site preview, not by any render test — the PDFs were
    // perfect while the live surface showed empty discs.
    // NOT re-escaped. The src was read out of ALREADY-escaped rendered HTML, so
    // `escapeAttr` here turned `&amp;` into `&amp;amp;` and a portrait URL carrying
    // a query string (`?w=200&h=200`) resolved to a literal `&amp;` and 404'd.
    // `resolveInlineImageSrcs` — the kernel this mirrors (lib/core/bg-image.js) —
    // re-emits the attribute text verbatim for exactly this reason, and a quote
    // cannot appear in it un-escaped for the same reason.
    const src = resolveAssetUrl(person.photo.src, baseUrl);
    return `<span class="person-figure"><img class="person-photo" src="${src}" alt=""></span>`;
  }
  const initials = initialsOf(person.name);
  if (!initials) return '<span class="person-figure person-figure--monogram" aria-hidden="true"></span>';
  return `<span class="person-figure person-figure--monogram" aria-hidden="true"><span class="person-initials">${escapeAttr(initials)}</span></span>`;
}

function personHtml(liInner, baseUrl) {
  const person = parsePerson(liInner);
  const text = [];
  if (person.name) text.push(`<span class="person-name">${person.name}</span>`);
  if (person.role) text.push(`<span class="person-role">${person.role}</span>`);
  for (const note of person.notes) text.push(`<span class="person-note">${note}</span>`);
  const body = text.length ? `<span class="person-text">${text.join('')}</span>` : '';
  return `<li class="person">${figureHtml(person, baseUrl)}${body}</li>`;
}

/**
 * Rebuild the DIRECT-CHILD lists of `container` into rosters. Everything below
 * turns on "direct child", and two defects came from not having it:
 *
 *   - A list nested in anything else is QUOTED material, not a roster. Scanning
 *     the body for lists at any depth turned a mid-slide blockquote's bullets
 *     into monogrammed people.
 *   - The frame's `.cell-coda` and `.cell-footer` are DIVs, so their inner lists
 *     are not direct children and are never entered. That is why this needs no
 *     `peelCoda`: an earlier version peeled the coda and re-appended it, which
 *     moved the cell AFTER `.cell-footer` — the one layout in the catalog to do
 *     so, and the exact order `coda.test.js` pins ("chrome must stay last"). Not
 *     peeling leaves the cell exactly where the frame put it.
 *
 * `sides` authors two lists under two `### ` headings; both are direct children,
 * so both become rosters.
 */
function rebuildRosters(container, baseUrl) {
  let out = '';
  let cursor = 0;
  let changed = false;
  for (const el of topLevelElements(container)) {
    if (el.tag !== 'ul' && el.tag !== 'ol') continue;
    const openEnd = container.indexOf('>', el.start) + 1;
    const closeStart = container.lastIndexOf('</', el.end);
    const items = parseTopLevelLis(container.slice(openEnd, closeStart))
      .map((li) => personHtml(li, baseUrl))
      .join('');
    out += container.slice(cursor, el.start) + `<ul class="${MARKER}">${items}</ul>`;
    cursor = el.end;
    changed = true;
  }
  return changed ? out + container.slice(cursor) : container;
}

/** The frame's stage cell, when the masthead kernel has already wrapped the body. */
function findStage(inner) {
  for (const el of topLevelElements(inner)) {
    if (el.tag !== 'div') continue;
    const open = inner.slice(el.start, inner.indexOf('>', el.start) + 1);
    if (/\sclass="[^"]*\bcell-stage\b/.test(open)) return el;
  }
  return null;
}

/**
 * Rewrite one `section.team-profile` body. Returns the input unchanged when there
 * is nothing to do, so the caller can pass every section through.
 */
function transformSection(inner, baseUrl) {
  if (typeof inner !== 'string') return inner;
  // Guard on the marker as a CLASS TOKEN, not a bare substring. `indexOf('team-roster')`
  // also matched the words in a person's own note ("We keep the team-roster in Notion"),
  // and the whole rebuild silently declined — the slide rendered as raw bullets. Every
  // sibling rebuilder guards on its class this way (contact on `class="qr-card"`,
  // scene on `:scope .scene-figure`), and coda.js documents at length why a class must
  // be matched as a token.
  if (MARKER_RE.test(inner)) return inner; // already rebuilt — idempotent
  if (inner.indexOf('<li') === -1) return inner;

  const stage = findStage(inner);
  if (!stage) return rebuildRosters(inner, baseUrl);
  const openEnd = inner.indexOf('>', stage.start) + 1;
  const closeStart = inner.lastIndexOf('</', stage.end);
  const body = rebuildRosters(inner.slice(openEnd, closeStart), baseUrl);
  return inner.slice(0, openEnd) + body + inner.slice(closeStart);
}

function applyToRenderedHtml(html, ctx) {
  if (typeof html !== 'string' || html.indexOf(SECTION_CLASS) === -1) return html;
  const baseUrl = ctx?.baseUrl;
  return mapSections(html, (_openTag, cls, inner) => {
    if (!new RegExp(`(?:^|\\s)${SECTION_CLASS}(?:\\s|$)`).test(cls)) return null;
    return transformSection(inner, baseUrl);
  });
}

function applyToDom(root) {
  if (!root || typeof root.querySelectorAll !== 'function') return;
  for (const sec of root.querySelectorAll(`section.${SECTION_CLASS}`)) {
    if (sec.querySelector(`:scope .${MARKER}`)) continue; // idempotent
    // Nothing is written until we know there IS a roster to rebuild: the pin loop
    // below used to run first, so a section this transform declines to touch still
    // had every one of its images rewritten — value-stable, but an unconditional
    // live-DOM write outside this transform's scope.
    if (!sec.querySelector(':scope li')) continue;
    // The live DOM has already resolved every `img.src` against the document, so
    // pin that absolute URL into the ATTRIBUTE before serializing — otherwise the
    // rebuild re-emits the author's relative path and the browser resolves it a
    // second time, against whatever document the rebuilt markup lands in.
    for (const img of sec.querySelectorAll('img')) {
      if (img.getAttribute('src') && img.src) img.setAttribute('src', img.src);
    }
    const next = transformSection(sec.innerHTML);
    if (next !== sec.innerHTML) sec.innerHTML = next;
  }
}

module.exports = {
  applyToRenderedHtml,
  applyToDom,
  transformSection,
  // exported for the unit tier
  textOf,
  initialsOf,
  parsePerson,
};
