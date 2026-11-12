/**
 * kanban — a swimlane board of status cards. Chart-family member;
 * kernel-as-module.
 *
 * Pure HTML/CSS boxes rather than SVG (see the manifest's `render` nature),
 * so this kernel emits nested `.kanban-*` divs. The family dispatches here
 * through the `kernel` block in kanban.manifest.json.
 */

const { parseTopLevelLis, extractFirstList } = require('@laticent/markup');
const { escAttr, plainText, spliceFirstList, chartStatus } = require('../../shared/transform-utils');

// The size codes live in lib/core/kanban-sizes.js, shared with narration.
const { kanbanSize } = require('../../../../core/kanban-sizes');
const { wrapWords, textWidth } = require('../../shared/text-measure');
const { formBoxPx } = require('../../shared/chart-phone');
const KB_DONE_NAMES = ['done','completed','shipped','closed'];
// Lane colors ride the chart-family's own vivid catN spectrum (the same
// Apple-inspired hues pie/quadrant use), canvas-aware via --catN-ink — not
// the engine-wide --cN palette.
const LANE_COLOR_VARS = [
  'var(--chart-cat-1-ink)','var(--chart-cat-2-ink)','var(--chart-cat-3-ink)','var(--chart-cat-4-ink)',
  'var(--chart-cat-5-ink)','var(--chart-cat-6-ink)','var(--chart-cat-7-ink)','var(--chart-cat-8-ink)',
];

/** The board's lanes as parts: each lane's open tag, its name, and its cards (markup and what the phone layout reads). */
function kanbanLanes(ulInner) {
  const laneColorMap = {};
  let laneColorIdx = 0;
  const getLaneColor = (lane) => {
    if (!lane) return '';
    const key = lane.toLowerCase();
    if (!laneColorMap[key]) laneColorMap[key] = LANE_COLOR_VARS[laneColorIdx++ % LANE_COLOR_VARS.length];
    return laneColorMap[key];
  };

  const columns = parseTopLevelLis(ulInner);
  return columns.map(col => {
    const colSub = extractFirstList(col);
    const colHeader = (colSub ? col.slice(0, colSub.start) : col)
      .replace(/<\/?p>/g, '').trim();
    const isDone = KB_DONE_NAMES.includes(colHeader.toLowerCase());

    let cards = [];
    if (colSub) {
      const cardItems = parseTopLevelLis(colSub.inner);
      cards = cardItems.map(cardContent => {
        const bodySub = extractFirstList(cardContent);
        const cardLead = (bodySub ? cardContent.slice(0, bodySub.start) : cardContent)
          .replace(/<\/?p>/g, '').trim();
        // Size: one trailing size code on the title line
        let size = '', cardTitle = cardLead;
        const sizeM = cardLead.match(/^([\s\S]*?)\s*<code>([^<]+)<\/code>\s*$/);
        if (sizeM && kanbanSize(sizeM[2])) {
          size = kanbanSize(sizeM[2]);
          cardTitle = sizeM[1].trim();
        }

        // Label + status: first sub-bullet (prose = label, trailing code = status)
        let label = '', status = '', statusText = '', cardBody = '';
        if (bodySub) {
          const subItems = parseTopLevelLis(bodySub.inner);
          if (subItems[0]) {
            const metaLine = subItems[0].replace(/<\/?p>/g, '').trim();
            const statM = metaLine.match(/^([\s\S]*?)\s*<code>([^<]+)<\/code>\s*$/);
            // `plainText`, not a local `/<[^>]+>/g` pass. Two reasons, and the
            // second is a defect the first uncovered:
            //   · It strips to a FIXED POINT — removing a tag can splice a new
            //     one out of the surrounding text — which is what CodeQL's
            //     js/incomplete-multi-character-sanitization is about. The pair
            //     of single-pass strips this replaces were carried over verbatim
            //     when this kernel moved out of chart-family.js, and CodeQL
            //     reported them as new because the file was.
            //   · It DECODES entities, and `label` is re-escaped by escAttr on
            //     the way out. Without the decode a lane authored `Ops & IT`
            //     arrives from markdown-it as `Ops &amp; IT`, gets escaped a
            //     second time, and the slide paints the literal `Ops &amp; IT`.
            //     It is also the lane-color map key, so the two spellings were
            //     two lanes.
            // The gate folds case, so the stamp folds it too: `AT-RISK` passed
            // this check and used to be stamped verbatim, which matched neither
            // `.kanban-card[data-s="at-risk"]` nor `.chart-status[data-s=…]` and
            // painted an untinted card. `data-s` carries the canonical word (as
            // gantt's does); the pill keeps the author's spelling as its text.
            if (statM && chartStatus(statM[2])) {
              status     = chartStatus(statM[2]);
              statusText = statM[2].trim();
              label  = plainText(statM[1]);
            } else {
              label = plainText(metaLine);
            }
          }
          cardBody = subItems[1] ? subItems[1].replace(/<\/?p>/g, '').trim() : '';
        }

        const laneColor = getLaneColor(label);
        const laneStyle = laneColor ? ` style="--lane-color:${laneColor}"` : '';
        const sAttr     = status ? ` data-s="${escAttr(status)}"` : '';
        // "S" is a word only to the eye, which reads it off a chip; the hidden
        // "size" makes it one to a screen reader too (`narrateKanban` says it).
        const sizeEl    = size  ? `<span class="kanban-size"><span class="chart-sr-only">size </span>${size}</span>` : '';
        const laneEl    = label
          ? `<span class="kanban-lane" style="--lane-color:${laneColor || 'var(--accent)'}">${escAttr(label)}</span>`
          : '';
        const statusEl  = status
          ? `<span class="chart-status" data-s="${escAttr(status)}">${statusText}</span>`
          : '';
        const titleEl   = `<div class="kanban-card-title"><span class="kanban-title-text">${cardTitle}</span>${sizeEl}</div>`;
        const metaEl    = (laneEl || statusEl) ? `<div class="kanban-card-meta">${laneEl}${statusEl}</div>` : '';
        const bodyEl    = cardBody ? `<div class="kanban-card-body">${cardBody}</div>` : '';

        // The card title leads `narrateKanban`'s card sentence, so it is the label
        // the Present Guide matches; `role="listitem"` inside the column's list.
        const hook = ` role="listitem" data-label="${escAttr(plainText(cardTitle))}"`;
        return {
          html: `<div class="kanban-card"${sAttr}${laneStyle}${hook}>${titleEl}${metaEl}${bodyEl}</div>`,
          title: plainText(cardTitle), sized: !!size, label, statusText: status ? plainText(statusText) : '', body: plainText(cardBody),
        };
      });
    }

    const doneAttr = isDone ? ' data-done' : '';
    // A column is a list item holding its own list of cards, so a screen reader
    // hears "Backlog, list, 2 items"; its header is the label the column sentence
    // leads with.
    return { open: `<div class="kanban-column"${doneAttr} role="listitem" data-label="${escAttr(plainText(colHeader))}">`, header: colHeader, cards };
  });
}

