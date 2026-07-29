// Static, editor-intrinsic vocabularies for deck-grammar autocomplete.
//
// Pure and import-free. These are the closed token sets the editor itself
// defines (Marp slide directives, the fence languages it highlights, the
// Mermaid keyword grammar) — distinct from the build-time catalog/theme
// handoff. complete.js consumes them; editor.js consumes MERMAID_KEYWORDS to
// build its highlighter regexes, so the keyword list has ONE source of truth.

// Slide-scoped Marp directives authored as `<!-- _name: value -->`. `_class` is
// completed with its full grammar elsewhere (component names + modifiers); it's
// listed here too so the NAME completes before the colon is typed.
export const DIRECTIVE_NAMES = ['_class', '_paginate', '_header', '_footer', '_backgroundColor', '_color', '_focus', '_focusStyle', '_focusSteps'];

// Value vocabulary for `_focusStyle:` — the focus treatment styles. MUST mirror
// FOCUS_STYLES in lib/authoring/lint-core.js (asserted by the completion test,
// so a new style can't be lint-valid yet un-completable).
export const FOCUS_STYLE_VALUES = ['spotlight', 'blur', 'ring', 'list-fill', 'pop'];

// Axis keywords for `_focus:` / `_focusSteps:` (the ordinal that follows — `row
// 4`, `item 2-4` — isn't completable). MUST mirror the focus resolver's
// SUPPORTED_AXES (lib/transformers/focus.js), asserted by the completion test.
export const FOCUS_AXIS_VALUES = ['item', 'row', 'col', 'cell', 'line'];

// Value vocabulary for `_paginate:` (Marp accepts the booleans; `skip`/`hold`
// are Marp's pagination extensions). The other directives take free strings or
// colours — not completable.
export const PAGINATE_VALUES = ['true', 'false', 'skip', 'hold'];

// Value vocabulary for the deck-level `form:` front-matter toggle — the Form
// composition model. 'standard' = masthead band + bay + progress rail (the
// DEFAULT, so an absent `form:` key composes as standard); 'off' = disabled (the
// opt-out). Mirrors FORM_MODES in lib/integrations/markdown-it/plugins.js.
// (`minimal` retired 2026-07-03 — its "form, no rail" look is now the deck-wide
// `class: no-progress` chrome control.)
export const FORM_VALUES = ['off', 'standard'];


// Value vocabulary for the Lattice `split:` front-matter directive, which picks
// how the body divides into slides: `rule` (split on `---`, the default) or
// `headings` (split on each h1/h2). Mirrors lib/core/resolve-split.js SPLIT_NAMES.
export const SPLIT_VALUES = ['rule', 'headings'];

// Value vocabulary for the `size:` front-matter directive — the slide formats.
// The curated subset of the engine's `@size` registry (lib/_theme.css), one
// entry per format (aliases like 9:16 / reel omitted). MUST mirror SIZE_OPTIONS
// in docs/src/playground/deck-sizes.js (the deck-config picker) and resolve
// against the registry — both asserted by test/unit/playground/deck-sizes.test.js,
// so the picker, this autocomplete, and the engine can't drift apart.
export const SIZE_VALUES = ['hd', '4K', 'standard', 'square', 'portrait', 'story', 'mobile'];

// Fence info-strings worth completing: the Lattice-special focusable fences
// (`mermaid`, `chart`) plus the languages editor.js highlights, with the common
// short aliases (`js`/`ts`/`py`) so they resolve too. A practical completion
// set, not a strict mirror of editor.js's EAGER_LANGUAGES — a language missing
// here just isn't suggested, never broken.
export const FENCE_LANGS = [
	'mermaid',
	'chart',
	'javascript',
	'js',
	'typescript',
	'ts',
	'tsx',
	'python',
	'py',
	'sql',
	'json',
	'yaml',
	'css',
	'html',
	'bash',
];

// Mermaid keyword grammar, the single source of truth shared by the highlighter
// (editor.js builds its KW_DECLARE / KW_FLOW regexes from these) and the
// in-fence keyword completion (complete.js). `declare` = diagram/declaration
// openers (case-sensitive); `flow` = block/control keywords (case-insensitive).
export const MERMAID_KEYWORDS = {
	declare: [
		'action',
		'callback',
		'class',
		'classDef',
		'classDiagram',
		'click',
		'direction',
		'erDiagram',
		'flowchart',
		'gantt',
		'gitGraph',
		'graph',
		'journey',
		'link',
		'linkStyle',
		'pie',
		'requirementDiagram',
		'sequenceDiagram',
		'stateDiagram-v2',
		'stateDiagram',
		'style',
		'subgraph',
	],
	flow: [
		'activate',
		'alt',
		'and',
		'as',
		'autonumber',
		'deactivate',
		'else',
		'end',
		'loop',
		'opt',
		'par',
		'participant',
		'rect',
		'state',
		'note',
	],
};
