import { describe, expect, it } from 'vitest';
import { emitRegistry, parseLensRegistry, upsertLensRegistry } from './registry';
import type { LensRegistry, WorkspaceLensConfig } from './types';

const WORKSPACE: WorkspaceLensConfig = {
	default: 'full',
	lenses: [
		{ id: 'brief', label: 'Bottom line', base: 'none' },
		{ id: 'ask', label: 'The ask', base: 'none', single: true, hidden: true },
		{ id: 'evidence', label: 'Show the work', base: 'all', hidden: true },
	],
};

describe('parseLensRegistry', () => {
	it('always includes the implicit full lens at index 0', () => {
		const reg = parseLensRegistry('');
		expect(reg.lenses[0].id).toBe('full');
		expect(reg.default).toBe('full');
	});
	it('parses an inline-flow-map block with quoted commas', () => {
		const fm = 'title: Q3\nlenses:\n  brief: { label: "Findings, in brief", base: none, approved: "sha256:ab" }';
		const reg = parseLensRegistry(fm);
		const brief = reg.lenses.find((l) => l.id === 'brief');
		expect(brief).toMatchObject({ label: 'Findings, in brief', base: 'none', approved: 'sha256:ab' });
	});
	it('merges workspace defaults, then per-deck overrides by id', () => {
		const reg = parseLensRegistry('lenses:\n  brief: { label: "Headline" }', WORKSPACE);
		expect(reg.lenses.find((l) => l.id === 'brief')?.label).toBe('Headline'); // deck overrides label
		expect(reg.lenses.find((l) => l.id === 'ask')?.hidden).toBe(true); // inherited untouched
	});
	it('drops an inherited lens with { drop: true }', () => {
		const reg = parseLensRegistry('lenses:\n  evidence: { drop: true }', WORKSPACE);
		expect(reg.lenses.find((l) => l.id === 'evidence')).toBeUndefined();
	});
	it('lens-defaults: off ignores workspace lenses entirely', () => {
		const reg = parseLensRegistry('lens-defaults: off\nlenses:\n  custom: { label: "Only me", base: none }', WORKSPACE);
		expect(reg.lenses.map((l) => l.id).sort()).toEqual(['custom', 'full']);
	});
	it('honors lens-default and falls back to full when it names nothing', () => {
		expect(parseLensRegistry('lens-default: brief\nlenses:\n  brief: { base: none }').default).toBe('brief');
		expect(parseLensRegistry('lens-default: ghost').default).toBe('full');
	});
	it('skips a malformed child line without throwing', () => {
		const reg = parseLensRegistry('lenses:\n  brief: { base: none }\n  broken line here\n  ask: { base: none }');
		expect(reg.lenses.map((l) => l.id)).toEqual(['full', 'brief', 'ask']);
	});
});

describe('round-trip — parse(upsert(x)) preserves the registry', () => {
	const cases: LensRegistry[] = [
		{ default: 'full', lenses: [{ id: 'full', label: 'Full deck', base: 'all' }] },
		{
			default: 'brief',
			lenses: [
				{ id: 'full', label: 'Full deck', base: 'all' },
				{ id: 'brief', label: 'Bottom line', base: 'none', order: 1, approved: 'sha256:deadbeef' },
				{ id: 'ask', label: 'The ask', base: 'none', single: true, hidden: true, order: 2 },
				{ id: 'evidence', label: 'Show the work', base: 'all', order: 3 },
			],
		},
	];
	it.each(cases.map((c, i) => [i, c] as const))('case %i deep-equals after a round-trip', (_i, reg) => {
		const fm = upsertLensRegistry('title: Deck', reg);
		const back = parseLensRegistry(fm);
		expect(back).toEqual(reg);
	});
	it('preserves unrelated front-matter keys and emits a canonical block', () => {
		const reg = cases[1];
		const fm = upsertLensRegistry('title: Deck\ntheme: indaco', reg);
		expect(fm).toContain('title: Deck');
		expect(fm).toContain('theme: indaco');
		expect(fm).toContain('lens-default: brief');
		expect(emitRegistry(reg)).toContain('brief: { label: "Bottom line", base: none, order: 1, approved: "sha256:deadbeef" }');
	});
	it('replaces an existing block rather than duplicating it', () => {
		const reg = cases[1];
		const first = upsertLensRegistry('title: Deck', reg);
		const second = upsertLensRegistry(first, reg);
		expect(second).toBe(first);
		expect(second.match(/lenses:/g)?.length).toBe(1);
	});
	it('round-trips a label with an ODD number of quotes on a base:all + approved lens (no corruption)', () => {
		// The maker-checker MAJOR: an escaped quote must not close the string and swallow the comma,
		// which would silently flip base:all->none and drop approved.
		const reg: LensRegistry = {
			default: 'full',
			lenses: [
				{ id: 'full', label: 'Full deck', base: 'all' },
				{ id: 'evidence', label: 'a"b — "quoted', base: 'all', approved: 'sha256:cafe' },
			],
		};
		const back = parseLensRegistry(upsertLensRegistry('', reg));
		expect(back).toEqual(reg); // base stays 'all', approved survives, label intact
	});
	it('round-trips a label containing a comma and control-escapes', () => {
		const reg: LensRegistry = {
			default: 'full',
			lenses: [
				{ id: 'full', label: 'Full deck', base: 'all' },
				{ id: 'brief', label: 'Findings, in brief\ttab', base: 'none' },
			],
		};
		expect(parseLensRegistry(upsertLensRegistry('', reg))).toEqual(reg);
	});
});
