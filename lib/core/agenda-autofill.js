/**
 * lib/core/agenda-autofill.js — an EMPTY agenda fills itself from the deck's dividers.
 *
 * An author who writes an agenda slide with a heading and no list:
 *
 *     <!-- _class: agenda -->
 *
 *     ## What we will cover
 *
 * gets one numbered item per section of the deck, each one the heading of that section's `divider`
 * slide, in deck order. Dropped between sections (inside section k), the same empty agenda also gets
 * `progress-k`, so it marks where the room is without the author counting dividers. A hand-written
 * list always wins: an agenda with ANY top-level list is left exactly as written.
 *
 * WHY FILL AND NOT GENERATE. `glossary: auto` (lib/core/glossary-auto.mjs) appends a slide the
 * source does not contain, and six consumers have had to trim it back out (`withoutAutoGlossary`)
 * because every narrator, the Studio preview and Present index slides by authored position. That
 * works only because the glossary goes LAST. An agenda belongs at slide 2, where an inserted slide
 * would shift every slide after it. Filling a slide the author placed changes no slide's position,
 * so nothing downstream needs to know it happened. The decision, the variant audit beside it and
 * what this does NOT do (page references): engineering/decisions/2026-11-08-agenda-styles-and-autofill.md.
 *
 * WHERE IT RUNS (HARD RULE #1). The engine's render door (lib/engine/index.js `render`), so the CLI,
 * the Studio, the docs site and every export the engine draws see one result; and the two
 * Export-to-Marp bakes (tools/export-marp.js, docs/src/components/studio/export/deck-export.js),
 * where marp-core renders instead of the engine. The Studio's one-slide preview route cannot see the
 * other slides, so a deck that relies on the fill takes the whole-deck route
 * (docs/src/playground/single-slide-render.ts `DECK_DERIVED_FACTS`, whose own source test asks the same question
 * without importing this file, and over-matches rather than misses).
 *
 * WHAT IT READS, all of it shared with the renderer rather than re-spelled here: the engine's own
 * boundary parser (lib/core/boundary-parser.js) and its slide-rule test (`isSlideRule`), the way
 * lib/core/bake-splits.js walks a deck, so a `divider` or a list inside a code fence is code, not
 * structure; the directive grammar (`readDirectiveComment`, spot-over-global like the engine); and
 * `tokensHide`, so a hidden divider opens no section, as on the rail. It deliberately does NOT reach
 * lib/core/slide-boundaries.mjs or the meta scan: those read the LINT core's copy of the boundary
 * parser, and the playground build fails if the engine and the lint core share one
 * (tools/build-playground.js `assertLintParserIsolated`). The linter reads the same facts its own way
 * (lib/authoring/lint-core.js `findAgendaIssues`), pinned to `autoAgendaPlan` by
 * test/unit/core/agenda-autofill.test.js.
 *
 * Pure, synchronous, no fs. Returns the source unchanged (the same string) when there is nothing to
 * fill, so a deck without an empty agenda renders byte-identically.
 */

const { boundaryParser: md, FRONT_MATTER, normalizeSource } = require('./boundary-parser');
const { isSlideRule } = require('./slide-rule');
const { readDirectiveComment } = require('./comment-directive.mjs');
const { tokensHide } = require('./hide-directive.mjs');
const { agendaSettings, AGENDA_STYLE_CLASS } = require('./resolve-agenda');

/** The agenda's CSS draws `progress-1` … `progress-6` (agenda.styles.css); past six there is no style to name. */
const MAX_PROGRESS = 6;

/** Fewer sections than this and the fill does nothing: a one-item contents page is empty wayfinding
 *  (agenda.docs.md "Single-section decks"), and the empty slide's lint finding says why. */
const MIN_SECTIONS = 2;

/** A cheap superset probe: no `agenda` anywhere means nothing to fill, and the parse is skipped. */
const AGENDA_PROBE = /\bagenda\b/;

const CLASS_VOCAB = { known: new Set(['class']), flags: new Set() };

/** The class tokens of one directive payload. */
const classTokens = (payload) => String(payload || '').split(/\s+/).filter(Boolean);

/**
 * The deck read once: its lines, and per slide its line span (in the WHOLE source), the class
 * tokens in force, the line of its spot `_class` directive, and the facts the fill needs. `null`
 * for a deck with no agenda anywhere.
 */
