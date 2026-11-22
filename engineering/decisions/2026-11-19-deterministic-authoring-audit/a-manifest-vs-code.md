# Per-component manifest-vs-code sweep (80 manifests: 52 components + 28 chart kinds)

Method: every skeleton/sample/stressDoc.sample/variantDocs[*].sample linted (lib/authoring/lint lintText) and rendered (lib/engine render, jsdom). Slot selectors tested against both the plain markdown-it DOM and the rendered DOM. "CSS reacts to undeclared" is a raw dist/lattice.css compound-selector scan and includes cross-cutting families (sketch, tag-*, compact) — noise unless named in the report. Last column: lint result when the sample's h2 is removed or written as `#`; in both cases the engine builds no masthead and lint is silent except where noted.

| component | samples | lint err/warn on own samples | required slot unmet by own sample | source elements no slot declares | selector problems | variant problems | list-type swap (lint silent) | missing h2 / `#` for `##` |
|---|---|---|---|---|---|---|---|---|
| diagram | 2 | 0/0 | skeleton:mermaid[[data-lattice-figure], svg] sample:mermaid[[data-lattice-figure], svg] | top>pre | - | - | - | silent |
| title | 3 | 0/0 | - | - | - | - | - | n/a (h2 not required) |
| topic | 4 | 0/0 | - | - | - | - | - | silent |
| closing | 5 | 0/0 | - | top>ul ul>li | - | - | - | silent |
| divider | 5 | 0/0 | - | top>ul ul>li | - | CSS reacts to undeclared: progress-rail-bar | - | silent |
| math | 11 | 0/0 | variant:derivation:equation[p] | top>table top>h3 top>pre top>h1 | - | CSS reacts to undeclared: roadmap lane align-top no-table-reflow sketch | - | silent |
| cycle | 3 | 0/capacity-crowd | - | - | - | - | 1. kills ring SVG (3->0 svg nodes), lint silent | silent |
| list-steps | 16 | 0/0 | - | - | - | CSS reacts to undeclared: rule-full tag-foot tag-notch | - -> ul; CSS keyed on ol (UNVERIFIED px), lint silent | silent |
| authority-chain | 7 | 0/capacity-crowd | - | - | - | - | - | silent |
| regulatory-update | 7 | 0/capacity-crowd | - | top>h3 | - | CSS reacts to undeclared: regulatory- | - | silent |
| obligation-matrix | 7 | 0/0 | - | - | - | CSS reacts to undeclared: derivation roadmap lane sketch | - | silent |
| policy-recommendation | 7 | 0/0 | - | - | - | - | - | silent |
| citation-card | 7 | 0/0 | - | - | - | CSS reacts to undeclared: sketch | - | silent |
| statute-stack | 7 | 0/capacity-crowd | variant:lane:rows[ul > li] | top>table | - | CSS reacts to undeclared: derivation roadmap sketch | - | silent |
| code | 3 | 0/0 | - | - | - | - | - | silent |
| compare-code | 3 | 0/0 | - | top>p top>pre | left/right `p:first-of-type`/`nth-of-type(2)` mis-bind when the sample's own eyebrow p is present | CSS reacts to undeclared: code-cols | - | silent |
| wifi | 2 | 0/0 | - | - | - | - | - | silent |
| gift-card | 2 | 0/0 | - | - | - | - | - | n/a (h2 not required) |
| contact | 2 | 0/0 | - | - | - | - | - | n/a (h2 not required) |
| rows | 4 | 0/0 | - | top>h3 top>ul ul>li top>table top>blockquote blockquote>p top>p | - | - | - | silent |
| columns | 4 | 0/0 | - | top>h3 top>ul ul>li top>p top>blockquote blockquote>p top>table | - | - | - | silent |
| verdict-grid | 3 | 0/capacity-crowd | - | - | - | CSS reacts to undeclared: sketch | - | silent |
| matrix-2x2 | 3 | 0/0 | - | - | - | CSS reacts to undeclared: sketch | - | silent |
| split-compare | 3 | 0/0 | - | - | - | CSS reacts to undeclared: no-finish tag-foot tag-notch tag-inline sketch | - | flagged |
| compare-prose | 11 | 0/tag-alias | - | - | - | banner-tag (lint: retired alias); CSS reacts to undeclared: tag-foot tag-notch tag-inline sketch | - | silent |
| decision | 4 | 0/tag-alias | - | - | - | banner-tag (lint: retired alias of tag-band); CSS reacts to undeclared: vertical tag-foot tag-notch tag-inline sketch | - | silent |
| redline | 7 | 0/0 | - | - | - | CSS reacts to undeclared: sketch | - | silent |
| table | 3 | 0/capacity-crowd | - | - | - | - | - | silent |
| pricing | 5 | 0/0 | - | - | - | CSS reacts to undeclared: sketch | - | silent |
| actors | 3 | 0/capacity-crowd | - | - | - | CSS reacts to undeclared: sketch | - | silent |
| agenda | 11 | 0/0 | - | - | - | CSS reacts to undeclared: sketch | - -> plain ul; CSS has 0 ul selectors, lint silent | silent |
| checklist | 3 | 0/capacity-crowd | - | - | - | CSS reacts to undeclared: sketch | - | silent |
| q-and-a | 8 | 0/0 | - | - | - | CSS reacts to undeclared: compact | - | n/a (h2 not required) |
| cards-stack | 5 | 0/0 | - | - | - | numbered (class inert; ol source does it); CSS reacts to undeclared: tag-foot tag-notch tag-inline sketch | - | silent |
| glossary | 3 | 0/0 | - | - | - | CSS reacts to undeclared: derivation roadmap lane no-table-reflow sketch | - | silent |
| logo-wall | 4 | 0/0 | - | - | - | - | - | n/a (h2 not required) |
| list | 9 | 0/0 | - | - | - | numbered/lettered/roman/bullet only act with takeaway/principles (dependency undeclared); CSS reacts to undeclared: sketch | - | silent |
| inventory | 6 | 0/0 | - | - | - | - | - | silent |
| team-profile | 7 | 0/0 | - | - | - | - | - | n/a (h2 not required) |
| list-tabular | 17 | 0/0 | - | - | - | CSS reacts to undeclared: compact sketch | - -> ul; CSS keyed on ol (UNVERIFIED px), lint silent | silent |
| cards-grid | 6 | 0/0 | - | - | - | numbered (class inert; ol source does it); CSS reacts to undeclared: cards-grid-inner tag-foot tag-notch tag-inline sketch | - | silent |
| scene | 8 | 0/0 | - | top>pre | - | - | - | n/a (h2 not required) |
| image | 27 | 0/0 | - | - | - | CSS reacts to undeclared: sketch full contain | - | n/a (h2 not required) |
| collage | 8 | 0/0 | - | - | - | - | - | n/a (h2 not required) |
| video | 5 | 0/0 | - | top>p | - | - | - | n/a (h2 not required) |
| stats | 3 | 0/capacity-crowd | - | - | - | CSS reacts to undeclared: derivation theorem compare canvas matrix | - -> ul; CSS keyed on ol (UNVERIFIED px), lint silent | silent |
| kpi | 8 | 0/0 | - | - | - | CSS reacts to undeclared: briefing | - -> ul; CSS keyed on ol (UNVERIFIED px), lint silent | silent |
| content | 3 | 0/0 | skeleton:body[section > p, section > ul] sample:body[section > p, section > ul] stress:body[section > p, section > ul] | - | body `section > p` cannot match (.cell-stage wraps body); ol styled but undeclared | CSS reacts to undeclared: sketch | - | silent |
| premise | 3 | 0/capacity-scale,capacity-crowd | - | - | - | - | - -> ul; CSS keyed on ol (UNVERIFIED px), lint silent | silent |
| quote | 4 | 0/0 | - | top>p | attribution `section > p:last-child` cannot match; CSS styles EVERY stage p as attribution | CSS reacts to undeclared: sketch | - | n/a (h2 not required) |
| big-number | 3 | 0/0 | - | - | - | - | - | n/a (h2 not required) |
| split-panel | 19 | 0/0 | variant:pullquote:heading[h2] | top>h3 | - | CSS reacts to undeclared: no-finish sketch no-heading-rule rule-accent | - | flagged |
| slope | 5 | 0/0 | - | - | - | - | - | silent |
| timeline-list | 3 | 0/0 | - | top>p | - | - | - | silent |
| flowchart | 7 | 0/0 | - | - | - | - | - | silent |
| gantt | 3 | 0/0 | - | top>p | - | - | - | silent |
| funnel | 3 | 0/0 | - | - | - | - | - | silent |
| histogram | 3 | 0/0 | - | - | - | - | - | silent |
| stacked-bar | 5 | 0/0 | - | - | - | - | - | silent |
| scatter | 5 | 0/0 | - | top>p | - | - | - | silent |
| bar | 6 | 0/0 | - | top>p | - | - | - | silent |
| risk-matrix | 3 | 0/0 | - | top>p | - | - | - | silent |
| hub-spoke | 8 | 0/0 | - | top>p | - | - | - | silent |
| progress | 3 | 0/0 | - | - | - | - | - | silent |
| roadmap | 7 | 0/0 | - | top>p | - | CSS reacts to undeclared: derivation lane sketch | - | silent |
| journey | 7 | 0/0 | - | - | - | CSS reacts to undeclared: journey-board | 1. -> no chart, raw {who=…} pills shown, lint silent | silent |
| tower | 3 | 0/0 | - | top>p | - | - | - | silent |
| bullet | 5 | 0/0 | - | - | - | CSS reacts to undeclared: principles | - | silent |
| map | 8 | 0/map-highlight-implied | - | - | - | - | - | silent |
| quadrant | 9 | 0/0 | - | top>p | - | CSS reacts to undeclared: radar | - | silent |
| heatmap | 4 | 0/0 | - | - | - | CSS reacts to undeclared: journey curve swimlane weighted | - | silent |
| waterfall | 5 | 0/0 | - | top>p | - | - | - | silent |
| kanban | 5 | 0/capacity-crowd | - | top>p | - | CSS reacts to undeclared: marks-pigment marks-etch marks-tone | - | silent |
| piechart | 4 | 0/0 | - | top>p | - | - | - | silent |
| ep-curve | 3 | 0/0 | - | - | - | - | - | silent |
| line | 6 | 0/0 | - | - | - | - | - | silent |
| radar | 9 | 0/0 | - | - | - | - | - | silent |
| word-cloud | 7 | 0/0 | - | - | - | - | - | silent |
| state-chart | 9 | 0/0 | - | top>p | 3 selectors are prose, not CSS | CSS reacts to undeclared: horizontal canvas | - | silent |
| matrix-grid | 3 | 0/0 | - | - | - | CSS reacts to undeclared: derivation roadmap lane sketch | - | silent |
