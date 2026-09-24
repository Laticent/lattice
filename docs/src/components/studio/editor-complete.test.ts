// @vitest-environment node
// This file touches no DOM. Under the suite default it paid for a jsdom window it
// never used; see engineering/decisions/2026-09-20-dom-library-bakeoff.md.

import { readFileSync } from 'node:fs';
import { CompletionContext } from '@codemirror/autocomplete';
import { EditorState } from '@codemirror/state';
import { describe, expect, it } from 'vitest';
// The engine's lint vocabulary (CommonJS) — the value lists the editor completes against.
import { buildVocab } from '../../../../lib/authoring/lint.js';
import { FRONT_MATTER_KEYS, makeStudioCompletion, registerValueLists, VOCAB_VALUE_FIELDS } from './editor-complete';

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

	it('completes all three RENDER-TARGET keys, not just present:', () => {
		// These three name the artifact a render emits, so they get no settings-panel control
		// (2026-08-18-settings-panel-coverage-and-ux.md §2.3). That is a decision about PANELS:
		// the editor is a plain text surface, and an author typing the key by hand still needs
		// the hint. Offering `present` while hiding `fluid` and `player` — which this list did
		// until 2026-09-13 — left `fluid:` reachable only by already knowing it exists.
		expect(labels(complete('---\nflu', 7))).toContain('fluid');
		expect(labels(complete('---\nplay', 8))).toContain('player');
		expect(labels(complete('---\npres', 8))).toContain('present');
	});

	it('does not fire in plain prose', () => {
		expect(complete('Just some body text here')).toBeNull();
	});

	it('does not fire on the front-matter fence line itself', () => {
		// On the closing `---`, the key completer must stand down.
		expect(complete('---\nsize: 16:9\n---', 18)).toBeNull();
	});
});

describe('front-matter registers — keys and values', () => {
	const vocab = buildVocab();
	const withRegisters = makeStudioCompletion(COMPS, [], [], { registers: registerValueLists(vocab) });
	const done = (doc: string, pos = doc.length) => {
		const r = withRegisters(new CompletionContext(EditorState.create({ doc }), pos, true));
		return r ? r.options.map((o) => o.label) : [];
	};

	it('offers the keys that had no route but knowing they exist', () => {
		const keys = done('---\n', 4);
		for (const k of ['guards', 'cards', 'player-motion', 'captions', 'ai-lang', 'color', 'backgroundColor', 'backgroundSize']) {
			expect(keys, `${k} missing from key completion`).toContain(k);
		}
	});

	it('completes guards: and cards: values from the engine vocabulary', () => {
		expect(done('---\nguards: ')).toEqual(['loose', 'strict']);
		expect(done('---\ncards: sp')).toEqual(['center', 'stretch', 'top', 'spread']);
		expect(done('---\nclaim: ')).toContain('bleed');
		expect(done('---\nspectrum-trim: ')).toContain('restrained');
	});

	it('completes the static vocabularies — player-motion offers only what its reader reads', () => {
		expect(done('---\nplayer-motion: ')).toEqual(['off']);
		expect(done('---\nmotion-speed: ')).toEqual(['auto', 'slow', 'normal', 'fast']);
	});

	it('does not complete a register value on an indented line (a nested map entry)', () => {
		// `lexicon:` takes arbitrary word keys; `  cards: …` there is data, not the register.
		expect(done('---\nlexicon:\n  cards: ')).toEqual([]);
		// …and never outside the front matter.
		expect(done('---\ntitle: x\n---\n\ncards: ')).toEqual([]);
	});

	// Drift gate: a new `*Names` list in the lint vocab is a new register with a fixed
	// vocabulary. It must be wired for value completion or named here as handled by its
	// own branch, so a register can't ship with values the editor never offers.
	it('every register value list in the lint vocab is wired for completion', () => {
		const HANDLED_ELSEWHERE = new Set(['finishNames', 'paceNames', 'names']);
		const wired = new Set(Object.values(VOCAB_VALUE_FIELDS));
		const unwired = Object.keys(vocab).filter((f) => f.endsWith('Names') && !wired.has(f) && !HANDLED_ELSEWHERE.has(f));
		expect(unwired, 'add these to VOCAB_VALUE_FIELDS (or HANDLED_ELSEWHERE with a reason)').toEqual([]);
	});

	// The gate above reads the FULL vocab, but the Studio receives what studio.astro
	// serializes. That page used to hand-pick a few `*Names` lists, so this suite passed
	// while the real editor had no `guards:` values at all. Pin the pass-everything spread.
	it('the Studio page passes every register value list to the editor', () => {
		const page = readFileSync(new URL('../../pages/studio.astro', import.meta.url), 'utf8');
		expect(page).toMatch(/packedNames: packVocabNames\(v\)/);
	});

	// Drift gate: every key the deck Inspector writes must also be completable in the
	// editor, so the two surfaces can't offer different front-matter vocabularies.
	it('every front-matter key the Studio Inspector writes is in autocomplete', () => {
		const shell = readFileSync(new URL('./StudioShell.tsx', import.meta.url), 'utf8');
		const written = new Set([...shell.matchAll(/writeFrontMatterLine\(\w+, '([\w-]+)'/g)].map((m) => m[1]));
		expect(written.size).toBeGreaterThan(20);
		const offered = new Set(FRONT_MATTER_KEYS.map((k) => k.key));
		expect([...written].filter((k) => !offered.has(k))).toEqual([]);
	});
});
