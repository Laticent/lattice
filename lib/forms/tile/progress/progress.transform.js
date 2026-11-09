/**
 * progress Tile — kernel (single source of truth for all render paths).
 *
 * The section dot-rail in the footer-center zone (design/forms.md §6): one dot
 * per deck section (derived from `divider` slides, and BUCKETED past MAX_DOTS),
 * with the current section's dot elongated + inked. Injected into every `form`
 * slide that falls within a section; each `divider` composes its own larger marker
 * instead (`divider-marker`, frame content, not chrome). Drawn only when the deck is
 * long and sectioned enough to need it (`railWanted`: 3+ sections and 15+ slides, or
 * `progress-rail: on`). Opt a slide out with `no-progress`; `silent` suppresses it
 * with the rest of the chrome. `with-progress` opts a slide back IN, over both — the
 * owner's rule (2026-11-03): a deck-wide `class: no-progress` reaches every slide,
 * and a slide overrides it with an explicit token. It has to win when both are on
 * the slide, because the deck class is on every slide (`railShown`).
 *
 * The rail carries NO section label — see `railHtml` for why, and
 * engineering/decisions/2026-07-27-footer-band-allocation.md for the band-wide policy
 * it is one rank of.
 *
 * SELF-CONTAINED FORM TILE (issue #356): the Tile owns its logic, CSS
 * (progress.css) and manifest in one folder, and exposes both adapters from this
 * single file (mirrors lib/components/<b>/<c>/<c>.transform.js):
 *
 *   · applyToHtml(html) — the HTML-string render path (the owned engine,
 *                         lib/engine). Depth-aware section walk via the shared
 *                         docs/src/lib/markup/sections.ts.
 *   · applyToDom(doc)   — the live-DOM render path (runtime/preview).
 *
 * The footer zones are now independently-positioned Cells (the rail parks beside
 * the page number — lib/forms/cell/progress-center), so no `has-progress` class is
 * needed: the legacy footer "yield" it drove is retired. Both adapters are
 * idempotent (guarded on the `.tile-progress` marker).
 */

const { switchOn } = require('../../../core/switches');
const { splitSections, maskInert } = require('@laticent/markup');
const { dockInFooterCell } = require('../../../core/footer-dock');

// A HIDDEN divider (`<!-- hide -->`) opens no section: Present and every export leave it out, so the rail and
// the glyph count only the dividers the audience sees (engineering/decisions/2026-11-06-hidden-slides.md).
const { isHiddenSection, isHiddenElement } = require('../../../core/hidden-slides');

/**
 * THE RAIL'S BUDGET. One dot per section stops working on a long deck: a 24-section
 * deck drew 24 dots on every page, and the band is shared with the author's footer
 * text, which is what gets squeezed. So the rail is capped and sections are BUCKETED
 * past the cap — ten dots covering N sections, the bucket you are in elongated.
 *
 * Ten is a width budget expressed as a count: the dots are sized in container units, so
 * ten of them occupy a fixed FRACTION of the band rather than a fixed number of pixels,
 * and the rail's share is the same at every canvas size. That is what makes a constant
 * the responsive answer here — nothing has to be measured at render time.
 *
 * The fraction is NOT the same in every ORIENTATION, though, and getting that wrong is
 * this change's most expensive mistake. The gaps carry `--canvas-scale` (1.95 in portrait)
 * while the dot widths do not, so a ten-dot rail is 21.48 `--_sec-1cqi` units at `hd` and
 * 32.17 in portrait — MEASURED on a real render, not computed from token names, because
 * computing it produced three different wrong answers. If you change MAX_DOTS, re-measure
 * in portrait and raise `--footer-center-w` (stage.css) to match; `footer-band.test.js`
 * asserts that relationship rather than either number.
 */
const MAX_DOTS = 10;