function readDeck(source) {
  const src = normalizeSource(source);
  if (!AGENDA_PROBE.test(src)) return null;
  const fmMatch = src.match(FRONT_MATTER);
  const fm = fmMatch ? fmMatch[0] : '';
  const offset = fm ? fm.replace(/\n$/, '').split('\n').length : 0; // body line 0 is source line `offset`
  const body = src.slice(fm.length);
  const lines = src.split('\n');
  const tokens = md.parse(body, {});
  const bodyLines = body.split('\n').length;
  // The front matter's `class:` never names a component: the engine refuses one there (lib/core/deck-class-register.js
  // `deckClassValue`), so neither `agenda` nor `divider` can come from it, and the running class starts empty.
  let running = '';
  const slides = [];
  let from = 0; // first token of the slide
  let start = 0; // first body line of the slide
  const close = (to, end) => {
    // A rule as the very first token opens no slide of its own: the engine merges the empty leading group
    // into the slide that follows (lib/core/slide-boundaries.mjs `dropLeadingEmpty`).
    if (from === 0 && to === 0) return;
    const own = tokens.slice(from, to);
    let spot = null;
    let spotBlock = null; // [start, end) source lines of the html_block holding the winning spot `_class`
    let heading = '';
    let listed = false;
    for (let i = 0; i < own.length; i++) {
      const t = own[i];
      // A directive is a WHOLE html_block that is one comment, at any depth: the engine's own reading
      // (lib/engine/slides.js `lattice_directives`). `<!-- a --> <!-- _class: agenda -->` on one line, or a
      // comment with text after it, is no directive there, so it is none here either.
      if (t.type === 'html_block') {
        const d = readDirectiveComment(t.content, CLASS_VOCAB);
        if (d?.spot) {
          spot = d.value;
          spotBlock = t.map && t.level === 0 ? [offset + t.map[0], offset + t.map[1]] : null;
        } else if (d) running = d.value;
        continue;
      }
      if (t.level !== 0) continue;
      if (t.type === 'heading_open' && !heading) {
        heading = (own[i + 1]?.content || '').trim();
      } else if (t.type === 'ordered_list_open' || t.type === 'bullet_list_open') {
        listed = true;
      }
    }
    const has = new Set(classTokens(spot ?? running));
    slides.push({
      start: offset + start,
      end: offset + end,
      spotBlock,
      divider: has.has('divider'),
      agenda: has.has('agenda'),
      hidden: tokensHide(own),
      heading,
      listed,
      progress: [...has].some((c) => /^progress-\d+$/.test(c)),
      has,
    });
  };
  for (let i = 0; i < tokens.length; i++) {
    if (!isSlideRule(tokens[i])) continue;
    close(i, tokens[i].map[0]);
    from = i + 1;
    start = tokens[i].map[1];
  }
  close(tokens.length, bodyLines);
  // The deck's `agenda:` line (lib/core/resolve-agenda.js), read from the front matter's body.
  const settings = agendaSettings(fm.replace(/^---[^\n]*\n/, '').replace(/\n?---[ \t]*\n?$/, ''));
  return { lines, slides, settings };
}

/**
 * An agenda item from a divider heading: one line, and without the heading's closing period. House
 * headings end in a period (`## Where growth came from.`); an agenda line does not (the six-stop
 * examples in agenda.docs.md). Only a single trailing `.` goes, so `…` and `?` stay.
 */
