/**
 * highlight.js language definition for Mermaid.
 *
 * Inspired by Prism's `prism-mermaid.js` (MIT) — adapted to the highlight.js
 * mode-tree API. Goal: produce reasonable token spans (.hljs-keyword,
 * .hljs-string, .hljs-comment, .hljs-operator, …) for every diagram type so
 * that when a `mermaid` fence either has not yet been runtime-rendered or
 * fails to parse, the source still reads as syntax-colored code under the
 * existing hljs theme rules in `themes/*.css`.
 *
 * Coverage targets: flowchart/graph, sequenceDiagram, classDiagram,
 * stateDiagram(-v2), erDiagram, journey, gantt, pie, gitGraph, mindmap,
 * timeline, kanban, quadrantChart, requirementDiagram, C4Context/Container/
 * Component/Deployment, architecture-beta, packet-beta, sankey-beta,
 * radar-beta, xychart-beta, block-beta, info.
 *
 * The grammar is intentionally permissive: we tag tokens that are safe to
 * tag in any diagram and avoid mode-stacks that depend on knowing which
 * diagram type a fence is. This trades some precision (e.g. `section` is
 * treated uniformly across gantt/journey/timeline) for grammar size.
 */

module.exports = function mermaidLanguage(hljs) {
  const DIAGRAM_TYPES = [
    'flowchart', 'flowchart-elk', 'graph',
    'sequenceDiagram',
    'classDiagram', 'classDiagram-v2',
    'stateDiagram', 'stateDiagram-v2',
    'erDiagram',
    'journey',
    'gantt',
    'pie',
    'gitGraph',
    'mindmap',
    'timeline',
    'kanban',
    'quadrantChart',
    'requirementDiagram',
    'C4Context', 'C4Container', 'C4Component', 'C4Deployment', 'C4Dynamic',
    'architecture-beta',
    'packet-beta',
    'sankey-beta',
    'radar-beta',
    'xychart-beta',
    'block-beta',
    'info',
  ];

  // Common keywords spanning multiple diagram types. False-positive risk is
  // low: these words rarely appear in node labels (and labels are usually
  // matched as strings before hitting keyword matching).
  const KEYWORDS = [
    // Direction
    'TB', 'TD', 'BT', 'LR', 'RL',
    // Containers
    'subgraph', 'end',
    // Sequence
    'participant', 'actor', 'autonumber', 'activate', 'deactivate',
    'note', 'Note', 'loop', 'alt', 'else', 'opt', 'par', 'and', 'rect',
    'critical', 'option', 'break', 'box',
    'over', 'left of', 'right of',
    // Class
    'class', 'classDef', 'click', 'callback', 'link', 'cssClass', 'style',
    'linkStyle', 'direction',
    // State
    'state', 'as',
    // Gantt / timeline / journey
    'section', 'title', 'dateFormat', 'axisFormat', 'tickInterval',
    'todayMarker', 'excludes', 'includes', 'weekday', 'inclusiveEndDates',
    'topAxis',
    // Pie / chart
    'showData',
    // Requirement
    'requirement', 'functionalRequirement', 'interfaceRequirement',
    'performanceRequirement', 'physicalRequirement', 'designConstraint',
    'element', 'satisfies', 'derives', 'verifies', 'refines', 'traces',
    'contains', 'copies',
    // Mindmap / kanban / architecture
    'root', 'service', 'group', 'junction',
    // Gitgraph
    'commit', 'branch', 'checkout', 'merge', 'cherry-pick',
    'order', 'tag', 'type',
    // Misc
    'accDescr', 'accTitle', 'config',
  ];

  const COMMENT = hljs.COMMENT('%%', '$');

  // Frontmatter --- ... --- at the very top of the diagram body.
  const FRONTMATTER = {
    className: 'meta',
    begin: /^---\s*$/,
    end: /^---\s*$/,
    contains: [
      { className: 'attr', begin: /[A-Za-z_][\w-]*(?=\s*:)/ },
      { className: 'string', begin: /"/, end: /"/ },
      { className: 'string', begin: /'/, end: /'/ },
    ],
  };

  // Init directive: %%{init: { ... }}%%
  const INIT_DIRECTIVE = {
    className: 'meta',
    begin: /%%\s*\{\s*init/, end: /%%/,
    contains: [
      { className: 'string', begin: /"/, end: /"/ },
      { className: 'string', begin: /'/, end: /'/ },
      { className: 'number', begin: /\b\d+(?:\.\d+)?\b/ },
    ],
  };

  const STRING = {
    className: 'string',
    variants: [
      { begin: /"/, end: /"/ },
      { begin: /'/, end: /'/ },
    ],
  };

  // Edge labels: |label|, |"label"|
  const EDGE_LABEL = {
    className: 'string',
    begin: /\|/, end: /\|/,
    relevance: 0,
  };

  // Arrows / connectors / link operators. Order matters — longest first.
  const ARROW = {
    className: 'operator',
    match: /(?:<-{1,3}>?|-{1,3}>|={1,3}>|-{1,3}|={1,3}|-\.+->?|<\.+->|-\.+-|o-+o|x-+x|<-+>|-{2,}|\.{2,}|-{1,2}[ox]|[ox]-{1,2}|::+|\|\|--o\{|\}o--\|\||\}o--o\{|\|\|--\|\||\|\|--o\||\|o--o\||\.{2}>|<\.{2}|<\|--|--\|>|--\*|--o|\*--|o--)/,
    relevance: 0,
  };

  // ER cardinality fragments not caught by ARROW (e.g. `||--o{`)
  const ER_CARDINALITY = {
    className: 'operator',
    match: /[|}{o]{2,}--?[|}{o]{0,2}/,
    relevance: 0,
  };

  // Numbers (gantt durations, weights, axis ranges)
  const NUMBER = {
    className: 'number',
    match: /\b\d+(?:\.\d+)?(?:%|d|h|m|s|ms|w)?\b/,
    relevance: 0,
  };

  // Diagram-type opener at the start of the body. Marked as `section` so it
  // visually pops (matches our existing hljs-section rule).
  const DIAGRAM_HEADER = {
    className: 'section',
    begin: '\\b(?:' + DIAGRAM_TYPES.map(t => t.replace(/-/g, '\\-')).join('|') + ')\\b',
    end: /$/,
    relevance: 10,
    contains: [
      { className: 'keyword', match: /\b(?:TB|TD|BT|LR|RL)\b/ },
      { className: 'punctuation', match: /[:]/ },
    ],
  };

  // Class / style assignment lines: `class A,B foo`, `classDef foo fill:#f00`
  const STYLE_DECL = {
    className: 'attr',
    match: /\b(?:fill|stroke|stroke-width|stroke-dasharray|color|font-size|font-family|opacity|rx|ry)\s*(?=:)/,
    relevance: 0,
  };

  // Hex color values (after `fill:` etc.) — use literal so they pick up
  // .hljs-literal styling (warm pink in our themes).
  const HEX_COLOR = {
    className: 'literal',
    match: /#[0-9A-Fa-f]{3,8}\b/,
    relevance: 0,
  };

  // Tags inside Mermaid labels: <br/>, <b>, etc.
  const HTML_TAG = {
    className: 'tag',
    begin: /<\/?[a-zA-Z][\w-]*\s*\/?>/,
    relevance: 0,
  };

  return {
    name: 'Mermaid',
    aliases: ['mmd'],
    case_insensitive: false,
    keywords: {
      keyword: KEYWORDS.join(' '),
      literal: 'true false null yes no',
    },
    contains: [
      FRONTMATTER,
      INIT_DIRECTIVE,
      COMMENT,
      DIAGRAM_HEADER,
      STRING,
      EDGE_LABEL,
      HTML_TAG,
      STYLE_DECL,
      HEX_COLOR,
      ER_CARDINALITY,
      ARROW,
      NUMBER,
    ],
  };
};
