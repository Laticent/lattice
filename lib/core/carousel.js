/**
 * carousel.js — the Fit Ladder's SPLIT move for READ-ACROSS layouts
 * (engineering/decisions/2026-06-22-the-fit-spine.md §3; the "two families" split
 * of the carousel design, 2026-06-23-read-across-carousel.md).
 *
 * A read-across layout (compare-prose's two columns, split-panel's panes, a table's
 * rows, a verdict's justifications, two code blocks) can't be partitioned between
 * members the way a list can — its meaning lives in the cross-reading, so `partitionAxis`
 * returns null and the slide would otherwise clip (the ring). This module is the other
 * answer: re-author the one overflowing slide as a short, deliberate SEQUENCE that the
 * layout OWNS. Every layout shares ONE accent cover→content finish (the split-panel
 * treatment the maintainer set as the fidelity bar — "a split must read as the same deck,
 * just more of it"): a cover, then the content windowed beneath, all in the deck's own
 * vocabulary. The per-layout strategies (`carouselize` dispatcher) differ only in what
 * they parse and how the body flows; `coverWindow` is the shared cover+window builder.
 *
 * Operates POST-render on the already-assembled section (like auto-split's resplitDoc):
 * it parses the rendered DOM, carries the stable chrome (<header>/<footer>), and re-emits
 * the role sections. Returns null when the section doesn't parse as the expected shape,
 * so the caller leaves it for the ring rather than emitting a broken sequence. Pure & fs-free.
 */

const { directChildren, countAxis, evenGroups } = require('./collections');
// The universal COVER → BODY → CLOSING envelope + the section-assembly primitives it
// shares with this module (§0a; HARD RULE #1 — one cover mechanism, not two).
const {
  splitEnvelope, balancedPerPage, readCover, coverSection, roleOpenTag, chromeOf, stripChrome, introOf,
  splitRegions, insightPage, insightPageFrom, trailingSlotMaterialOf, markNote, injectTrailing, injectTrailingInSection, withRole, removeSpans,
} = require('./split-envelope');

// ── extraction from the rendered section inner ────────────────────────────────
// Visible text of an HTML fragment, whitespace-collapsed — used to ask "did this survive
// anywhere?" without caring which element or page now carries it (relocation ≠ loss).
const textOf = (html) => String(html).replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();

const grab = (html, re) => {
  const m = html.match(re);
  return m ? m[1].trim() : null;
};

// A subject's prose body: the nested <ul>'s direct <li> children, joined. Using
// directChildren (not a span-to-last-</li> regex) keeps a multi-bullet body from
// leaking literal `</li><li>` into the article prose. Returns the joined text or null.
function subjectBody(li) {
  const m = li.match(/<(ul|ol)\b/); // <ul> OR <ol> — a nested ordered body must not vanish
  if (!m) return null;
  const tag = m[1];
  const at = li.indexOf(`<${tag}`);
  const open = li.indexOf('>', at) + 1;
  const [span] = directChildren(li.slice(at), tag);
  if (!span) return null;
  const body = li.slice(open, at + span.end - `</${tag}>`.length);
  const bullets = directChildren(body, 'li').map((s) => body.slice(s.start, s.end).replace(/^<li[^>]*>/, '').replace(/<\/li>$/, '').trim());
  return bullets.length ? bullets.join(' ') : null;
}

// The subject body <ul> is the first top-level list AFTER the masthead cell. Each
// direct <li> is one subject (label in <strong>, prose in a nested <ul>). Returns
// [{ label, body }, …] (≥ 2 — compare-prose's two-up, or a 3-option banner-tag) or null.
function readSubjects(inner) {
  const afterMast = inner.replace(/<div class="cell-masthead">[\s\S]*?<\/div>\s*<\/div>/, '');
  const ulAt = afterMast.indexOf('<ul');
  if (ulAt < 0) return null;
  const ulEnd = afterMast.indexOf('>', ulAt) + 1;
  const [span] = directChildren(afterMast.slice(ulAt), 'ul');
  if (!span) return null;
  const body = afterMast.slice(ulEnd, ulAt + span.end - '</ul>'.length);
  const subjects = directChildren(body, 'li')
    .map((s) => {
      const li = body.slice(s.start, s.end);
      return { label: grab(li, /<strong>([\s\S]*?)<\/strong>/), body: subjectBody(li) };
    })
    .filter((s) => s.label && s.body);
  return subjects.length >= 2 ? subjects : null;
}

// ── role-section assembly ─────────────────────────────────────────────────────
// `roleOpenTag` (swap the layout class for the split role's) and `chromeOf` (the
// header/footer Form chrome carried onto every frame) live in split-envelope.js —
// the plain-partition path needs the identical primitives, so they have one home.

// ── feature-cover strategy (split-panel) ──────────────────────────────────────
// split-panel is ASYMMETRIC — a featured left panel (watermark / eyebrow / heading +
// lede) beside a right-side list of supporting POINTS. In a tall box the feature panel
// is too heavy to sit beside its points, so the `feature-cover` recipe gives the
// feature its own cover, then flows the points onto clean pages under a running header
// (the SP3 treatment the maintainer picked). The points paginate `perPage` at a time.

