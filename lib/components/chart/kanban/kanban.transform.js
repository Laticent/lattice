/**
 * kanban — a swimlane board of status cards. Chart-family member;
 * kernel-as-module.
 *
 * Pure HTML/CSS boxes rather than SVG (see the manifest's `render` nature),
 * so this kernel emits nested `.kanban-*` divs. The family dispatches here
 * through the `kernel` block in kanban.manifest.json.
 */

const { parseTopLevelLis, extractFirstList } = require('../../../core/html-lists');
const { escAttr, plainText, spliceFirstList, chartStatus } = require('../_chart-family/transform-utils');

// The size codes live in lib/core/kanban-sizes.js, shared with narration.
const { kanbanSize } = require('../../../core/kanban-sizes');
const KB_DONE_NAMES = ['done','completed','shipped','closed'];
// Lane colors ride the chart-family's own vivid catN spectrum (the same
// Apple-inspired hues pie/quadrant use), canvas-aware via --catN-ink — not
// the engine-wide --cN palette.
const LANE_COLOR_VARS = [
  'var(--chart-cat-1-ink)','var(--chart-cat-2-ink)','var(--chart-cat-3-ink)','var(--chart-cat-4-ink)',
  'var(--chart-cat-5-ink)','var(--chart-cat-6-ink)','var(--chart-cat-7-ink)','var(--chart-cat-8-ink)',
];

function buildKanbanBoard(ulInner) {
  const laneColorMap = {};
  let laneColorIdx = 0;
  const getLaneColor = (lane) => {
    if (!lane) return '';
    const key = lane.toLowerCase();
    if (!laneColorMap[key]) laneColorMap[key] = LANE_COLOR_VARS[laneColorIdx++ % LANE_COLOR_VARS.length];
    return laneColorMap[key];
  };

  const columns = parseTopLevelLis(ulInner);
  const columnsHtml = columns.map(col => {
    const colSub = extractFirstList(col);
    const colHeader = (colSub ? col.slice(0, colSub.start) : col)
      .replace(/<\/?p>/g, '').trim();
    const isDone = KB_DONE_NAMES.includes(colHeader.toLowerCase());

    let cardsHtml = '';
    if (colSub) {
      const cardItems = parseTopLevelLis(colSub.inner);
      cardsHtml = cardItems.map(cardContent => {
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
        return `<div class="kanban-card"${sAttr}${laneStyle}${hook}>${titleEl}${metaEl}${bodyEl}</div>`;
      }).join('');
    }

    const doneAttr = isDone ? ' data-done' : '';
    // A column is a list item holding its own list of cards, so a screen reader
    // hears "Backlog, list, 2 items"; its header is the label the column sentence
    // leads with.
    return `<div class="kanban-column"${doneAttr} role="listitem" data-label="${escAttr(plainText(colHeader))}">` +
      `<div class="kanban-column-header">${colHeader}</div>` +
      `<div class="kanban-cards" role="list">${cardsHtml}</div>` +
      `</div>`;
  }).join('');

  return `<div class="kanban-board" role="list">${columnsHtml}</div>`;
}

function transformSection(html) {
  return spliceFirstList(html, (ext) => buildKanbanBoard(ext.inner));
}

module.exports = { transformSection, buildKanbanBoard };
