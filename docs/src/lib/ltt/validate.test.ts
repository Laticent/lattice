import { describe, expect, it } from 'vitest';
import { buildTrack } from '@/lib/cadenza';
import schema from './ltt.schema.json';
import type { Ltt, LttSlideSegment, LttStretchSegment } from './types';
import { normalizeMatch, validateLtt } from './validate';

// These tests break files on purpose — delete a required key, add a forbidden one, set a field to
// the wrong type — which no honest type allows. One alias names that, instead of `any` scattered.
// biome-ignore lint/suspicious/noExplicitAny: a deliberately malformed fixture has no truthful type
type Mut = any;

const H = `sha256:${'ab'.repeat(32)}`;

/** A valid three-slide deck: a narrated first slide, a silent second, a narrated third. */
function deck(): Ltt {
	return {
		format: 'ltt',
		version: '1.0',
		source: { kind: 'deck', id: 'board.md' },
		inputs: { engine: H, pace: 'moderate', deckPace: 'natural', lang: 'en' },
		seekable: true,
		segments: [
			{ id: 'd1', kind: 'slide', at: { slide: 1 }, hash: H, basis: 'estimate', holdMs: 0, track: buildTrack('Revenue grew 18% to $4.2M.'), tailMs: 700 },
			{ id: 'd2', kind: 'hold', at: { slide: 2 }, holdMs: 1400 },
			{ id: 'd3', kind: 'slide', at: { slide: 3 }, hash: H, basis: 'estimate', holdMs: 1400, track: buildTrack('We ask the board to approve the plan.'), tailMs: 700 },
		],
	};
}

/** A valid tour before any run is recorded: a stretch that waits on the viewer, with an action. */
function tour(): Ltt {
	return {
		format: 'ltt',
		version: '1.0',
		source: { kind: 'tour', id: 'board-demo' },
		inputs: { engine: H, pace: 'moderate', viewport: { w: 1440, h: 900 }, motion: 'full', stagePace: 1 },
		seekable: false,
		segments: [
			{ id: 's1', kind: 'stretch', at: { beats: [0, 2] }, hash: H, basis: 'estimate', track: buildTrack('Open the report.') },
			{
				id: 's2',
				kind: 'stretch',
				at: { beats: [3, 5] },
				after: 'awaitUser',
				hash: H,
				basis: 'estimate',
				track: buildTrack('Now click Publish to send it to the board.'),
				actions: [{ cue: 0, word: 2, match: 'publish', verb: 'click', target: '#publish', arrive: 'on-word' }],
			},
		],
	};
}

const slide = (l: Ltt, i: number) => l.segments[i] as LttSlideSegment;
const stretch = (l: Ltt, i: number) => l.segments[i] as LttStretchSegment;

/** Apply `edit` to a fresh copy of `base()` and return what the validator says. */
function after(base: () => Ltt, edit: (l: Ltt & Record<string, Mut>) => void): string {
	const l = base() as Ltt & Record<string, Mut>;
	edit(l);
	return validateLtt(l).join('\n');
}

