import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { slideTakesTable, TABLE_UNSUITED_NAMES } from './registers';

// The table door Compose offers, and the curated list of layouts it stands down on.
//
// The list is EDITORIAL and hand-written, which is the point: a previous version derived it
// from the manifest with a regex and answered a different question, hiding the control on 57
// of 61 components including `content`. A machine can tell you which components DECLARE a
// table; only a person can say on which ones a table is the wrong slide.
//
// Hand-written also means it can rot — a component gets renamed or retired and its entry
// silently stops matching anything. The census at the bottom is the guard against that.

const d = (cls: string) => [`<!-- _class: ${cls} -->`];

describe('slideTakesTable', () => {
	it('withholds the door on a layout whose anatomy is one statement or one picture', () => {
		for (const cls of ['title', 'closing', 'quote', 'big-number', 'scene', 'wifi']) {
			expect(slideTakesTable(d(cls)), cls).toBe(false);
		}
	});

	it('offers it on `content` — the catch-all body layout, where a table is ordinary', () => {
		// The single most important entry in this file: the derived gate got this one wrong,
		// which removed the only in-Compose route to a table on the default body slide.
		expect(slideTakesTable(d('content'))).toBe(true);
	});

	it('offers it on the four layouts that take a table as their primary content', () => {
		for (const cls of ['compare-table', 'matrix-grid', 'obligation-matrix', 'roadmap']) {
			expect(slideTakesTable(d(cls)), cls).toBe(true);
		}
	});

	it('is PERMISSIVE for an unclassed slide and an unknown class', () => {
		expect(slideTakesTable([])).toBe(true);
		expect(slideTakesTable(d('not-a-real-component'))).toBe(true);
	});

	it('reads every token of the class payload, not just the first', () => {
		// `<!-- _class: dark quote -->` is ordinary authoring and the component name does not
		// have to lead. Matching only the first token resolved this to `dark` and fell through.
		expect(slideTakesTable(['<!-- _class: dark quote -->'])).toBe(false);
		expect(slideTakesTable(['<!-- _class: quote dark -->'])).toBe(false);
	});

	it('cannot be tricked into a prototype-chain hit', () => {
		// A `Set` lookup, not a plain-object one — `constructor` and friends resolve to nothing.
		for (const cls of ['constructor', 'hasOwnProperty', 'toString']) {
			expect(slideTakesTable(d(cls)), cls).toBe(true);
		}
	});

	it('honors the LAST matching directive, as the engine does', () => {
		expect(slideTakesTable(['<!-- _class: content -->', '<!-- _class: quote -->'])).toBe(false);
	});
});

// THE ANTI-ROT CENSUS. Every curated name must still be a real component. Without this a
// rename turns an entry into a no-op that nothing reports — the door quietly comes back on a
// layout we decided it did not belong on, and no test fails.
describe('the curated list stays anchored to real components', () => {
	it('every withheld name exists in the shipped manifest', () => {
		const manifest = JSON.parse(readFileSync(join(process.cwd(), '..', 'dist/docs/components.json'), 'utf8')) as { components?: { name?: string }[] };
		const known = new Set((manifest.components ?? []).map((c) => c.name));
		expect(known.size).toBeGreaterThan(50); // the manifest actually loaded
		const missing = TABLE_UNSUITED_NAMES.filter((n) => !known.has(n));
		expect(missing, 'curated names that no longer match a component').toEqual([]);
	});
});
