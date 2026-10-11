/**
 * lib/plugin-kit/charts.js — the plugin kit's chart helpers: the label-drop record a chart figure
 * carries, the pill pass's record stamp, and the `ctx.utils` the chart family hands every chart kernel. They live with the
 * chart components (lib/components/chart/_chart-family/), which use them too; a plugin reaches
 * them only through here (engineering/decisions/2026-10-11-codebase-structure.md §5).
 */

const { collectLabelDrops, encodeLabelDrops } = require('../components/chart/_chart-family/label-drops');
const { escAttr, escHtml, plainText, spliceFirstList, stripTrailingPills, readsHandBody } = require('../components/chart/_chart-family/transform-utils');
// The pill pass's record stamp, which the chart family's bridge reads and strips (lib/core/chart-rows.js).
const { bridgeRecordsHtml, unstamp, RECORD_ATTR } = require('../core/chart-rows');

module.exports = { collectLabelDrops, encodeLabelDrops, escAttr, escHtml, plainText, spliceFirstList, stripTrailingPills, readsHandBody, bridgeRecordsHtml, unstamp, RECORD_ATTR };