// The supporting points: the first list in the right panel, each <li> a title (strong)
// + a nested body. Reuses subjectBody so a multi-bullet point can't leak markup.
function readPoints(html) {
  const m = html.match(/<(ul|ol)\b/);
  if (!m) return null;
  const tag = m[1];
  const at = html.indexOf(`<${tag}`);
  const open = html.indexOf('>', at) + 1;
  const [span] = directChildren(html.slice(at), tag);
  if (!span) return null;
  const body = html.slice(open, at + span.end - `</${tag}>`.length);
  const points = directChildren(body, 'li')
    .map((s) => {
      const li = body.slice(s.start, s.end);
      return { title: grab(li, /<strong>([\s\S]*?)<\/strong>/), body: subjectBody(li) };
    })
    .filter((p) => p.title && p.body);
  return points.length ? points : null;
}

// The lede is a framing <p> that is NOT the eyebrow's <code> wrapper. Variants put it
// in different panels: default/metric/steps in panel-left (after the heading), watermark
// in panel-right (after the subhead). Prefer left, fall back to right; skip any <p> that
// wraps a <code> (the watermark variant's eyebrow). Returns inner HTML (keeps inline em).
function readLede(left, right) {
  for (const block of [left, right]) {
    for (const m of block.matchAll(/<p[^>]*>([\s\S]*?)<\/p>/g)) {
      if (!/<code\b/.test(m[0]) && m[1].trim()) return m[1].trim();
    }
  }
  return null;
}

// Parse split-panel's rendered DOM into { watermark, eyebrow, heading, subtitle, lede, points }.
// The eyebrow renders as <span class="panel-eyebrow"> (default/metric/steps) or <code>
// (watermark); both live in panel-left. The `subtitle` is panel-right's own <h3> subhead —
// authored text this reader did not read at all, so `feature-cover` DROPPED it outright
// (found by the rule-6 conservation gate). It is masthead material, so it rides the cover.
function readFeature(inner) {
  const rightAt = inner.indexOf('<div class="panel-right"');
  if (rightAt < 0) return null;
  const left = inner.slice(0, rightAt);
  const right = inner.slice(rightAt);
  const heading = grab(left, /<h2[^>]*>([\s\S]*?)<\/h2>/);
  const points = readPoints(right);
  if (!heading || !points) return null;
  return {
    heading,
    watermark: grab(left, /<div class="watermark">([\s\S]*?)<\/div>/),
    eyebrow: grab(left, /<span class="panel-eyebrow">([\s\S]*?)<\/span>/) || grab(left, /<code>([\s\S]*?)<\/code>/),
    subtitle: grab(right, /<h3[^>]*>([\s\S]*?)<\/h3>/),
    lede: readLede(left, right),
    points,
  };
}

// Shared cover → windowed-items builder for the cover strategies. Emits a COVER (an
// accent field: optional watermark/eyebrow + heading + optional lede), then the items
// flow `perPage` at a time under a running header. `cls(role)` maps a role to the
// section class string, so each layout keeps its own scoping while sharing the finish
// — the continuity the maintainer approved on split-panel, reused verbatim.
function coverWindow(openTag, cover, items, chrome, perPage, cls) {
  const { header, footer, rail } = chrome;
  const wrap = (klass, first, body, role = first ? 'cover' : 'body') => `${roleOpenTag(openTag, klass, first, role)}${header}${body}${footer}${rail}</section>`;
  const out = [];
  const wm = cover.watermark ? `<div class="split-feat-bleed" aria-hidden="true"><div class="split-feat-wm">${cover.watermark}</div></div>` : '';
  const eye = cover.eyebrow ? `<div class="split-feat-eye">${cover.eyebrow}</div>` : '';
  // The subtitle slot mirrors `coverSection`'s (split-envelope.js) — the two cover builders
  // carry the same masthead material in the same order (HARD RULE #1).
  const sub = cover.subtitle ? `<div class="split-feat-sub">${cover.subtitle}</div>` : '';
  const lede = cover.lede ? `<div class="split-feat-lede">${cover.lede}</div>` : '';
  // The cover's semantic lead-in INTO the next slide — the layout declares it in its
  // manifest `split.intro` (e.g. "Two readings", "The reasoning"), `{n}` → item count.
  const lead = cover.intro ? `<div class="split-cover-lead">${cover.intro} &rarr;</div>` : '';
  out.push(wrap(cls('cover'), true, `${wm}${eye}<div class="split-feat-h">${cover.heading}</div>${sub}${lede}${lead}`));
  const per = Number.isInteger(perPage) && perPage > 0 ? perPage : 3;
  const runhead = `<div class="split-runhead">${cover.heading}</div>`;
  // `per` is a CEILING; chunking `i += per` treated it as a chunk size and left a runt last
  // page (4 items at 3 → 3+1) for `feature-cover` (split-panel) and `cover-rows`
  // (list-tabular), the two callers that pass a `perPage` above 1. `evenGroups` spreads the
  // items over the same page count so no page exceeds the ceiling and none is a runt — the
  // same distribution `partitionAxis` now applies on the plain path (HARD RULE #15, one
  // pacing rule). Closes #1194.
  let i = 0;
  for (const size of evenGroups(items.length, per)) {
    const rows = items
      .slice(i, i + size)
      .map((p) => `<li><span class="split-pt-t">${p.title ?? p.label}</span><span class="split-pt-b">${p.body}</span></li>`)
      .join('');
    out.push(wrap(cls('points'), false, `${runhead}<ul class="split-pts">${rows}</ul>`));
    i += size;
  }
  return out;
}

