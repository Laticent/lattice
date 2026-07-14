import { CompletionContext } from '@codemirror/autocomplete';
import { EditorState } from '@codemirror/state';
import { describe, expect, it } from 'vitest';
import { makeStudioCompletion } from './editor-complete';

const COMPS = [
	{ name: 'kpi', bucket: 'inventory', description: 'Key metrics' },
	{ name: 'quote', bucket: 'statement', description: 'A pull quote' },
];
const src = makeStudioCompletion(COMPS);

function complete(doc: string, pos = doc.length) {
	const state = EditorState.create({ doc });
	return src(new CompletionContext(state, pos, true));
}
const labels = (r: ReturnType<typeof complete>) => (r ? r.options.map((o) => o.label) : []);

describe('makeStudioCompletion', () => {
	it('completes component names on a _class line', () => {
		const r = complete('<!-- _class: ');
		expect(labels(r)).toEqual(['kpi', 'quote']);
	});

	it('completes a partially-typed component name', () => {
		const r = complete('<!-- _class: kp');
		expect(labels(r)).toContain('kpi');
		// `from` points at the start of the partial word so it replaces, not appends.
		expect(r?.from).toBe('<!-- _class: '.length);
	});

	it('completes fenced-block languages after ```', () => {
		const r = complete('```');
		expect(labels(r)).toContain('mermaid');
		expect(labels(r)).toContain('chart');
	});

	it('completes front-matter keys inside the --- block', () => {
		const r = complete('---\nsi', 6);
		expect(labels(r)).toContain('size');
		expect(labels(r)).toContain('paginate');
	});

	it('completes the finish-override + mode keys in the --- block', () => {
		expect(labels(complete('---\nfinish-o', 11))).toContain('finish-override');
		expect(labels(complete('---\nmod', 7))).toContain('mode');
	});

	it('completes finish: VALUES — built-ins bare, saved finishes PREFIXED', () => {
		// The caller passes the exact value vocabulary: built-ins bare, saved prefixed.
		const withFinishes = makeStudioCompletion(COMPS, ['atrium', 'halo', 'finish-my-brand']);
		const done = (doc: string, pos = doc.length) => {
			const r = withFinishes(new CompletionContext(EditorState.create({ doc }), pos, true));
			return r ? r.options.map((o) => o.label) : [];
		};
		expect(done('---\nfinish: at')).toContain('atrium'); // built-in stays bare
		expect(done('---\nfinish: finish-my')).toContain('finish-my-brand'); // saved offered prefixed
		// only on a finish: line, and not out in prose
		expect(done('Just prose finish: at', 21)).toEqual([]);
	});

	it('completes a finish CLASS on a _class: line — from the class vocabulary', () => {
		// 3rd arg is the `_class:` class vocabulary (all already `finish-` prefixed).
		const withFinishes = makeStudioCompletion(COMPS, [], ['finish-atrium', 'finish-shu']);
		const done = (doc: string, pos = doc.length) => {
			const r = withFinishes(new CompletionContext(EditorState.create({ doc }), pos, true));
			return r ? r.options.map((o) => o.label) : [];
		};
		// A finish class is offered as `finish-<name>` alongside components…
		expect(done('<!-- _class: ')).toContain('finish-shu');
		expect(done('<!-- _class: ')).toContain('kpi');
		// …and on a SECOND token after a component name.
		expect(done('<!-- _class: quote finish-')).toContain('finish-shu');
		// `from` replaces just the current token, not the whole line.
		const r = withFinishes(new CompletionContext(EditorState.create({ doc: '<!-- _class: quote finish-sh' }), 28, true));
		expect(r?.from).toBe('<!-- _class: quote '.length);
	});

	it('completes universal modifiers (dark/light) on a _class: line', () => {
		const withMods = makeStudioCompletion(COMPS, [], [], { modifiers: ['dark', 'light', 'numbered'] });
		const done = (doc: string, pos = doc.length) => {
			const r = withMods(new CompletionContext(EditorState.create({ doc }), pos, true));
			return r ? r.options.map((o) => o.label) : [];
		};
		// Modifiers ride alongside component names on the _class: line…
		expect(done('<!-- _class: ')).toContain('dark');
		expect(done('<!-- _class: ')).toContain('light');
		expect(done('<!-- _class: ')).toContain('kpi');
		// …and on a SECOND token after the component (`_class: statement light`).
		expect(done('<!-- _class: quote li')).toContain('light');
	});

	it('completes modifiers on the deck-wide `class:` front-matter value', () => {
		const withMods = makeStudioCompletion(COMPS, [], [], { modifiers: ['dark', 'light'] });
		const done = (doc: string, pos = doc.length) => {
			const r = withMods(new CompletionContext(EditorState.create({ doc }), pos, true));
			return r ? r.options.map((o) => o.label) : [];
		};
		expect(done('---\nclass: da')).toContain('dark');
		expect(done('---\nclass: dark li')).toContain('light');
		// Not out in prose (must be inside the front-matter block).
		expect(done('Body class: da', 14)).toEqual([]);
	});

	it('completes theme: VALUES from the palette vocabulary', () => {
		const withThemes = makeStudioCompletion(COMPS, [], [], { palettes: ['indaco', 'cuoio', 'cuoio-dark', 'my-brand'] });
		const done = (doc: string, pos = doc.length) => {
			const r = withThemes(new CompletionContext(EditorState.create({ doc }), pos, true));
			return r ? r.options.map((o) => o.label) : [];
		};
		expect(done('---\ntheme: ')).toContain('cuoio');
		expect(done('---\ntheme: cuoio-d')).toContain('cuoio-dark');
		expect(done('---\ntheme: my')).toContain('my-brand');
		// Only on a theme: line inside the block, never in prose.
		expect(done('Just prose theme: in', 20)).toEqual([]);
	});

	it('completes lang: VALUES from the supported document languages', () => {
		// No extra vocabulary needed — the language list is static (studio-language).
		expect(labels(complete('---\nlang: '))).toContain('en-US');
		expect(labels(complete('---\nlang: en-G'))).toContain('en-GB');
		// `from` replaces the partial code, not the whole line.
		const r = complete('---\nlang: en-G', 14);
		expect(r?.from).toBe('---\nlang: '.length);
		// Only on a lang: line inside the block, never out in prose.
		expect(labels(complete('Body lang: en', 13))).toEqual([]);
	});

	it('completes ai-lang: VALUES too — the AI-output override shares the language list', () => {
		expect(labels(complete('---\nai-lang: '))).toContain('en-US');
		expect(labels(complete('---\nai-lang: en-G'))).toContain('en-GB');
		// And ai-lang is offered as a front-matter KEY.
		expect(labels(complete('---\nai-l', 8))).toContain('ai-lang');
	});

	it('does not fire in plain prose', () => {
		expect(complete('Just some body text here')).toBeNull();
	});

	it('does not fire on the front-matter fence line itself', () => {
		// On the closing `---`, the key completer must stand down.
		expect(complete('---\nsize: 16:9\n---', 18)).toBeNull();
	});
});