/**
 * WHEN THE RAIL IS WORTH DRAWING. A position cue earns its space only when the reader cannot hold
 * the deck's structure in their head, and only once it can be read as "which part" rather than
 * "how far" (the page number already says how far). So, by default:
 *
 *   · THREE sections or more. With two, the rail is a binary first-half / second-half that the
 *     page number already tells; with one it is a lone lit pill that reads as a stray dash.
 *   · FIFTEEN slides or more. Below that the reader holds the structure unaided.
 *
 * `progress-rail: on` (the inert `progress-rail-on` token, lib/core/resolve-progress-rail.js)
 * lowers both floors to the hard minimum: two sections, any length. A scale of one is never drawn,
 * forced or not. The policy, and why: engineering/decisions/2026-11-06-section-rail-placement.md.
 */
const MIN_SECTIONS = 3;
const MIN_SECTIONS_FORCED = 2;
const MIN_SLIDES = 15;
const FORCE_TOKEN = 'progress-rail-on';

/** Is the rail (and the divider's marker) drawn at all in a deck of `total` sections and `slides`
 *  slides, on a slide whose class list answers `has`? Exported for the unit suite. */
function railWanted(total, slides, has) {
  if (has(FORCE_TOKEN)) return total >= MIN_SECTIONS_FORCED;
  return total >= MIN_SECTIONS && slides >= MIN_SLIDES;
}

/**
 * Past EIGHT sections, dots stop being countable at footer size, so the rail draws as a bar unless
 * the deck asked for dots by name. Stamped on the rail (`bar-auto`), not the section, so it never
 * reads as an author's `progress-rail-bar` and never moves anything else on the slide.
 */
const AUTO_BAR_PAST = 8;

/**
 * Which slides carry the CHROME rail: a `form` slide inside a section, and nothing else. Every
 * sovereign Frame — title, divider, topic, closing, the full-bleed layouts — composes its own canvas
 * and hosts no chrome Cell (design/forms.md §6; frame-identity-agrees.test.js holds that absolute).
 * A topic slide draws its own track one level down, and a full-bleed slide drops the page number
 * too, so the reader sees a different kind of surface rather than a mark blinking out.
 */
const carriesRail = (has) => has('form');

/**
 * A DIVIDER teaches the rail instead of wearing it. Each divider composes its own section marker
 * inside its frame — the section count (`2 / 4`) and the same row of marks, drawn larger, with its
 * own section lit — right beside the section's name in display type. That is where a reader learns
 * what the footer marks mean: every later rail is a miniature of it. It is frame content, not a chrome
 * Cell, so it is not `tile-progress`; it is drawn exactly when the deck's rail is (same floors,
 * same `no-progress` / `silent`), so the legend never teaches a mark the deck does not show.
 * `divider numbered` carries it too, under its numeral, as the first row of the block (divider.styles.css).
 */
const MARKER_CLASS = 'divider-marker';
const carriesMarker = (has) => has('divider');

/**
 * `progress-rail: edge` (lib/core/resolve-progress-rail.js) stands the rail upright on the slide's
 * right edge, so it is placed at SECTION level rather than docked in the footer Cell: the Cell is
 * itself positioned, and a rail inside it could only ever be placed relative to the footer band.
 * Every other placement docks, and CSS does the rest.
 */
const EDGE_TOKEN = 'progress-rail-edge';

/**
 * Which dot is lit, and how many there are, for section `idx` (1-based) of `total`.
 * At or under the cap this is the identity — dot k is section k, unchanged. Over it,
 * section `idx` maps into the bucket that covers it, monotonically, with the last
 * section always landing on the last dot.
 */
function dotPlan(idx, total) {
  const shown = Math.min(total, MAX_DOTS);
  return { shown, on: Math.min(shown - 1, Math.floor((idx - 1) * shown / total)) };
}

/**
 * Build the `.tile-progress` dot-rail markup for section `idx` of `total`.
 *
 * NO SECTION LABEL. The rail used to carry the divider's eyebrow beside the dots, and
 * that one `white-space: nowrap` string is what made the band unresolvable: it could
 * not yield, so it collided with the author's footer text or bid the footer's width
 * away. The band's priority order is now pagination > dots > the author's words > the
 * section name, and the section name loses outright — the divider slide named the
 * section a page or two back, and the dots still say where you are.
 * See engineering/decisions/2026-07-27-footer-band-allocation.md.
 */
