/**
 * timeline-list — a dated spine of milestones. Chart-family member;
 * kernel-as-module.
 *
 * Reached through the `kernel` block in timeline-list.manifest.json, like
 * every other chart: the family dispatches, this file parses the ordered list
 * and emits `.timeline-spine`, and the chart-frame wrap stays in the family.
 */

const { parseTopLevelLis, extractFirstList } = require('@laticent/markup');
const { escAttr, plainText, stripTrailingPills, spliceFirstList, chartStatus } = require('../../shared/transform-utils');
const { wrapWords, textWidth } = require('../../shared/text-measure');
const { formBoxPx, phoneSteps } = require('../../shared/chart-phone');

/** Each entry as data: its date, title, status word and body lines (author markup, already escaped by markdown-it). */
function timelineItems(olInner) {
  return parseTopLevelLis(olInner).map((item) => {
    const nestedIdx = item.search(/<ul[^>]*>/);
    let lead = nestedIdx >= 0 ? item.slice(0, nestedIdx) : item;
    let body = [];
    if (nestedIdx >= 0) {
      // EVERY nested item, each read by the list walker. The lazy match this replaces ran from
      // the first `<li>` to the last `</li></ul>`, so a second bullet painted inside the body
      // as a stray `</li><li>` — broken markup, and a line the narrator could not account for.
      const sub = extractFirstList(item.slice(nestedIdx));
      if (sub) body = parseTopLevelLis(sub.inner).map((li) => li.replace(/<\/?p>/g, '').trim()).filter(Boolean);
    }
    lead = lead.replace(/<\/?p>/g, '').trim();
    const leadingMatch = lead.match(/^<code>([^<]+)<\/code>\s*/);
    const date = leadingMatch ? leadingMatch[1].trim() : '';
    if (leadingMatch) lead = lead.slice(leadingMatch[0].length);
    const { leadStripped, pills } = stripTrailingPills(lead);
    return { date, title: leadStripped.trim(), status: pills[0] || '', body };
  });
}

function itemHtml({ date, title, status, body }) {
  const dateEl = date
    ? `<div class="timeline-pill">${date}</div>`
    : '<div class="timeline-pill timeline-pill--empty"></div>';
  const statusEl = status
    // Folded like every CHART_STATUS consumer: `AT-RISK` stamps `at-risk`.
    ? `<span class="chart-status" data-s="${escAttr(chartStatus(status) || status)}">${status}</span>`
    : '';
  const bodyEl = body.length ? `<div class="timeline-body">${body.join('<br>')}</div>` : '';
  // The date names the milestone — `narrateTimelineList` leads with it — so it is
  // the label the Present Guide matches; `role="listitem"` makes the spine a list.
  const hook = ` role="listitem"` + (date ? ` data-label="${escAttr(plainText(date))}"` : '');
  return `<div class="timeline-item"${hook}>` +
    `<div class="timeline-dot"></div>` +
    dateEl +
    `<div class="timeline-title">${title}</div>` +
    statusEl +
    bodyEl +
    `</div>`;
}

function buildTimelineSpine(olInner, over = null) {
  const items = timelineItems(olInner);
  const k = over ? over(items) : 1;
  // OVER CAPACITY (a phone page whose stacked entries do not fit at the type ladder's size, `tlScale`): the spine is
  // drawn whole and scaled by `--tl-k`, the owner's rule for every chart (engineering/decisions/2026-11-10-chart-form.md).
  // `data-fit-k` names the scale for the legibility probe (overflow-probe.js `probeFigureLegibility`), which measures a
  // scaled box's text as it does a scaled state chart's.
  const entries = items.map(itemHtml).join('');
  if (k >= 1) return `<div class="timeline-spine" role="list">${entries}</div>`;
  // Scaled, the entries ride in an inner spine inside a box of no height (timeline-list.styles.css): their unscaled
  // layout would otherwise grow the chart body past the stage, and the overflow watchers would report a cut the reader
  // never sees. The outer box keeps the bare `timeline-spine` class, the figure root the chart frame finds
  // (chart-frame.js `BODY_RE`); the inner one carries every spine style, the list role and the scale.
  const kk = k.toFixed(3);
  return `<div class="timeline-spine" data-chart-form="over" data-fit-k="${kk}" style="--tl-k:${kk}">` +
    `<div class="timeline-spine timeline-scaled" role="list">${entries}</div></div>`;
}

// THE STACKED SPINE'S HEIGHT on a phone page, in page px (a 1080-wide page), from the markup and the glyph widths
// (shared/text-measure.js). Measured on examples/gallery-jargon.md at mobile, story, 4:5 and square, every entry to the
// pixel (timeline-list.styles.css, the tall/square/strip block):
//   an entry   — a first row as tall as the date pill (60.9), the status chip (56.0) or the title's lines at 1.2 of its
//                13pt (43.47), whichever is tallest; then the body's lines at 1.5 of the deck body, the smallest step
//                (`--sp-2xs`, a sixth of `--sp-md`) above it;
//   the title  — wraps in what the dot (16.6), the widest pill and the widest status chip leave, `--sp-md` between each;
//                a pill is 51.4 and 22.1 a character, a chip 0.85 of its word in capitals at 11pt and 90 (both a little
//                over: DECISION 244.6 measured, 247 here);
//   the spine  — the entries, `--sp-md` between each two, `--sp-xs` (a third of it) above and below.
const TL_PAGE = {
  title: 43.47,
  titleLh: 1.2,
  // The body: the deck body (4.35cqi on a tall page, 2.8cqi at square) floored at 11pt (36.78px).
  bodyTall: 46.98,
  bodySquare: 36.78,
  bodyLh: 1.5,
  pillH: 60.94,
  pillPad: 51.4,
  pillChar: 22.1,
  statusH: 56.03,
  statusText: 36.78,
  statusOf: 0.85,
  statusPad: 90,
  dot: 16.625,
  fit: 0.99,
};

