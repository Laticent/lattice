// The slide-context completion sources BOTH editors run: the Studio's deck editor
// (docs/src/components/studio/Editor.tsx, through editor-complete.ts `studioCompletionSources`)
// and the Playground's (complete.js `latticeAutocomplete`). One list, so a source added for
// one editor reaches the other; docs/src/components/studio/editor-complete.test.ts asks both assemblies the same
// questions and pins that they answer alike.
// (engineering/decisions/2026-11-13-studio-autocomplete-audit.md, slice 1.)
//
//   • directive names    — `<!-- _hea…` → `_header`, `_focus`, …, and the note channels and pane keys (`say:`, `panes:`)
//   • directive values   — `<!-- _paginate: ` → its register's words (the deck's register lists, passed in)
//   • `_focusStyle:`     — its enum values
//   • `_focus:` axis     — narrowed by the slide's layout (`focusAxes`)
//   • nested `backdrop:` — its axis keys
//   • mermaid            — keywords inside a ```mermaid fence
//   • flowchart          — on a `flowchart` slide: arrow forms after a name, the chart's own names after an arrow,
//                          and the span words (outline, color, status, line) inside a backtick; the grammar kernel
//                          (lib/core/flowchart-grammar.js) loads on first use and supplies every word
//   • math               — TeX commands after `\` inside `$…$`, `$$…$$` or a ```math fence (tex-commands.js)
//   • skeleton           — a one-shot slot scaffold on an empty classed slide body
//   • insert list        — Ctrl-Space on a blank body line: a layout directive, a record, a note, a heading, a list,
//                          a fence, a new slide (never while typing: a blank line stays a blank line)
//   • data sources       — literal body values per component (map regions), passed in,
//                          so the Studio can load them lazily (the basemaps are ~100 KB)
//
// Each source returns null outside its own context, so they never compete with each
// other or with an editor's own sources.

import { insertCompletionText, pickedCompletion, startCompletion } from '@codemirror/autocomplete';
import { KNOWN_KEYS } from '../../../lib/core/meta-keys.mjs';
import { COMMENT_KEYS, DIRECTIVE_NAMES, FOCUS_AXIS_VALUES, FOCUS_STYLE_VALUES, MERMAID_KEYWORDS } from './grammar-vocab.js';
import {
	backdropAxisPosition,
	blankBodyPartial,
	directiveNameAt,
	focusAxisPosition,
	focusStyleValuePosition,
	identifierBefore,
	inFencedLang,
	inFrontMatter,
	skeletonBody,
	slideBodyEmpty,
	slideClassAt,
} from './slide-context.js';

const TOKEN = /^[\w-]*$/;
const DIRECTIVE_TOKEN = /^_?[\w-]*$/;
const DIRECTIVE_OPTIONS = [
	...DIRECTIVE_NAMES.map((d) => ({ label: d, type: 'keyword', detail: 'directive' })),
	// `<!-- s` → `say: `: the channel writes its colon and space, so the author types the line straight away.
	...COMMENT_KEYS.map((k) => ({ label: k.name, type: 'keyword', detail: k.kind, info: k.info, apply: `${k.name}: ` })),
];
const FOCUS_STYLE_OPTIONS = FOCUS_STYLE_VALUES.map((v) => ({ label: v, type: 'constant', detail: 'focus style' }));

// Mermaid keyword options (declaration openers + flow/block keywords), the
// in-fence completion vocabulary. CodeMirror prefix-filters against the typed
// word, so a node id that matches no keyword shows nothing — low noise.
const MERMAID_OPTIONS = [...MERMAID_KEYWORDS.declare, ...MERMAID_KEYWORDS.flow].map((k) => ({
	label: k,
	type: 'keyword',
	detail: 'mermaid',
}));

