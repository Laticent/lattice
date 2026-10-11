/**
 * lib/plugin-kit/deck-walk.js — the plugin kit's source-side deck walk, for a plugin's BAKE (Node):
 * which slide and class each offset of the Markdown belongs to, which color band a slide's figure
 * draws in, and where the Mermaid fences are. Not for a browser bundle: the slide walk carries the
 * whole boundary parser. A plugin reaches these only through here
 * (engineering/decisions/2026-10-11-codebase-structure.md §5).
 */

const { resolveDiagramBand } = require('../core/diagram-band');
const { slideClassSpans, slideClassAt, slideIndexAt } = require('../core/slide-class-spans');
const { matchMermaidFences } = require('../core/mermaid-fences');

module.exports = { resolveDiagramBand, slideClassSpans, slideClassAt, slideIndexAt, matchMermaidFences };