function featureCoverSections(openTag, feat, chrome, recipe) {
  return coverWindow(openTag, { ...feat, intro: introOf(recipe, feat.points.length) }, feat.points, chrome, recipe.perPage, (role) => `content split-panel-split split-panel-${role} form`);
}

// ── cover-rows strategy (list-tabular) ────────────────────────────────────────
// list-tabular is an <ol> of row-<li>s — read-across lives WITHIN a row (label · what
// it measures · how it scores), intact when split BETWEEN rows. The maintainer picked
// the same cover→content finish as split-panel: the title gets an accent cover, then the
// rows flow on clean pages. Each row's label is the leading text before its nested list;
// the body is the nested items joined (reusing subjectBody, so inline <em> survives).
function readRows(inner) {
  const afterMast = inner.replace(/<div class="cell-masthead">[\s\S]*?<\/div>\s*<\/div>/, '');
  const m = afterMast.match(/<(ul|ol)\b/);
  if (!m) return null;
  const tag = m[1];
  const at = afterMast.indexOf(`<${tag}`);
  const open = afterMast.indexOf('>', at) + 1;
  const [span] = directChildren(afterMast.slice(at), tag);
  if (!span) return null;
  const body = afterMast.slice(open, at + span.end - `</${tag}>`.length);
  const rows = directChildren(body, 'li')
    .map((s) => {
      const li = body.slice(s.start, s.end);
      const liInner = li.slice(li.indexOf('>') + 1, li.lastIndexOf('</li>'));
      const sub = liInner.search(/<(ul|ol)\b/);
      const title = (sub >= 0 ? liInner.slice(0, sub) : liInner).replace(/<[^>]+>/g, '').trim();
      return { title, body: sub >= 0 ? subjectBody(li) : null };
    })
    .filter((r) => r.title && r.body);
  return rows.length ? rows : null;
}

// ── cover-code strategy (compare-code) ────────────────────────────────────────
// compare-code is two labelled code blocks read across. Code can't reflow into a
// name+body row, so the split is a cover (the comparison title) then ONE code block per
// page at full width under its label — the same accent cover, a code-native body.
function readCode(inner) {
  const colsAt = inner.indexOf('<div class="code-cols">');
  if (colsAt < 0) return null;
  const head = inner.slice(0, colsAt);
  const heading = grab(head, /<h2[^>]*>([\s\S]*?)<\/h2>/);
  const colsOpen = inner.indexOf('>', colsAt) + 1;
  const [colsSpan] = directChildren(inner.slice(colsAt), 'div');
  if (!colsSpan) return null;
  const colsBody = inner.slice(colsOpen, colsAt + colsSpan.end - '</div>'.length);
  const cols = directChildren(colsBody, 'div')
    .map((s) => {
      const col = colsBody.slice(s.start, s.end);
      const preAt = col.indexOf('<pre');
      // Grab the label <code> from the column HEAD (before the <pre>) so a label-less
      // column can never grab the first line of the code body as its runhead.
      return { label: grab(preAt >= 0 ? col.slice(0, preAt) : col, /<code>([\s\S]*?)<\/code>/), pre: (col.match(/<pre[\s\S]*?<\/pre>/) || [''])[0] };
    })
    .filter((c) => c.pre);
  if (!heading || cols.length < 2) return null;
  return { heading, eyebrow: grab(head, /<code>([\s\S]*?)<\/code>/), cols };
}

function coverCodeSections(openTag, code, chrome, intro) {
  const { header, footer, rail } = chrome;
  const wrap = (klass, first, body, role = first ? 'cover' : 'body') => `${roleOpenTag(openTag, klass, first, role)}${header}${body}${footer}${rail}</section>`;
  const out = [];
  const eye = code.eyebrow ? `<div class="split-feat-eye">${code.eyebrow}</div>` : '';
  const lead = intro ? `<div class="split-cover-lead">${intro} &rarr;</div>` : '';
  out.push(wrap('content compare-code-split compare-code-cover form', true, `${eye}<div class="split-feat-h">${code.heading}</div>${lead}`));
  code.cols.forEach((c) => {
    out.push(wrap('content compare-code-split compare-code-block form', false, `<div class="split-runhead">${c.label || ''}</div>${c.pre}`));
  });
  return out;
}

// ── cover-paginate strategy (the dense list / legal batch) ────────────────────
// Unlike the read-across strategies (which re-author the body into split-pts rows or
// one-block-per-page), these layouts CAN paginate between their native members — a list
// of cards, a table of rows — they just shouldn't drop the reader in cold. cover-paginate
// gives them the same accent COVER lead-in as the read-across family, then flows the
// layout's OWN native cards on body pages, never flattened: `partitionAxis` does the body
// split (the heading and a table's <thead> repeat per page, an <ol> is renumbered), and
// each body page carries the `lat-split-native` marker so a body page that STILL overflows
// paginates again rather than growing a second cover (the re-split guard in auto-split.js).
// The shared accent cover is `coverSection` (split-envelope.js) — the SAME field the
// plain-partition path opens with (§0a), fed by the same `readCover` masthead reader
// (eyebrow · title · subtitle · lede).