describe('validateLtt', () => {
	it('accepts a deck and a tour as the spec writes them', () => {
		expect(validateLtt(deck())).toEqual([]);
		expect(validateLtt(tour())).toEqual([]);
	});

	it('never throws, whatever it is handed', () => {
		for (const junk of [null, undefined, 0, 'ltt', [], { segments: 'x' }, { segments: [null, 1, { kind: 'slide' }] }]) {
			expect(() => validateLtt(junk)).not.toThrow();
			expect(validateLtt(junk).length).toBeGreaterThan(0);
		}
	});

	it('ignores a key it does not know outside the core — a reader skips a layer it has not heard of', () => {
		expect(after(deck, (l) => { l.future = 1; (l.segments[0] as Mut).futureLayer = { x: 1 }; l.inputs = { ...l.inputs, future: 2 } as Mut; })).toBe('');
	});

	// Each rule, broken on purpose. The fragment is what a person reading the report needs to see.
	const cases: [string, () => Ltt, (l: Ltt & Record<string, Mut>) => void, RegExp][] = [
		['a wrong format tag', deck, (l) => { (l as Mut).format = 'vtt'; }, /format is "vtt"/],
		['an unknown version', deck, (l) => { (l as Mut).version = '2.0'; }, /this reader knows "1\.0"/],
		['a packed file handed in unpacked', deck, (l) => { l.encoding = 'packed'; }, /unpack it before validating/],
		['a malformed hash', deck, (l) => { l.inputs.engine = 'sha256:abc'; }, /inputs\.engine is not a content hash/],
		['an unknown pace', deck, (l) => { l.inputs.pace = 'quick' as Mut; }, /inputs\.pace is "quick"/],
		['a tour input on a deck', deck, (l) => { l.inputs.motion = 'full'; }, /tour input; a deck does not carry it/],
		['a deck that says it is not seekable', deck, (l) => { l.seekable = false; }, /a deck is always seekable/],
		['a hold on the first slide', deck, (l) => { slide(l, 0).holdMs = 1400; }, /Play speaks the first slide at once/],
		['slides out of order', deck, (l) => { slide(l, 2).at = { slide: 2 }; }, /one per slide, with no gaps/],
		['a skipped slide', deck, (l) => { slide(l, 2).at = { slide: 4 }; }, /slide 3 comes next/],
		['a slide without its tail breath', deck, (l) => { delete (slide(l, 0) as Mut).tailMs; }, /tailMs is not a whole/],
		['a negative voice speed', deck, (l) => { slide(l, 0).audio = { src: 'a.mp3', clip: H, voice: { model: 'm', voice: 'v', speed: -1 }, measuredMs: 900 }; }, /non-negative speed/],
		['a repeated id', deck, (l) => { l.segments[1].id = 'd1'; }, /repeats/],
		['narration on a hold', deck, (l) => { (l.segments[1] as Mut).track = buildTrack('x'); }, /does not belong on a hold/],
		['a stretch in a deck', deck, (l) => { (l.segments[1] as Mut).kind = 'stretch'; }, /only a tour has/],
		['a narrated slide with no cues', deck, (l) => { slide(l, 0).track = { cues: [], durationMs: 0 }; }, /has no cues/],
		['a missing spoken form', deck, (l) => { delete (slide(l, 0).track.cues[0].words[0] as Mut).spoken; }, /core requires the spoken form/],
		['a fractional time', deck, (l) => { slide(l, 0).track.cues[0].words[0].endMs = 10.5; }, /endMs is not a whole/],
		['a durationMs that is not the last cue end', deck, (l) => { slide(l, 0).track.durationMs += 1; }, /durationMs is the end of the last cue/],
		['cues out of order (the core check, via validateTrack)', deck, (l) => { const t = buildTrack('One two. Three four.'); t.cues.reverse(); t.durationMs = t.cues[1].endMs; slide(l, 2).track = t; }, /out of order/],
		['an undeclared core key', deck, (l) => { (slide(l, 0).track.cues[0] as Mut).pitch = 3; }, /the core is closed/],
		['a hold field on a stretch', tour, (l) => { (l.segments[0] as Mut).holdMs = 0; }, /a stretch waits on `after`/],
		['beats running backward', tour, (l) => { stretch(l, 1).at = { beats: [1, 1] }; }, /before the previous stretch ended/],
		['a seekable tour with an unrecorded wait', tour, (l) => { l.seekable = true; }, /no recorded waitedMs/],
		['a recorded wait with nothing to wait on', tour, (l) => { stretch(l, 0).waitedMs = 500; }, /names none in `after`/],
		['an action whose word moved', tour, (l) => { stretch(l, 1).track = buildTrack('Now please click Publish.'); }, /names "publish", but cue 0 word 2 is now "click"/],
		['an action pointing past the track', tour, (l) => { stretch(l, 1).actions![0].word = 99; }, /which this track does not have/],
	];
	for (const [name, base, edit, want] of cases) {
		it(`reports ${name}`, () => {
			expect(after(base, edit)).toMatch(want);
		});
	}

	it('a seekable tour is valid once every wait is recorded', () => {
		expect(after(tour, (l) => { l.seekable = true; stretch(l, 1).waitedMs = 2300; })).toBe('');
	});
});

