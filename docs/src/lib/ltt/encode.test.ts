// The encodings are lossless both ways, and the proof is GENERATED from the JSON Schema rather than
// listed by hand (guardrail G1, 2026-09-24-lattice-timing-track.md §7): the fixture below carries
// every field the schema defines, so a field added to types.ts — and so to the schema — that
// `packTrack` does not carry fails here, with no test to remember to update.

import { gzipSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';
import { buildTrack } from '@/lib/cadenza';
import { type PackedLtt, pack, packTrack, unpack, unpackTrack } from './encode';
import schema from './ltt.schema.json';
import type { Ltt } from './types';

// A JSON Schema node, walked generically — its shape is whatever the schema says.
// biome-ignore lint/suspicious/noExplicitAny: a schema node is untyped JSON by nature
type S = Record<string, any>;
const defs = schema.$defs as Record<string, S>;

/**
 * An instance of `node` with EVERY property present, optional ones included. `flavor` picks the
 * edge each run exercises: 'distinct' gives every string its own value (so `spoken` differs from
 * `display`) and booleans true; 'plain' makes every string the same (so `spoken` equals `display`,
 * the case packing omits) and booleans false (present-but-false, which must not read back absent).
 */
function sample(node: S, flavor: 'distinct' | 'plain', path: string, counter: { n: number }): unknown {
	if (node.$ref) return sample(defs[node.$ref.replace('#/$defs/', '')], flavor, path, counter);
	if ('const' in node) return node.const;
	if (node.enum) return node.enum[counter.n++ % node.enum.length];
	if (node.oneOf) return node.oneOf.map((v: S, i: number) => sample(v, flavor, `${path}|${i}`, counter));
	switch (node.type) {
		case 'object': {
			const out: Record<string, unknown> = {};
			for (const [k, v] of Object.entries(node.properties as Record<string, S>)) out[k] = sample(v, flavor, `${path}.${k}`, counter);
			return out;
		}
		case 'array': {
			if (node.prefixItems) return node.prefixItems.map((v: S, i: number) => sample(v, flavor, `${path}[${i}]`, counter));
			// A oneOf item type yields one element per variant; anything else, two elements, so
			// relative offsets are exercised against a non-zero base.
			const items = node.items as S;
			const first = sample(items, flavor, `${path}[0]`, counter);
			if (items.oneOf || (items.$ref && defs[items.$ref.replace('#/$defs/', '')].oneOf)) return first;
			return [first, sample(items, flavor, `${path}[1]`, counter)];
		}
		case 'string':
			if (node.pattern) return `sha256:${'0123456789abcdef'.repeat(4)}`;
			return flavor === 'plain' ? 'same' : `s${counter.n++}:${path}`;
		case 'integer':
			return 7 + 13 * counter.n++;
		case 'number':
			return 1.25 + counter.n++;
		case 'boolean':
			return flavor === 'distinct';
		default:
			throw new Error(`the round-trip generator does not know schema node ${JSON.stringify(node)} at ${path} — teach it, do not skip it`);
	}
}

/** The same, with only the REQUIRED properties — the other end of the optional-field range. */
function minimal(node: S, counter: { n: number }): unknown {
	if (node.$ref) return minimal(defs[node.$ref.replace('#/$defs/', '')], counter);
	if (node.type === 'object') {
		const out: Record<string, unknown> = {};
		for (const k of (node.required as string[]) ?? []) out[k] = minimal(node.properties[k], counter);
		return out;
	}
	if (node.type === 'array' && node.items) {
		const items = node.items as S;
		const variants = items.oneOf ?? (items.$ref && defs[items.$ref.replace('#/$defs/', '')].oneOf);
		return variants ? variants.map((v: S) => minimal(v, counter)) : [minimal(items, counter)];
	}
	return sample(node, 'distinct', 'min', counter);
}

const roundTrip = (ltt: Ltt): Ltt => unpack(JSON.parse(JSON.stringify(pack(ltt))) as PackedLtt);

describe('canonical ↔ packed, generated from the schema', () => {
	for (const flavor of ['distinct', 'plain'] as const) {
		it(`every field the schema defines survives a round trip (${flavor})`, () => {
			const ltt = sample(schema as S, flavor, '', { n: 0 }) as Ltt;
			// The generator really did reach every kind of segment and every core field.
			expect(ltt.segments.map((s) => s.kind)).toEqual(['slide', 'hold', 'stretch']);
			const word = (ltt.segments[0] as { track: { cues: { words: object[] }[] } }).track.cues[0].words[0];
			expect(Object.keys(word).sort()).toEqual(Object.keys(defs.Word.properties).sort());
			expect(roundTrip(ltt)).toStrictEqual(ltt);
		});
	}

	it('the required-only file survives a round trip too', () => {
		const ltt = minimal(schema as S, { n: 0 }) as Ltt;
		expect(roundTrip(ltt)).toStrictEqual(ltt);
	});

	it('a key a later layer adds, which this package has never heard of, rides through untouched', () => {
		const ltt = sample(schema as S, 'distinct', '', { n: 0 }) as Ltt & Record<string, unknown>;
		const withLayer = { ...ltt, futureTopLevel: { a: 1 }, segments: ltt.segments.map((s) => ({ ...s, futureLayer: [1, 2] })) } as unknown as Ltt;
		expect(roundTrip(withLayer)).toStrictEqual(withLayer);
	});

	it('unpack refuses a file that does not say it is packed', () => {
		const ltt = sample(schema as S, 'distinct', '', { n: 0 }) as Ltt;
		expect(() => unpack(ltt as unknown as PackedLtt)).toThrow(/not in the packed encoding/);
	});
});

describe('a real track from buildTrack', () => {
	// The size sample from the design note §7: a five-sentence board paragraph with a percentage,
	// a currency figure and an acronym, three times over, each repeat ending with a space.
	const PARAGRAPH =
		'Revenue grew 18% to $4.2M this quarter, led by enterprise renewals. ARR crossed the ten million mark in August. ' +
		'Churn fell for the third straight quarter. We are raising guidance for the full year. ' +
		'The board is asked to approve the hiring plan on the next slide. ';
	const track = buildTrack(PARAGRAPH.repeat(3), { pace: 'moderate' });

	it('round-trips byte for byte, key order included', () => {
		expect(JSON.stringify(unpackTrack(packTrack(track)))).toBe(JSON.stringify(track));
	});

	it('weights, paragraph ends and a spoken form that differs all survive', () => {
		const t = buildTrack('Revenue grew $4.2M.\n\nWe hired.', { emphasis: [{ start: 0, end: 7, weight: 2 }] });
		expect(t.cues[0].weight).toBeDefined();
		expect(t.cues[0].endsParagraph).toBe(true);
		expect(JSON.stringify(unpackTrack(packTrack(t)))).toBe(JSON.stringify(t));
	});

	it('the packed form keeps the §7 size claim: 141 words, gzipped at least 2.5x smaller than canonical', () => {
		const words = track.cues.reduce((n, c) => n + c.words.length, 0);
		expect(words).toBe(141);
		const gz = (o: unknown) => gzipSync(JSON.stringify(o)).length;
		expect(gz(track) / gz(packTrack(track))).toBeGreaterThanOrEqual(2.5);
	});
});