// ── cover-cards strategy (compare-table portrait — the RESHAPE move) ───────────
// A wide read-across <table> can't paginate its way out of HORIZONTAL overflow: rows divide
// vertically, but the overflow is across the COLUMNS. In a portrait box it RESHAPES — each
// data ROW becomes a card, the column headers become the card's field labels
// ("Build: … / Buy: … / Delay: …"). Cards stack and paginate, so the same accent cover →
// content finish fits a phone with no datum dropped (axiom 4) and no shrink (the portrait
// type floor). The cover keeps the engine id; body pages drop it (never duplicate an id).
// See engineering/decisions/2026-06-25-retire-landscape-locks-portrait-everything.md.
function parseTable(inner) {
  const tableAt = inner.search(/<table\b/);
  if (tableAt < 0) return null;
  const head = inner.slice(0, tableAt);
  const heading = grab(head, /<h2[^>]*>([\s\S]*?)<\/h2>/);
  const theadHtml = (inner.match(/<thead[\s\S]*?<\/thead>/) || [''])[0];
  // Header cells — the column subjects. The first <th> is the row-label column (often
  // empty); kept so headers and cells align by index.
  const headers = [...theadHtml.matchAll(/<th\b[^>]*>([\s\S]*?)<\/th>/g)].map((m) => m[1].trim());
  const bodyHtml = (inner.match(/<tbody[\s\S]*?<\/tbody>/) || [''])[0] || inner.slice(tableAt);
  const rows = [...bodyHtml.matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/g)]
    .map((m) => [...m[1].matchAll(/<td\b[^>]*>([\s\S]*?)<\/td>/g)].map((c) => c[1].trim()));
  if (!heading || headers.length < 2 || rows.length < 1) return null;
  return { head, heading, headers, rows };
}