/**
 * Does this slide carry the rail? `with-progress` first (a slide's explicit word beats the
 * deck-wide `no-progress` it also carries), then `no-progress` / `silent`.
 * @param {{ contains(t: string): boolean }} tokens  a classList, or anything shaped like one
 */
function railShown(tokens) {
  // `progress-rail: off` (lib/core/resolve-progress-rail.js) is the register's own token, not the
  // switch's, so it is honored here beside it: off unless the slide says `with-progress`.
  if (tokens.contains('progress-rail-off') && !tokens.contains('with-progress')) return false;
  return switchOn('progress', tokens);
}

function dotsHtml(idx, total) {
  const { shown, on } = dotPlan(idx, total);
  return Array.from({ length: shown }, (_, k) => `<span class="dot${k === on ? ' on' : ''}"></span>`).join('');
}

/** `bar-auto` past AUTO_BAR_PAST sections, unless the slide names `dots` itself. */
const autoBar = (total, has) => total > AUTO_BAR_PAST && !has('progress-rail-dots');

/**
 * The divider's own marker: the count in figures (`2 / 4`, language-neutral — the engine has no
 * locale layer, and a typed "of" would be English on every deck) and the same marks as the rail.
 */
function markerHtml(idx, total, has) {
  const bar = autoBar(total, has) ? ' bar-auto' : '';
  return `<div class="${MARKER_CLASS}${bar}" aria-hidden="true"><span class="${MARKER_CLASS}-count">${idx} / ${total}</span>`
    + `<span class="${MARKER_CLASS}-marks">${dotsHtml(idx, total)}</span></div>`;
}

/**
 * THE AGENDA LEGEND. An `agenda` whose list has exactly as many items as the deck has sections is
 * the deck's contents, item k being section k. Each item then ends with a miniature of the footer
 * rail as it will look DURING that section — `2. Unit economics  • ━ • •` — so the reader meets the
 * marks with their names before the first divider. A count that does not match draws nothing: the
 * items are something else, and a legend that mislabels the rail is worse than none. Drawn only
 * when the deck draws its rail (`railWanted`, `railShown`). Placed before a trailing page reference
 * (`` `p.12` ``), which the ledger style aligns to the right edge.
 */
const AGENDA_CLASS = 'agenda-rail';
// `bar-auto` past AUTO_BAR_PAST sections, like the rail and the marker: a legend shows the rail as
// it will look in that section, so it has to look like it.
const agendaRailHtml = (k, total, has) =>
  `<span class="${AGENDA_CLASS}${autoBar(total, has) ? ' bar-auto' : ''}" aria-hidden="true">${dotsHtml(k, total)}</span>`;

/** The [start, end) offsets of the direct `<li>` children of the first `<ol>` in `html`, or null. */
function directItems(html) {
  const open = html.search(/<ol\b/i);
  if (open < 0) return null;
  const re = /<(\/?)(ol|ul|li)\b[^>]*>/gi;
  re.lastIndex = open;
  const items = [];
  let depth = 0; // list depth
  let liStart = -1;
  let m;
  while ((m = re.exec(html))) {
    const closing = m[1] === '/';
    const tag = m[2].toLowerCase();
    if (tag === 'ol' || tag === 'ul') {
      depth += closing ? -1 : 1;
      if (depth === 0) break;
    } else if (depth === 1) {
      if (!closing) liStart = m.index;
      else if (liStart >= 0) { items.push([liStart, m.index]); liStart = -1; }
    }
  }
  return items;
}

/** Where in one item the legend goes: before a trailing page reference, else at the end. */
function legendAt(itemHtml) {
  // `\s*$` lets whitespace follow the page reference; the DOM arm skips the same whitespace nodes.
  const ref = /<code\b[^>]*>[^<]*<\/code>\s*$/.exec(itemHtml);
  return ref ? ref.index : itemHtml.length;
}

