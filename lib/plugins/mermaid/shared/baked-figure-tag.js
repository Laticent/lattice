/**
 * lib/plugins/mermaid/shared/baked-figure-tag.js — the `figure-baked` wrapper (the manifest's `pdf` and
 * `player` surface), built by both paths that bake a figure into a file: the CLI bake
 * (mermaid.bake.js) and the Studio's Webpage export (docs/src/components/studio/export/deck-export.js).
 *
 * Not in baked-figure.js: the browser runtime bundles that file, a `--fluid` export inlines the
 * runtime, and this module's `class="mermaid-svg` literal would ride into every such file's text.
 * Pure strings, no requires.
 */

const escAttr = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

/**
 * THE `figure-baked` WRAPPER: `<div class="mermaid-svg" data-lattice-figure="mermaid">`, the shape the
 * CLI bake splices into the deck and the Studio's Webpage export builds from its live figure
 * (docs/src/components/studio/export/deck-export.js `bakeDeckSections`). The live shape is the
 * source `<pre>` plus a sibling `.mermaid` the pass draws into; a baked file needs neither.
 *
 * `pinned` stamps `data-author-theme="1"` for a fence that pins Mermaid's own theme
 * (init-directive.js `authorPinsTheme`), which tools/check-diagram-labels.js reads. `idx` stamps
 * `data-mmd-idx`, the figure's place in the shared kernel's walk (render-diagrams.js), which the
 * image-set export's cross-scheme re-bake keys on. Omit it to stamp it later with `stampFigureIndex`,
 * as the CLI does once its batch returns.
 */
function bakedFigureOpenTag({ name, pinned = false, extraClass = null, idx } = {}) {
  const cls = extraClass ? `mermaid-svg ${extraClass}` : 'mermaid-svg';
  const tag = `<div class="${cls}" data-lattice-figure="${escAttr(name)}"${pinned ? ' data-author-theme="1"' : ''}>`;
  return idx === undefined ? tag : stampFigureIndex(tag, idx);
}

// `data-mmd-idx` right after `class`, where the CLI has always written it.
function stampFigureIndex(html, idx) {
  return String(html).replace(/(<div class="mermaid-svg[^"]*")/, `$1 data-mmd-idx="${Number(idx)}"`);
}

module.exports = { bakedFigureOpenTag, stampFigureIndex };
