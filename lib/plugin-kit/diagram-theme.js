/**
 * lib/plugin-kit/diagram-theme.js — the plugin kit's diagram look: which drawn look and hand a
 * slide's diagram takes, and the palette tokens assembled into a diagram library's theme. Safe in
 * a browser bundle: the live preview's hydrate step carries it. A plugin reaches these only through
 * here (engineering/decisions/2026-10-11-codebase-structure.md §5).
 */

const { resolveDiagramLook, resolveDiagramHandType } = require('../core/diagram-look');
const { buildDiagramTheme, textValueTokens } = require('../core/mermaid-theme-map');

module.exports = { resolveDiagramLook, resolveDiagramHandType, buildDiagramTheme, textValueTokens };
