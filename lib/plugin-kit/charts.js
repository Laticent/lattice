/**
 * lib/plugin-kit/charts.js — the plugin kit's chart helpers: the label-drop record a chart figure
 * carries, and the `ctx.utils` the chart family hands every chart kernel. They live with the
 * chart components (lib/components/chart/_chart-family/), which use them too; a plugin reaches
 * them only through here (engineering/decisions/2026-10-11-codebase-structure.md §5).
 */

const { collectLabelDrops, encodeLabelDrops } = require('../components/chart/_chart-family/label-drops');
const { escAttr, escHtml, plainText, spliceFirstList, stripTrailingPills, readsHandBody } = require('../components/chart/_chart-family/transform-utils');

module.exports = { collectLabelDrops, encodeLabelDrops, escAttr, escHtml, plainText, spliceFirstList, stripTrailingPills, readsHandBody };
