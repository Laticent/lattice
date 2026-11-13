// Static, editor-intrinsic vocabularies for deck-grammar autocomplete.
//
// Pure. The slide-directive names and the enum values of `_focusStyle` come from the
// shared vocabulary (lib/core/meta-keys.mjs, derived from the `meta` plugin's manifest), so a key
// added there is completable the day it lands; the rest are closed token sets the editor owns. These are the closed token sets the editor itself
// defines (Marp slide directives, the fence languages it highlights, the
// Mermaid keyword grammar) — distinct from the build-time catalog/theme
// handoff. complete.js consumes them; editor.js consumes MERMAID_KEYWORDS to
// build its highlighter regexes, so the keyword list has ONE source of truth.

// Slide-scoped Marp directives authored as `<!-- _name: value -->`. `_class` is
// completed with its full grammar elsewhere (component names + modifiers); it's
// listed here too so the NAME completes before the colon is typed.
import { COMPLETE_KEYS, enumValues, HOST_REGISTERS, kebab, REGISTERS } from '../../../lib/core/meta-keys.mjs';
import { META_COMMENTS } from '../../../lib/plugins/meta.generated.mjs';

export const DIRECTIVE_NAMES = COMPLETE_KEYS.map((k) => `_${k}`);

// The comment keys that are not directives: the note channels (`<!-- say: … -->`, `describe:`, `reader:`) and the pane
// structure (`panes:`, `pane:`), each with the first sentence of its manifest description. Offered beside the directive
// names after `<!-- `, so a speaker-note channel is one keystroke away. From the `meta` manifest, like DIRECTIVE_NAMES.
export const COMMENT_KEYS = Object.entries(META_COMMENTS).map(([name, c]) => ({
	name,
	kind: c.kind === 'channel' ? 'note channel' : c.kind,
	info: String(c.describe || '').split(/(?<=\.)\s/)[0],
}));

// The fields a slide RECORD offers after `<!-- {` (record note §4.2, step 3), each with a short detail: the typed
// class fields first, then the host's registers, the plugins' registers, the completable directive keys (kebab-case,
// as a record writes them), the note channels and the pane structure. One list, derived: a register added to a
// manifest is completable the day it lands.
export const RECORD_FIELDS = [
	...['layout', 'variant'].map((name) => ({ name, detail: 'class' })),
	...HOST_REGISTERS.map((r) => ({ name: r.key, detail: 'register' })),
	...REGISTERS.map((r) => ({ name: r.key, detail: `${r.plugin} register` })),
	...COMPLETE_KEYS.filter((k) => k !== 'hide').map((k) => ({ name: kebab(k), detail: k === 'class' ? 'class words' : 'field' })),
	...['note', 'reader', 'say', 'describe'].map((name) => ({ name, detail: 'note channel' })),
	...['pane', 'panes'].map((name) => ({ name, detail: 'pane' })),
	{ name: 'hide', detail: 'flag' },
	{ name: 'carry', detail: 'flag' },
];

// The closed value sets a record field takes: every host register's values, every plugin register's axis words, and
// the enum fields. `layout`, `variant` and `class` complete from the catalog instead (slide-context.js).
export const RECORD_VALUES = Object.freeze({
	...Object.fromEntries(HOST_REGISTERS.map((r) => [r.key, Object.keys(r.values)])),
	...Object.fromEntries(REGISTERS.map((r) => [r.key, r.axes.flatMap((a) => a.names)])),
	'focus-style': enumValues('focusStyle'),
});

// Value vocabulary for `_focusStyle:` — the focus treatment styles. MUST mirror
// FOCUS_STYLES in lib/authoring/lint-core.js (asserted by the completion test,
// so a new style can't be lint-valid yet un-completable).
export const FOCUS_STYLE_VALUES = enumValues('focusStyle');

// Axis keywords for `_focus:` / `_focusSteps:` (the ordinal that follows — `row
// 4`, `item 2-4` — isn't completable). MUST mirror the focus resolver's
// SUPPORTED_AXES (lib/transformers/focus.js), asserted by the completion test.
export const FOCUS_AXIS_VALUES = ['item', 'row', 'col', 'cell', 'line', 'mark', 'series'];

// Page numbers are not a slide directive: front matter `paginate:` sets the deck, and the
// `no-pagination` / `with-pagination` classes set one slide, so `_paginate:` is not offered.
// The other directives take free strings or colors — not completable.

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
export const SIZE_VALUES = ['hd', '4K', 'standard', 'mobile-landscape', 'square', 'portrait', 'story', 'mobile'];

// Fenced-block languages offered after ``` — ONE list, completed by context-sources.js `fenceLanguageSource` in both
// editors. The fences a plugin renders come from the plugin registry (lib/plugins/grammar.generated.mjs, built from each
// manifest's `contributes.fences`), so a plugin's fence completes the day it lands and a name no plugin renders is never
// offered: the old hand list offered `chart`, which the engine shows as plain code. A fence's aliases (deprecated
// `latticeplot`) are not keys of `fences`, so they are not offered. The registry carries every plugin's syntax rules,
// so it loads the first time a fence is opened, not at start-up (the route budget, docs/route-budget.json). Then the
// common code languages, which the code plugin highlights, with the short aliases (`js`, `ts`, `py`) so they resolve.
export const CODE_FENCE_LANGUAGES = [
	['javascript', 'JavaScript'],
	['js', 'JavaScript'],
	['typescript', 'TypeScript'],
	['ts', 'TypeScript'],
	['tsx', 'TypeScript JSX'],
	['python', 'Python'],
	['py', 'Python'],
	['sql', 'SQL'],
	['json', 'JSON'],
	['yaml', 'YAML'],
	['css', 'CSS'],
	['html', 'HTML'],
	['bash', 'Shell'],
].map(([lang, info]) => ({ lang, info }));

let fenceLanguages = null;
/** The plugin fences, then the code languages: `[{ lang, info }]`. Loads the plugin registry once. */
export function loadFenceLanguages() {
	fenceLanguages ??= import('../../../lib/plugins/grammar.generated.mjs').then(({ PLUGIN_GRAMMAR }) => [
		...PLUGIN_GRAMMAR.flatMap((g) => Object.keys(g.fences || {}).map((lang) => ({ lang, info: g.title }))),
		...CODE_FENCE_LANGUAGES,
	]);
	return fenceLanguages;
}

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
