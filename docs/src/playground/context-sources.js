// The slide-context completion sources BOTH editors run: the Studio's deck editor
// (docs/src/components/studio/Editor.tsx, through editor-complete.ts `studioCompletionSources`)
// and the Playground's (complete.js `latticeAutocomplete`). One list, so a source added for
// one editor reaches the other; test/unit/components/autocomplete-parity.test.js and
// editor-complete.test.ts pin that both assemblies include it.
// (engineering/decisions/2026-11-13-studio-autocomplete-audit.md, slice 1.)
//
//   • directive names    — `<!-- _hea…` → `_header`, `_focus`, …
//   • `_focusStyle:`     — its enum values
//   • `_focus:` axis     — narrowed by the slide's layout (`focusAxes`)
//   • nested `backdrop:` — its axis keys
//   • mermaid            — keywords inside a ```mermaid fence
//   • skeleton           — a one-shot slot scaffold on an empty classed slide body
//   • data sources       — literal body values per component (map regions), passed in,
//                          so the Studio can load them lazily (the basemaps are ~100 KB)
//
// Each source returns null outside its own context, so they never compete with each
// other or with an editor's own sources.

import { DIRECTIVE_NAMES, FOCUS_AXIS_VALUES, FOCUS_STYLE_VALUES, MERMAID_KEYWORDS } from './grammar-vocab.js';
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
const DIRECTIVE_OPTIONS = DIRECTIVE_NAMES.map((d) => ({ label: d, type: 'keyword', detail: 'directive' }));
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

/**
 * The shared sources, in order. `catalog` is the compact component catalog (`name`, `skeleton`,
 * `focusAxes`); `dataSources` the per-component body completers (complete.js passes the static
 * registry, the Studio a lazy one). Both optional.
 * @param {{ catalog?: { name: string, skeleton?: string, focusAxes?: string[] }[], dataSources?: import('@codemirror/autocomplete').CompletionSource[] }} [opts]
 * @returns {import('@codemirror/autocomplete').CompletionSource[]}
 */
export function contextSources({ catalog, dataSources = [] } = {}) {
	return [
		lineLocalSource(directiveNameAt, DIRECTIVE_OPTIONS, DIRECTIVE_TOKEN),
		lineLocalSource(focusStyleValuePosition, FOCUS_STYLE_OPTIONS),
		focusAxisSource(catalog),
		backdropAxisSource(),
		mermaidSource,
		skeletonSource(catalog),
		...dataSources,
	];
}
