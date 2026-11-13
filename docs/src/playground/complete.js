// CodeMirror autocomplete assembly for the Lattice editor.
//
// Composes the slide-context-sensitive completion sources into one
// `autocompletion` extension. Each source returns null outside its own context,
// so they never compete:
//   • class-directive — component names + modifiers inside `<!-- _class: … -->`
//   • record          — fields and values inside `<!-- { … } -->`
//   • theme / finish / split / size / fence language — front-matter and fence values
//   • the shared context sources (context-sources.js) — directive names, focus,
//     nested backdrop, mermaid, skeleton and the data-source registry; the Studio's
//     editor runs the same list
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
import { contextSources, lineLocalSource } from './context-sources.js';
import { dataSources } from './data-sources.js';
import { FENCE_LANGS, SIZE_VALUES, SPLIT_VALUES } from './grammar-vocab.js';
import {
	classDirectiveCompletion,
	classTokenResult,
	deckSplit,
	fenceLangAt,
	finishValuePosition,
	inFrontMatter,
	recordCompletion,
	recordOptions,
	sizeValuePosition,
	slideBodyAfter,
	splitValuePosition,
	themeValuePosition,
} from './slide-context.js';

const TOKEN = /^[\w-]*$/;

// Static option lists (built once) for the line-local Tier-2 sources.
const SPLIT_OPTIONS = SPLIT_VALUES.map((v) => ({ label: v, type: 'constant', detail: 'split' }));
const SIZE_OPTIONS = SIZE_VALUES.map((v) => ({ label: v, type: 'constant', detail: 'size' }));
const FENCE_OPTIONS = FENCE_LANGS.map((l) => ({ label: l, type: 'constant', detail: 'language' }));

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

// Completes the component name and modifiers inside a `_class:` directive.
function classDirectiveSource(catalog, vocab) {
	return (context) => {
		const line = context.state.doc.lineAt(context.pos);
		const before = context.state.sliceDoc(line.from, context.pos);
		const spot = classDirectiveCompletion(before);
		if (!spot) return null;
		// Stay quiet on a bare position until there's a keystroke (or Ctrl-Space),
		// matching the map source's restraint.
		if (!spot.typed && !context.explicit) return null;

		// Positional: a component first, then only what that component accepts.
		const doc = context.state.doc;
		const split = deckSplit(doc.sliceString(0, Math.min(doc.length, 4000)));
		const slideText = slideBodyAfter((n) => doc.line(n).text, doc.lines, line.number, { split });
		const { options, validFor } = classTokenResult(spot, catalog, vocab || [], { slideText });
		if (!options.length) return null;

		return { from: line.from + spot.from, options, validFor };
	};
}

// Record completion (`recordOptions`) lives in slide-context.js, shared with the Studio's completer
// (docs/src/components/studio/editor-complete.ts).
export { recordOptions };

function recordSource(catalog, vocab) {
	return (context) => {
		const line = context.state.doc.lineAt(context.pos);
		const before = context.state.sliceDoc(line.from, context.pos);
		const spot = recordCompletion(before);
		if (!spot) return null;
		if (!spot.typed && !context.explicit && spot.kind === 'value') return null;
		const doc = context.state.doc;
		const split = deckSplit(doc.sliceString(0, Math.min(doc.length, 4000)));
		const slideText = slideBodyAfter((n) => doc.line(n).text, doc.lines, line.number, { split });
		const options = recordOptions(spot, catalog, vocab || [], { slideText });
		if (!options.length) return null;
		return { from: line.from + spot.from, options, validFor: TOKEN };
	};
}

// Build the editor's autocomplete extension. `vocab` is the Drawing Board's
// lintVocab ({ names, modifiers, universalModifiers, mapRegions }); `catalog` is
// the compact component catalog ({ name, bucket, variants, skeleton, … });
// `themes` is the registered theme-name list; `finishes` the finish-register
// names. All optional — without them only the (self-sufficient) data sources
// are live.
/** The Playground's source list: its own sources plus the shared `contextSources`. Exported for the parity test. */
export function playgroundCompletionSources({ vocab, catalog, themes, finishes } = {}) {
	return [
		themeSource(themes),
		finishSource(finishes),
		lineLocalSource(splitValuePosition, SPLIT_OPTIONS),
		lineLocalSource(sizeValuePosition, SIZE_OPTIONS),
		lineLocalSource(fenceLangAt, FENCE_OPTIONS),
		classDirectiveSource(catalog, vocab),
		recordSource(catalog, vocab),
		...contextSources({ catalog, dataSources }),
	];
}

export function latticeAutocomplete(opts = {}) {
	return autocompletion({
		override: playgroundCompletionSources(opts),
		activateOnTyping: true,
		icons: false,
	});
}
