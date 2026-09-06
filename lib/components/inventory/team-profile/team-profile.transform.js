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
const { peelCoda } = require('../../../core/coda');

const SECTION_CLASS = 'team-profile';
const MARKER = 'team-roster';

/** The named entities markdown output actually carries, decoded in ONE pass. */
const ENTITIES = Object.freeze({
  amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', '#39': "'",
});

/**
 * A person's name as plain text — for the initials, and for "is there anything
 * here at all". NOT a sanitizer, and it is written so nobody can mistake it for
 * one: both halves are the shape CodeQL flags in a hand-rolled cleaner, and both
 * were flagged here (alerts 241/242 on #2102) before this rewrite.
 *
 * TAGS come off to a FIXPOINT. A single `replace(/<[^>]*>/g, '')` is the classic
 * incomplete multi-character sanitization: `<<b>b>` has its inner `<b>` removed
 * and the outer halves close up into a live `<b>` the pass has already gone past.
 * The loop terminates because every pass that changes the string shortens it.
 *
 * ENTITIES are decoded in ONE pass over the original text, never as a chain of
 * `.replace()` calls. Chained, `&amp;` → `&` runs first and its output is then
 * re-read by the later rules, so `&amp;lt;` decodes to `&lt;` and then to `<` —
 * a double-unescape that manufactures a character the author never wrote. One
 * regex with a lookup can only ever consume each entity once.
 */
function textOf(html) {
  let stripped = String(html);
  let prev;
  do {
    prev = stripped;
    stripped = stripped.replace(/<[^>]*>/g, '');
  } while (stripped !== prev);
  // An UNCLOSED `<script` has no `>` to match, so the loop above leaves it whole.
  // A residual angle bracket carries no meaning in a name, so drop it and the
  // guarantee becomes simple enough to state: nothing that came out of the markup
  // still opens a tag.
  return stripped.replace(/[<>]/g, ' ')
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
/** The first `<img …>` in a fragment, with its attribute run captured. */
const IMG_RE = /<img\b([^>]*?)\/?>/i;

function readAttr(attrs, name) {
  const m = String(attrs).match(new RegExp(`\\s${name}\\s*=\\s*"([^"]*)"`, 'i'));
  return m ? m[1] : '';
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
  const parts = { name: lead.trim(), photo: null, role: '', notes: [] };
  if (!nested) return parts;

  for (const item of parseTopLevelLis(nested.inner)) {
    const img = item.match(IMG_RE);
    if (img) {
      if (!parts.photo) parts.photo = { src: readAttr(img[1], 'src'), alt: readAttr(img[1], 'alt') };
      continue;
    }
    const code = item.match(ONLY_CODE_RE);
    if (code) {
      if (!parts.role) parts.role = code[1].trim();
      continue;
    }
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
function figureHtml(person) {
  if (person.photo?.src) {
    // NOT `loading="lazy"`. Every render path here lays the whole deck out as one
    // document, so a portrait on slide 7 is far off-screen and a lazy image never
    // loads at all — the export's "settle swapped images" watchdog then waits the
    // full 90s and Chrome comes back wedged, which is how the gallery build failed
    // the first time this shipped. Eager is also simply correct for a deck: there
    // is no scroll to defer the cost to.
    return `<span class="person-figure"><img class="person-photo" src="${escapeAttr(person.photo.src)}" alt=""></span>`;
  }
  const initials = initialsOf(person.name);
  if (!initials) return '<span class="person-figure person-figure--monogram" aria-hidden="true"></span>';
  return `<span class="person-figure person-figure--monogram" aria-hidden="true"><span class="person-initials">${escapeAttr(initials)}</span></span>`;
}

function personHtml(liInner) {
  const person = parsePerson(liInner);
  const text = [];
  if (person.name) text.push(`<span class="person-name">${person.name}</span>`);
  if (person.role) text.push(`<span class="person-role">${person.role}</span>`);
  for (const note of person.notes) text.push(`<span class="person-note">${note}</span>`);
  const body = text.length ? `<span class="person-text">${text.join('')}</span>` : '';
  return `<li class="person">${figureHtml(person)}${body}</li>`;
}

/**
 * Rebuild every top-level list in a section body into a roster. `sides` authors
 * two (one under each `### ` heading), so this walks them all rather than taking
 * the first.
 *
 * An authored `<ol>` comes back as a `<ul>`, deliberately: a roster has no
 * numbering design — no ordinal is drawn, and every selector in the stylesheet is
 * written against `ul.team-roster` — so emitting `<ol>` would promise an order
 * the render does not keep. `lead` already says "the first person is the hero"
 * structurally, which is the only ordering this component means.
 */
function rebuildLists(body) {
  let out = '';
  let rest = body;
  while (rest) {
    const list = extractFirstList(rest);
    if (!list) break;
    const items = parseTopLevelLis(list.inner).map(personHtml).join('');
    out += `${rest.slice(0, list.start)}<ul class="${MARKER}">${items}</ul>`;
    rest = rest.slice(list.end);
  }
  return out + rest;
}

/**
 * Rewrite one `section.team-profile` body. Returns the input unchanged when
 * there is nothing to do, so the caller can pass every section through.
 */
function transformSection(inner) {
  if (typeof inner !== 'string') return inner;
  if (inner.indexOf(MARKER) !== -1) return inner; // already rebuilt — idempotent
  if (inner.indexOf('<li') === -1) return inner;
  // The coda cell belongs to the FRAME, not to us (lib/core/coda.js). Peel it
  // before the walk and put it back after, so a key-insight list inside it is
  // never mistaken for a person.
  const { rest, coda } = peelCoda(inner);
  return rebuildLists(rest) + coda;
}

function applyToRenderedHtml(html) {
  if (typeof html !== 'string' || html.indexOf(SECTION_CLASS) === -1) return html;
  return mapSections(html, (_openTag, cls, inner) => {
    if (!new RegExp(`(?:^|\\s)${SECTION_CLASS}(?:\\s|$)`).test(cls)) return null;
    return transformSection(inner);
  });
}

function applyToDom(root) {
  if (!root || typeof root.querySelectorAll !== 'function') return;
  for (const sec of root.querySelectorAll(`section.${SECTION_CLASS}`)) {
    if (sec.querySelector(`:scope .${MARKER}`)) continue; // idempotent
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