function withAgendaLegend(inner, total, has) {
  if (inner.includes(`class="${AGENDA_CLASS}`)) return inner;
  // MASKED for the search, so a list inside a comment or a code sample is never the agenda (the DOM
  // arm only ever sees real elements); masking keeps every offset, so the edits land on `inner`.
  const masked = maskInert(inner);
  const items = directItems(masked);
  if (!items || items.length !== total) return inner;
  let out = inner;
  for (let k = items.length - 1; k >= 0; k -= 1) { // back to front, so earlier offsets hold
    const [start, end] = items[k];
    const at = start + legendAt(masked.slice(start, end));
    out = out.slice(0, at) + agendaRailHtml(k + 1, total, has) + out.slice(at);
  }
  return out;
}

/**
 * THE FILLED AGENDA'S PAGE NUMBERS. An agenda the engine filled from the deck's dividers carries
 * `agenda-pages` (lib/core/agenda-autofill.js, unless the deck or the slide said `no-pages`), and each
 * item k ends with the page section k starts on: `<code class="agenda-page">p.7</code>`, the trailing
 * inline-code page reference every agenda style already draws flush right.
 *
 * THE PAGE IS THE DIVIDER'S PLACE AMONG THE SHOWN SLIDES. A divider draws no page number of its own,
 * but the engine counts it (the slide after it is one more), a hidden slide is not counted, and a split
 * numbers its extra pages `4.2`, `4.3` without moving any slide after it (lib/core/auto-split.js
 * `repaginate`). So the count is exactly the numbering a reader sees. FAIL CLOSED: if any slide's own
 * stamped number disagrees with the count (a document that holds part of a deck, an offset), or the deck
 * prints no page numbers at all (`paginate: false`), or the list is not one item per section, nothing is
 * printed. A wrong `p.12` on a contents page is worse than none.
 */
const AGENDA_PAGE_CLASS = 'agenda-page';
const agendaPageHtml = (n) => `<code class="${AGENDA_PAGE_CLASS}">p.${n}</code>`;
const PAGINATION_RE = /\sdata-(?:lattice|marpit)-pagination="([^"]*)"/;

/** Each shown divider's page, in order, or null when the count cannot be trusted (see above). */
function dividerPages(entries) {
  let n = 0;
  let stamped = 0;
  const pages = [];
  for (const e of entries) {
    if (e.hidden || e.continuation) continue;
    n += 1;
    if (e.pagination != null) {
      stamped += 1;
      if (String(e.pagination) !== String(n)) return null;
    }
    if (e.divider) pages.push({ page: n, name: e.name });
  }
  return stamped ? pages : null;
}

/**
 * The text an agenda line and a divider heading are compared on: tags out, the five entities a renderer writes
 * decoded, spacing collapsed, and one closing period dropped (the fill drops it from the heading,
 * lib/core/agenda-autofill.js `itemText`).
 */
function sameName(text) {
  // Tags out by a scan, not a regex replace: the result is only ever compared, never written to a page, but a
  // one-pass `replace(/<[^>]*>/g, '')` is the shape CodeQL js/incomplete-multi-character-sanitization flags.
  const src = String(text ?? '');
  let bare = '';
  let inTag = false;
  for (const ch of src) {
    if (ch === '<') inTag = true;
    else if (ch === '>' && inTag) inTag = false;
    else if (!inTag) bare += ch;
  }
  const t = bare
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ')
    .trim();
  return /[^.]\.$/.test(t) ? t.slice(0, -1) : t;
}

/**
 * A page belongs to a line only when the line NAMES its section. The count alone cannot say so: a list reordered or
 * renamed after the fill (by hand, or in an Export-to-Marp bundle, which carries the filled list and `agenda-pages`
 * in its source) would get the right number of pages in the wrong places. So every line must read as the heading of
 * the divider at its position, or the agenda gets no pages at all.
 */
const namesMatch = (lines, pages) => lines.length === pages.length && lines.every((l, k) => lineOwns(l, pages[k]) !== null);

