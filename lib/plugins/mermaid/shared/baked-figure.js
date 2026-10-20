/**
 * lib/plugins/mermaid/shared/baked-figure.js — what a drawn Mermaid diagram carries once it is baked,
 * shared by every path that draws one (HARD RULE #1): the accessible-name floor, the sankey label
 * collapse and the export's drawing box. The `figure-baked` wrapper is in baked-figure-tag.js, kept
 * apart because the browser runtime bundles THIS file and a `--fluid` export inlines that bundle, so
 * a wrapper literal here reached every such file's text.
 *
 * THE NAME FLOOR is applied by the CLI bake (mermaid.bake.js `finishMermaidSvg`) and the browser pass
 * (mermaid.hydrate.js `renderDiagramJob`).
 *
 * Mermaid emits its root as `role="graphics-document document"` with NO name unless the author wrote
 * `accTitle:` / `accDescr:`, so an un-annotated diagram reaches a screen reader as an anonymous
 * graphics document. The floor labels it with the diagram's TYPE, read from the first meaningful line
 * of its source. It is a floor, not a description: `accTitle:` / `accDescr:` remain the right way to
 * say what a diagram MEANS, and Mermaid's own `<title>` / `aria-labelledby` is left alone wherever it
 * exists (semantic-html ADR §17.12).
 *
 * Only the CLI applied it until 2026-10-17, so the live preview and the Studio's exports shipped
 * every such diagram nameless while the CLI's named it
 * (engineering/decisions/2026-10-16-player-as-library-audit.md §11.9).
 *
 * Pure strings, no requires: the browser pass bundles it and the CLI requires it.
 */

// A human name for a Mermaid diagram's TYPE. Unknown keywords fall back to the generic "Diagram"
// rather than a wrong guess.
const MERMAID_KINDS = {
  graph: 'Flowchart', flowchart: 'Flowchart', sequencediagram: 'Sequence diagram',
  classdiagram: 'Class diagram', statediagram: 'State diagram', 'statediagram-v2': 'State diagram',
  erdiagram: 'Entity relationship diagram', journey: 'User journey diagram', gantt: 'Gantt chart',
  pie: 'Pie chart', quadrantchart: 'Quadrant chart', requirementdiagram: 'Requirement diagram',
  gitgraph: 'Git graph', mindmap: 'Mind map', timeline: 'Timeline', sankey: 'Sankey diagram',
  'sankey-beta': 'Sankey diagram', xychart: 'XY chart', 'xychart-beta': 'XY chart',
  block: 'Block diagram', 'block-beta': 'Block diagram', packet: 'Packet diagram',
  architecture: 'Architecture diagram', 'architecture-beta': 'Architecture diagram',
};

const escAttr = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

// The diagram's type, from the first meaningful line of its source: `%%{init}%%` directives,
// front matter and blank lines are skipped.
function mermaidKindLabel(definition) {
  const lines = String(definition || '').split('\n');
  let inFrontMatter = false;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    // Mermaid YAML FRONT MATTER is a `---` fenced block, and skipping only the fence
    // lines left the loop reading `title: …` from INSIDE it — which is not a diagram
    // keyword, so every front-mattered diagram fell through to the generic "Diagram".
    // 12 of the repo's own 100 mermaid blocks use front matter, including the baseline
    // gallery's first diagram, which is the artifact §17.12 originally cited as proof
    // this worked. Track the block and skip its BODY, not just its fences.
    if (line === '---') { inFrontMatter = !inFrontMatter; continue; }
    if (inFrontMatter) continue;
    if (!line || line.startsWith('%%')) continue;
    const word = (line.split(/[\s:;{(]/)[0] || '').toLowerCase();
    if (!word) continue;
    return MERMAID_KINDS[word] || 'Diagram';
  }
  return 'Diagram';
}

// The floor applied to an SVG string: `aria-label` on the root, only when the root has no name of its
// own and the diagram carries no `<title>`.
function labelDiagramSvg(svg, definition) {
  const text = String(svg);
  if (/\saria-label(?:ledby)?=/.test(text.slice(0, text.indexOf('>') + 1)) || /<title\b/.test(text)) return text;
  return text.replace(/^(\s*<svg\b)/, `$1 aria-label="${escAttr(mermaidKindLabel(definition))}"`);
}

// A SANKEY NODE'S LABEL ON ONE LINE. Mermaid (11.14) writes each sankey node's `<text>` as the name, a
// literal newline, and the outbound value. SVG renders that newline as a space, but the CLI's bake
// splices the svg into the deck source before markdown-it parses it, and markdown-it reads `\n\n` in
// it as a paragraph break: `<text>Wages<p>750</text>`, invalid SVG and run-together labels. So the
// CLI collapsed it (since #1385; decisions/2026-08-05-bake-before-render-ordering.md), and the browser
// pass, which never meets markdown-it, kept the newline: the same label in different bytes from the
// two hosts. Both collapse it now. Gated on sankey's `<g class="links"` marker so no other family's
// text is touched.
function collapseSankeyText(svg) {
  const text = String(svg);
  if (!text.includes('<g class="links"')) return text;
  return text.replace(/(<text\b[^>]*>)([\s\S]*?)(<\/text>)/g, (_m, open, inner, close) => `${open}${inner.replace(/\s*\n\s*/g, ' ').trim()}${close}`);
}

/**
 * THE WIDTH AN EXPORT DRAWS A DIAGRAM AT, in CSS px. Mermaid sizes several families from the box it
 * draws in (a Gantt spans it; an xychart's labels are measured inside an svg scaled to it). The CLI's
 * worker (render-worker.js) draws in its page's `#container`: Puppeteer's default 800 px viewport less
 * the body's 8 px margins, which every CLI PDF and player has used. Named here so the browser pass
 * draws an export render in the same box (mermaid.hydrate.js), and the worker states it rather than
 * inheriting it. The live preview draws in the slide and is not affected.
 */
const DIAGRAM_STAGE_WIDTH = 784;

/**
 * THE TEXT STYLES A BARE PAGE GIVES THE CLI WORKER'S `#container`, for the browser pass's export stage
 * (mermaid.hydrate.js `exportStage`), which writes its own box AFTER this so those declarations win.
 * `all: initial` resets every property but `direction` (the spec leaves it out of `all`), so that one is
 * named. One shorthand rather than a list of the inherited text properties: the list cost about 250 bytes
 * gzipped in the viewer runtime, which the engine's byte budget counts, and measured the same in Chromium.
 */
const STAGE_TEXT_RESET = 'all:initial;direction:ltr;display:block;';

module.exports = { MERMAID_KINDS, mermaidKindLabel, labelDiagramSvg, collapseSankeyText, DIAGRAM_STAGE_WIDTH, STAGE_TEXT_RESET };
