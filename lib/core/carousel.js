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
 * Operates POST-render on the already-assembled section (like auto-split's `splitDoc`):
 * it parses the rendered DOM, carries the stable chrome (<header>/<footer>), and re-emits
 * the role sections. Returns null when the section doesn't parse as the expected shape,
 * so the caller leaves it for the ring rather than emitting a broken sequence. Pure & fs-free.
 */

const { directChildren, countAxis, evenGroups } = require('./collections');
const { findMatchingClose } = require('./find-matching-close');
// The universal COVER → BODY → CLOSING envelope + the section-assembly primitives it
// shares with this module (§0a; HARD RULE #1 — one cover mechanism, not two).
const {
  splitEnvelope, closingPage, closingPageFromMaterial, balancedPerPage, readCover, coverSection, roleOpenTag, chromeOf, footerCell, stripChrome, introOf, deriveAxis,
  splitRegions, trailingMaterialOf, trailingSlotMaterialOf, withRole, removeSpans, readMasthead, classOf,
} = require('./split-envelope');

// ── extraction from the rendered section inner ────────────────────────────────

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
  if (!bullets.length) return null;
  // EACH SUB-BULLET KEEPS ITS OWN LINE. Joining them with a bare space fused fields the author
  // wrote as separate ones: `list-tabular` authors a row as `- Term` / `  - what it measures` /
  // `  - how it scores`, and the join rendered "Penalizes signals that swing Also penalizes the
  // early-warning ones" — one run-on clause a reader has to re-parse, on a slide whose own title
  // promises "what they measure, and how they score". Measured on a real split; found by the
  // QUALITY BAR sweep, not by any gate (conservation is satisfied — every word is present, and
  // the words are the only thing it counts).
  //
  // A single bullet stays bare, so the common case emits exactly the markup it did before.
  return bullets.length === 1
    ? bullets[0]
    : bullets.map((b) => `<span class="split-pt-line">${b}</span>`).join('');
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
  const { header } = chrome;
  const wrap = (klass, first, body, role = first ? 'cover' : 'body') => `${roleOpenTag(openTag, klass, first, role)}${header}${body}${footerCell(openTag, chrome)}</section>`;
  const out = [];
  const wm = cover.watermark ? `<div class="split-feat-bleed" aria-hidden="true"><div class="split-feat-wm">${cover.watermark}</div></div>` : '';
  const eye = cover.eyebrow ? `<div class="split-feat-eye">${cover.eyebrow}</div>` : '';
  // The subtitle slot mirrors `coverSection`'s (split-envelope.js) — the two cover builders
  // carry the same masthead material in the same order (HARD RULE #1).
  const sub = cover.subtitle ? `<div class="split-feat-sub">${cover.subtitle}</div>` : '';
  const lede = cover.lede ? `<div class="split-feat-lede">${cover.lede}</div>` : '';
  // The cover's semantic lead-in INTO the next slide — the layout declares it in its
  // manifest `split.intro` (e.g. "Two readings", "The reasoning"), `{n}` → item count.
  const lead = cover.intro ? `<div class="split-cover-lead">${cover.intro}</div>` : '';
  out.push(wrap(cls('cover'), true, `${wm}${eye}<div class="split-feat-h">${cover.heading}</div>${sub}${lede}${lead}`));
  // ONE member per page. A recipe that declares `split.perPage` still passes it, and every
  // recipe in the catalog now declares 1 — but the FALLBACK used to be 3, so a new recipe that
  // forgot to declare one would have packed silently. The single-element rule is not a property
  // of what each manifest happens to say (2026-09-01).
  const per = Number.isInteger(perPage) && perPage > 0 ? perPage : 1;
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
// compare-code is two labeled code blocks read across. Code can't reflow into a
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
  const { header } = chrome;
  const wrap = (klass, first, body, role = first ? 'cover' : 'body') => `${roleOpenTag(openTag, klass, first, role)}${header}${body}${footerCell(openTag, chrome)}</section>`;
  const out = [];
  const eye = code.eyebrow ? `<div class="split-feat-eye">${code.eyebrow}</div>` : '';
  const lead = intro ? `<div class="split-cover-lead">${intro}</div>` : '';
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
  const { header } = chrome;
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
    pageInners.push(`${header}${runhead}<div class="ct-cards">${group}</div>${footerCell(openTag, chrome)}`);
    i += size;
  }
  // The NOTE does not ride a card page. It closes the run beside the key insight, on the
  // CLOSING page below — the same placement every other path takes since 2026-09-01. This
  // arm kept the retired 2026-07-26 rule ("rides the LAST card page, one size down") for one
  // change longer than the rest, which is exactly the drift a shared kernel exists to stop:
  // `cover-cards` re-authors its own body from a transposed table, so it never went through
  // `splitEnvelope` and the placement change did not reach it.
  const pages = pageInners.map((pageInner) => `${bodyTag}${pageInner}</section>`);
  const result = [cover, ...pages];
  // CLOSING — the note AND the key insight, together, on the run's last page (2026-09-01).
  // `closingPage` needs the resolved regions this path already has, so it is the same builder
  // the plain envelope uses rather than a second one for the transposed shape (HARD RULE #1).
  if (regions && (regions.insight.length || regions.note.length)) result.push(closingPage(openTag, inner, regions));
  return result;
}