function coverCardsSections(openTag, inner, chrome, recipe, layoutName) {
  const table = parseTable(inner);
  if (!table) return null;
  const { heading, headers, rows } = table;
  // Each ROW → a card: title = the row-label cell (first <td>); fields = the remaining
  // cells paired with their column header. A card with no subject cells is dropped.
  const cards = rows
    .map((cells) => ({
      title: (cells[0] || '').replace(/<[^>]+>/g, '').trim(),
      fields: cells.slice(1).map((v, i) => ({ label: headers[i + 1] || '', value: v })).filter((f) => f.value !== ''),
    }))
    .filter((c) => c.title && c.fields.length);
  if (cards.length < 2) return null;
  const { header, footer, rail } = chrome;
  // The cover carries the slide's whole masthead — including the framing lede, which
  // the transposed card bodies replace and would otherwise DROP entirely (§0a).
  const mast = readCover(inner, 'row');
  if (!mast) return null;
  // The trailing key-insight blockquote / below-note, hoisted the same way the plain
  // envelope does (§0a) — found by a second pass over the carousel strategies: this
  // reshape built its cards from the table ALONE, so a trailing insight or note simply
  // never made it into any page and vanished (confirmed on a real render). `splitRegions`
  // is the SAME extraction `splitEnvelope` uses (HARD RULE #15), so it finds the
  // identical spans regardless of which strategy is re-authoring the body.
  const regions = splitRegions(inner, 'row');
  const cover = coverSection(openTag, chrome, { ...mast, intro: introOf(recipe, cards.length) }, layoutName);
  const idless = openTag.replace(/\s+id="[^"]*"/, '');
  const bodyTag = withRole(idless.replace(/(\sclass=")([^"]*)(")/, (_, a, c, b) => `${a}${c} lat-split-cards${b}`), 'body');
  // A transposed card is far taller than its source row, and grows with the column (field)
  // count — so size the page by DENSITY, not a fixed count: fewer taller cards per page. A
  // deterministic cut that keeps a 4-field card page inside a portrait box without needing a
  // measure pass (a pathologically long value still rings — move 4). The manifest `perPage`
  // caps the sparsest case so a 2-field card page never grows past it.
  const fieldCount = Math.max(1, headers.length - 1);
  const cap = Number.isInteger(recipe.perPage) && recipe.perPage > 0 ? recipe.perPage : 4;
  const density = Math.max(1, Math.min(cap, fieldCount <= 2 ? 4 : fieldCount === 3 ? 3 : 2));
  // …then BALANCED against that density ceiling, the same pacing rule the plain path and
  // `cover-paginate` use (§0b: a uniform count, never a greedy chunk). The density figure
  // above is a CEILING, so feeding it straight to `i += per` left the last page a runt —
  // 4 three-field rows came out 3+1, the exact "jarring uneven slides" this branch fixes
  // everywhere else (caught by LOOKING at the re-rendered demo deck, not by a test).
  // `balancedPerPage` never returns more than the ceiling, so the density intent that
  // keeps a tall card page inside a portrait box is preserved: 4 at 3 → 2+2, both ≤ 3.
  const runhead = `<div class="split-runhead">${heading}</div>`;
  const pageInners = [];
  // `evenGroups` against the density CEILING — it both normalizes the page count and spreads
  // the cards, so `balancedPerPage` + a greedy `i += per` (which still left 3+1 whenever the
  // ceiling didn't divide the count) is no longer needed here.
  let i = 0;
  for (const size of evenGroups(cards.length, density)) {
    const group = cards
      .slice(i, i + size)
      .map((card) => {
        const dl = card.fields.map((f) => `<div class="ct-field"><dt>${f.label}</dt><dd>${f.value}</dd></div>`).join('');
        return `<article class="ct-card"><h3 class="ct-card-title">${card.title}</h3><dl class="ct-card-fields">${dl}</dl></article>`;
      })
      .join('');
    pageInners.push(`${header}${runhead}<div class="ct-cards">${group}</div>${footer}${rail}`);
    i += size;
  }
  // NOTE rides the LAST card page, one size down — the same placement/sizing rule as the
  // plain envelope (base.modifiers.css § Shared split NOTE), not a page of its own.
  if (regions?.note.length) {
    const last = pageInners.length - 1;
    pageInners[last] = injectTrailing(pageInners[last], markNote(regions.note));
  }
  const pages = pageInners.map((pageInner) => `${bodyTag}${pageInner}</section>`);
  const result = [cover, ...pages];
  // INSIGHT always earns its own final page, never shared with the note or the cards.
  if (regions?.insight.length) result.push(insightPage(openTag, inner, regions));
  return result;
}

function coverPaginateSections(openTag, inner, chrome, recipe, ratio, layoutName) {
  const axis = recipe.axis === 'row' ? 'row' : 'item';
  const count = countAxis(inner, axis);
  if (count < 2) return null;
  // Per-page cut: the manifest `perPage` is the author's portrait-COMFORTABLE count (the
  // common overflow case is a tall/portrait box). A reflowing multi-column layout can pack
  // the original tighter than the single-column split, so the measured overflow ratio can
  // UNDER-count the pages needed — use it only to cut FURTHER (denser), never looser, so the
  // body lands in one balanced pass with the native heading intact.
  const manifestPer = Number.isInteger(recipe.perPage) && recipe.perPage > 0 ? recipe.perPage : 4;
  const ratioBased = ratio > 1 ? Math.max(1, Math.floor((count / ratio) * 0.82)) : manifestPer;
  // Balanced against that ceiling, so the last body page is never a runt — the same
  // pacing rule the plain path uses (§0b: a fixed UNIFORM count, not a greedy chunk).
  const per = balancedPerPage(count, Math.min(manifestPer, ratioBased));
  // The SHAPE (cover → native body pages → optional closing) is the universal envelope
  // — this strategy only resolves the axis + the per-page pacing (§0a, §8 rule 9).
  return splitEnvelope(openTag, inner, chrome, { axis, per, recipe, layoutName });
}

// ── redline-blocks strategy (redline portrait — the SPLIT after COLLAPSE) ──────
// A redline collapses its .split/.three-col columns to a stacked column in portrait (CSS).
// When that stack is STILL too tall for one slide, give each block its own slide: OLD on one,
// NEW (with the note/why list riding) on the next, the heading + citation repeated for
// context. The OLD/NEW identity rides explicit rl-old/rl-new classes — one block per slide,
// so :nth-of-type can't carry it. Needs ≥2 blockquotes (the default / .annotated single
// passage has nothing to split BETWEEN, so it returns null → left for the ring; we never
// split a passage mid-sentence). If the NEW+note slide is itself too tall it rings (a single
// passage taller than the phone is a genuine floor case). See
// engineering/decisions/2026-06-25-retire-landscape-locks-portrait-everything.md.
function redlineBlockSplit(openTag, inner) {
  const bqs = directChildren(inner, 'blockquote');
  if (!bqs || bqs.length < 2) return null;
  if (!grab(inner.slice(0, bqs[0].start), /<h2[^>]*>([\s\S]*?)<\/h2>/)) return null;
  const noteM = inner.match(/<(ul|ol)\b[\s\S]*?<\/\1>/);   // the note / why list — rides NEW
  const note = noteM ? { start: noteM.index, end: noteM.index + noteM[0].length } : null;
  // Trailing material (a closing line after the why-list) rides the LAST page only — cut it
  // from the first, or `partitionAxis`'s FM-2 duplication reappears by hand.
  const trailing = trailingSlotMaterialOf(inner).note;
  // Each page is the SOURCE INNER WITH SPANS REMOVED — the plain envelope's own discipline
  // (split-envelope.js: "nothing is re-authored away, so no leaf can go missing"). Re-authoring
  // it as `${header}${head}${blockquote}${footer}` instead, as this did, rebuilt the section
  // from parsed pieces and so:
  //   · left `.cell-stage` OPEN — `head` slices up to the first blockquote, which is INSIDE the
  //     stage cell, so the browser auto-closed at `</section>` and the footer, the section rail
  //     and the k-of-N rail all ended up nested inside `.cell-stage`, mispositioned (caught on a
  //     real render by probing the rail's parentElement);
  //   · emitted TWO `<header>` elements once the section had a deck header;
  //   · dropped the footer CELL (page number, section rail) and any trailing line after the
  //     why-list (the rule-6 conservation gate's finding).
  // Removing spans keeps every wrapper, cell and chrome node exactly where the engine put it.
  const drop = (spans) => removeSpans(inner, spans.filter(Boolean));
  const mark = (html, klass) => html.replace(/<blockquote\b/, `<blockquote class="${klass}"`);
  // Slides keep `redline` but drop the wide variant (no columns left to lay out) and gain
  // `lat-split-native` so the splitter treats them as finished bodies (never re-carouseled).
  const baseCls = (openTag.match(/\sclass="([^"]*)"/) || ['', ''])[1]
    .replace(/\b(split|three-col|stacked)\b/g, '').replace(/\s+/g, ' ').trim();
  const slideTag = withRole(openTag.replace(/(\sclass=")[^"]*(")/, `$1${baseCls} lat-split-native$2`), 'body');
  const contTag = slideTag.replace(/\s+id="[^"]*"/, '');
  const cont = (html) => html.replace(/<\/(h[12])>/, ' <span class="lat-cont">(cont.)</span></$1>');
  return [
    `${slideTag}${mark(drop([bqs[1], note, ...trailing]), 'rl-old')}</section>`,
    `${contTag}${cont(mark(drop([bqs[0]]), 'rl-new'))}</section>`,
  ];
}

// ── kanban-lanes strategy (kanban portrait — one lane per slide) ───────────────
// A kanban board is N lanes side-by-side — unreadable on a phone. In portrait each LANE
// gets its OWN slide: the chart-header (eyebrow + heading) repeats, the board is re-emitted
// holding a single .kanban-column, so that lane has the whole slide for its cards (the point:
// a lane with many cards gets room instead of being crushed beside its neighbours). Robust by
// construction — it repeats the exact wrapper prefix (chart-header → chart-body → board-open)
// and the exact closes, so whatever chrome the chart family emits is preserved; only the
// column set changes. Needs ≥2 lanes. A single lane with more cards than one slide holds rings
// (a future pass can paginate a lane's cards). See
// engineering/decisions/2026-06-25-retire-landscape-locks-portrait-everything.md.
function kanbanLaneSplit(openTag, inner) {
  const boardOpen = inner.indexOf('<div class="kanban-board"');
  if (boardOpen < 0) return null;
  const afterOpen = inner.indexOf('>', boardOpen) + 1;
  // `stripChrome`: the prefix starts at index 0 and so carries the section's own <header>
  // on a real render; `${header}${pfx}` below would emit it twice (same defect as redline).
  const chrome = chromeOf(inner);
  const prefix = stripChrome(inner.slice(0, afterOpen), chrome); // chart-header → chart-body → board-open
  if (!grab(prefix, /<h2[^>]*>([\s\S]*?)<\/h2>/)) return null;
  const boardInner = inner.slice(afterOpen);
  // The `.kanban-column` children ONLY. `directChildren(boardInner, 'div')` took EVERY div
  // child, and Form nests the footer CELL inside the board — so `.cell-footer` counted as a
  // lane and the split emitted a spurious final page holding nothing but a doubled footer
  // (seen on a real portrait render: 4 lanes → 5 pages, the 5th empty). Filtered by class,
  // which is what the comment always claimed this line did.
  const cols = directChildren(boardInner, 'div')
    .filter((s) => /^<div\s[^>]*class="[^"]*\bkanban-column\b/.test(boardInner.slice(s.start, s.end)));
  if (!cols || cols.length < 2) return null;
  // Everything after the last lane: the footer CELL (Form docks it INSIDE the board) plus the
  // board / chart-body / stage closes. Kept whole rather than chrome-stripped, so each lane page
  // gets a real `.cell-footer` — footer text, section rail and the page-number span, which
  // `repaginate` then re-stamps per page. That is also why this strategy must NOT append
  // `chrome.footer`/`chrome.rail` the way the re-authoring cover strategies do: they would be
  // the SECOND copy. (Taking only the leading run of close tags, as an intermediate fix did,
  // matched ZERO characters here — the `.cell-footer` div comes first — leaving the board and
  // stage wrappers unclosed, so the browser auto-closed at `</section>` and the k-of-N rail
  // ended up nested inside `.cell-stage` where its positioning was wrong. Caught on a real
  // render by probing the rail's parent element.)
  const suffix = boardInner.slice(cols[cols.length - 1].end);
  const { header } = chrome;
  const baseCls = (openTag.match(/\sclass="([^"]*)"/) || ['', ''])[1];
  const idless = openTag.replace(/\s+id="[^"]*"/, '');
  const laneTag = (first) => withRole((first ? openTag : idless).replace(/(\sclass=")[^"]*(")/, `$1${baseCls} lat-split-native$2`), 'body');
  return cols.map((c, k) => {
    const col = boardInner.slice(c.start, c.end);
    const pfx = k === 0 ? prefix : prefix.replace(/<\/(h[12])>/, ' <span class="lat-cont">(cont.)</span></$1>');
    return `${laneTag(k === 0)}${header}${pfx}${col}${suffix}</section>`;
  });
}

// ── public entry ──────────────────────────────────────────────────────────────
// Re-author one rendered read-across section as a carousel per its `recipe.strategy`.
// Every strategy shares ONE accent cover→content finish (the split-panel treatment the
// maintainer set as the fidelity bar) so a split reads as the same deck, just more of it:
//   · 'feature-cover'  — split-panel: feature cover → supporting points paginated.
//   · 'cover-rows'     — list-tabular: title cover → row-list paginated.
//   · 'cover-sides'    — compare-prose: cover (question) → one subject per page → verdict.
//   · 'cover-decision' — decision: verdict cover → justifications paginated.
//   · 'cover-code'     — compare-code: title cover → one code block per page, full width.
//   · 'cover-paginate' — dense lists/tables (legal batch): accent cover → the layout's OWN
//                        native cards paginated (partitionAxis), never flattened.
// (cover-rows / -sides / -decision share the `coverWindow` builder.)
// Returns an ARRAY of section strings (the caller joins + renumbers data-lattice-slide),
// or null when the section doesn't parse as the expected shape (→ left for the ring).
// ── Per-strategy splitters ──────────────────────────────────────────────────
// One small builder per recipe strategy: parse the section's shape, build the
// page sections, apply that strategy's own minimum-parts threshold. Each
// returns the parts array or null (→ left for the ring). carouselize()
// dispatches through CAROUSEL_STRATEGIES; ctx carries
// { openTag, chrome, recipe, ratio, layoutName }.

function splitFeatureCover(inner, ctx) {
  const feat = readFeature(inner);
  if (!feat) return null;
  const parts = featureCoverSections(ctx.openTag, feat, ctx.chrome, ctx.recipe);
  return parts.length >= 2 ? parts : null;
}

function splitCoverRows(inner, ctx) {
  const heading = grab(inner, /<h2[^>]*>([\s\S]*?)<\/h2>/);
  const rows = readRows(inner);
  if (!heading || !rows) return null;
  const cover = { heading, lede: grab(inner, /class="below-note">\s*<p[^>]*>([\s\S]*?)<\/p>/), intro: introOf(ctx.recipe, rows.length) };
  const parts = coverWindow(ctx.openTag, cover, rows, ctx.chrome, ctx.recipe.perPage, (role) => `content list-tabular-split list-tabular-${role} form`);
  return parts.length >= 2 ? parts : null;
}

// compare-prose, the FIDELITY treatment: the same accent cover→content finish as
// split-panel (not the editorial drop-cap/pull-quote), so a split comparison reads as
// the same deck. Cover (the question) → one subject per page → an optional verdict.
function splitCoverSides(inner, ctx) {
  const subjects = readSubjects(inner);
  if (!subjects) return null;
  const heading = grab(inner, /<h2[^>]*>([\s\S]*?)<\/h2>/) || '';
  const synthesis = grab(inner, /class="below-note">\s*<p[^>]*>([\s\S]*?)<\/p>/);
  const cls = (role) => `content compare-split compare-split-${role} form`;
  const parts = coverWindow(ctx.openTag, { heading, intro: introOf(ctx.recipe, subjects.length) }, subjects, ctx.chrome, 1, cls);
  if (synthesis) {
    const { header, footer, rail } = ctx.chrome;
    parts.push(`${roleOpenTag(ctx.openTag, cls('verdict'), false, 'insight')}${header}<div class="split-runhead">The verdict</div><div class="split-pullq">${synthesis}</div>${footer}${rail}</section>`);
  }
  return parts.length >= 3 ? parts : null;
}

// decision: the verdict heading is the cover; the justifications (a top-level list
// after the masthead — Build / Why not buy / Why not delay) window beneath it. Same
// cover finish — the decision lands, then its reasons.
function splitCoverDecision(inner, ctx) {
  const heading = grab(inner, /<h2[^>]*>([\s\S]*?)<\/h2>/);
  const points = readSubjects(inner);
  if (!heading || !points) return null;
  const cover = { heading, eyebrow: grab(inner, /<div class="masthead-lede">[\s\S]*?<code>([\s\S]*?)<\/code>/), intro: introOf(ctx.recipe, points.length) };
  const parts = coverWindow(ctx.openTag, cover, points, ctx.chrome, ctx.recipe.perPage, (role) => `content decision-split decision-${role} form`);
  return parts.length >= 2 ? parts : null;
}

function splitCoverCode(inner, ctx) {
  const code = readCode(inner);
  if (!code) return null;
  const parts = coverCodeSections(ctx.openTag, code, ctx.chrome, introOf(ctx.recipe, code.cols.length));
  return parts.length >= 2 ? parts : null;
}

function splitRedlineBlocks(inner, ctx) {
  const parts = redlineBlockSplit(ctx.openTag, inner);
  return parts && parts.length >= 2 ? parts : null;
}

function splitKanbanLanes(inner, ctx) {
  const parts = kanbanLaneSplit(ctx.openTag, inner);
  return parts && parts.length >= 2 ? parts : null;
}

function splitCoverCards(inner, ctx) {
  const parts = coverCardsSections(ctx.openTag, inner, ctx.chrome, ctx.recipe, ctx.layoutName);
  return parts && parts.length >= 2 ? parts : null;
}

function splitCoverPaginate(inner, ctx) {
  const parts = coverPaginateSections(ctx.openTag, inner, ctx.chrome, ctx.recipe, ctx.ratio, ctx.layoutName);
  return parts && parts.length >= 2 ? parts : null;
}

const CAROUSEL_STRATEGIES = {
  'feature-cover': splitFeatureCover,
  'cover-rows': splitCoverRows,
  'cover-sides': splitCoverSides,
  'cover-decision': splitCoverDecision,
  'cover-code': splitCoverCode,
  'redline-blocks': splitRedlineBlocks,
  'kanban-lanes': splitKanbanLanes,
  'cover-cards': splitCoverCards,
  'cover-paginate': splitCoverPaginate,
};

function carouselize(openTag, inner, recipe, ratio, layoutName) {
  if (!recipe) return null;
  // Object.hasOwn guard: a plain [key] lookup inherits Object.prototype, so a
  // strategy like "toString" would return a truthy non-splitter (or crash on
  // "hasOwnProperty") instead of the unknown-strategy null the old if-chain
  // gave. checkSplit now rejects bad strategies at manifest LOAD, so this is
  // defense-in-depth for recipes that arrive outside loadAll (direct calls,
  // future runtime paths). (Found by the PR's independent checker.)
  const split = Object.hasOwn(CAROUSEL_STRATEGIES, recipe.strategy) ? CAROUSEL_STRATEGIES[recipe.strategy] : null;
  if (!split) return null;
  const chrome = chromeOf(inner);
  const parts = split(inner, { openTag, chrome, recipe, ratio, layoutName });
  if (!parts || parts.length < 2) return parts;
  // §8 rule 6 — CONSERVATION, applied once for every strategy rather than nine times.
  //
  // A trailing key-insight `<blockquote>` was dropped OUTRIGHT by every strategy except
  // `cover-cards`: measured with a sentinel across cover-sides, feature-cover, cover-rows,
  // cover-decision and cover-code — all five lost it, no page, no warning. `coverWindow`
  // never reads the trailing region at all, and each strategy re-authors its body from
  // parsed parts, so anything after the parsed structure simply never reaches an emitted page.
  //
  // Hoisted HERE, in the one dispatcher, so a strategy cannot forget — and guarded by a
  // containment check rather than a per-strategy list: a strategy that already CONSUMED the
  // material (compare-prose turns a trailing `.below-note` into its verdict page;
  // `cover-rows` promotes one to the cover lede) is left alone, because relocation is not
  // loss. `cover-cards` resolves its own regions and appends its own insight page, so its
  // text is already present and this is a no-op there too.
  const { insight, note } = trailingSlotMaterialOf(inner);
  // Is this material already on an emitted page, wherever it ended up? A strategy that
  // CONSUMED it (compare-prose turns a trailing `.below-note` into its verdict page;
  // `cover-rows` promotes one to the cover lede) is left alone — relocation is not loss.
  const carried = (spans) => {
    const emitted = parts.join('');
    return spans.every((s) => emitted.includes(textOf(s.outer)));
  };
  // The NOTE rides the LAST BODY page, one size down — the same placement rule the plain
  // envelope applies (it is a footnote of the content above it, not a beat of its own).
  // `cover-decision`, `cover-code` and `redline-blocks` dropped it outright: each re-authors
  // its body from parsed parts, so anything after that structure never reached a page.
  if (note.length && !carried(note)) {
    const lastBody = parts.reduce((acc, p, k) => (/\sdata-split-role="body"/.test(p) ? k : acc), -1);
    if (lastBody >= 0) parts[lastBody] = injectTrailingInSection(parts[lastBody], markNote(note));
  }
  if (insight.length) {
    const alreadyCarried = carried(insight);
    if (!alreadyCarried) {
      const page = insightPageFrom(openTag, inner);
      if (page) {
        // Rule 9 allows ONE closing slide. `cover-sides` already builds its own — the
        // verdict, synthesized from a trailing `.below-note` — so a slide carrying BOTH a
        // note and a key insight emitted two `insight` roles and broke the invariant task #1
        // just built. The key insight takes the slot: the doc is explicit that a `.below-note`
        // "is not a takeaway that earns its own beat, it is a footnote of the content
        // immediately above it", whereas the blockquote IS "the run's takeaway". So the
        // note-derived closing re-stamps to `body` and the insight lands last. Only the ROLE
        // attribute changes — the verdict keeps its `compare-split-verdict` class, so its
        // finish is byte-identical. (Merging the two onto one page was the other option and
        // renders WRONG: the insight CSS is scoped `…lat-split-insight > .cell-stage >
        // blockquote`, and a re-authored verdict page has no `.cell-stage` to match.)
        const at = parts.findIndex((p) => /\sdata-split-role="insight"/.test(p));
        if (at >= 0) parts[at] = withRole(parts[at], 'body');
        parts.push(page);
      }
    }
  }
  return parts;
}

module.exports = { carouselize, readSubjects, readFeature, readRows, readCode, CAROUSEL_STRATEGIES };
