// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createStyleLoader } from './style-loader';

// A three-module sheet: `base` is unconditional, `card` needs `.card`, `chart` needs `.chart svg`
// (verified against the document) and `fx` is pulled in by `card` through a named definition.
const FILES: Record<string, string> = {
	'0-base.css': ':root{--x:1}',
	'1-card.css': '.card{animation:fx 1s}',
	'2-chart.css': '.chart svg{fill:red}',
	'3-fx.css': '@keyframes fx{to{opacity:0}}/* </style><img src=x onerror=alert(1)> */',
	'4-empty.css': '',
};
const NEEDS = {
	version: 1,
	verified: true,
	runtime: { c: ['db-copied'], a: [] },
	modules: [
		{ id: 'base', file: '0-base.css', bytes: FILES['0-base.css'].length },
		{ id: 'card', file: '1-card.css', bytes: FILES['1-card.css'].length },
		{ id: 'chart', file: '2-chart.css', bytes: FILES['2-chart.css'].length },
		{ id: 'fx', file: '3-fx.css', bytes: FILES['3-fx.css'].length },
		{ id: 'empty', file: '4-empty.css', bytes: 0 },
	],
	index: [
		{ id: 'base', always: true, alts: [], requires: [] },
		{ id: 'card', always: false, alts: [[['card'], [], [], []]], requires: [3] },
		{ id: 'chart', always: false, alts: [[['chart'], [], ['svg'], []]], requires: [], sel: [['.chart svg']] },
		{ id: 'fx', always: false, alts: [[['fx-only'], [], [], []]], requires: [], defines: ['fx'] },
		{ id: 'empty', always: false, alts: [[['never'], [], [], []]], requires: [] },
	],
};

