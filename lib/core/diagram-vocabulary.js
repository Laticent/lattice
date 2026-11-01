/**
 * lib/core/diagram-vocabulary.js — the engine's DIAGRAM vocabulary, handed to a plugin through its ctx
 * (`ctx.vocabulary.diagram`; 2026-11-01-plugin-contract-hollywood.md §2, the `diagram-theme` row). Never imported by a plugin.
 *
 * Why it is the engine's and not Mermaid's: the palette-token → theme-variable map is a contract an engine gate
 * enforces (tools/check-ownership.js `diagramThemeTokens`), and the look/hand answers read the engine's own mode
 * registers. Both have use beyond the plugin, so by the note's rule 3 they stay shared; the plugin receives them.
 *
 * Its own module, holding only what a browser pass already bundled, so handing it to Mermaid's pass costs the
 * runtime bundle nothing.
 */
const { buildDiagramTheme, textValueTokens } = require('./mermaid-theme-map');
const { resolveDiagramLook, resolveDiagramHandType } = require('./diagram-look');

module.exports = Object.freeze({ buildDiagramTheme, textValueTokens, resolveDiagramLook, resolveDiagramHandType });
