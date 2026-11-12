/**
 * chart-text-roles.js — every text a chart prints, by class, and the ROLE it plays on the phone ladder
 * (chart-roles.js). Read by chart-family.styles.css § THE PHONE LADDER (one style per role, generated from this map)
 * and by test/unit/plugins/chart-roles.test.js, which holds the two equal. Source: the role audit of all 28 kinds,
 * engineering/decisions/2026-11-03-responsive-tables.md § 32. `data` is the word cloud's own case (its size is the data);
 * `item` is an HTML kind's running entry, set at the deck's body size.
 */

const CHART_TEXT_ROLES = Object.freeze({
  "bar": {
    "cart-cat": "category",
    "cart-value": "value",
    "chart-key-label": "key",
    "cart-tick": "tick"
  },
  "bullet": {
    "bullet-plan": "note",
    "cart-value": "value",
    "cart-cat": "category",
    "cart-tick": "tick"
  },
  "ep-curve": {
    "cart-tick": "tick",
    "cart-series": "direct",
    "cart-axis-title": "title",
    "cart-value": "value"
  },
  "flowchart": {
    "fc-edge-label": "note",
    "fc-name": "direct",
    "fc-key-label": "key",
    "graph-callout": "callout",
    "fc-group-title": "region"
  },
  "funnel": {
    "funnel-label": "category",
    "funnel-value": "value",
    "funnel-conv": "note"
  },
  "gantt": {
    "gantt-tick": "tick",
    "gantt-lane-label": "category",
    "gantt-bar-label": "direct",
    "gantt-mlabel": "direct",
    "gantt-legend-label": "key"
  },
  "heatmap": {
    "heatmap-col-label": "category",
    "cart-cat": "category",
    "heatmap-value": "value",
    "chart-key-label": "key"
  },
  "histogram": {
    "cart-value": "value",
    "cart-tick": "tick",
    "cart-axis-title": "title"
  },
  "hub-spoke": {
    "hub-spoke-hub-name": "direct",
    "hub-spoke-name": "direct",
    "hub-spoke-status": "status",
    "hub-spoke-hub-value": "value",
    "hub-spoke-value": "value",
    "chart-key-label": "key"
  },
  "journey": {
    "journey-desc": "item",
    "journey-vstage-name": "heading",
    "journey-actor-dot": "glyph",
    "journey-task-label": "item",
    "journey-actor-name": "key",
    "journey-mood-key": "title",
    "journey-mood-key-label": "tick"
  },
  "kanban": {
    "kanban-column-header": "heading",
    "kanban-title-text": "item",
    "chart-status": "status",
    "kanban-lane": "status",
    "kanban-size": "glyph"
  },
  "line": {
    "cart-tick": "tick",
    "cart-cat": "category",
    "cart-series": "direct",
    "cart-value": "value"
  },
  "map": {
    "chart-key-label": "key",
    "chart-key-value": "key",
    "chart-key-head": "heading"
  },
  "matrix-grid": {
    "matrix-grid-key-label": "key",
    "th": "category",
    "td": "category",
    "cell": "status"
  },
  "piechart": {
    "chart-key-label": "key",
    "chart-key-value": "key"
  },
  "progress": {
    "progress-label": "item",
    "progress-pct": "value",
    "chart-status": "status"
  },
  "quadrant": {
    "quadrant-axis-name": "title",
    "quadrant-tick": "tick",
    "quadrant-label": "region",
    "quadrant-dot-label": "direct",
    "quadrant-bubble-value": "value",
    "quadrant-bubble-label": "direct",
    "quadrant-cohort-label": "region",
    "chart-key-label": "key",
    "chart-key-value": "key",
    "quadrant-target-badge": "note"
  },
  "radar": {
    "radar-axis-label": "category",
    "radar-tick": "tick",
    "chart-key-label": "key",
    "radar-sector-label": "region",
    "radar-mini-label": "heading"
  },
  "risk-matrix": {
    "risk-tick": "category",
    "risk-axis": "title",
    "risk-number": "glyph",
    "risk-key-number": "glyph",
    "risk-key-label": "key"
  },
  "roadmap": {
    "horizon-eyebrow": "title",
    "horizon-title": "heading",
    "lat-pill": "status",
    "row-text": "item",
    "roadmap-legend-label": "key",
    "row-label": "category"
  },
  "scatter": {
    "cart-tick": "tick",
    "cart-axis-title": "title",
    "cart-series": "direct",
    "scatter-size-value": "note"
  },
  "slope": {
    "cart-axis-title": "category",
    "cart-series": "direct",
    "cart-value": "value",
    "cart-tick": "tick",
    "cart-cat": "category"
  },
  "stacked-bar": {
    "cart-tick": "tick",
    "cart-cat": "category",
    "cart-value": "value",
    "cart-axis-title": "title",
    "cart-series": "direct",
    "chart-key-head": "heading",
    "chart-key-label": "key",
    "chart-key-value": "key"
  },
  "state-chart": {
    "state-edge-label": "note",
    "state-index-t": "glyph",
    "state-label-t": "direct",
    "fc-key-label": "key",
    "graph-callout": "callout",
    "state-label": "direct",
    "state-index": "glyph",
    "state-chip-event": "status",
    "state-chip-to": "glyph"
  },
  "timeline-list": {
    "timeline-pill": "status",
    "timeline-title": "heading",
    "timeline-body": "item",
    "chart-status": "status"
  },
  "tower": {
    "tower-retained": "note",
    "tower-name": "direct",
    "tower-note": "note",
    "tower-share-value": "value",
    "tower-open-value": "value",
    "tower-edge": "tick",
    "chart-key-label": "key"
  },
  "waterfall": {
    "waterfall-total-value": "value",
    "waterfall-delta": "value",
    "cart-tick": "tick",
    "cart-cat": "category"
  },
  "word-cloud": {
    "wc-word": "data",
    "wc-key-label": "key",
    "wc-key-edge": "key",
    "wc-key-a": "data"
  },
  "_shared": {
    "legend-text": "callout",
    "chart-key-label": "key",
    "chart-key-value": "key",
    "chart-key-head": "heading"
  }
});

module.exports = { CHART_TEXT_ROLES };