function coverPaginateSections(openTag, inner, chrome, recipe, ratio, layoutName) {
  // Rule 1 — the RENDERED structure decides, not the recipe's declared axis.
  const axis = deriveAxis(inner) === 'row' ? 'row' : 'item';
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
/**
 * The section's trailing BEATS — the key insight and the below-note — as spans.
 *
 * The three NATIVE strategies (`redline-blocks`, `kanban-lanes`, `roadmap-horizons`) do not
 * re-author their body — they re-emit SLICES of the source, which is what makes them robust
 * against whatever chrome their component family emits. The same property makes them sweep up
 * the slide's trailing material: everything after the last lane / card / passage rides the
 * slice, and the slice is repeated on every page. Measured on a two-lane `kanban`, a key
 * insight printed on both lanes AND on the closing page — three copies of one blockquote.
 *
 * That is FM-2 duplication, and the conservation gate is structurally blind to it: a multiset
 * containment check only ever reports a shortfall, so counts that RISE always pass. So the
 * strip is here rather than a gate: the beats belong to the run's closing page, and a strategy
 * that re-emits source has to hand them over rather than copy them.
 *
 * The five re-authoring strategies need no strip — they build their pages from parsed parts
 * (`readFeature`, `readSubjects`, `readRows`, `readCode`) and never copy the trailing region at
 * all, which is the same fact that made them DROP it before the dispatcher hoisted it.
 * `cover-paginate` and `cover-cards` need no strip either: they resolve the regions themselves
 * and build their own `closingPage` from them.
 */
function trailingBeatsOf(inner, cls) {
  const { insight, note } = trailingSlotMaterialOf(inner, cls);
  return [...insight, ...note];
}

/** `trailingBeatsOf`, applied: the inner with its beats removed. */
function withoutTrailingBeats(inner, cls) {
  const beats = trailingBeatsOf(inner, cls);
  return beats.length ? removeSpans(inner, beats) : inner;
}

/**
 * The NATIVE SLICE kernel — one member per page, by re-emitting slices of the source.
 *
 * `kanban-lanes` and `roadmap-horizons` were the same forty lines twice, and every fix
 * this session had to be made in both (the doubled `<header>`, the `.cell-footer`
 * counted as a member, the trailing beats riding every page). A third and fourth copy
 * would have made that four places, so the shape is a function and the strategies are
 * its arguments — HARD RULE #15, and #1: one place for the transform.
 *
 * WHAT IT DOES, and why this shape is robust. It never parses the component's anatomy.
 * It finds the CONTAINER holding the members, keeps everything before it OPEN as a
 * `prefix` and everything after the last member as a `suffix`, and emits one page per
 * member as `prefix + member + suffix`. Whatever chrome the component family wraps
 * around the members — a chart header, a status key, a figure — is preserved verbatim
 * because it was never understood, only copied.
 *
 * The four rules the copies each had to learn, now learned once:
 *
 *  1. STRIP THE TRAILING BEATS FIRST, AND NEVER HONOR A `coda.claims` HERE. `suffix` is
 *     everything after the last member and rides every page, so a beat left in it prints once
 *     per member AND on the closing page (measured: 2 lanes, 3 copies; a three-card roadmap
 *     printed its below-note 3 times). That is why the class is NOT passed to the strip: a
 *     claim means "this layout renders the beat itself", which is only true while the layout's
 *     own page ships whole. See MEMBER_CLAIM_STRATEGIES.
 *
 *     AN EARLIER VERSION OF THIS COMMENT CLAIMED THE ROADMAP CASE LOST THE BEAT ENTIRELY —
 *     "lands in neither prefix nor suffix and reaches no page at all". That is structurally
 *     impossible: `holdInner` runs to the end of `inner`, so the suffix is EVERYTHING after the
 *     last member, a coda docked beside `.cell-stage` included. The "zero copies" behind it was
 *     read from `pdftotext` on a page the engine was CLIPPING — the text was on the page and cut
 *     off, not missing. Duplication is the defect; loss was never one.
 *  2. STRIP THE SECTION'S OWN `<header>` FROM THE PREFIX. The prefix starts at index 0,
 *     so it carries the header; `${header}${prefix}` would then emit it twice.
 *  3. FILTER THE MEMBERS BY CLASS. Form docks the footer CELL *inside* the container, so
 *     taking every element child counts it as a member and emits a spurious final page
 *     holding nothing but a doubled footer (seen on a real render: 4 lanes → 5 pages).
 *  4. KEEP THE SUFFIX WHOLE — do not chrome-strip it. Each page needs a real
 *     `.cell-footer` for `repaginate` to re-stamp. That is also why a native strategy
 *     must NOT append `chrome.footer` / `chrome.rail` the way the re-authoring cover
 *     strategies do: it would be the second copy.
 *  5. NAME THE MEMBER, because nothing downstream can. The forward pointer is built by
 *     `applyRelationshipSignals`, which resolves a page's members with `membersIn` — the
 *     first `<ul>`/`<ol>` on the page and its `<li>` children. That proxy holds for a page
 *     whose body IS a list and breaks on a native slice, where the page holds ONE member
 *     that may contain lists of its own. Measured on `examples/portrait-roadmap.md`: the
 *     first list on a phase page is `ul.horizon-rows` INSIDE the card, so every pointer
 *     named a workstream row instead of the phase — "next: Signal Intake Scoring v2", two
 *     fields of one row run together, where the page it points at is titled "Q2". `kanban`
 *     builds its cards from `<div>`s, so `membersIn` found nothing and its runs carried no
 *     pointer at all. Only `journey` was right, and by luck: its vertical stack happens to
 *     be the first list on the page.
 *
 *     The splitter is the only thing that knows what it sliced, so it says so —
 *     `data-split-label` on the page, read in preference to the heuristic. A future
 *     strategy gets a correct pointer by naming its title class, not by teaching a shared
 *     kernel about its DOM.
 *
 * `spec` is `{ container, member, tag = 'div', containerTag = tag, min = 2, heading = true }`:
 *   · `container`    — the class of the element holding the members.
 *   · `member`       — the class of one member.
 *   · `tag`          — the element name of a MEMBER (`div` for a card or lane, `li` for a
 *                      list stage). Container children of any other name are skipped, which
 *                      is rule 3's mechanism as much as the class filter is.
 *   · `containerTag` — the element name of the CONTAINER, when it differs from the member's
 *                      (journey stacks `li.journey-vstage` inside `ol.journey-vstack`).
 *   · `min`          — fewest members that make a run; below it, null → the ring.
 *   · `heading`      — require an `h1`/`h2` in the prefix, so a page has something to say
 *                      what it is. Every current caller wants this.
 *   · `label`        — the class of the element inside a member that TITLES it. The page is
 *                      stamped `data-split-label` with that text, and `applyRelationshipSignals`
 *                      names the next page from it. Optional; without it a page falls back to
 *                      the shared `membersIn` heuristic, which is wrong here — see below.
 *
 * Returns the page array, or null when the section is not this shape (→ left for the
 * ring). Returning null is how a strategy scopes itself to ONE rendered form: `roadmap`
 * finds no `.horizons` grid in its table form, `journey` no `.journey-vstack` at
 * landscape, and both keep ringing there, untouched.
 */
/**
 * Stamp a native-slice page with the NAME of the member it carries (rule 5 above).
 *
 * Text only, entity-escaped, and capped: this rides an HTML attribute, and the label is author
 * content. A member with no title element, or a title that is empty once tags are stripped, is
 * left unstamped rather than stamped blank — `applyRelationshipSignals` then falls back to its
 * own heuristic, which is what every page did before this existed.
 */
function withMemberLabel(tag, memberHtml, labelClass) {
  if (!labelClass) return tag;
  // The title element's OWN closing tag, found depth-aware. A lazy `([\s\S]*?)</[a-z0-9]+>`
  // stops at the first NESTED close instead: a lane titled `- **Backlog** and triage` renders
  // `<div class="kanban-column-header"><strong>Backlog</strong> and triage</div>` and labelled
  // itself "Backlog", so the pointer named half a title. `kanban` and `roadmap` both pass an
  // author's inline markup straight into the title (`kanban.transform.js` colHeader,
  // `roadmap.transform.js` headerText); `journey` escapes and strips first, which is why the
  // committed decks never showed it.
  const open = new RegExp(`<([a-z0-9]+)\\b[^>]*\\sclass="[^"]*(?<![\\w-])${labelClass}(?![\\w-])[^"]*"[^>]*>`, 'i')
    .exec(memberHtml);
  if (!open) return tag;
  // `findMatchingClose` wants the index OF the `<` and returns the index AFTER the close.
  const from = open.index + open[0].length;
  const end = findMatchingClose(memberHtml, open[1], open.index);
  if (end < 0) return tag;
  const inner = memberHtml.slice(from, end - `</${open[1]}>`.length);
  // DECODE before re-escaping. The slice is rendered HTML, so an author's `&` is already
  // `&amp;` there; escaping again stores `&amp;amp;`, and the reader's single decode hands
  // the pointer a literal `&amp;`. One decode here, one escape below, one decode on read.
  const text = inner.replace(/<[^>]*>/g, ' ')
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'").replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ').trim();
  if (!text) return tag;
  const attr = text.slice(0, 120)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  return tag.replace(/^<section\b/, `<section data-split-label="${attr}"`);
}

