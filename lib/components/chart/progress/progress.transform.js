/**
 * progress — labeled percentage bars. Chart-family member; kernel-as-module.
 *
 * The family's generic dispatcher (lib/components/chart/_chart-family/
 * chart-family.dispatch.js) finds this file through the `kernel` block in
 * progress.manifest.json and calls `transformSection`; nothing central names
 * this chart. Parsing + markup live here, the chart-frame wrap stays in the
 * family. Three-renderer parity rides on the one kernel being shared by the
 * emulator, the owned engine and the runtime bundle.
 */

const { parseTopLevelLis, extractFirstList } = require('../../../core/html-lists');
const { parseValue } = require('../../../core/chart-values.js');
const { takeRecord, settleLead } = require('../../../core/chart-rows.js');
const { escAttr, plainText, stripTrailingPills, spliceFirstList, chartStatus } = require('../_chart-family/transform-utils');

function buildProgressBars(ulInner) {
  const items = parseTopLevelLis(ulInner);
  const rows = items.map(item => {
    const nestedIdx = item.search(/<ul[^>]*>/);
    const lead = nestedIdx >= 0 ? item.slice(0, nestedIdx) : item;
    let note = '';
    if (nestedIdx >= 0) {
      // EVERY nested item, each read by the list walker. The lazy match this replaces ran from
      // the first `<li>` to the last `</li></ul>`, so a second bullet painted inside the note
      // as a stray `</li><li>` — broken markup, and a line the narrator could not account for.
      const sub = extractFirstList(item.slice(nestedIdx));
      if (sub) note = parseTopLevelLis(sub.inner).map((li) => li.replace(/<\/?p>/g, '').trim()).filter(Boolean).join('<br>');
    }
    // A row written as one `{68%, at-risk, note="…"}` record is read through the row schema (chart-rows.js `takeRecord`), the same
    // reader the narrator uses; an old-form row reads its trailing spans as it always did (phase 4 deletes that branch).
    const record = takeRecord('progress', lead.replace(/<\/?p>/g, '').trim());
    const { leadStripped, pills } = record ? { leadStripped: record.lead.trim(), pills: [record.fields.value, record.fields.status] } : stripTrailingPills(settleLead('progress', lead).replace(/<\/?p>/g, '').trim());
    const pctRaw = pills[0] || '';
    const status = pills[1] || '';
    // The record's own note comes before the nested items, which the chart paints together in one note.
    if (record?.fields.note) note = [escAttr(record.fields.note), note].filter(Boolean).join('<br>');
    // The one number reader every chart shares (lib/core/chart-values.js, Segno phase 2).
    const pctN = parseValue(pctRaw);
    const pct = Number.isFinite(pctN) ? pctN : 0;
    const labelText = leadStripped.trim();
    // A vocabulary word stamps folded (`AT-RISK` → `at-risk`), so the case-
    // sensitive `[data-s]` paint arms match it; any other word stamps verbatim
    // and takes the info fallback, as it always has.
    const statusAttr = status ? ` data-s="${escAttr(chartStatus(status) || status)}"` : '';
    const statusEl = status
      ? `<span class="chart-status"${statusAttr}>${status}</span>`
      : '<span class="chart-status-empty"></span>';
    const noteEl = note ? `<div class="progress-note">${note}</div>` : '';
    // `role="listitem"` + `data-label`/`data-value`: a screen reader announces the
    // rows as a list ("5 items"), and the Present Guide points at the row the voice
    // is reading — `narrateProgress` leads each sentence with this label and says
    // this value (present-guide.ts `findMarkTarget`).
    const hook = ` role="listitem" data-label="${escAttr(plainText(labelText))}"` + (pctRaw ? ` data-value="${escAttr(pctRaw)}"` : '');
    return `<div class="progress-row"${hook}>` +
      `<div class="progress-label">${labelText}</div>` +
      // The number is the fill's SIBLING, not its child: it is drawn on the slide just past the bar's end, so the
      // box it sits in must be the track (no paint), never the fill (the status solid). `--pct` rides on the track,
      // where both read it.
      `<div class="progress-track" style="--pct:${pct}"><div class="progress-fill"${statusAttr}></div><span class="progress-pct">${pctRaw}</span></div>` +
      statusEl +
      noteEl +
      `</div>`;
  }).join('');
  return `<div class="progress-bars" role="list">${rows}</div>`;
}
function transformSection(html) {
  return spliceFirstList(html, (ext) => buildProgressBars(ext.inner));
}

module.exports = { transformSection, buildProgressBars };