/**
 * How one line names its section: `'whole'` when the whole line is the heading (a heading that ends in inline code
 * reads this way, so its code is part of the name, not a page reference), `'own-ref'` when the line is the heading
 * followed by a page reference of its own, `null` when it names something else. `l` is `{ whole, bare }`: the line,
 * and the line without a trailing `<code>`.
 */
function lineOwns(l, page) {
  const name = sameName(page.name);
  if (sameName(l.whole) === name) return 'whole';
  if (l.bare !== l.whole && sameName(l.bare) === name) return 'own-ref';
  return null;
}

function withAgendaPagesHtml(pieces) {
  if (!pieces.some((p) => p.type === 'section' && p.cls.split(/\s+/).includes('agenda-pages'))) return null;
  const runOf = (tag) => (tag.match(/\sdata-split-run="([^"]*)"/) || [])[1] ?? null;
  let prevRun = null;
  const entries = pieces.filter((p) => p.type === 'section').map((p) => {
    const tokens = p.cls.split(/\s+/);
    // A split's later pages carry the run of the page before them (lib/core/auto-split.js `repaginate`'s own
    // test): they continue that slide and are not counted, numbered or not.
    const run = runOf(p.openTag);
    const continuation = run !== null && run === prevRun;
    prevRun = run;
    return {
      hidden: isHiddenSection(p.openTag),
      continuation,
      pagination: (p.openTag.match(PAGINATION_RE) || [])[1] ?? null,
      divider: tokens.includes('divider'),
      name: tokens.includes('divider') ? ((p.inner.match(/<h[1-6]\b[^>]*>([\s\S]*?)<\/h[1-6]>/) || [])[1] ?? '') : '',
    };
  });
  const pages = dividerPages(entries);
  if (!pages) return null;
  return pieces.map((p) => {
    if (p.type !== 'section' || !p.cls.split(/\s+/).includes('agenda-pages') || p.inner.includes(`class="${AGENDA_PAGE_CLASS}"`)) return p;
    const masked = maskInert(p.inner);
    const items = directItems(masked);
    if (!items || items.length !== pages.length) return p;
    // Each line's own words: the item without a trailing page reference of its own.
    const lineText = (k) => {
      const it = masked.slice(items[k][0], items[k][1]);
      return { whole: p.inner.slice(items[k][0], items[k][1]), bare: p.inner.slice(items[k][0], items[k][0] + legendAt(it)) };
    };
    const lines = items.map((_, k) => lineText(k));
    if (!namesMatch(lines, pages)) return p;
    let inner = p.inner;
    for (let k = items.length - 1; k >= 0; k -= 1) {
      // An item that already ends in its own page reference keeps it, and gets no second one.
      if (lineOwns(lines[k], pages[k]) === 'own-ref') continue;
      inner = inner.slice(0, items[k][1]) + agendaPageHtml(pages[k].page) + inner.slice(items[k][1]);
    }
    return { ...p, inner };
  });
}

function railHtml(idx, total, has = () => false) {
  const dots = dotsHtml(idx, total);
  // A `div`, NOT a `nav`. The rail is a decorative echo of the pagination — it is
  // `aria-hidden`, so tagging it `nav` claimed the navigation role and then removed
  // it from the accessibility tree in the same breath. That is the over-tagging the
  // promotion rubric forbids (semantic-html ADR §3, §17.6): an element earns a
  // native tag by carrying its role, and this one deliberately carries none.
  return `<div class="tile-progress${autoBar(total, has) ? ' bar-auto' : ''}" aria-hidden="true">${dots}</div>`;
}

/**
 * HTML-string adapter. Derive sections from `divider` slides, inject the
 * footer-center dot-rail into every `form` slide within a section. No-op without
 * dividers. Idempotent.
 */
