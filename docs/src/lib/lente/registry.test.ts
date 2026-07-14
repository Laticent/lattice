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

describe('workspace-inherited registry — upsert emits only the deck DELTA', () => {
	// The B model: reader views are INHERITED from a workspace setting, so an untouched deck writes NO
	// block; the deck source records only what the author changed (approved / modified / custom / dropped).
	// `parseLensRegistry(upsert(reg, WORKSPACE), WORKSPACE)` must round-trip back to `reg` every time.
	const pristine = () => parseLensRegistry('', WORKSPACE); // full + brief + ask + evidence, all inherited

	it('a pristine (untouched) deck writes NO lenses block — every view is inherited', () => {
		const reg = pristine();
		const fm = upsertLensRegistry('', reg, WORKSPACE);
		expect(fm).toBe('');
		expect(parseLensRegistry(fm, WORKSPACE)).toEqual(reg); // re-inherited identically
	});

	it('preserves unrelated front matter while writing no block for a pristine deck', () => {
		const fm = upsertLensRegistry('title: Deck\ntheme: indaco', pristine(), WORKSPACE);
		expect(fm).toContain('title: Deck');
		expect(fm).toContain('theme: indaco');
		expect(fm).not.toContain('lenses:');
	});

	it('APPROVING an inherited view materializes ONLY that view (portable); the rest stay inherited', () => {
		const reg = pristine();
		const approved: LensRegistry = { ...reg, lenses: reg.lenses.map((l) => (l.id === 'brief' ? { ...l, approved: 'sha256:abc123' } : l)) };
		const fm = upsertLensRegistry('', approved, WORKSPACE);
		expect(fm).toContain('brief:');
		expect(fm).toContain('approved: "sha256:abc123"');
		expect(fm).not.toMatch(/\bask:/); // inherited, not materialized
		expect(fm).not.toMatch(/\bevidence:/);
		expect(parseLensRegistry(fm, WORKSPACE)).toEqual(approved); // round-trips
	});

	it('MODIFYING an inherited view (relabel) materializes it even without approval', () => {
		const reg = pristine();
		const relabeled: LensRegistry = { ...reg, lenses: reg.lenses.map((l) => (l.id === 'brief' ? { ...l, label: 'My bottom line' } : l)) };
		const fm = upsertLensRegistry('', relabeled, WORKSPACE);
		expect(fm).toContain('My bottom line');
		expect(parseLensRegistry(fm, WORKSPACE)).toEqual(relabeled);
	});

	it('REMOVING an inherited view persists a `drop` so it does not silently re-inherit', () => {
		const reg = pristine();
		const dropped: LensRegistry = { ...reg, lenses: reg.lenses.filter((l) => l.id !== 'evidence') };
		const fm = upsertLensRegistry('', dropped, WORKSPACE);
		expect(fm).toContain('evidence: { drop: true }');
		const back = parseLensRegistry(fm, WORKSPACE);
		expect(back.lenses.map((l) => l.id)).toEqual(['full', 'brief', 'ask']); // stays removed
	});

	it('a CUSTOM (non-default) view is written in full and survives', () => {
		const reg = pristine();
		const withCustom: LensRegistry = { ...reg, lenses: [...reg.lenses, { id: 'custom', label: 'Mine', base: 'none' }] };
		const fm = upsertLensRegistry('', withCustom, WORKSPACE);
		expect(fm).toContain('custom: { label: "Mine", base: none }');
		expect(parseLensRegistry(fm, WORKSPACE).lenses.some((l) => l.id === 'custom')).toBe(true);
	});

	it('with the workspace setting OFF (no config), inherited views vanish — only the deck DELTA remains', () => {
		const reg = pristine();
		const approved: LensRegistry = { ...reg, lenses: reg.lenses.map((l) => (l.id === 'brief' ? { ...l, approved: 'sha256:abc' } : l)) };
		const fm = upsertLensRegistry('', approved, WORKSPACE);
		const off = parseLensRegistry(fm); // no workspace → no inheritance
		expect(off.lenses.map((l) => l.id)).toEqual(['full', 'brief']); // only the materialized (approved) one
	});

	it('lens-default is written only when the deck OVERRIDES the workspace default', () => {
		const reg = pristine(); // default: 'full' (== WORKSPACE.default)
		expect(upsertLensRegistry('', reg, WORKSPACE)).not.toContain('lens-default'); // matches inherited default
		const overridden: LensRegistry = { ...reg, default: 'brief' };
		expect(upsertLensRegistry('', overridden, WORKSPACE)).toContain('lens-default: brief');
		const ws2: WorkspaceLensConfig = { ...WORKSPACE, default: 'brief' };
		const reg2 = parseLensRegistry('', ws2);
		expect(upsertLensRegistry('', reg2, ws2)).not.toContain('lens-default');
	});

	it('writes lens-default: full when the WORKSPACE default is non-full and the deck opens on the whole deck', () => {
		// Checker Finding 2: `full` is a real DEVIATION from a non-full inherited default and must round-trip.
		const ws2: WorkspaceLensConfig = { ...WORKSPACE, default: 'brief' };
		const openFull: LensRegistry = { ...parseLensRegistry('', ws2), default: 'full' };
		const fm = upsertLensRegistry('', openFull, ws2);
		expect(fm).toContain('lens-default: full');
		expect(parseLensRegistry(fm, ws2).default).toBe('full'); // reader opens on the whole deck, not brief
	});

	it('CLEARING an inherited hidden/single (promoting a staged view) round-trips — never silently re-inherits', () => {
		// Checker Finding 1: an omitted boolean would re-merge the workspace value; the delta writes an
		// explicit `false`. `ask` is inherited as single+hidden; un-stage + un-single it, expect it to stick.
		const reg = pristine();
		const promoted: LensRegistry = { ...reg, lenses: reg.lenses.map((l) => (l.id === 'ask' ? { id: 'ask', label: 'The ask', base: 'none' as const } : l)) };
		const fm = upsertLensRegistry('', promoted, WORKSPACE);
		expect(fm).toContain('hidden: false');
		expect(fm).toContain('single: false');
		const back = parseLensRegistry(fm, WORKSPACE);
		const ask = back.lenses.find((l) => l.id === 'ask');
		expect(ask?.hidden).toBeUndefined(); // stayed promoted — not re-hidden
		expect(ask?.single).toBeUndefined();
		expect(back).toEqual(promoted);
	});

	it('does not double-count an implicit full lens mistakenly declared in the workspace', () => {
		// Checker Finding 3: a misconfigured workspace with an `id: full` lens must not yield two fulls.
		const wsBad: WorkspaceLensConfig = { default: 'full', lenses: [{ id: 'full', label: 'Whole thing', base: 'all' }, { id: 'brief', label: 'Bottom line', base: 'none' }] };
		const reg = parseLensRegistry('', wsBad);
		expect(reg.lenses.filter((l) => l.id === 'full')).toHaveLength(1);
		expect(reg.lenses[0].label).toBe('Full deck'); // the canonical implicit full, not the workspace's
	});
});