/** One lane's markup: its open tag, its name, its cards. */
function kanbanLaneHtml(lane) {
  return `${lane.open}<div class="kanban-column-header">${lane.header}</div>` +
    `<div class="kanban-cards" role="list">${lane.cards.map((c) => c.html).join('')}</div></div>`;
}

function buildKanbanBoard(ulInner) {
  return `<div class="kanban-board" role="list">${kanbanLanes(ulInner).map((l) => kanbanLaneHtml(l)).join('')}</div>`;
}

// ── ON A PAGE READ ON A PHONE: a board that fits stays one page ────────────────────────────────────────────────────
//
// The owner's call (2026-11-12): on a phone page the lanes stack (kanban.styles.css, by the room the slide has), and a
// board whose stacked lanes fit the page stays ONE page (`data-kanban-fits`, which lib/core/carousel.js `kanbanLaneSplit`
// reads and leaves whole). One that does not fit splits as it always has, a lane a page; packing lanes onto pages is
// #2988's measured split, not this file's. The check is made HERE, from the markup and the stored glyph widths
// (shared/text-measure.js), never from a render, so the same deck always splits the same way. The exception it makes to
// the one-element-per-page rule is recorded in engineering/decisions/2026-09-01-autosplit-splits-on-structure.md.
//
// THE ESTIMATE, in px of a 1080-wide page, calibrated in Chromium on kanban.gallery.md and
// examples/kanban-chart-redesign.md at mobile, 4:5 and square (within 0.5% of every measured board):
//   a card     — 16.6 of padding and border, and one row holding the title, its size code and its chips (a lane label
//                is its text and 15; a status pill its text and 105; 4 between two, all at the 11pt status role): the
//                row is as tall as the title's lines at 1.2 times its size, or the chips' 58.4, whichever is taller.
//                When the chips leave the title less than 40% of the card, they take a row of their own under it
//                (6.7 between). A body takes its own rows, at the title's line height (an over-estimate);
//   a lane     — its name band (80), then each card after the small step (`--sp-sm`); a `tinted` lane is a padded box
//                (kanban.styles.css), the small step above and below (measured: 674 for two lanes where `keyline` took 585);
//   the board  — the lanes, the medium step (`--sp-md`) between each two. Both steps follow the page's shape, measured
//                at mobile, story, 4:5 and square (`gap` below).
// The room is the chart box the kernel kinds use (shared/chart-phone.js `formBoxPx`), less 1% for the estimate's error.
const KB_PAGE = {
  laneHead: 80,
  cardPad: 16.6,
  lineHeight: 1.2,
  chipRow: 58.4,
  chipText: 36.78,
  chipLane: 15,
  chipStatus: 105,
  rowGap: 6.7,
  // [page width over height, `--sp-md` between lanes, `--sp-sm` before a card]: mobile, story, 4:5, square.
  gap: [[1080 / 2340, 46.37, 30.92], [1080 / 1920, 44.35, 29.57], [0.8, 39.49, 26.33], [1, 33.41, 22.28]],
  // The title's size: the deck body (4.35cqi on a tall page, 2.8cqi at square) floored at 11pt (36.78px).
  titleTall: 46.98,
  titleSquare: 36.78,
  fit: 0.99,
};