function applyToHtml(html, ctx) {
  let pieces = splitSections(html);
  // The filled agenda's page numbers come FIRST, so the legend below lands before them, as it does before
  // an author's own `p.N`. Not on a document that holds part of a deck: it cannot see every divider.
  if (!ctx?.deckSection) {
    const paged = withAgendaPagesHtml(pieces);
    if (paged) {
      html = paged.map((p) => (p.type === 'section' ? p.openTag + p.inner + '</section>' : p.text)).join('');
      pieces = splitSections(html);
    }
  }
  // SUPPLIED SECTION POSITION. `cur`/`total` are deck-positional metadata — which
  // divider-delimited section this slide sits in, and how many the deck has — so a caller
  // that already knows them can hand them over instead of forcing a whole-deck parse. That
  // is the same trade the page number makes (lib/engine/slides.js): deriving them is why a
  // preview showing ONE slide of a deck with dividers had to re-render the entire deck on
  // every keystroke. Absent it, nothing changes — the walk below counts as it always did.
  const supplied = ctx?.deckSection;
  const suppliedTotal = supplied && Number.isInteger(supplied.total) && supplied.total > 0 ? supplied.total : 0;
  const suppliedIndex = supplied && Number.isInteger(supplied.index) && supplied.index > 0 ? supplied.index : 0;
  // The deck's LENGTH is deck-positional too, and a one-slide document cannot count it: a slice
  // caller hands it over beside the section (`deckSectionFor`, slice-equivalence-core.mjs), or the
  // fifteen-slide floor would hide the rail in every single-slide preview.
  const suppliedSlides = supplied && Number.isInteger(supplied.slides) && supplied.slides > 0 ? supplied.slides : 0;
  const total = suppliedTotal || pieces.filter((p) => p.type === 'section'
    && p.cls.split(/\s+/).includes('divider') && !isHiddenSection(p.openTag)).length;
  // SHOWN slides: a hidden one renders in the document but leaves Present and every export, so the
  // fifteen-slide floor counts what the audience sees, as the page numbers do.
  const slides = suppliedSlides || pieces.filter((p) => p.type === 'section' && !isHiddenSection(p.openTag)).length;
  if (total < MIN_SECTIONS_FORCED) return html;

  // With a supplied index the document holds only the shown slide, so there is no run to
  // walk: the caller already resolved which section it falls in. Seeding `cur` and skipping
  // the increment is what makes a one-section document render the SAME rail it would have
  // received inside the full deck.
  let cur = suppliedIndex;
  return pieces.map((p) => {
    if (p.type === 'gap') return p.text;
    const tokens = p.cls.split(/\s+/);
    const has = (t) => tokens.includes(t);
    const hidden = isHiddenSection(p.openTag);
    if (has('divider') && !hidden && !suppliedIndex) cur += 1;
    let inner = p.inner;
    const openTag = p.openTag;
    if (!railWanted(total, slides, has) || !railShown({ contains: has })) return openTag + inner + '</section>';
    // An agenda is a legend wherever it sits, and still a content slide: inside a section (an agenda
    // reused between sections, agenda.docs.md) it also carries the rail.
    if (has('agenda')) inner = withAgendaLegend(inner, total, has);
    if (cur === 0) return openTag + inner + '</section>';
    // A hidden divider opens no section, so it carries no marker (it would repeat its neighbor's count).
    if (carriesMarker(has) && hidden) return openTag + inner + '</section>';
    if (carriesMarker(has) && !inner.includes(`class="${MARKER_CLASS}`)) {
      // FIRST in the frame, so it reads before the eyebrow and the name it introduces
      // (divider.styles.css sets it above them at zero height).
      return openTag + markerHtml(cur, total, has) + inner + '</section>';
    }
    if (carriesRail(has) && !inner.includes('class="tile-progress')) {
      const rail = railHtml(cur, total, has);
      if (has(EDGE_TOKEN)) return openTag + inner + rail + '</section>';
      // Dock the rail INTO the footer Cell (flex cell-tree §6) when the frame
      // has one — grouped just left of the page number — else append at section
      // level (un-migrated / sovereign frames keep the positioned rail). Shared
      // with the split k-of-N rail (lib/core/footer-dock.js) — one docking rule
      // for both marks in the band, HARD RULE #15.
      inner = dockInFooterCell(inner, rail);
    }
    return openTag + inner + '</section>';
  }).join('');
}