// Completes Mermaid keywords inside a ```mermaid fence — the diagram component's
// authoring surface. Walks up to confirm the enclosing fence is mermaid.
function mermaidSource(context) {
	const doc = context.state.doc;
	const line = doc.lineAt(context.pos);
	if (inFencedLang((n) => doc.line(n).text, line.number, ['mermaid']) !== 'mermaid') return null;
	const before = context.state.sliceDoc(line.from, context.pos);
	const spot = identifierBefore(before);
	if (!spot) return null;
	if (!spot.typed && !context.explicit) return null;
	return { from: line.from + spot.from, options: MERMAID_OPTIONS, validFor: /^[\w-]*$/ };
}

// A line-local source: `detect(before)` returns `{ from, typed } | null`,
// `options` is the static list. Shapes the result with the shared restraint
// (quiet on an empty position unless Ctrl-Space) and offset mapping.
export function lineLocalSource(detect, options, validFor = TOKEN) {
	const opts = options;
	return (context) => {
		const line = context.state.doc.lineAt(context.pos);
		const before = context.state.sliceDoc(line.from, context.pos);
		const spot = detect(before);
		if (!spot) return null;
		if (!spot.typed && !context.explicit) return null;
		return { from: line.from + spot.from, options: opts, validFor };
	};
}

// Completes the axes of the nested `backdrop:` front-matter map. Offers the SHIPPED
// axes (`strength`, `clearance`); `spotlight` joins when that slice lands.
// Gated on the enclosing block header actually being `backdrop:` (scans upward
// for the nearest less-indented line) so it never fires under an unrelated map.
function backdropAxisSource() {
	const options = [
		{ label: 'strength', type: 'property', detail: 'backdrop', info: 'Dim the whole finish (0–1; 1 = full)' },
		{ label: 'clearance', type: 'property', detail: 'backdrop', info: 'Recede the finish behind the content box (on / off)' },
	];
	return (context) => {
		const doc = context.state.doc;
		const line = doc.lineAt(context.pos);
		if (!inFrontMatter((n) => doc.line(n).text, line.number)) return null;
		const before = context.state.sliceDoc(line.from, context.pos);
		const spot = backdropAxisPosition(before);
		if (!spot) return null;
		// Confirm we're inside a `backdrop:` map: the nearest non-blank line above
		// with LESS indentation must be exactly `backdrop:`.
		let header = null;
		for (let n = line.number - 1; n >= 2; n--) {
			const t = doc.line(n).text;
			if (!t.trim()) continue;
			if (t.match(/^(\s*)/)[1].length < spot.indent) { header = t.trim(); break; }
		}
		if (header !== 'backdrop:') return null;
		if (!spot.typed && !context.explicit) return null;
		return { from: line.from + spot.from, options, validFor: TOKEN };
	};
}

// Offers a one-shot slot skeleton on the empty body of a classed slide — the
// correct nesting/slot shape, plain text (no snippet fields: skeletons contain
// literal `$`/`{` that snippet templates would mis-parse). Inert once the slide
// has any content, so it never clobbers authored body.
function skeletonSource(catalog) {
	if (!catalog?.length) return () => null;
	const byName = new Map(catalog.map((c) => [c.name, c]));
	return (context) => {
		const doc = context.state.doc;
		const line = doc.lineAt(context.pos);
		const info = slideClassAt((n) => doc.line(n).text, line.number);
		if (!info || line.number <= info.directiveLine) return null; // on/above the directive
		const comp = byName.get(info.name);
		if (!comp?.skeleton) return null;
		if (!slideBodyEmpty((n) => doc.line(n).text, doc.lines, info.directiveLine, line.number)) return null;

		const before = context.state.sliceDoc(line.from, context.pos);
		const spot = blankBodyPartial(before);
		if (!spot) return null;
		if (!spot.typed && !context.explicit) return null;
		const body = skeletonBody(comp.skeleton);
		if (!body) return null;

		const option = {
			label: 'skeleton',
			type: 'text',
			detail: `${info.name} slots`,
			boost: 80,
			apply: (view, _completion, from, to) => {
				view.dispatch({ changes: { from, to, insert: body }, selection: { anchor: from } });
			},
		};
		return { from: line.from + spot.from, options: [option], validFor: TOKEN };
	};
}

