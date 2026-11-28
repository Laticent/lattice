// The reference reader against SEGNO-1.0's shared test cases (spec/conformance/segno/cases.json). The cases are written
// against the spec, not this code; this file is the adapter that turns `parse`'s tree into the cases' shape (positions
// dropped, `quoted` and `name` and `tag` only where they are set) and compares. A second implementation runs the same
// file with its own adapter.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, test } from 'vitest';
import { type Item, parse, type Value } from './notation';

const here = path.dirname(fileURLToPath(import.meta.url));
const file = path.resolve(here, '../../../../spec/conformance/segno/cases.json');
const { cases } = JSON.parse(fs.readFileSync(file, 'utf8')) as {
	cases: { section: string; title: string; input: string; item?: unknown; refuse?: string; ok?: true }[];
};

type Shape = Record<string, unknown> | null;
function valueShape(v: Value | null): Shape {
	if (v === null) return null;
	if (v.kind === 'scalar') return v.quoted ? { kind: 'scalar', text: v.text, quoted: true } : { kind: 'scalar', text: v.text };
	if (v.kind === 'description') return { kind: 'description', text: v.text };
	if (v.kind === 'list') return { kind: 'list', items: v.items.map(valueShape) };
	return { kind: 'record', items: v.items.map(itemShape) };
}
function itemShape(it: Item): Shape {
	const out: Record<string, unknown> = {};
	if (it.tag) out.tag = it.tag;
	if (it.name !== null) out.name = it.name;
	out.value = valueShape(it.value);
	return out;
}

describe('SEGNO-1.0 shared test cases', () => {
	test('the case file is not empty', () => {
		expect(cases.length).toBeGreaterThan(30);
	});
	for (const c of cases) {
		test(`§${c.section} ${c.title}: ${JSON.stringify(c.input)}`, () => {
			const r = parse(c.input);
			if (c.refuse) {
				expect(r.ok, 'the span must be refused').toBe(false);
				if (!r.ok) expect(r.diagnostic.code).toBe(c.refuse);
				return;
			}
			expect(r.ok ? true : r.diagnostic, 'the span must read').toBe(true);
			if (r.ok && c.item !== undefined) expect(itemShape(r.item)).toEqual(c.item);
		});
	}
});
