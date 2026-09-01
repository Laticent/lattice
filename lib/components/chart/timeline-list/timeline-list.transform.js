/**
 * timeline-list — a dated spine of milestones. Chart-family member;
 * kernel-as-module.
 *
 * Reached through the `kernel` block in timeline-list.manifest.json, like
 * every other chart: the family dispatches, this file parses the ordered list
 * and emits `.timeline-spine`, and the chart-frame wrap stays in the family.
 */

const { parseTopLevelLis } = require('../../../core/html-lists');
const { escAttr, stripTrailingPills, spliceFirstList } = require('../_chart-family/transform-utils');

function buildTimelineSpine(olInner) {
  const items = parseTopLevelLis(olInner);
  const itemEls = items.map(item => {
    const nestedIdx = item.search(/<ul[^>]*>/);
    let lead = nestedIdx >= 0 ? item.slice(0, nestedIdx) : item;
    let body = '';
    if (nestedIdx >= 0) {
      const nestedMatch = item.slice(nestedIdx).match(/<ul[^>]*>\s*<li[^>]*>([\s\S]*?)<\/li>\s*<\/ul>/);
      if (nestedMatch) body = nestedMatch[1].trim();
    }
    lead = lead.replace(/<\/?p>/g, '').trim();
    const leadingMatch = lead.match(/^<code>([^<]+)<\/code>\s*/);
    const datePill = leadingMatch ? leadingMatch[1].trim() : '';
    if (leadingMatch) lead = lead.slice(leadingMatch[0].length);
    const { leadStripped, pills } = stripTrailingPills(lead);
    const statusPill = pills[0] || '';
    const title = leadStripped.trim();
    const dateEl = datePill
      ? `<div class="timeline-pill">${datePill}</div>`
      : '<div class="timeline-pill timeline-pill--empty"></div>';
    const statusEl = statusPill
      ? `<span class="chart-status" data-s="${escAttr(statusPill)}">${statusPill}</span>`
      : '';
    const bodyEl = body ? `<div class="timeline-body">${body}</div>` : '';
    return `<div class="timeline-item">` +
      `<div class="timeline-dot"></div>` +
      dateEl +
      `<div class="timeline-title">${title}</div>` +
      statusEl +
      bodyEl +
      `</div>`;
  }).join('');
  return `<div class="timeline-spine">${itemEls}</div>`;
}

function transformSection(html) {
  return spliceFirstList(html, (ext) => buildTimelineSpine(ext.inner));
}

module.exports = { transformSection, buildTimelineSpine };