// Completes the AXIS keyword in a `_focus:` / `_focusSteps:` directive, scoped
// to the active slide's layout: a layout's manifest `focusAxes` (carried in the
// catalog) narrows the offered axes — `table` → row/col/cell, a card
// grid → item, `code` → line. A layout that declares none (or an unclassed
// slide) falls back to the full axis set, so focus still completes everywhere.
function focusAxisSource(catalog) {
	const byName = catalog ? new Map(catalog.map((c) => [c.name, c])) : null;
	return (context) => {
		const doc = context.state.doc;
		const line = doc.lineAt(context.pos);
		const before = context.state.sliceDoc(line.from, context.pos);
		const spot = focusAxisPosition(before);
		if (!spot) return null;
		if (!spot.typed && !context.explicit) return null;
		let axes = FOCUS_AXIS_VALUES;
		if (byName) {
			const info = slideClassAt((n) => doc.line(n).text, line.number);
			const comp = info && byName.get(info.name);
			if (comp && Array.isArray(comp.focusAxes) && comp.focusAxes.length) axes = comp.focusAxes;
		}
		const options = axes.map((v) => ({ label: v, type: 'keyword', detail: 'focus axis' }));
		return { from: line.from + spot.from, options, validFor: TOKEN };
	};
}

// The value of a slide directive that is also a front-matter register (`<!-- _paginate: fa|`), from the same value
// lists the front-matter completion reads (lib/front-matter-values.ts `registerValueLists`), so a slide's directive
// and the deck's key offer the same words. Only a key the engine reads as a slide directive (meta-keys.mjs KNOWN_KEYS):
// any other `<!-- key: … -->` is a speaker note, so offering words there would mislead. `class` has its own positional
// grammar, and the focus keys theirs.
const OWN_VALUE_GRAMMAR = new Set(['class', 'focus', 'focusSteps', 'focusStyle']);
function directiveValueSource(registers) {
	const options = Object.fromEntries(Object.entries(registers || {}).map(([key, words]) => [key, words.map((w) => ({ label: w, type: 'constant', detail: key }))]));
	return (context) => {
		const line = context.state.doc.lineAt(context.pos);
		const before = context.state.sliceDoc(line.from, context.pos);
		const m = /^\s*<!--\s*_?([A-Za-z][\w-]*)[ \t]*:[ \t]*([\w-]*)$/.exec(before);
		if (!m || OWN_VALUE_GRAMMAR.has(m[1]) || !KNOWN_KEYS.has(m[1]) || !Object.hasOwn(options, m[1])) return null;
		if (!m[2] && !context.explicit) return null;
		return { from: context.pos - m[2].length, options: options[m[1]], validFor: TOKEN };
	};
}

// What Ctrl-Space offers on a blank line of a slide body: the things an author starts a line with. Each writes its text
// with the caret where the author types next (`at`, an offset into `text`; the end when absent), and the ones whose
// next word completes (`opensMenu`) open that menu at once: a layout's names, a record's fields, a fence's languages.
const INSERTS = [
	{ label: '<!-- _class: -->', detail: 'layout for this slide', text: '<!-- _class:  -->', at: 13, opensMenu: true },
	{ label: '<!-- { } -->', detail: 'slide record', text: '<!-- {} -->', at: 6, opensMenu: true },
	{ label: '<!-- say: -->', detail: 'what the slide says aloud', text: '<!-- say:  -->', at: 10 },
	{ label: '<!-- -->', detail: 'speaker note', text: '<!--  -->', at: 5 },
	{ label: '#', detail: 'heading', text: '# ' },
	{ label: '-', detail: 'list item', text: '- ' },
	{ label: '```', detail: 'fenced block', text: '```\n\n```', at: 3, opensMenu: true },
	{ label: '---', detail: 'new slide', text: '---\n\n' },
];

/**
 * The info string of the fenced block line `lineNo` (1-based) sits inside, `''` for a fence with none, or null when it
 * is outside every fence. Follows CommonMark's rules: a fence is three or more backticks or tildes indented at most
 * three spaces, and only a fence of the same character, at least as long and with no info string, closes it. So a
 * ```` ```` ```` block holding a ```` ``` ```` sample stays open, and a `~~~` block ignores backticks. Exported for a test.
 */
