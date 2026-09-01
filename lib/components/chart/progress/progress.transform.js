/**
 * progress — labeled percentage bars. Chart-family member; kernel-as-module.
 *
 * The family's generic dispatcher (lib/components/chart/_chart-family/
 * chart-family.js) finds this file through the `kernel` block in
 * progress.manifest.json and calls `transformSection`; nothing central names
 * this chart. Parsing + markup live here, the chart-frame wrap stays in the
 * family. Three-renderer parity rides on the one kernel being shared by the
 * emulator, the owned engine and the runtime bundle.
 */

const { parseTopLevelLis } = require('../../../core/html-lists');
const { escAttr, stripTrailingPills, spliceFirstList } = require('../_chart-family/transform-utils');

function buildProgressBars(ulInner) {
  const items = parseTopLevelLis(ulInner);
  const rows = items.map(item => {
    const nestedIdx = item.search(/<ul[^>]*>/);
    const lead = nestedIdx >= 0 ? item.slice(0, nestedIdx) : item;
    let note = '';
    if (nestedIdx >= 0) {
      const nestedMatch = item.slice(nestedIdx).match(/<ul[^>]*>\s*<li[^>]*>([\s\S]*?)<\/li>\s*<\/ul>/);
      if (nestedMatch) note = nestedMatch[1].trim();
    }
    const { leadStripped, pills } = stripTrailingPills(lead.replace(/<\/?p>/g, '').trim());
    const pctRaw = pills[0] || '';
    const status = pills[1] || '';
    const pct = parseInt(pctRaw, 10) || 0;
    const labelText = leadStripped.trim();
    const statusAttr = status ? ` data-s="${escAttr(status)}"` : '';
    const statusEl = status
      ? `<span class="chart-status"${statusAttr}>${status}</span>`
      : '<span class="chart-status-empty"></span>';
    const noteEl = note ? `<div class="progress-note">${note}</div>` : '';
    return `<div class="progress-row">` +
      `<div class="progress-label">${labelText}</div>` +
      `<div class="progress-track"><div class="progress-fill"${statusAttr} style="--pct:${pct}"><span class="progress-pct">${pctRaw}</span></div></div>` +
      statusEl +
      noteEl +
      `</div>`;
  }).join('');
  return `<div class="progress-bars">${rows}</div>`;
}
function transformSection(html) {
  return spliceFirstList(html, (ext) => buildProgressBars(ext.inner));
}

module.exports = { transformSection, buildProgressBars };