/** Live-DOM arm of `withAgendaPagesHtml`, for the runtime (an Export-to-Marp bundle, where marp-core
 *  renders and the engine's HTML pass never ran). Idempotent: an item that has its page keeps it. */
function agendaPagesDom(doc, sections) {
  const agendas = sections.filter((s) => s.classList.contains('agenda-pages'));
  if (!agendas.length) return;
  let prevRun = null;
  const pages = dividerPages(sections.map((s) => {
    const own = s.getAttribute('data-lattice-pagination') ?? s.getAttribute('data-marpit-pagination');
    const run = s.getAttribute('data-split-run');
    const continuation = run !== null && run === prevRun; // as the string arm reads it
    prevRun = run;
    const divider = s.classList.contains('divider');
    return { hidden: isHiddenElement(s), continuation, pagination: own, divider, name: divider ? (s.querySelector('h1,h2,h3,h4,h5,h6')?.textContent ?? '') : '' };
  }));
  if (!pages) return;
  for (const s of agendas) {
    if (s.querySelector(`.${AGENDA_PAGE_CLASS}`)) continue;
    const items = [...(s.querySelector('ol')?.children || [])].filter((li) => li.tagName === 'LI');
    if (items.length !== pages.length) continue;
    // As the string arm: each line must name the section at its position (rail legend and own page ref left out).
    const lineText = (li) => {
      const c = li.cloneNode(true);
      for (const n of c.querySelectorAll(`.${AGENDA_CLASS}`)) n.remove();
      const whole = c.textContent;
      let last = c.lastChild;
      while (last && last.nodeType === 3 && !last.textContent.trim()) last = last.previousSibling;
      if (last && last.nodeType === 1 && last.tagName === 'CODE') last.remove();
      return { whole, bare: c.textContent };
    };
    const lines = items.map(lineText);
    if (!namesMatch(lines, pages)) continue;
    items.forEach((li, k) => {
      // As the string arm: an item that already ends in its own page reference keeps it.
      if (lineOwns(lines[k], pages[k]) === 'own-ref') return;
      const code = doc.createElement('code');
      code.className = AGENDA_PAGE_CLASS;
      code.textContent = `p.${pages[k].page}`;
      li.appendChild(code);
    });
  }
}

/**
 * Live-DOM adapter. Same logic against a `document`: derive sections from
 * `divider` slides and inject the footer-center dot-rail into each `form` slide
 * within a section. No-op without dividers; respects `no-progress` / `silent`.
 * Idempotent.
 */
