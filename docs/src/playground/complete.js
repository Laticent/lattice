// CodeMirror autocomplete assembly for the Lattice editor.
//
// Composes the slide-context-sensitive completion sources into one
// `autocompletion` extension. Each source returns null outside its own context,
// so they never compete:
//   • class-directive — component names + modifiers inside `<!-- _class: … -->`
//   • skeleton        — a one-shot slot scaffold on an empty classed slide body
//   • data sources    — literal body values per component (map regions, …),
//                       from the data-sources.js registry
//
// All grammar/decision logic is pure and lives in slide-context.js (unit
// tested); this file is the thin CodeMirror adapter — it reads the cursor's
// line, hands the text to the pure functions, and shapes the result into
// CodeMirror's { from, options, validFor }. Vocabulary (component catalog +
// universal modifiers) comes from the page handoff the Drawing Board already
// builds for the Architect's linter, so completion and lint speak the same
// vocabulary; when it's absent (the single-component Specimen editor) the
// class-directive and skeleton sources are simply inert.

import { autocompletion } from '@codemirror/autocomplete';
import { dataSources } from './data-sources.js';
import { AUTOSPLIT_VALUES, DIRECTIVE_NAMES, FENCE_LANGS, FOCUS_AXIS_VALUES, FOCUS_STYLE_VALUES, FORM_VALUES, MERMAID_KEYWORDS, PAGINATE_VALUES, SIZE_VALUES, SPLIT_VALUES } from './grammar-vocab.js';
import {
	autosplitValuePosition,
	backdropAxisPosition,
	blankBodyPartial,
	classDirectiveCompletion,
	classOptions,
	directiveNameAt,
	fenceLangAt,
	finishValuePosition,
	focusAxisPosition,
	focusStyleValuePosition,
	formValuePosition,
	identifierBefore,
	inFencedLang,
	inFrontMatter,
	modifierOptions,
	paginateValuePosition,
	sizeValuePosition,
	skeletonBody,
	slideBodyEmpty,
	slideClassAt,
	splitValuePosition,
	themeValuePosition,
} from './slide-context.js';

const TOKEN = /^[\w-]*$/;
const DIRECTIVE_TOKEN = /^_?[\w-]*$/;

// Static option lists (built once) for the line-local Tier-2 sources.
const DIRECTIVE_OPTIONS = DIRECTIVE_NAMES.map((d) => ({ label: d, type: 'keyword', detail: 'directive' }));
const PAGINATE_OPTIONS = PAGINATE_VALUES.map((v) => ({ label: v, type: 'constant' }));
const FORM_OPTIONS = FORM_VALUES.map((v) => ({ label: v, type: 'constant', detail: 'form' }));
const SPLIT_OPTIONS = SPLIT_VALUES.map((v) => ({ label: v, type: 'constant', detail: 'split' }));
const AUTOSPLIT_OPTIONS = AUTOSPLIT_VALUES.map((v) => ({ label: v, type: 'constant', detail: 'autosplit' }));
const SIZE_OPTIONS = SIZE_VALUES.map((v) => ({ label: v, type: 'constant', detail: 'size' }));
const FOCUS_STYLE_OPTIONS = FOCUS_STYLE_VALUES.map((v) => ({ label: v, type: 'constant', detail: 'focus style' }));
const FENCE_OPTIONS = FENCE_LANGS.map((l) => ({ label: l, type: 'constant', detail: 'language' }));

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
function lineLocalSource(detect, options, validFor = TOKEN) {
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

// Completes the registered theme names after `theme:` in the deck's front
// matter. A theme not in the registered set renders unstyled (white,
// no tokens) — a documented gotcha this prevents at the keystroke.
function themeSource(themes) {
	if (!themes?.length) return () => null;
	const options = themes.map((t) => ({ label: t, type: 'constant', detail: 'theme' }));
	return (context) => {
		const doc = context.state.doc;
		const line = doc.lineAt(context.pos);
		if (!inFrontMatter((n) => doc.line(n).text, line.number)) return null;
		const before = context.state.sliceDoc(line.from, context.pos);
		const spot = themeValuePosition(before);
		if (!spot) return null;
		if (!spot.typed && !context.explicit) return null;
		return { from: line.from + spot.from, options, validFor: TOKEN };
	};
}

// Completes the deck-wide finish register after `finish:` in the front matter
// (boardroom / sketch / sketch-clean). The names come from the same handoff the
// linter validates against (lintVocab.finishNames → lib/core/resolve-finish.js),
// so completion and the unknown-finish lint speak one vocabulary.
function finishSource(finishes) {
	if (!finishes?.length) return () => null;
	const options = finishes.map((f) => ({ label: f, type: 'constant', detail: 'finish' }));
	return (context) => {
		const doc = context.state.doc;
		const line = doc.lineAt(context.pos);
		if (!inFrontMatter((n) => doc.line(n).text, line.number)) return null;
		const before = context.state.sliceDoc(line.from, context.pos);
		const spot = finishValuePosition(before);
		if (!spot) return null;
		if (!spot.typed && !context.explicit) return null;
		return { from: line.from + spot.from, options, validFor: TOKEN };
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

// Completes the component name and modifiers inside a `_class:` directive.
function classDirectiveSource(catalog, universalModifiers) {
	return (context) => {
		const line = context.state.doc.lineAt(context.pos);
		const before = context.state.sliceDoc(line.from, context.pos);
		const spot = classDirectiveCompletion(before);
		if (!spot) return null;
		// Stay quiet on a bare position until there's a keystroke (or Ctrl-Space),
		// matching the map source's restraint.
		if (!spot.typed && !context.explicit) return null;

		const options =
			spot.kind === 'class'
				? classOptions(catalog)
				: modifierOptions(spot.name, catalog, universalModifiers, spot.present);
		if (!options.length) return null;

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
// catalog) narrows the offered axes — `compare-table` → row/col/cell, a card
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

// Build the editor's autocomplete extension. `vocab` is the Drawing Board's
// lintVocab ({ names, modifiers, universalModifiers, mapRegions }); `catalog` is
// the compact component catalog ({ name, bucket, variants, skeleton, … });
// `themes` is the registered theme-name list; `finishes` the finish-register
// names. All optional — without them only the (self-sufficient) data sources
// are live.
export function latticeAutocomplete({ vocab, catalog, themes, finishes } = {}) {
	const universalModifiers = (vocab && (vocab.universalModifiers || vocab.modifiers)) || [];
	return autocompletion({
		override: [
			themeSource(themes),
			finishSource(finishes),
			backdropAxisSource(),
			lineLocalSource(directiveNameAt, DIRECTIVE_OPTIONS, DIRECTIVE_TOKEN),
			lineLocalSource(paginateValuePosition, PAGINATE_OPTIONS),
			lineLocalSource(focusStyleValuePosition, FOCUS_STYLE_OPTIONS),
			focusAxisSource(catalog),
			lineLocalSource(formValuePosition, FORM_OPTIONS),
			lineLocalSource(splitValuePosition, SPLIT_OPTIONS),
			lineLocalSource(autosplitValuePosition, AUTOSPLIT_OPTIONS),
			lineLocalSource(sizeValuePosition, SIZE_OPTIONS),
			lineLocalSource(fenceLangAt, FENCE_OPTIONS),
			mermaidSource,
			classDirectiveSource(catalog, universalModifiers),
			skeletonSource(catalog),
			...dataSources,
		],
		activateOnTyping: true,
		icons: false,
	});
}
