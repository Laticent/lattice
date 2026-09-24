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

	it('completes a finish CLASS after the component, never in the component slot', () => {
		// 3rd arg is the `_class:` class vocabulary (all already `finish-` prefixed).
		const withFinishes = makeStudioCompletion(COMPS, [], ['finish-atrium', 'finish-shu']);
		const done = (doc: string, pos = doc.length) => {
			const r = withFinishes(new CompletionContext(EditorState.create({ doc }), pos, true));
			return r ? r.options.map((o) => o.label) : [];
		};
		// The first word is a component — a finish is not one.
		expect(done('<!-- _class: ')).toEqual(['kpi', 'quote']);
		// A finish is offered once the component is named…
		expect(done('<!-- _class: quote finish-')).toContain('finish-shu');
		// …and only one: picking a finish takes the rest off the menu.
		expect(done('<!-- _class: quote finish-shu ')).not.toContain('finish-atrium');
		// `from` replaces just the current token, not the whole line.
		const r = withFinishes(new CompletionContext(EditorState.create({ doc: '<!-- _class: quote finish-sh' }), 28, true));
		expect(r?.from).toBe('<!-- _class: quote '.length);
	});

	it('completes universal modifiers after the component, and falls back when the first word matches no component', () => {
		const withMods = makeStudioCompletion(COMPS, [], [], { modifiers: ['dark', 'light', 'numbered'] });
		const done = (doc: string, pos = doc.length) => {
			const r = withMods(new CompletionContext(EditorState.create({ doc }), pos, true));
			return r ? r.options.map((o) => o.label) : [];
		};
		// First word: components only.
		expect(done('<!-- _class: ')).toEqual(['kpi', 'quote']);
		// A first word that names no component falls back to modifiers (`_class: dark`).
		expect(done('<!-- _class: da')).toContain('dark');
		expect(done('<!-- _class: da')).not.toContain('kpi');
		// A later word offers modifiers, never another component.
		expect(done('<!-- _class: quote li')).toContain('light');
		expect(done('<!-- _class: quote ')).not.toContain('kpi');
	});

	describe('the first word, as CodeMirror re-asks while you type', () => {
		// CodeMirror keeps a result while `validFor` matches the typed text and only
		// calls the source again once it stops matching. A plain word pattern froze
		// the component list, so `dark` never reached the fallback.
		const CAT = ['radar', 'agenda', 'kpi', 'content'].map((name) => ({ name, bucket: 'x', description: '' }));
		const s = makeStudioCompletion(CAT, [], [], { modifiers: ['dark', 'light'] });
		const at = (doc: string) => s(new CompletionContext(EditorState.create({ doc }), doc.length, true));
		const validFor = (r: ReturnType<typeof at>, text: string) => {
			const v = r?.validFor;
			return typeof v === 'function' ? v(text, 0, text.length, EditorState.create({ doc: '' })) : !!v?.test(text);
		};

		it('keeps the component list only while the text still names a component', () => {
			const r = at('<!-- _class: d');
			expect(r?.options.map((o) => o.label)).toContain('radar');
			expect(validFor(r, 'dar')).toBe(true); // `radar` — still a component
			expect(validFor(r, 'dark')).toBe(false); // names none: CodeMirror must re-ask
		});

		it('then offers the modifiers, and keeps them while the text names no component', () => {
			const r = at('<!-- _class: dark');
			expect(r?.options.map((o) => o.label)).toContain('dark');
			expect(validFor(r, 'darkx')).toBe(true);
			expect(validFor(r, 'k')).toBe(false); // back to naming a component
		});
	});

	describe('where the slide ends', () => {
		const CAT = [{ name: 'content', bucket: 'statement', description: '', surfaces: ['slide', 'heading'] }];
		const VOCAB = { modifierGroups: [{ name: 'table', label: 'Table', tokens: ['table-fill'], surface: 'table' }], exclusiveAxes: {} };
		const s = makeStudioCompletion(CAT, [], [], { vocab: VOCAB });
		const labels = (doc: string) => (s(new CompletionContext(EditorState.create({ doc }), doc.split('\n')[0].length, true))?.options ?? []).map((o) => o.label);
		const table = '| a | b |\n|---|---|\n| 1 | 2 |';

		it('a second heading starts the next slide under the default heading split', () => {
			expect(labels(`<!-- _class: content \n\n## A\n\ntext\n\n## B\n\n${table}\n`)).not.toContain('table-fill');
			expect(labels(`<!-- _class: content \n\n## A\n\n${table}\n`)).toContain('table-fill');
		});

		it('under `split: rule` only a `---` ends it', () => {
			const doc = `---\nsplit: rule\n---\n\n<!-- _class: content \n\n## A\n\n## B\n\n${table}\n`;
			const line = '<!-- _class: content ';
			const pos = doc.indexOf(line) + line.length;
			const r = s(new CompletionContext(EditorState.create({ doc }), pos, true));
			expect(r?.options.map((o) => o.label)).toContain('table-fill');
		});

		it('a `---` inside a fenced block is code, not a slide break', () => {
			expect(labels(`<!-- _class: content \n\n\`\`\`yaml\n---\n\`\`\`\n\n${table}\n`)).toContain('table-fill');
		});
	});

	describe('surfaces, slide content and usage', () => {
		const CAT = [
			{ name: 'content', bucket: 'statement', description: 'Default', surfaces: ['slide', 'heading'] },
			{ name: 'big-number', bucket: 'statement', description: 'One number', surfaces: ['slide'], modifierUsage: { dark: 9 } },
			{ name: 'cards-grid', bucket: 'inventory', description: 'Cards', surfaces: ['slide', 'heading', 'card-row'] },
		];
		const VOCAB = {
			modifierGroups: [
				{ name: 'mood', label: 'Canvas', tokens: ['dark', 'light'], exclusive: true },
				{ name: 'chrome', label: 'Chrome', tokens: ['silent', 'no-footer'] },
				{ name: 'rule', label: 'Heading rule', tokens: ['rule-none'], surface: 'heading' },
				{ name: 'table', label: 'Table', tokens: ['table-fill'], surface: 'table' },
				{ name: 'cards', label: 'Card spacing', tokens: ['cards-spread'], surface: 'card-row' },
			],
			exclusiveAxes: {},
			modifierUsage: { silent: 200, 'no-footer': 1 },
		};
		const s = makeStudioCompletion(CAT, [], [], { vocab: VOCAB });
		const done = (doc: string, line = doc.split('\n')[0]) => {
			const r = s(new CompletionContext(EditorState.create({ doc }), line.length, true));
			return r ? r.options : [];
		};
		const labels = (doc: string) => done(doc).map((o) => o.label);

		it('offers a slide-level modifier everywhere and a component-level one only where its surface exists', () => {
			expect(labels('<!-- _class: big-number ')).toContain('silent');
			expect(labels('<!-- _class: big-number ')).not.toContain('rule-none');
			expect(labels('<!-- _class: content ')).toContain('rule-none');
			expect(labels('<!-- _class: content ')).not.toContain('cards-spread');
			expect(labels('<!-- _class: cards-grid ')).toContain('cards-spread');
		});

		it('turns on a content surface when the slide actually contains it', () => {
			expect(labels('<!-- _class: content ')).not.toContain('table-fill');
			const withTable = '<!-- _class: content \n\n| a | b |\n|---|---|\n| 1 | 2 |\n';
			expect(labels(withTable)).toContain('table-fill');
			// …and ranks it ahead of the slide-level groups, because it acts on what is there.
			const opts = done(withTable) as { label: string; section?: { rank: number } }[];
			const rankOf = (l: string) => opts.find((o) => o.label === l)?.section?.rank ?? 99;
			expect(rankOf('table-fill')).toBeLessThan(rankOf('dark'));
			// A slide break ends the slide: a table on the NEXT slide does not count.
			expect(labels('<!-- _class: content \n\n---\n\n| a | b |\n|---|---|\n')).not.toContain('table-fill');
		});

		it('floats the modifiers authors use most to the top of their section', () => {
			const opts = done('<!-- _class: content ') as { label: string; boost?: number }[];
			const boost = (l: string) => opts.find((o) => o.label === l)?.boost ?? 0;
			expect(boost('silent')).toBeGreaterThan(boost('no-footer'));
			// Use after THIS component weighs more than use overall.
			const bn = done('<!-- _class: big-number ') as { label: string; boost?: number }[];
			expect(bn.find((o) => o.label === 'dark')?.boost ?? 0).toBeGreaterThan(0);
		});

		it('adds the surfaces a variant on the line brings, and keeps a measured-inert surface hidden', () => {
			const cat = [
				{ name: 'kpi', bucket: 'evidence', description: 'KPIs', variants: ['ops'], surfaces: ['slide', 'heading'], variantSurfaces: { ops: ['card-surface'] }, inertSurfaces: ['table'] },
			];
			const vocab = { ...VOCAB, modifierGroups: [...VOCAB.modifierGroups, { name: 'lift', label: 'Card lift', tokens: ['lifted'], surface: 'card-surface' }] };
			const k = makeStudioCompletion(cat, [], [], { vocab });
			const at = (doc: string, line = doc.split('\n')[0]) => (k(new CompletionContext(EditorState.create({ doc }), line.length, true))?.options ?? []).map((o) => o.label);
			expect(at('<!-- _class: kpi ')).not.toContain('lifted');
			expect(at('<!-- _class: kpi ops ')).toContain('lifted');
			// A table on the slide does not bring back modifiers measured to do nothing here.
			expect(at('<!-- _class: kpi \n\n| a | b |\n|---|---|\n')).not.toContain('table-fill');
		});

		it('offers every group on a component with no surface data (a local component)', () => {
			const local = makeStudioCompletion([{ name: 'mine', bucket: 'local', description: '' }], [], [], { vocab: VOCAB });
			const r = local(new CompletionContext(EditorState.create({ doc: '<!-- _class: mine ' }), 18, true));
			expect(r?.options.map((o) => o.label)).toContain('cards-spread');
		});
	});

	describe('positional `_class:` completion from the manifest', () => {
		const CAT = [
			{ name: 'content', bucket: 'statement', description: 'Default', excludedModifiers: [] },
			{
				name: 'map', bucket: 'chart', description: 'A map',
				variants: ['world', 'us', 'highlight'],
				variantAxes: [{ label: 'Basemap', exclusive: true, members: ['world', 'us'] }],
				familyModifiers: ['canvas'],
				excludedModifiers: ['table-fill', 'insight-key', 'insight-why'],
			},
		];
		const VOCAB = {
			modifierGroups: [
				{ name: 'mood', label: 'Canvas', tokens: ['dark', 'light'], exclusive: true },
				{ name: 'insight', label: 'Insight label', tokens: ['insight-key', 'insight-why'], exclusive: true },
				{ name: 'table', label: 'Table', tokens: ['table-plain', 'table-fill'] },
				{ name: 'decoration', label: 'Decoration', tokens: ['tint-corner'], follows: { 'tint-corner': ['at-tl', 'at-br'] } },
				{ name: 'aliases', label: 'Aliases', tokens: ['mirror'], offer: false },
			],
			exclusiveAxes: {},
		};
		const s = makeStudioCompletion(CAT, [], [], { vocab: VOCAB });
		const done = (doc: string) => {
			const r = s(new CompletionContext(EditorState.create({ doc }), doc.length, true));
			return r ? r.options.map((o) => o.label) : [];
		};

		it('offers the component\'s own variants first, then family, then universal groups', () => {
			const got = done('<!-- _class: map ');
			expect(got.slice(0, 4)).toEqual(['world', 'us', 'highlight', 'canvas']);
			expect(got).toContain('dark');
		});

		it('drops what the manifest excludes and the never-offered aliases', () => {
			const got = done('<!-- _class: map ');
			expect(got).not.toContain('table-fill');
			expect(got).not.toContain('insight-key');
			expect(got).toContain('table-plain');
			expect(got).not.toContain('mirror');
		});

		it('offers one member per exclusive axis — component axes and registry axes alike', () => {
			expect(done('<!-- _class: map us ')).not.toContain('world');
			expect(done('<!-- _class: map dark ')).not.toContain('light');
			expect(done('<!-- _class: map us ')).toContain('highlight');
		});

		it('offers a dependent only after its lead, and leads with it', () => {
			expect(done('<!-- _class: map ')).not.toContain('at-tl');
			expect(done('<!-- _class: map tint-corner ').slice(0, 2)).toEqual(['at-tl', 'at-br']);
		});

		it('opens no menu on a bare space — the default look is writing nothing', () => {
			const at = (doc: string, explicit: boolean) => s(new CompletionContext(EditorState.create({ doc }), doc.length, explicit));
			expect(at('<!-- _class: map ', false)).toBeNull();
			expect(at('<!-- _class: ', false)).toBeNull();
			// The first letter opens it; Ctrl-Space (explicit) browses from nothing.
			expect(at('<!-- _class: map h', false)?.options.map((o) => o.label)).toContain('highlight');
			expect(at('<!-- _class: map ', true)?.options.length).toBeGreaterThan(0);
		});

		it('offers one placement per decoration lead', () => {
			expect(done('<!-- _class: map tint-corner at-tl ')).not.toContain('at-br');
		});

		it('never re-offers a token already on the line', () => {
			expect(done('<!-- _class: map highlight ')).not.toContain('highlight');
		});

		it('groups the menu into sections, variants ranked first', () => {
			const r = s(new CompletionContext(EditorState.create({ doc: '<!-- _class: map ' }), 17, true));
			const first = r?.options[0] as { section?: { name: string; rank: number } };
			expect(first.section?.name).toBe('map variants');
		});
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

	it('a key named after an Object prototype member completes nothing', () => {
		expect(done('---\nconstructor: ')).toEqual([]);
		expect(done('---\ntoString: ')).toEqual([]);
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
		const HANDLED_ELSEWHERE = new Set(['finishNames', 'paceNames']);
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
		// …and the island UNPACKS it: without this every *Names list vanishes in the Studio.
		const island = readFileSync(new URL('./StudioIsland.tsx', import.meta.url), 'utf8');
		expect(island).toMatch(/withUnpackedNames\(props\.lintVocab\)/);
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