function applyToDom(doc) {
  if (!doc) return;
  const sections = [...doc.querySelectorAll('section[data-lattice-slide]')];
  // A VIRTUAL FILMSTRIP (the Playground, `.lattice[data-lv]`) mounts a window of the deck, not the
  // deck: counting its sections reads a window of seven to thirteen slides as a short deck and would
  // strip every rail, marker and legend the whole-deck engine render drew. There the engine's output
  // is authoritative, as it is for the section numeral (section-index.js): this pass only takes a
  // mark back when the slide's OWN classes say so, never on counts it cannot see.
  const virtual = !!doc.querySelector?.('.lattice[data-lv]');
  if (virtual) {
    for (const s of sections) {
      if (railShown(s.classList)) continue;
      for (const n of s.querySelectorAll(`.tile-progress, .${MARKER_CLASS}, .${AGENDA_CLASS}`)) n.remove();
    }
    return;
  }
  agendaPagesDom(doc, sections);
  const total = sections.filter((s) => s.classList.contains('divider') && !isHiddenElement(s)).length;
  const slides = sections.filter((s) => !isHiddenElement(s)).length;
  if (total < MIN_SECTIONS_FORCED) return;
  const make = (tag, cls) => { const el = doc.createElement(tag); el.className = cls; return el; };
  const fillDots = (into, idx) => {
    const { shown, on } = dotPlan(idx, total);
    for (let k = 0; k < shown; k++) into.appendChild(make('span', 'dot' + (k === on ? ' on' : '')));
  };
  const agendaLegendDom = (s, wanted, has) => {
    const items = [...(s.querySelector('ol')?.children || [])].filter((li) => li.tagName === 'LI');
    const existing = s.querySelectorAll(`.${AGENDA_CLASS}`);
    if (!wanted || items.length !== total) { for (const n of existing) n.remove(); return; }
    if (existing.length) return; // idempotent
    items.forEach((li, k) => {
      const legend = make('span', AGENDA_CLASS + (autoBar(total, has) ? ' bar-auto' : ''));
      legend.setAttribute('aria-hidden', 'true');
      fillDots(legend, k + 1);
      // The last child that is not whitespace, as the string arm's `\s*$` reads it.
      let last = li.lastChild;
      while (last && last.nodeType === 3 && !last.textContent.trim()) last = last.previousSibling;
      const ref = last && last.nodeType === 1 && last.tagName === 'CODE' ? last : null;
      li.insertBefore(legend, ref);
    });
  };
  let cur = 0;
  for (const s of sections) {
    const has = (t) => s.classList.contains(t);
    const hidden = isHiddenElement(s);
    if (has('divider') && !hidden) cur += 1;
    if (has('agenda')) agendaLegendDom(s, railWanted(total, slides, has) && railShown(s.classList), has);
    if (cur === 0) continue;
    // RECONCILE, not only inject: a deck-wide `no-progress` can land AFTER the first pass (the
    // runtime resolves a re-rendered deck's settings again, and the VS Code preview reads the saved
    // file asynchronously), and a mark injected before it must not outlive the class that removes it.
    const wanted = railWanted(total, slides, has) && railShown(s.classList);

    if (carriesMarker(has)) {
      const existing = s.querySelector(`:scope > .${MARKER_CLASS}`);
      if (!wanted || hidden) { if (existing) existing.remove(); continue; }
      if (existing) continue; // idempotent
      const marker = make('div', MARKER_CLASS + (autoBar(total, has) ? ' bar-auto' : ''));
      marker.setAttribute('aria-hidden', 'true');
      const count = make('span', `${MARKER_CLASS}-count`);
      count.textContent = `${cur} / ${total}`;
      const marks = make('span', `${MARKER_CLASS}-marks`);
      fillDots(marks, cur);
      marker.append(count, marks);
      s.insertBefore(marker, s.firstChild);
      continue;
    }
    if (!carriesRail(has)) continue;
    const footerCell = s.querySelector(':scope > .cell-footer');
    const edge = has(EDGE_TOKEN);
    const scope = (!edge && footerCell) || s;
    // A rail in the OTHER berth (the slide's placement changed after the first pass) is moved, not
    // kept: the reconcile below otherwise leaves a docked rail on a slide that now says `edge`.
    const stray = (edge ? footerCell : s)?.querySelector(':scope > .tile-progress');
    if (stray && stray.parentNode !== scope) stray.remove();
    const existing = scope.querySelector(':scope > .tile-progress');
    if (!wanted) { if (existing) existing.remove(); continue; }
    if (existing) continue; // idempotent
    // `div`, matching railHtml above — see the note there on why this is not a `nav`.
    const rail = make('div', 'tile-progress' + (autoBar(total, has) ? ' bar-auto' : ''));
    rail.setAttribute('aria-hidden', 'true');
    fillDots(rail, cur);
    // Dock the rail INTO the footer Cell (flex cell-tree §6) when the frame has
    // one — grouped just left of the page number — else append at section level
    // (un-migrated / sovereign frames keep the positioned rail).
    const pag = edge ? null : footerCell?.querySelector(':scope > .lat-pagination');
    if (pag) footerCell.insertBefore(rail, pag);
    else scope.appendChild(rail);
  }
}

// `dotPlan` + `MAX_DOTS` are exported for the unit suite: the bucketing is arithmetic on
// a boundary (does the last section always land on the last dot?), which is far cheaper to
// pin directly than to infer from rendered markup.
module.exports = { applyToHtml, applyToDom, dotPlan, railShown, railWanted, MAX_DOTS, MIN_SECTIONS, MIN_SECTIONS_FORCED, MIN_SLIDES, AUTO_BAR_PAST };