/** Lines `text` takes `width` wide. `wrapWords` breaks at spaces only; the browser also breaks a run with none (CJK
 *  text, a long URL), so a line wider than `width` counts as the lines it really takes. */
function tlLines(text, width, fontSize, opts) {
  const r = wrapWords(text, width, fontSize, opts);
  return r.lines.reduce((n, l) => {
    const w = textWidth(l, fontSize, opts);
    if (w <= width) return n + 1;
    // A run the browser breaks between characters holds a whole number of them a line.
    const chars = [...l].length;
    const perLine = Math.max(1, Math.floor(width / (w / chars)));
    return n + Math.ceil(chars / perLine);
  }, 0) || 1;
}

/** An entry's body as the lines it starts: each nested item is its own block, as the browser lays it out. */
const BLOCK_TAGS = new Set(['ul', 'ol', 'li', 'p', 'br', 'br/']);
function bodyBlocks(parts) {
  const out = [];
  for (const part of parts) {
    const [first, ...rest] = part.split('<');
    let cur = first;
    for (const seg of rest) {
      const close = seg.indexOf('>');
      const tag = close < 0 ? '' : seg.slice(0, close).split(' ')[0].toLowerCase();
      if (BLOCK_TAGS.has(tag)) { out.push(cur); cur = seg.slice(close + 1); } else cur += `<${seg}`;
    }
    out.push(cur);
  }
  return out.map((x) => plainText(x).trim()).filter(Boolean);
}

/** The stacked spine's height when laid out `width` px wide (page px at scale 1), on a phone page of `aspect`. */
function tlHeight(items, width, aspect, v) {
  const g = phoneSteps(aspect)[0] * v;
  const bodyFs = (aspect >= 0.95 ? TL_PAGE.bodySquare : TL_PAGE.bodyTall) * v;
  const titleFs = TL_PAGE.title * v;
  // A pill's text is the label face; its width is the larger of 22.1 a character (the digits and a quarter measured)
  // and the glyph table's measure, which holds a wide letter (`W`) at its width.
  const pill = Math.max(...items.map((it) => {
    const t = plainText(it.date);
    return TL_PAGE.pillPad * v + Math.max(t.length * TL_PAGE.pillChar * v, textWidth(t, TL_PAGE.statusText * v, { weight: 600, tracking: 0.04 }));
  }));
  const chips = items.map((it) => (it.status ? TL_PAGE.statusOf * textWidth(plainText(it.status), TL_PAGE.statusText * v, { weight: 600, tracking: 0.04, upper: true }) + TL_PAGE.statusPad * v : 0));
  const chip = Math.max(0, ...chips);
  const titleW = width - TL_PAGE.dot * v - pill - chip - (chip ? 3 : 2) * g;
  const bodyW = width - TL_PAGE.dot * v - g;
  const rows = items.map((it) => {
    const lines = tlLines(plainText(it.title), Math.max(1, titleW), titleFs, { weight: 600 });
    const first = Math.max(TL_PAGE.pillH * v, it.status ? TL_PAGE.statusH * v : 0, lines * titleFs * TL_PAGE.titleLh);
    const bodyLines = bodyBlocks(it.body).reduce((a, b) => a + tlLines(b, bodyW, bodyFs, { weight: 400 }), 0);
    return first + (bodyLines ? g / 6 + bodyLines * bodyFs * TL_PAGE.bodyLh : 0);
  });
  return rows.reduce((a, b) => a + b, 0) + g * (rows.length - 1) + (2 * g) / 3;
}

/**
 * The scale a phone page's spine needs to fit `room`: 1 when it fits at the ladder's size, else the largest step of 0.02
 * at which the spine, laid out 1/k wider and scaled by k, fits (never under 0.4).
 */
function tlScale(items, room, aspect, v) {
  // The page is 1080 wide whatever the venue; a venue grows the type (`v`), not the page.
  const width = 972;
  if (!items.length || tlHeight(items, width, aspect, v) <= room) return 1;
  let k = 0.98;
  while (k > 0.4 && tlHeight(items, width / k, aspect, v) * k > room) k -= 0.02;
  return Math.max(0.4, k);
}

function transformSection(html, ctx = {}) {
  const phone = ctx && !ctx.paneView && ctx.aspect > 0 && ctx.aspect <= 1;
  if (!phone) return spliceFirstList(html, (ext) => buildTimelineSpine(ext.inner));
  const v = ctx.venueScale || 1;
  const room = formBoxPx(html, ctx.aspect, 0, ctx.metaLines || 0, v) * TL_PAGE.fit;
  return spliceFirstList(html, (ext) => buildTimelineSpine(ext.inner, (items) => tlScale(items, room, ctx.aspect, v)));
}

module.exports = { transformSection, buildTimelineSpine, tlHeight, tlScale, timelineItems };