function nativeSliceSplit(openTag, rawInner, spec) {
  const { container, member, tag = 'div', containerTag = tag, min = 2, heading = true, label } = spec;
  const inner = withoutTrailingBeats(rawInner);                     // rule 1 — no claim scope
  const open = inner.indexOf(`<${containerTag} class="${container}"`);
  if (open < 0) return null;
  const afterOpen = inner.indexOf('>', open) + 1;
  const chrome = chromeOf(inner);
  const prefix = stripChrome(inner.slice(0, afterOpen), chrome);    // rule 2
  if (heading && !grab(prefix, /<h[12][^>]*>([\s\S]*?)<\/h[12]>/)) return null;
  const holdInner = inner.slice(afterOpen);
  const memberRe = new RegExp(`^<${tag}\\b[^>]*\\sclass="[^"]*\\b${member}\\b`);
  const members = directChildren(holdInner, tag)                    // rule 3
    .filter((s) => memberRe.test(holdInner.slice(s.start, s.end)));
  if (!members || members.length < min) return null;
  const suffix = holdInner.slice(members[members.length - 1].end);  // rule 4
  const { header } = chrome;
  const baseCls = (openTag.match(/\sclass="([^"]*)"/) || ['', ''])[1];
  const idless = openTag.replace(/\s+id="[^"]*"/, '');
  const pageTag = (first) => withRole(
    (first ? openTag : idless).replace(/(\sclass=")[^"]*(")/, `$1${baseCls} lat-split-native$2`), 'body');
  return members.map((m, k) => {
    const html = holdInner.slice(m.start, m.end);
    const pfx = k === 0 ? prefix : prefix.replace(/<\/(h[12])>/, ' <span class="lat-cont">(cont.)</span></$1>');
    return `${withMemberLabel(pageTag(k === 0), html, label)}${header}${pfx}${html}${suffix}</section>`;
  });
}

function redlineBlockSplit(openTag, inner) {
  const bqs = directChildren(inner, 'blockquote');
  if (!bqs || bqs.length < 2) return null;
  if (!grab(inner.slice(0, bqs[0].start), /<h2[^>]*>([\s\S]*?)<\/h2>/)) return null;
  const noteM = inner.match(/<(ul|ol)\b[\s\S]*?<\/\1>/);   // the note / why list — rides NEW
  const note = noteM ? { start: noteM.index, end: noteM.index + noteM[0].length } : null;
  // A THIRD (or later) top-level blockquote is neither passage. Left in place it was FM-2 by
  // another route — in no drop-set, so it survived on BOTH pages, and the rule-6 hoist then saw
  // its text already emitted and stood down (a containment check reports shortfalls, never
  // duplicates). But cutting it from both pages unconditionally traded a duplication for a
  // DROP, which is strictly worse: the hoist can only rescue what `trailingMaterialOf` finds,
  // and that is a CONTIGUOUS TRAILING run — a third blockquote followed by the why-list is not
  // trailing, so it landed on no page at all. (Both failure modes found by the HARD RULE #25
  // trio, one per pass.)
  //
  // So cut exactly what the hoist will rescue, and no more. A RESCUABLE extra (one the trailing
  // scan claims, so the run's closing page carries it) leaves both body pages. A STRANDED one is
  // dropped from page 1 only and rides page 2 — the last body page, which is where the envelope
  // puts trailing material it cannot give a page of its own. Either way it appears exactly once.
  // NB `redline` CLAIMS `blockquote` (`coda.claims`), so on this strategy the scan claims none of
  // them and every extra is stranded — which is right: they are redline's own passages.
  const rescuable = new Set(trailingMaterialOf(inner, classOf(openTag)).insight.map((s) => `${s.start}:${s.end}`));
  const isRescuable = (b) => rescuable.has(`${b.start}:${b.end}`);
  const extra = bqs.slice(2).filter(isRescuable);
  const stranded = bqs.slice(2).filter((b) => !isRescuable(b));
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
  const mark = (html, klass) => html.replace(/<blockquote\b/, `<blockquote class="${klass}"`);
  // Slides keep `redline` but drop the wide variant (no columns left to lay out) and gain
  // `lat-split-native` so the splitter treats them as finished bodies (never re-carouseled).
  const baseCls = (openTag.match(/\sclass="([^"]*)"/) || ['', ''])[1]
    .replace(/\b(split|three-col|stacked)\b/g, '').replace(/\s+/g, ' ').trim();
  const slideTag = withRole(openTag.replace(/(\sclass=")[^"]*(")/, `$1${baseCls} lat-split-native$2`), 'body');
  const contTag = slideTag.replace(/\s+id="[^"]*"/, '');
  const cont = (html) => html.replace(/<\/(h[12])>/, ' <span class="lat-cont">(cont.)</span></$1>');
  // The trailing BEATS come off BOTH pages — they close the run on its own page now
  // (`withoutTrailingBeats`, and `carouselize`'s closing hoist). Leaving the note on page 2, as
  // this did, printed it there AND on the closing page.
  //
  // Removed in the SAME pass as each page's own drop-set, against the ORIGINAL `inner`
  // coordinates. Stripping the beats first and then removing spans from the shortened string
  // would need every later offset shifted; `removeSpans` already sorts back-to-front for
  // exactly that reason, so handing it one list is both simpler and exact.
  const drop = (spans) => removeSpans(inner, [...spans, ...trailingBeatsOf(inner, classOf(openTag))].filter(Boolean));
  return [
    `${slideTag}${mark(drop([bqs[1], note, ...extra, ...stranded]), 'rl-old')}</section>`,
    `${contTag}${cont(mark(drop([bqs[0], ...extra]), 'rl-new'))}</section>`,
  ];
}

// ── kanban-lanes strategy (kanban portrait — one lane per slide) ───────────────
// A kanban board is N lanes side-by-side — unreadable on a phone. In portrait each LANE
// gets its OWN slide: the chart-header (eyebrow + heading) repeats, the board is re-emitted
// holding a single .kanban-column, so that lane has the whole slide for its cards (the point:
// a lane with many cards gets room instead of being crushed beside its neighbors). Robust by
// construction — it repeats the exact wrapper prefix (chart-header → chart-body → board-open)
// and the exact closes, so whatever chrome the chart family emits is preserved; only the
// column set changes. Needs ≥2 lanes. A single lane with more cards than one slide holds rings
// (a future pass can paginate a lane's cards). See
// engineering/decisions/2026-06-25-retire-landscape-locks-portrait-everything.md.
function kanbanLaneSplit(openTag, rawInner) {
  return nativeSliceSplit(openTag, rawInner, {
    container: 'kanban-board', member: 'kanban-column', label: 'kanban-column-header' });
}

// ── roadmap-horizons strategy (roadmap portrait — phase cards across 2–4 pages) ─
//
// SCOPE, and why this is not a reversal of roadmap's §0c 'atomic' placement.
// §0c places the roadmap TABLE as atomic — "no viewBox, cannot scale, must not split
// (the grid/axis meaning is the point)" — and that reasoning is exactly right FOR THE
// TABLE: paginating a workstream x phase grid destroys the cross-reading that is the
// whole artifact (the #1193 defect class that shredded matrix-2x2).
//
// At portrait the roadmap does not render a table. `chart-family.js buildRoadmapSection`
// auto-selects the `horizons` card form, and `roadmap.transform.js` transposes the grid
// into N INDEPENDENT `.horizon-card`s — one per phase, each already self-contained (a
// phase header plus that phase's workstream rows). There is no cross-reading left to
// destroy: the transpose already made each phase a unit, exactly as kanban's `.kanban-column`
// lanes are units. So the seam exists in the CARD form only.
//
// This splitter therefore returns null unless it finds a `.horizons` grid — the table form
// keeps ringing on overflow, unchanged. Same shape as `kanbanLaneSplit`, and robust the
// same way: it repeats the exact wrapper prefix and the exact closes, so whatever chrome
// the chart family emits is preserved and only the card set changes.
//
// ONE horizon card per page — no budget. The owner's #1209 call capped a run at 2–4 parts and
// grouped beyond that ("a 6-phase roadmap is 2+2+1+1 and never 6 pages"), which is packing, and
// packing is what the single-element rule forbids (2026-09-01). That cap was set when the page
// COUNT was the thing being economized; it is not, now that the count is simply how many things
// the author wrote. Its own sentence already conceded the point — "One card per page reads
// best" — and then paid it away to stay under the budget.

function roadmapHorizonSplit(openTag, rawInner) {
  // No `.horizons` grid means the TABLE form, which stays atomic and rings — the whole
  // scope of the exception above, enforced by the kernel returning null.
  return nativeSliceSplit(openTag, rawInner, {
    container: 'horizons', member: 'horizon-card', label: 'horizon-title' });
}

// ── journey-stages strategy (journey portrait — one stage per slide) ──────────
//
// SCOPE, and why this is a portrait-only enrollment rather than a treatment change.
// A journey at LANDSCAPE is one figure over a shared axis, exactly like `matrix-grid`
// and `gantt`: `.journey-board` sets `--task-count` and every rule draws into
// `grid-template-columns: repeat(var(--task-count), 1fr)`, each task carries an ABSOLUTE
// `--col`, and the stage ribbon spans its tasks with `grid-column: span var(--span)`
// (journey.styles.css lines 339/346/382/389). Cut that and a page holds tasks at columns
// 4-5 of a grid whose columns 1-3 are gone. There is no reader that fixes it, which is the
// test `split-facts.js` applies to `matrix-grid` and `gantt` — so at landscape, journey
// rings, untouched.
//
// At portrait the board is a different DOM. `journey.transform.js` emits
// `ol.journey-vstack > li.journey-vstage > ol.journey-vrows > li.journey-vtask`, and the
// vertical rules use flex throughout: `--span` is a flex GROWTH factor, not a grid span,
// and `--col` is not read at all (measured — no `--col`, `--task-count`, `:nth-child`,
// counter or sibling combinator appears in any rule below journey.styles.css:800). A
// `.journey-vstage` is therefore a genuine unit: its own band label, its own rows, and a
// per-task mood mark rather than a polyline across the whole set. One stage per page holds
// together on its own, which a slice of the landscape grid does not.
//
// The categorical accent survives the cut because it is ATTRIBUTE-driven —
// `.journey-vstage[data-section="0..5"]` picks `--cat-1-mark`..`--cat-6-mark`
// (journey.styles.css:853-858) — and `data-section` is written on the member by the
// transform, so it travels. That is the whole difference between this enrollment and
// `timeline-list`, whose dot spectrum is `:nth-child(6n+k)` on an element carrying no
// index: sliced to one member per page, every page is `:nth-child(1)` and the sequence
// collapses to cat-1. Positional CSS is what makes a component unsliceable, not the shape
// of its DOM.
//
// The two legends (`.journey-legend` actors, `.journey-mood-legend` scale) FOLLOW the vstack in
// the emitted DOM, so they land in the SUFFIX and repeat on every page — which is what a reader
// needs: a page showing mood faces without the mood key is unreadable. (This comment said
// "BEFORE … the prefix" and was wrong about the mechanism while right about the outcome;
// `journey.transform.js` emits `ol.journey-vstack` first and both legends after it.)
function journeyStageSplit(openTag, rawInner) {
  // No `ol.journey-vstack` means the landscape grid form, which stays whole and rings —
  // the whole scope of the exception above, enforced by the kernel returning null.
  return nativeSliceSplit(openTag, rawInner, {
    container: 'journey-vstack', containerTag: 'ol', member: 'journey-vstage', tag: 'li',
    label: 'journey-vstage-name' });
}

// ── public entry ──────────────────────────────────────────────────────────────
// Re-author one rendered read-across section as a carousel per its `recipe.strategy`.
// Every strategy shares ONE accent cover→content finish (the split-panel treatment the
// maintainer set as the fidelity bar) so a split reads as the same deck, just more of it:
//   · 'feature-cover'  — split-panel: feature cover → supporting points paginated.
//   · 'cover-rows'     — list-tabular: title cover → row-list paginated.
//   · 'cover-sides'    — compare-prose: cover (question) → one subject per page.
//   · 'cover-decision' — decision: verdict cover → justifications paginated.
//   · 'cover-code'     — compare-code: title cover → one code block per page, full width.
//   · 'cover-paginate' — dense lists/tables (legal batch): accent cover → the layout's OWN
//                        native cards paginated (partitionAxis), never flattened.
// (cover-rows / -sides / -decision share the `coverWindow` builder.)
// EVERY run then closes on the shared CLOSING page when the slide has trailing material —
// the below-note and the key insight together, built by the kernel, never by a strategy.
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

// The below-note is NOT promoted to the cover lede any more. That promotion put a trailing
// footnote at the FRONT of the run, where it read as framing the author never wrote — and it
// consumed the note, so the run then ended with a key insight alone while its note sat on the
// cover. Trailing material closes the run; the cover carries masthead material (§0a).
function splitCoverRows(inner, ctx) {
  const heading = grab(inner, /<h2[^>]*>([\s\S]*?)<\/h2>/);
  const rows = readRows(inner);
  if (!heading || !rows) return null;
  const cover = { heading, intro: introOf(ctx.recipe, rows.length) };
  const parts = coverWindow(ctx.openTag, cover, rows, ctx.chrome, ctx.recipe.perPage, (role) => `content list-tabular-split list-tabular-${role} form`);
  return parts.length >= 2 ? parts : null;
}

// compare-prose, the FIDELITY treatment: the same accent cover→content finish as
// split-panel (not the editorial drop-cap/pull-quote), so a split comparison reads as
// the same deck. Cover (the question) → one subject per page → the shared closing page.
//
// IT NO LONGER BUILDS A VERDICT PAGE OF ITS OWN. It used to read the slide's trailing
// `.below-note` and re-author it as "The verdict" + a pull-quote — which CONSUMED the note,
// so the dispatcher's hoist saw its text already emitted and stood down, and a slide carrying
// a note AND a key insight ended `… body(the verdict) · insight`: the two beats on separate
// pages, which is precisely the retired 2026-07-26 placement the 2026-09-01 ruling replaced.
// The beats close the run TOGETHER on one page now, and that page is the kernel's
// (`closingPageFromMaterial`), so this strategy stops owning a second copy of the rule
// (HARD RULE #1). `compare-split-verdict`'s CSS goes with it — a rule whose only emitter is
// gone is dead weight the next reader has to disprove.
function splitCoverSides(inner, ctx) {
  const subjects = readSubjects(inner);
  if (!subjects) return null;
  const heading = grab(inner, /<h2[^>]*>([\s\S]*?)<\/h2>/) || '';
  const cls = (role) => `content compare-split compare-split-${role} form`;
  const parts = coverWindow(ctx.openTag, { heading, intro: introOf(ctx.recipe, subjects.length) }, subjects, ctx.chrome, 1, cls);
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

function splitRoadmapHorizons(inner, ctx) {
  const parts = roadmapHorizonSplit(ctx.openTag, inner);
  return parts && parts.length >= 2 ? parts : null;
}

function splitKanbanLanes(inner, ctx) {
  const parts = kanbanLaneSplit(ctx.openTag, inner);
  return parts && parts.length >= 2 ? parts : null;
}

function splitJourneyStages(inner, ctx) {
  const parts = journeyStageSplit(ctx.openTag, inner);
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

/**
 * The strategies whose claimed beat RIDES A MEMBER — the only ones whose `coda.claims` is honored.
 *
 * A layout's claim says "I render this beat myself, in my own anatomy". The question the splitter
 * has to answer is narrower: would the beat still be RIGHT if the splitter left it alone? The test
 * is not whether the strategy re-emits source. It is WHERE in the emitted page the claimed element
 * lands.
 *
 *   · Inside a MEMBER → honor the claim. `redline` claims `blockquote` and its two passages ARE
 *     the members; each rides its own page, styled by the component that claimed it. Hoisting them
 *     would dismantle the slide.
 *   · In the repeated PREFIX or SUFFIX → never honor it. A native slice repeats everything outside
 *     the member set on every page, so a claimed note there is printed once per member. That is
 *     not survival, it is FM-2 duplication, and the conservation gate is blind to it (a multiset
 *     containment check only reports a shortfall, so counts that RISE always pass).
 *   · Outside the sliced subtree entirely → also never. `roadmap` docks its coda as a sibling of
 *     `.cell-stage`, while the slice is taken inside `.chart-body`, so a claimed note is in
 *     neither the prefix nor the suffix and reaches NO page at all.
 *   · A RE-AUTHORING strategy (the five cover recipes) rebuilds its body from parsed parts, so an
 *     element its parser does not read reaches no page either. `split-panel` claims both beats and
 *     renders NEITHER — it sweeps them into `.panel-right` unstyled, one of the swallowed cases
 *     lib/core/coda.js was written to end.
 *
 * THIS SET HELD FOUR STRATEGIES AND THAT WAS WRONG (2026-09-02). It was built on "re-emits source",
 * which is a property of the strategy rather than of the claimed element, and `kanban`, `roadmap`
 * and `journey` all claim `trailing-paragraph` while docking it outside their member set. Measured
 * on a two-stage journey the below-note printed on BOTH pages; on a three-card roadmap it printed
 * on none. Only `redline` passes the real test, so only `redline` is here — and a strategy joins it
 * by showing that the claimed element rides a member, not by re-emitting markup.
 */
const MEMBER_CLAIM_STRATEGIES = new Set(['redline-blocks']);

const CAROUSEL_STRATEGIES = {
  'feature-cover': splitFeatureCover,
  'cover-rows': splitCoverRows,
  'cover-sides': splitCoverSides,
  'cover-decision': splitCoverDecision,
  'cover-code': splitCoverCode,
  'redline-blocks': splitRedlineBlocks,
  'kanban-lanes': splitKanbanLanes,
  'roadmap-horizons': splitRoadmapHorizons,
  'journey-stages': splitJourneyStages,
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
  // §8 rule 6 — CONSERVATION, and the 2026-09-01 CLOSING PAGE, applied once for every
  // strategy rather than ten times.
  //
  // A trailing key insight was dropped OUTRIGHT by every strategy except `cover-cards`:
  // measured with a sentinel across cover-sides, feature-cover, cover-rows, cover-decision and
  // cover-code — all five lost it, no page, no warning. Each re-authors its body from parsed
  // parts, so anything after the parsed structure never reaches an emitted page.
  //
  // Hoisted HERE, in the one dispatcher, so a strategy cannot forget — and the beats land on
  // ONE page, together, which is the ruling this dispatcher was the last holdout against. It
  // used to split them: the note was spliced into the LAST BODY page (the retired 2026-07-26
  // placement) and the insight got a page of its own, so a run carrying both ended
  // `… body(+note) · insight` instead of `… body · closing`.
  // The layout's claim is asked ONLY for a strategy that re-emits source (see
  // MEMBER_CLAIM_STRATEGIES). A re-authoring strategy passes no class, so every trailing shape
  // counts as a beat — because on that path the alternative to hoisting is losing it.
  const claimScope = MEMBER_CLAIM_STRATEGIES.has(recipe.strategy) ? classOf(openTag) : undefined;
  const material = trailingSlotMaterialOf(inner, claimScope);
  const beats = [...material.insight, ...material.note];
  if (!beats.length) return parts;
  // Does the strategy build its OWN closing page? Asked STRUCTURALLY, of the kernel-owned
  // role, not by testing whether the material's text appears somewhere in the emitted bytes.
  //
  // That text test is what used to guard this hoist, and it is unreliable in both directions.
  // It cannot see a DUPLICATE — containment only ever reports a shortfall — so `kanban-lanes`,
  // which swept the trailing material into the suffix it repeats on every lane, read as
  // "carried" while printing the key insight once per page (measured: 2 lanes, 2 copies). And
  // it reads a false positive whenever the material's words happen to occur in the body, which
  // would silently drop the page. `cover-paginate` and `cover-cards` route through
  // `splitEnvelope` / `closingPage` and stamp the role themselves; every other strategy now
  // strips the material from its own pages, so the answer is a fact about the emitted markup
  // rather than a guess about its words.
  if (parts.some((p) => /\sdata-split-role="closing"/.test(p))) return parts;
  // The run's heading, so the closing page names the slide it closes exactly as the body pages
  // do — the same `readMasthead` the cover builder uses, not a second reader (HARD RULE #15).
  const heading = readMasthead(inner)?.heading || null;
  const page = closingPageFromMaterial(openTag, chrome, beats, layoutName, heading);
  if (!page) return parts;
  // NO STRATEGY EMITS AN `insight` ROLE ANY MORE, so there is nothing to re-stamp. This carried a
  // `findIndex(insight) → withRole('body')` guard whose comment said `redline-blocks` leaves one
  // for a rescuable extra blockquote; `redlineBlockSplit` returns exactly two `body` sections and
  // never has. The role's only emitter was `insightPageFrom`, which the closing page replaced —
  // measured at zero across four full galleries. Both it and the guard are gone rather than kept
  // as insurance against a caller that does not exist (the same argument this change makes when
  // it deletes `compare-split-verdict`). Found by the HARD RULE #25 checker.
  parts.push(page);
  return parts;
}

module.exports = { carouselize, readSubjects, readFeature, readRows, readCode, nativeSliceSplit, CAROUSEL_STRATEGIES, MEMBER_CLAIM_STRATEGIES };