/** The two steps at `aspect`, interpolated between the measured shapes: `[between lanes, before a card]`. */
function kbGaps(aspect) {
  const pts = KB_PAGE.gap;
  if (aspect <= pts[0][0]) return [pts[0][1], pts[0][2]];
  for (let i = 1; i < pts.length; i++) {
    if (aspect <= pts[i][0]) {
      const t = (aspect - pts[i - 1][0]) / (pts[i][0] - pts[i - 1][0]);
      return [1, 2].map((j) => pts[i - 1][j] + (pts[i][j] - pts[i - 1][j]) * t);
    }
  }
  const last = pts[pts.length - 1];
  return [last[1], last[2]];
}

/** Each card's height in page px (with the gap before it), on a phone page of `aspect`. */
function kbCardHeights(lane, aspect, v) {
  const fs = (aspect >= 0.95 ? KB_PAGE.titleSquare : KB_PAGE.titleTall) * v;
  const gapSm = kbGaps(aspect)[1] * v;
  const width = 972 - 2 * gapSm;
  const chipFs = KB_PAGE.chipText * v;
  return lane.cards.map((c) => {
    const chips = [c.label ? textWidth(c.label, chipFs) + KB_PAGE.chipLane * v : 0, c.statusText ? textWidth(c.statusText, chipFs) + KB_PAGE.chipStatus * v : 0]
      .filter((w) => w > 0);
    // The chips take the row under the title, every card the same shape.
    const titleW = width - (c.sized ? fs * 1.6 : 0);
    const lines = wrapWords(c.title, titleW, fs, { weight: 400 }).lines.length || 1;
    const titleH = lines * fs * KB_PAGE.lineHeight;
    const row = chips.length ? titleH + KB_PAGE.rowGap + KB_PAGE.chipRow * v : titleH;
    const bodyLines = c.body ? wrapWords(c.body, width, fs, { weight: 400 }).lines.length : 0;
    return gapSm + KB_PAGE.cardPad + row + (bodyLines ? KB_PAGE.rowGap + bodyLines * fs * KB_PAGE.lineHeight : 0);
  });
}

/** True when the stacked lanes fit the room of a phone page: the board then stays one page. */
function kbFits(lanes, room, aspect, v, tinted = false) {
  const gapLg = kbGaps(aspect)[0] * v;
  const head = (KB_PAGE.laneHead + (tinted ? 2 * kbGaps(aspect)[1] : 0)) * v;
  const total = lanes.reduce((a, l) => a + head + kbCardHeights(l, aspect, v).reduce((x, y) => x + y, 0), 0) +
    gapLg * (lanes.length - 1);
  return total <= room;
}

function transformSection(html, ctx = {}) {
  const phone = ctx && !ctx.paneView && ctx.aspect > 0 && ctx.aspect <= 1;
  return spliceFirstList(html, (ext) => {
    if (!phone) return buildKanbanBoard(ext.inner);
    const v = ctx.venueScale || 1;
    const room = formBoxPx(html, ctx.aspect, 0, ctx.metaLines || 0, v) * KB_PAGE.fit;
    const lanes = kanbanLanes(ext.inner);
    const fits = kbFits(lanes, room, ctx.aspect, v, (ctx.classTokens || []).includes('tinted'));
    return `<div class="kanban-board" role="list"${fits ? ' data-kanban-fits' : ''}>${lanes.map((l) => kanbanLaneHtml(l)).join('')}</div>`;
  });
}

module.exports = { transformSection, buildKanbanBoard };
