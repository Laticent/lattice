// The `.lattice` file's shared test cases (spec/conformance/lattice-file/) run against the
// reference reader, `readLatticeFile`. The cases are written against spec/LATTICE-FILE-1.0.md;
// this file is the adapter: it zips each case's entries and maps the reader's refusal messages to
// the spec's four refusal reasons. The second block is the failing arm: every case's verdict is
// flipped and must fail.

import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import JSZip from 'jszip';
import { describe, expect, it } from 'vitest';
import { readLatticeFile } from './lattice-file';

type Expect = { ok: boolean; source?: string; title?: string; comments?: number; themes?: string[]; refused?: string };
type Case = { name: string; title: string; section: string; entries: Record<string, unknown>; expect: Expect };

const dir = join(__dirname, '../../../../spec/conformance/lattice-file');
const cases: Case[] = readdirSync(dir)
	.filter((f) => f.endsWith('.json'))
	.sort()
	.map((f) => ({ name: f.slice(0, -5), ...JSON.parse(readFileSync(join(dir, f), 'utf8')) }));

// The reference reader's messages, by the reason spec §5 gives for each refusal.
const REASONS: [RegExp, string][] = [
	[/missing its deck or manifest/, 'missing-entry'],
	[/newer Lattice/, 'newer-version'],
	[/version is invalid/, 'bad-version'],
	[/Not a Lattice file/, 'not-lattice'],
];

async function read(c: Case): Promise<Expect> {
	const zip = new JSZip();
	for (const [path, value] of Object.entries(c.entries)) zip.file(path, typeof value === 'string' ? value : JSON.stringify(value));
	const bytes = await zip.generateAsync({ type: 'uint8array', compression: 'DEFLATE' });
	try {
		const r = await readLatticeFile(bytes);
		return { ok: true, source: r.source, title: r.title, comments: r.comments.length, themes: r.packages.themes.map((t) => t.name) };
	} catch (e) {
		const message = String((e as Error).message);
		return { ok: false, refused: REASONS.find(([re]) => re.test(message))?.[1] ?? `unmapped: ${message}` };
	}
}

/** The fields `expect` names, compared; [] when they all match. */
async function failures(c: Case): Promise<string[]> {
	const got = await read(c);
	return Object.entries(c.expect)
		.filter(([k, v]) => JSON.stringify(got[k as keyof Expect]) !== JSON.stringify(v))
		.map(([k, v]) => `${k} is ${JSON.stringify(got[k as keyof Expect])}, expected ${JSON.stringify(v)}`);
}

describe('.lattice conformance: every shared case on the reference reader', () => {
	it('covers the container, the manifest, packages, the checks and versioning', () => {
		const sections = new Set(cases.map((c) => c.section));
		for (const s of ['2', '3', '4', '5', '7']) expect(sections.has(s), `§${s} has a case`).toBe(true);
	});
	for (const c of cases) it(`${c.name}: ${c.title}`, async () => expect(await failures(c)).toEqual([]));
});

describe('.lattice conformance: a wrong expectation fails (the arm that bites)', () => {
	for (const c of cases) {
		it(c.name, async () => {
			const flipped = { ...c, expect: c.expect.ok ? { ok: false, refused: 'missing-entry' } : { ok: true } };
			expect((await failures(flipped)).length).toBeGreaterThan(0);
		});
	}
});