describe('the closed core agrees with the schema, key for key', () => {
	// validateLtt keeps its own key lists for the core; this pins them to the generated schema, so
	// a field added to types.ts cannot be accepted by one and refused by the other.
	const $defs = schema.$defs as unknown as Record<string, { properties: Record<string, unknown>; additionalProperties?: boolean }>;
	it('only the core is closed', () => {
		const closed = Object.entries($defs).filter(([, d]) => d.additionalProperties === false).map(([k]) => k).sort();
		expect(closed).toEqual(['CaptionTrack', 'Cue', 'Word']);
	});
	for (const [def, get] of [
		['Word', (l: Ltt) => slide(l, 0).track.cues[0].words[0]],
		['Cue', (l: Ltt) => slide(l, 0).track.cues[0]],
		['CaptionTrack', (l: Ltt) => slide(l, 0).track],
	] as const) {
		it(`${def}: every schema key is accepted, and nothing else is`, () => {
			for (const key of Object.keys($defs[def].properties)) {
				expect(after(deck, (l) => { const o = get(l) as Mut; if (!(key in o)) o[key] = key === 'endsParagraph' ? true : 1; })).not.toMatch(new RegExp(`"${key}", which the core does not define`));
			}
			expect(after(deck, (l) => { (get(l) as Mut).undeclared = 1; })).toMatch(/"undeclared", which the core does not define/);
		});
	}
});

describe('normalizeMatch', () => {
	it('case-folds and strips edge punctuation, as Vetrina matches a cue word', () => {
		expect(normalizeMatch('Publish.')).toBe('publish');
		expect(normalizeMatch('“Save,”')).toBe('save');
		expect(normalizeMatch('$4.2M')).toBe('4.2m');
	});
});

describe('validateLtt survives hostile input (red team, PR #2347)', () => {
	it('reports — never throws on — a null cue, a words string, a null word, a cue with no words', () => {
		const shapes: [string, (l: Ltt) => void][] = [
			['cues:[null]', (l) => { (slide(l, 0).track as Mut).cues = [null]; }],
			['words:"abc"', (l) => { (slide(l, 0).track.cues[0] as Mut).words = 'abc'; }],
			['words:[null]', (l) => { (slide(l, 0).track.cues[0] as Mut).words = [null]; }],
			['no words key', (l) => { delete (slide(l, 0).track.cues[0] as Mut).words; }],
		];
		for (const [name, edit] of shapes) {
			const l = deck();
			edit(l);
			expect(() => validateLtt(l), name).not.toThrow();
			expect(validateLtt(l).length, name).toBeGreaterThan(0);
		}
	});

	it('normalizeMatch is linear: a 40k-character punctuation run takes milliseconds, not a second', () => {
		const t = performance.now();
		expect(normalizeMatch(`a${'!'.repeat(40000)}a`)).toBe(`a${'!'.repeat(40000)}a`);
		expect(performance.now() - t).toBeLessThan(250);
	});

	it('quotes a hostile word short, so a report cannot run to megabytes', () => {
		const long = 'x'.repeat(40000);
		const msg = after(tour, (l) => { stretch(l, 1).actions![0].match = long; }).split('\n')[0];
		expect(msg.length).toBeLessThan(400);
	});

	it('refuses a time past the largest safe integer, where packed times stop adding back exactly', () => {
		expect(after(deck, (l) => { slide(l, 0).track.cues[0].words[0].endMs = 2 ** 53 + 2; })).toMatch(/endMs is not a whole/);
	});

	const timeline: [string, (l: Ltt) => void, RegExp][] = [
		['a word outside its cue', (l) => { slide(l, 0).track.cues[0].words[0].endMs = slide(l, 0).track.cues[0].endMs + 50; }, /outside its cue/],
		['words running backward', (l) => { const w = slide(l, 0).track.cues[0].words; w[2].startMs = w[1].startMs - 1; }, /before the word ahead of it/],
		['overlapping cues', (l) => { const t = buildTrack('One two. Three four.'); t.cues[0].endMs = t.cues[1].startMs + 1; slide(l, 2).track = t; }, /cues do not overlap/],
	];
	for (const [name, edit, want] of timeline) {
		it(`reports ${name}, which the slide length formula cannot describe`, () => {
			const l = deck();
			edit(l);
			expect(validateLtt(l).join('\n')).toMatch(want);
		});
	}
});