export function fenceAround(getLine, lineNo) {
	let open = null;
	for (let n = 1; n < lineNo; n++) open = stepFence(open, getLine(n));
	return open ? open.info : null;
}

/** One line of the fence walk: the fence open after `line`, given the fence open before it (null for none). */
function stepFence(open, line) {
	const m = /^ {0,3}(`{3,}|~{3,})(.*)$/.exec(line);
	if (!m) return open;
	const [, run, rest] = m;
	if (!open) {
		// A backtick fence's info string may not hold a backtick.
		if (run[0] === '`' && rest.includes('`')) return open;
		return { ch: run[0], len: run.length, info: rest.trim().split(/\s+/)[0] || '' };
	}
	return run[0] === open.ch && run.length >= open.len && rest.trim() === '' ? null : open;
}

function insertListSource() {
	const options = INSERTS.map((it, i) => ({
		label: it.label,
		detail: it.detail,
		type: 'text',
		// Keep the list in the order written, not the alphabet's.
		boost: -i,
		apply: (view, completion, from, to) => {
			const tr = insertCompletionText(view.state, it.text, from, to);
			view.dispatch({ ...tr, selection: { anchor: from + (it.at ?? it.text.length) }, annotations: pickedCompletion.of(completion) });
			if (it.opensMenu) startCompletion(view);
		},
	}));
	return (context) => {
		if (!context.explicit) return null;
		const doc = context.state.doc;
		const line = doc.lineAt(context.pos);
		if (line.text.trim() !== '') return null;
		const getLine = (n) => doc.line(n).text;
		if (inFrontMatter(getLine, line.number)) return null;
		if (fenceAround(getLine, line.number) !== null) return null;
		return { from: context.pos, options, filter: false };
	};
}

// Is the caret inside math? A ```math fence; a `$$` display block left open above it on this slide; or an inline `$`
// left open on this line. Code is never math: inside any other fence there is none, and a backtick span on the line is
// removed before the dollars are counted (`$PATH` in a shell line is not an equation). An escaped `\$` is a dollar sign.
const withoutCode = (t) => t.replace(/`[^`]*`/g, '').replace(/`[^`]*$/, '');
function inMath(getLine, lineNo, before) {
	// One walk down to the caret: the fence state, and the `$$` count since this slide's `---`, outside every fence.
	let open = null;
	let display = 0;
	for (let n = 1; n < lineNo; n++) {
		const t = getLine(n);
		const wasOpen = open;
		open = stepFence(open, t);
		if (wasOpen || open) continue;
		if (/^---\s*$/.test(t)) display = 0;
		else display += (withoutCode(t).replace(/\\\$/g, '').match(/\$\$/g) || []).length;
	}
	if (open) return open.info === 'math';
	const here = withoutCode(before).replace(/\\\$/g, '');
	display += (here.match(/\$\$/g) || []).length;
	if (display % 2 === 1) return true;
	return (here.replace(/\$\$/g, '').match(/\$/g) || []).length % 2 === 1;
}

// The command list loads the first time the caret is in math: it is about 1 KB the Studio and the Playground would
// otherwise pay at start-up (the route budget, docs/route-budget.json).
let texOptions = null;
const loadTexOptions = () => (texOptions ??= import('./tex-commands.js').then(({ TEX_COMMANDS }) => TEX_COMMANDS.map(texOption)));
const texOption = (c) => {
	const caret = c.template.indexOf('{');
	return {
		label: `\\${c.name}`,
		detail: c.info,
		type: 'function',
		apply: (view, completion, from, to) => {
			const tr = insertCompletionText(view.state, c.template, from, to);
			view.dispatch({ ...tr, selection: { anchor: from + (caret === -1 ? c.template.length : caret + 1) }, annotations: pickedCompletion.of(completion) });
		},
	};
};

function mathSource(context) {
	const doc = context.state.doc;
	const line = doc.lineAt(context.pos);
	const before = context.state.sliceDoc(line.from, context.pos);
	const m = /\\([A-Za-z]*)$/.exec(before);
	// A bare `\` opens nothing while typing (a line continuation, a path), only a letter after it or the key does.
	if (!m || (!m[1] && !context.explicit)) return null;
	if (!inMath((n) => doc.line(n).text, line.number, before.slice(0, -m[0].length))) return null;
	const from = context.pos - m[0].length;
	return loadTexOptions().then((options) => (context.aborted ? null : { from, options, validFor: /^\\[A-Za-z]*$/ }));
}

// ── flowchart (followups.d/2385) ──────────────────────────────────────────────
// Every word comes from the grammar kernel's own tables, loaded the first time the caret is on a flowchart slide, so a
// shape or status added there completes with no editor change.
const ARROWS = [
	['->', 'a line'],
	['=>', 'the heavy main path'],
	['--', 'a line with no head'],
	['<->', 'a line with heads at both ends'],
	['<-', 'a line pointing back'],
	['-label->', 'a labeled line; type the label'],
];
const ARROW_OPTIONS = ARROWS.map(([label, info], i) => ({
	label,
	detail: 'arrow',
	info,
	type: 'keyword',
	boost: -i,
	apply: (view, completion, from, to) => {
		const text = `${label} `;
		const tr = insertCompletionText(view.state, text, from, to);
		// The labeled form selects its placeholder word, so typing replaces it.
		const sel = label === '-label->' ? { anchor: from + 1, head: from + 6 } : { anchor: from + text.length };
		view.dispatch({ ...tr, selection: sel, annotations: pickedCompletion.of(completion) });
	},
}));
// An arrow is a word of its own: the light and heavy forms, or a label inside one (`-ships via->`, which may span
// words). Read by a single pass over the row's words, not a regex: a row is untrusted text linted on the main thread
// (HARD RULE #22), and the pattern this replaced backtracked exponentially on a row of repeated `\t&` (CodeQL).
const PLAIN_ARROWS = new Set(['<->', '<=>', '<-', '<=', '->', '=>', '--', '==']);
const opensLabel = (w) => (w[0] === '-' || w[0] === '=') && w.length > 1 && w[1] !== '-' && w[1] !== '=' && !/\s/.test(w[1]);
const closesLabel = (w) => w.endsWith('->') || w.endsWith('=>');

/** The offset just past the row's LAST arrow, or -1. Exported for a test. */
export function lastArrowEnd(text) {
	let end = -1;
	let open = false;
	for (const m of text.matchAll(/\S+/g)) {
		const w = m[0];
		const stop = m.index + w.length;
		if (PLAIN_ARROWS.has(w)) {
			end = stop;
			open = false;
		} else if (open) {
			if (closesLabel(w)) {
				end = stop;
				open = false;
			}
		} else if (opensLabel(w)) {
			if (w.length > 3 && closesLabel(w)) end = stop;
			else open = true;
		}
	}
	return end;
}

/** The target being typed after the row's last arrow (after the last `&` of a fan-out), or null when there is none. */
export function arrowTarget(text) {
	const end = lastArrowEnd(text);
	if (end === -1 || !/^\s/.test(text.slice(end))) return null;
	const rest = text.slice(end);
	if (rest.includes('`')) return null;
	const amp = rest.lastIndexOf('&');
	return (amp === -1 ? rest : rest.slice(amp + 1)).replace(/^\s+/, '');
}
let flowchartKernel = null;
const loadFlowchartKernel = () => (flowchartKernel ??= import('../../../lib/core/flowchart-grammar.js').then((m) => m.default ?? m));

function spanWordOptions(g) {
	const word = (label, detail) => ({ label, detail, type: 'keyword' });
	return [
		...g.SHAPES.map((w) => word(w, 'outline')),
		...Array.from({ length: g.SLOT_COUNT }, (_, i) => word(`c${i + 1}`, 'color')),
		...g.STATUS_WORDS.map((w) => word(w, 'status')),
		...[...g.PATTERNS, ...g.HEADS, 'loose'].map((w) => word(w, 'line')),
	];
}

/** The names a flowchart slide already holds (shapes and groups), from the kernel's own parse of the slide's list. */
function chartNames(g, getLine, firstLine, lastLine, skipLine) {
	const lines = [];
	for (let n = firstLine; n <= lastLine; n++) if (n !== skipLine) lines.push(getLine(n));
	const { items } = g.outlineFromMarkdown(lines.join('\n'));
	const model = g.parseFlowchart(items);
	return [...new Set([...(model.shapes || []), ...(model.groups || [])].map((s) => s.name).filter(Boolean))];
}

function flowchartSource(context) {
	const doc = context.state.doc;
	const line = doc.lineAt(context.pos);
	const getLine = (n) => doc.line(n).text;
	const info = slideClassAt(getLine, line.number);
	if (!info || info.name !== 'flowchart' || line.number <= info.directiveLine) return null;
	const before = context.state.sliceDoc(line.from, context.pos);
	const row = /^\s*[-*+]\s+(.*)$/.exec(before);
	if (!row) return null;
	const text = row[1];
	const rowFrom = before.length - text.length;
	const ticks = (text.match(/`/g) || []).length;
	// 1. Inside a backtick span: the span words.
	if (ticks % 2 === 1) {
		const w = /[\w-]*$/.exec(text)[0];
		if (!/(?:^|[`{,\s])[\w-]*$/.test(text)) return null;
		return loadFlowchartKernel().then((g) => (context.aborted ? null : { from: context.pos - w.length, options: spanWordOptions(g), validFor: /^[\w-]*$/ }));
	}
	// 2. After an arrow: the chart's own names.
	const target = arrowTarget(text);
	// A target already written, then a space and an arrow begun (`A -> B -`), is a chain: that is case 3.
	if (target !== null && !/\S\s+[-=<]+$/.test(target)) {
		const typed = target;
		if (!typed && !context.explicit) return null;
		let last = line.number;
		while (last < doc.lines && !/^---\s*$/.test(getLine(last + 1))) last++;
		return loadFlowchartKernel().then((g) => {
			if (context.aborted) return null;
			const names = chartNames(g, getLine, info.directiveLine + 1, last, line.number);
			if (!names.length) return null;
			return { from: line.from + rowFrom + text.length - typed.length, options: names.map((n) => ({ label: n, type: 'variable', detail: 'shape' })), validFor: /^[^&`]*$/ };
		});
	}
	// 3. After a name and a space: the arrow forms (typed `-`, `=` or `<`, or Ctrl-Space).
	const arrow = /\S\s+([-=<]*)$/.exec(text);
	if (arrow && (arrow[1] || context.explicit)) return { from: context.pos - arrow[1].length, options: ARROW_OPTIONS, validFor: /^[-=<]*$/ };
	return null;
}

/**
 * The shared sources, in order. `catalog` is the compact component catalog (`name`, `skeleton`,
 * `focusAxes`); `dataSources` the per-component body completers (complete.js passes the static
 * registry, the Studio a lazy one); `registers` the key → words lists for directive values. All optional.
 * @param {{ catalog?: { name: string, skeleton?: string, focusAxes?: string[] }[], dataSources?: import('@codemirror/autocomplete').CompletionSource[], registers?: Record<string, string[]> }} [opts]
 * @returns {import('@codemirror/autocomplete').CompletionSource[]}
 */
export function contextSources({ catalog, dataSources = [], registers } = {}) {
	return [
		lineLocalSource(directiveNameAt, DIRECTIVE_OPTIONS, DIRECTIVE_TOKEN),
		directiveValueSource(registers),
		lineLocalSource(focusStyleValuePosition, FOCUS_STYLE_OPTIONS),
		focusAxisSource(catalog),
		backdropAxisSource(),
		mermaidSource,
		flowchartSource,
		mathSource,
		skeletonSource(catalog),
		insertListSource(),
		...dataSources,
	];
}
