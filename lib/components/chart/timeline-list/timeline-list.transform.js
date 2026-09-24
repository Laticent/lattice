/**
 * timeline-list — a dated spine of milestones. Chart-family member;
 * kernel-as-module.
 *
 * Reached through the `kernel` block in timeline-list.manifest.json, like
 * every other chart: the family dispatches, this file parses the ordered list
 * and emits `.timeline-spine`, and the chart-frame wrap stays in the family.
 */

const { parseTopLevelLis, extractFirstList } = require('../../../core/html-lists');
const { escAttr, plainText, stripTrailingPills, spliceFirstList, chartStatus } = require('../_chart-family/transform-utils');

function buildTimelineSpine(olInner) {
  const items = parseTopLevelLis(olInner);
  const itemEls = items.map(item => {
    const nestedIdx = item.search(/<ul[^>]*>/);
    let lead = nestedIdx >= 0 ? item.slice(0, nestedIdx) : item;
    let body = '';
    if (nestedIdx >= 0) {
      // EVERY nested item, each read by the list walker. The lazy match this replaces ran from
      // the first `<li>` to the last `</li></ul>`, so a second bullet painted inside the body
      // as a stray `</li><li>` — broken markup, and a line the narrator could not account for.
      const sub = extractFirstList(item.slice(nestedIdx));
      if (sub) body = parseTopLevelLis(sub.inner).map((li) => li.replace(/<\/?p>/g, '').trim()).filter(Boolean).join('<br>');
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
      // Folded like every CHART_STATUS consumer: `AT-RISK` stamps `at-risk`.
      ? `<span class="chart-status" data-s="${escAttr(chartStatus(statusPill) || statusPill)}">${statusPill}</span>`
      : '';
    const bodyEl = body ? `<div class="timeline-body">${body}</div>` : '';
    // The date names the milestone — `narrateTimelineList` leads with it — so it is
    // the label the Present Guide matches; `role="listitem"` makes the spine a list.
    const hook = ` role="listitem"` + (datePill ? ` data-label="${escAttr(plainText(datePill))}"` : '');
    return `<div class="timeline-item"${hook}>` +
      `<div class="timeline-dot"></div>` +
      dateEl +
      `<div class="timeline-title">${title}</div>` +
      statusEl +
      bodyEl +
      `</div>`;
  }).join('');
  return `<div class="timeline-spine" role="list">${itemEls}</div>`;
}

function transformSection(html) {
  return spliceFirstList(html, (ext) => buildTimelineSpine(ext.inner));
}

module.exports = { transformSection, buildTimelineSpine };