// The inversion pass (PR #2347) found validateLtt keeping its own enums and required fields, with
// nothing tying them to the generated schema: add `'recorded'` to LttBasis, or a required field to a
// segment, and the two disagreed with every test green. This walks the schema ALONGSIDE real
// fixtures, so every enum value and every required key the schema defines is exercised — generated,
// not listed, exactly as the encoding round trip is.
describe('validateLtt agrees with the schema on every enum value and every required key', () => {
	type Node = Record<string, Mut>;
	const $defs = schema.$defs as unknown as Record<string, Node>;
	const resolve = (n: Node): Node => (n.$ref ? resolve($defs[n.$ref.replace('#/$defs/', '')]) : n);
	const full = (): Ltt[] => {
		const d = deck();
		slide(d, 0).audio = { src: 'a.mp3', clip: H, voice: { model: 'm', voice: 'v', speed: 1 }, measuredMs: 900, leadMs: 4 };
		const t = tour();
		t.seekable = true;
		stretch(t, 1).waitedMs = 2300;
		stretch(t, 1).audio = { src: 'b.mp3', clip: H, voice: { model: 'm', voice: 'v', speed: 1 }, measuredMs: 900 };
		return [d, t];
	};
	/** Every (path, schema node) pair the fixture actually reaches, with paths in validateLtt's form. */
	function walk(node: Node, value: Mut, path: string, out: [string, Node, Mut][]): void {
		const n = resolve(node);
		if (n.oneOf) {
			const branch = n.oneOf.map(resolve).find((b: Node) => b.properties?.kind?.const === value?.kind);
			if (branch) walk(branch, value, path, out);
			return;
		}
		out.push([path, n, value]);
		if (n.type === 'object' && value && typeof value === 'object') {
			for (const [k, sub] of Object.entries(n.properties as Record<string, Node>)) {
				if (k in value) walk(sub, value[k], path ? `${path}.${k}` : k, out);
			}
		}
		if (n.type === 'array' && Array.isArray(value) && n.items) {
			for (let i = 0; i < value.length; i++) walk(n.items, value[i], `${path}[${i}]`, out);
		}
	}
	const get = (root: Mut, path: string): Mut => path.split(/\.|\[(\d+)\]/).filter(Boolean).reduce((o, k) => o[k], root);

	it('the fixtures are valid, and reach every enum in the schema', () => {
		const enums = new Set<string>();
		for (const f of full()) {
			expect(validateLtt(f)).toEqual([]);
			const out: [string, Node, Mut][] = [];
			walk(schema as Node, f, '', out);
			for (const [, n] of out) if (n.enum) enums.add(n.enum.join('|'));
		}
		const all = Object.values($defs).filter((d) => d.enum).map((d) => d.enum.join('|'));
		for (const e of all) expect(enums, `no fixture reaches the enum ${e}`).toContain(e);
	});

	it('every value each enum allows is accepted where it appears', () => {
		full().forEach((f, fi) => {
			const out: [string, Node, Mut][] = [];
			walk(schema as Node, f, '', out);
			for (const [path, n] of out) {
				if (!n.enum || path === 'source.kind') continue; // the kind decides which other fields apply
				for (const v of n.enum) {
					const l = full()[fi];
					const parts = path.split('.');
					const key = parts.pop() as string;
					(parts.length ? get(l, parts.join('.')) : l)[key] = v;
					const hits = validateLtt(l).filter((m) => m.startsWith(`${path} `));
					expect(hits, `${path} = ${v}`).toEqual([]);
				}
			}
		});
	});

	it('deleting any key the schema requires is refused', () => {
		full().forEach((f, fi) => {
			const out: [string, Node, Mut][] = [];
			walk(schema as Node, f, '', out);
			for (const [path, n, value] of out) {
				if (n.type !== 'object' || !value) continue;
				for (const key of n.required ?? []) {
					const l = full()[fi];
					delete (path ? get(l, path) : l)[key];
					expect(validateLtt(l).length, `deleting ${path ? `${path}.` : ''}${key} was accepted`).toBeGreaterThan(0);
				}
			}
		});
	});
});