function itemText(heading) {
  const one = heading.replace(/\s*\n\s*/g, ' ').trim();
  const text = /[^.]\.$/.test(one) ? one.slice(0, -1) : one;
  // The text lands after `1. `, where a leading block marker would open a block of its own: `## 1. Intro`
  // would become a nested list, `## - Draft` a bullet list, `## # Hash` a heading. A backslash keeps it text.
  return text.replace(/^(\d{1,9})([.)])(?=\s|$)/, '$1\\$2').replace(/^([-+*#>])(?=\s|$)/, '\\$1');
}

/** The deck's sections, in order: the shown dividers' item texts. A hidden divider opens no section. */
const sectionsOf = (slides) => slides.filter((s) => s.divider && !s.hidden).map((s) => itemText(s.heading));

/**
 * The empty agendas and what each would get: `[{ slide, items, progress }]`, `slide` 1-based among
 * the authored slides (the linter's numbering), `items` the section names (empty when the deck has
 * fewer than MIN_SECTIONS), `progress` the section the slide sits in or 0. For the linter, which
 * reports what the fill will do without rendering.
 */
function autoAgendaPlan(source) {
  const deck = readDeck(source);
  if (!deck) return [];
  const sections = sectionsOf(deck.slides);
  const items = sections.length >= MIN_SECTIONS ? sections : [];
  const out = [];
  let cur = 0;
  deck.slides.forEach((s, k) => {
    if (s.divider && !s.hidden) cur += 1;
    if (s.agenda && !s.listed) out.push({ slide: k + 1, items, progress: cur, hadProgress: s.progress });
  });
  return out;
}

/**
 * The words the engine adds to one agenda slide's `_class`, and why each:
 *
 *   · the deck's STYLE (`agenda: circles` → `circles`), on every agenda that names no style of its own
 *     (`circles`, `checks`, or `agenda-ledger` to keep the ledger). A slide's `agenda-circles` /
 *     `agenda-checks` register word becomes the bare style word the CSS reads.
 *   · `progress-k`, on a FILLED agenda inside section k (1–6) that names no progress of its own.
 *   · `agenda-pages`, on a FILLED agenda when the deck's pages axis is on (the default) and the slide
 *     does not say `agenda-no-pages`. The render pass (progress.transform.js `withAgendaPages`) prints
 *     each item's page number on exactly those slides, so an agenda the author wrote never gets one.
 */
function classAdditions(s, filled, cur, settings) {
  const add = [];
  const own = ['circles', 'checks', 'agenda-ledger', 'agenda-circles', 'agenda-checks'].find((t) => s.has.has(t));
  if (own === 'agenda-circles' || own === 'agenda-checks') add.push(own.slice('agenda-'.length));
  else if (!own && AGENDA_STYLE_CLASS[settings.style]) add.push(AGENDA_STYLE_CLASS[settings.style]);
  if (filled && cur >= 1 && cur <= MAX_PROGRESS && !s.progress) add.push(`progress-${cur}`);
  const pagesOn = s.has.has('agenda-pages') || (settings.pages && !s.has.has('agenda-no-pages'));
  if (filled && pagesOn && !s.has.has('agenda-pages')) add.push('agenda-pages');
  return add.filter((t) => !s.has.has(t));
}

/**
 * Fill every empty agenda in `source` from the deck's dividers, and apply the deck's `agenda:` line to
 * every agenda slide. Returns `source` itself (the same string) when there is nothing to do: no agenda,
 * or every agenda already has a list and the deck sets no agenda style.
 *
 * @param {string} source
 * @returns {string}
 */
function fillAutoAgenda(source) {
  if (typeof source !== 'string') return source;
  const deck = readDeck(source);
  if (!deck) return source;
  const { lines, slides, settings } = deck;
  if (!slides.some((s) => s.agenda)) return source;
  const sections = sectionsOf(slides);
  const fills = sections.length >= MIN_SECTIONS;
  // An item whose divider has no heading would be a blank `1.`; number it by its place instead.
  const list = sections.map((t, k) => `${k + 1}. ${t || `Section ${k + 1}`}`);
  // Edits back to front, so the earlier spans' line numbers still hold.
  const out = lines.slice();
  let changed = false;
  let cur = slides.filter((s) => s.divider && !s.hidden).length;
  for (let k = slides.length - 1; k >= 0; k--) {
    const s = slides[k];
    if (s.agenda) {
      const filled = fills && !s.listed;
      if (filled) {
        // The list goes after the slide's last line with content, so a trailing blank line stays the gap before `---`.
        let last = s.end - 1;
        while (last >= s.start && !out[last].trim()) last -= 1;
        out.splice(last + 1, 0, '', ...list);
        changed = true;
      }
      const add = classAdditions(s, filled, cur, settings);
      if (add.length && s.spotBlock) {
        // The directive's own block, whole: a quoted value (`"agenda"`) takes the words INSIDE its quotes, or the
        // engine would read `"agenda" progress-1` as one class with quotes in it, and a directive spread over
        // several lines is still one comment. A running global `class: agenda` has no block here and gets
        // nothing: a word written there would carry to every later slide.
        const [a, b] = s.spotBlock;
        const block = out.slice(a, b).join('\n');
        const next = block.replace(/(<!--\s*_class\s*:\s*)(["']?)([\s\S]*?)\2(\s*-->)/, (_m, open, q, value, close) => `${open}${q}${value.trim()} ${add.join(' ')}${q}${close}`);
        out.splice(a, b - a, ...next.split('\n'));
        changed = true;
      }
    }
    if (s.divider && !s.hidden) cur -= 1;
  }
  return changed ? out.join('\n') : source;
}

module.exports = { fillAutoAgenda, autoAgendaPlan, MIN_SECTIONS, MAX_PROGRESS };