describe('createStyleLoader', () => {
	let fetched: string[];
	beforeEach(() => {
		fetched = [];
		vi.stubGlobal('fetch', (url: string) => {
			const file = url.split('/').pop() as string;
			fetched.push(file);
			const body = file === 'needs.json' ? JSON.stringify(NEEDS) : FILES[file];
			return Promise.resolve({ ok: body != null, status: body != null ? 200 : 404, text: () => Promise.resolve(body ?? '') } as Response);
		});
	});

	it('loads the index and only the unconditional modules for the floor', async () => {
		const s = createStyleLoader('/styles/', { wholeAbove: 1 });
		await s.ready();
		expect(fetched).toEqual(['needs.json', '0-base.css']);
		expect(s.css()).toBe(':root{--x:1}');
	});

	it('loads the common modules named by `floor` with the floor, so they are not a round trip after the first render', async () => {
		const withFloor = { ...NEEDS, floor: [1] };
		vi.stubGlobal('fetch', (url: string) => {
			const file = url.split('/').pop() as string;
			fetched.push(file);
			const body = file === 'needs.json' ? JSON.stringify(withFloor) : FILES[file];
			return Promise.resolve({ ok: body != null, status: body != null ? 200 : 404, text: () => Promise.resolve(body ?? '') } as Response);
		});
		const s = createStyleLoader('/styles/', { wholeAbove: 1 });
		await s.ready();
		expect(fetched).toContain('1-card.css');
		expect(s.css()).toContain('.card');
		// …and the scan then finds nothing new for a slide that needs only them.
		expect(fetched).toContain('3-fx.css'); // `card` mentions `fx`, which another module defines
		expect(await s.ensureFor('<section class="card"></section>')).toBe('same');
	});

	it('loads what the slides need, in lattice.css order, and pulls named definitions through `requires`', async () => {
		const s = createStyleLoader('/styles/', { wholeAbove: 1 });
		await s.ready();
		expect(await s.ensureFor('<article class="lattice"><section class="card">x</section></article>')).toBe('grew');
		// card needs fx (it mentions `fx`), and the chart module stays out: no `.chart`.
		expect(fetched).toContain('1-card.css');
		expect(fetched).toContain('3-fx.css');
		expect(fetched).not.toContain('2-chart.css');
		expect(s.css().indexOf('.card')).toBeGreaterThan(s.css().indexOf(':root'));
		expect(s.css().indexOf('@keyframes')).toBeGreaterThan(s.css().indexOf('.card'));
	});

	it('answers false when nothing new is needed, and the signature moves only when the set does', async () => {
		const s = createStyleLoader('/styles/', { wholeAbove: 1 });
		await s.ready();
		const sig0 = s.signature();
		await s.ensureFor('<section class="card"></section>');
		const sig1 = s.signature();
		expect(sig1).not.toBe(sig0);
		expect(await s.ensureFor('<section class="card"></section>')).toBe('same');
		expect(s.signature()).toBe(sig1);
	});

	it("says 'whole' when the slides need most of the sheet, and fetches no module for them", async () => {
		const s = createStyleLoader('/styles/', { wholeAbove: 0.3 });
		await s.ready();
		const before = fetched.length;
		expect(await s.ensureFor('<section class="card chart"><svg></svg></section>')).toBe('whole');
		expect(fetched.length).toBe(before);
	});

	it('does not scan the same slides twice', async () => {
		const s = createStyleLoader('/styles/', { wholeAbove: 1 });
		await s.ready();
		await s.ensureFor('<section class="card"></section>');
		const scans = s.stats().scans;
		expect(await s.ensureFor('<section class="card"></section>')).toBe('same');
		expect(s.stats().scans).toBe(scans);
	});

	it('never drops a module within a session (the union only grows)', async () => {
		const s = createStyleLoader('/styles/', { wholeAbove: 1 });
		await s.ready();
		await s.ensureFor('<section class="card"></section>');
		await s.ensureFor('<section></section>');
		expect(s.css()).toContain('.card');
	});

	it('verifies a met alternative against the document: `.chart` without an svg loads nothing', async () => {
		const s = createStyleLoader('/styles/', { wholeAbove: 1 });
		await s.ready();
		await s.ensureFor('<section class="chart"><p>no svg</p></section>');
		expect(fetched).not.toContain('2-chart.css');
		await s.ensureFor('<section class="chart"><svg></svg></section>');
		expect(fetched).toContain('2-chart.css');
	});

	it('counts a runtime token as present, so a rule keyed on a class script adds later still loads', async () => {
		const s = createStyleLoader('/styles/', { wholeAbove: 1, shell: { open: '<!doctype html><html><body>', prefix: '', runtime: { c: ['fx-only'] } } });
		await s.ready();
		await s.ensureFor('<section></section>');
		expect(fetched).toContain('3-fx.css');
	});

	it('loads the module that defines a name the composed sheet mentions (a palette naming a font only lattice.css declares)', async () => {
		const s = createStyleLoader('/styles/', { wholeAbove: 1 });
		await s.ready();
		expect(await s.ensureFor('<section></section>', ':root{--font-body:fx}')).toBe('grew');
		expect(fetched).toContain('3-fx.css');
	});

	it('neutralizes a `</style` carried in a module (HARD RULE #22) before anything holds it', async () => {
		const s = createStyleLoader('/styles/', { wholeAbove: 1 });
		await s.ready();
		await s.ensureFor('<section class="card"></section>');
		expect(s.css()).not.toMatch(/<\/style/i);
		expect(s.css()).toContain('@keyframes fx');
	});

	it('does not request a module that minifies to nothing', async () => {
		const s = createStyleLoader('/styles/', { wholeAbove: 1 });
		await s.ready();
		await s.ensureFor('<section class="never"></section>');
		expect(fetched).not.toContain('4-empty.css');
	});

	it('warm() fetches the modules a class word names but adds nothing to the base', async () => {
		const s = createStyleLoader('/styles/', { wholeAbove: 1 });
		await s.ready();
		s.warm('<!-- _class: card -->\n# hi');
		await new Promise((r) => setTimeout(r, 20));
		expect(fetched).toContain('1-card.css');
		expect(s.css()).not.toContain('.card');
	});

	it('warm() stops reading class words at a comment end, `-->` or `--!>`', async () => {
		const s = createStyleLoader('/styles/', { wholeAbove: 1 });
		await s.ready();
		s.warm('<!-- _class: --!> card -->\n# hi');
		await new Promise((r) => setTimeout(r, 20));
		expect(fetched, 'a word after --!> is not a class').not.toContain('1-card.css');
	});

	it('retries the index after a transient failure instead of caching it', async () => {
		let calls = 0;
		vi.stubGlobal('fetch', (url: string) => {
			calls++;
			const ok = calls > 1;
			return Promise.resolve({ ok, status: ok ? 200 : 503, text: () => Promise.resolve(url.endsWith('needs.json') ? JSON.stringify(NEEDS) : FILES[url.split('/').pop() as string] ?? '') } as Response);
		});
		const s = createStyleLoader('/styles/', { wholeAbove: 1 });
		await expect(s.ready()).rejects.toThrow(/503/);
		await expect(s.ready()).resolves.toBeUndefined();
	});
});
