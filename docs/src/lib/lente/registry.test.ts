import { describe, expect, it } from 'vitest';
import { emitRegistry, parseLensRegistry, upsertLensRegistry } from './registry';
import type { LensDef, LensRegistry, WorkspaceLensConfig } from './types';

const WORKSPACE: WorkspaceLensConfig = {
	default: 'full',
	lenses: [
		{ id: 'brief', label: 'Bottom line', base: 'none', kind: 'rung' },
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

	it('MATERIALIZES a pristine inherited view the deck has TAGGED (tagging counts as touching, #993)', () => {
		const reg = pristine();
		// brief's def is untouched (pristine), but the deck tagged slides into it → force-materialize {brief}.
		const fm = upsertLensRegistry('', reg, WORKSPACE, new Set(['brief']));
		// `kind: rung` rides along: a materialized view has to be self-contained, and dropping it here
		// would silently demote the deck's own rung to a cut the moment the workspace setting goes off.
		expect(fm).toContain('brief: { label: "Bottom line", base: none, kind: rung }');
		expect(fm).not.toMatch(/\bask:/); // ask NOT tagged → stays inherited (no block)
		expect(fm).not.toMatch(/\bevidence:/);
		expect(parseLensRegistry(fm, WORKSPACE)).toEqual(reg); // still round-trips with the workspace
		// The whole point: brief now persists even with the setting OFF (it's the deck's own view).
		expect(parseLensRegistry(fm).lenses.map((l) => l.id)).toEqual(['full', 'brief']);
	});

	it('a materialize hint for an untagged view is a no-op (only tagged views are written)', () => {
		// materialize names `ask`, but the reg for `ask` is pristine and NOT in the set actually tagged →
		// here we pass an EMPTY set, so nothing extra is forced: a pristine deck still writes nothing.
		expect(upsertLensRegistry('', pristine(), WORKSPACE, new Set())).toBe('');
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

	it('a source tombstone survives an OFF-mode rewrite — a dropped starter never silently re-inherits', () => {
		// Red-team finding: drop evidence (ON) → toggle OFF → any lens write (OFF) → toggle ON must NOT
		// resurrect evidence. The `{drop:true}` marker in source has to survive the OFF-mode rewrite even
		// though emitRegistry has no workspace to reconstruct it from.
		const dropped: LensRegistry = { ...pristine(), lenses: pristine().lenses.filter((l) => l.id !== 'evidence') };
		const onFm = upsertLensRegistry('', dropped, WORKSPACE);
		expect(onFm).toContain('evidence: { drop: true }');
		// The setting is now OFF: parse without a workspace, make another (unrelated) write, re-upsert OFF.
		const off = parseLensRegistry(onFm); // no workspace → evidence simply absent
		const offFm = upsertLensRegistry(onFm, off); // OFF-mode rewrite must PRESERVE the tombstone
		expect(offFm).toContain('evidence: { drop: true }');
		// Back ON: evidence stays dropped — it does not re-inherit.
		expect(parseLensRegistry(offFm, WORKSPACE).lenses.find((l) => l.id === 'evidence')).toBeUndefined();
	});

	it('does not double-count an implicit full lens mistakenly declared in the workspace', () => {
		// Checker Finding 3: a misconfigured workspace with an `id: full` lens must not yield two fulls.
		const wsBad: WorkspaceLensConfig = { default: 'full', lenses: [{ id: 'full', label: 'Whole thing', base: 'all' }, { id: 'brief', label: 'Bottom line', base: 'none' }] };
		const reg = parseLensRegistry('', wsBad);
		expect(reg.lenses.filter((l) => l.id === 'full')).toHaveLength(1);
		expect(reg.lenses[0].label).toBe('Full deck'); // the canonical implicit full, not the workspace's
	});
});

describe('the `kind` field — rung / cut, and the absent-means-cut default', () => {
	it('parses a declared rung and leaves an undeclared view without the field', () => {
		const reg = parseLensRegistry('lenses:\n  brief: { label: "B", base: none, kind: rung }\n  story: { label: "S", base: none }');
		expect(reg.lenses.find((l) => l.id === 'brief')?.kind).toBe('rung');
		expect(reg.lenses.find((l) => l.id === 'story')?.kind).toBeUndefined();
	});

	it('normalizes a redundant explicit `cut` away — absent already means cut', () => {
		const reg = parseLensRegistry('lenses:\n  story: { label: "S", base: none, kind: cut }');
		expect(reg.lenses.find((l) => l.id === 'story')?.kind).toBeUndefined();
	});

	it('ignores a junk value rather than inventing a third kind', () => {
		const reg = parseLensRegistry('lenses:\n  story: { label: "S", base: none, kind: ladder }');
		expect(reg.lenses.find((l) => l.id === 'story')?.kind).toBeUndefined();
	});

	it('emits and round-trips a rung', () => {
		const reg: LensRegistry = {
			default: 'full',
			lenses: [
				{ id: 'full', label: 'Full deck', base: 'all' },
				{ id: 'brief', label: 'Bottom line', base: 'none', kind: 'rung' },
				{ id: 'story', label: 'The story', base: 'none' },
			],
		};
		const fm = upsertLensRegistry('title: Deck', reg);
		expect(fm).toContain('brief: { label: "Bottom line", base: none, kind: rung }');
		expect(fm).toContain('story: { label: "The story", base: none }'); // a cut writes nothing extra
		expect(parseLensRegistry(fm)).toEqual(reg);
	});

	it('leaves a pre-field deck byte-identical WITH NO WORKSPACE — the scope of that promise', () => {
		// Deliberately narrow, and the title says so. Absent-means-cut protects the UNDECLARED view: with
		// no workspace there is nothing to inherit a `kind` from, so a deck written before the field
		// gains nothing on a rewrite. It does NOT generalize — see the next test, which is the case
		// almost every real deck is in, and which an earlier version of THIS test's title claimed to
		// cover while exercising the one mode where it is trivially true.
		const reg = parseLensRegistry('lenses:\n  brief: { label: "B", base: none }');
		expect(upsertLensRegistry('title: Deck', reg)).not.toContain('kind:');
	});

	it('a WORKSPACE rung reaches a deck that never asked for one — the honest opposite case', () => {
		// The workspace starters ship `kind: rung` on purpose (workspace-lenses.ts): brief and evidence
		// are the pair that provably nests, and shipping them as cuts would leave every default deck
		// with an empty ladder. The consequence, pinned here rather than left to a doc claim: a deck
		// carrying its own `brief` entry INHERITS the rung, and the next rewrite writes it into the
		// block. That is churn on a file the author did not edit, it is intended, and the design note
		// (§5.1) now says so instead of promising the reverse.
		const ws: WorkspaceLensConfig = { default: 'full', lenses: [{ id: 'brief', label: 'Bottom line', base: 'none', kind: 'rung' }] };
		const src = 'lenses:\n  brief: { label: "Bottom line", base: none, approved: "sha256:zzz" }';
		const reg = parseLensRegistry(src, ws);
		expect(reg.lenses.find((l) => l.id === 'brief')?.kind).toBe('rung'); // inherited, unasked
		expect(upsertLensRegistry(src, reg, ws)).toContain('kind: rung'); // and written back out
	});

	it('DEMOTING an inherited rung to a cut round-trips — it never silently re-enrolls in the ladder', () => {
		// Same hazard as the `single`/`hidden` clear: an omitted value re-merges the workspace's `rung`,
		// so a containment complaint the author resolved by demoting the view would come straight back.
		const reg = parseLensRegistry('', WORKSPACE);
		const demoted: LensRegistry = { ...reg, lenses: reg.lenses.map((l) => (l.id === 'brief' ? { id: 'brief', label: 'Bottom line', base: 'none' as const } : l)) };
		const fm = upsertLensRegistry('', demoted, WORKSPACE);
		expect(fm).toContain('kind: cut');
		const back = parseLensRegistry(fm, WORKSPACE);
		expect(back.lenses.find((l) => l.id === 'brief')?.kind).toBeUndefined(); // stayed a cut
		expect(back).toEqual(demoted);
	});

	it('an inherited rung the deck never touched stays pristine — no block, and the rung survives', () => {
		const reg = parseLensRegistry('', WORKSPACE);
		expect(upsertLensRegistry('', reg, WORKSPACE)).toBe('');
		expect(parseLensRegistry('', WORKSPACE).lenses.find((l) => l.id === 'brief')?.kind).toBe('rung');
	});

	it('PROMOTING a deck view to a rung materializes it against a workspace that has no opinion', () => {
		const reg = parseLensRegistry('', WORKSPACE);
		const promoted: LensRegistry = { ...reg, lenses: reg.lenses.map((l) => (l.id === 'evidence' ? { ...l, kind: 'rung' as const } : l)) };
		const fm = upsertLensRegistry('', promoted, WORKSPACE);
		expect(fm).toContain('kind: rung');
		expect(parseLensRegistry(fm, WORKSPACE)).toEqual(promoted);
	});
});

describe('the serializer round-trips EVERY field combination — Lente is the sole writer', () => {
	// The spot checks above each pin one interesting case. This is the exhaustive one, and it exists
	// because a serializer defect here does not fail a test — it corrupts an AUTHOR'S DECK. Every
	// combination of the fields a `LensDef` carries, through both writers:
	//   materialized (no workspace) → the whole registry is written out;
	//   delta (with a workspace)    → only what the deck changed, which is where the clear-to-inherit
	//                                 hazards live (a cleared `single`/`hidden`, a demoted `kind`).
	//
	// TWO normalizations are deliberate and the matrix reflects them rather than hiding them:
	//   · `kind` is `undefined | 'rung'` — an explicit `cut` is the default, so `completeDef` drops it
	//     (its own test above pins that), and the library never produces a def carrying one;
	//   · a workspace def never carries `order`. `order` is documented as a baseline a deck re-numbers
	//     but cannot clear back to inherited, so a ws `order` the deck cleared WOULD re-inherit. That
	//     is the existing contract (emitInlineDelta's docblock), not a case this matrix may assert —
	//     the guard below keeps a future edit from quietly adding one and calling it covered.
	const deckDefs: LensDef[] = [];
	for (const base of ['none', 'all'] as const)
		for (const single of [false, true])
			for (const hidden of [false, true])
				for (const order of [undefined, 3])
					for (const kind of [undefined, 'rung'] as const)
						for (const approved of [undefined, 'sha256:abc'])
							deckDefs.push({
								id: 'v',
								label: 'A "quoted", comma’d label',
								base,
								...(single ? { single: true } : {}),
								...(hidden ? { hidden: true } : {}),
								...(order != null ? { order } : {}),
								...(kind ? { kind } : {}),
								...(approved ? { approved } : {}),
							});

	const workspaces: WorkspaceLensConfig[] = [
		{ default: 'full', lenses: [{ id: 'v', label: 'WS', base: 'none' }] },
		{ default: 'full', lenses: [{ id: 'v', label: 'WS', base: 'all', single: true, hidden: true }] },
		{ default: 'full', lenses: [{ id: 'v', label: 'WS', base: 'none', kind: 'rung' }] },
		{ default: 'full', lenses: [{ id: 'v', label: 'WS', base: 'all', single: true, hidden: true, kind: 'rung' }] },
	];

	it('covers the whole field space, and no workspace shape carries the one field that cannot clear', () => {
		expect(deckDefs).toHaveLength(64);
		for (const ws of workspaces) for (const d of ws.lenses) expect(d.order).toBeUndefined();
	});

	it('materialized: parse(upsert(reg)) ≡ reg for all 64', () => {
		for (const def of deckDefs) {
			const reg: LensRegistry = { default: 'full', lenses: [{ id: 'full', label: 'Full deck', base: 'all' }, def] };
			expect(parseLensRegistry(upsertLensRegistry('title: Deck', reg)), JSON.stringify(def)).toEqual(reg);
		}
	});

	it('delta: parse(upsert(reg, ws), ws) ≡ reg for all 64 × 4', () => {
		for (const ws of workspaces) {
			for (const def of deckDefs) {
				const reg: LensRegistry = { default: 'full', lenses: [{ id: 'full', label: 'Full deck', base: 'all' }, def] };
				const fm = upsertLensRegistry('title: Deck', reg, ws);
				expect(parseLensRegistry(fm, ws), `${JSON.stringify(def)} over ${JSON.stringify(ws.lenses[0])}`).toEqual(reg);
			}
		}
	});

	it('delta: a rewrite is IDEMPOTENT — writing the parsed result back changes no bytes', () => {
		// The loop a deck actually lives in: parse, edit something unrelated, write, parse again. A
		// serializer that is correct but not stable would churn the file on every save.
		for (const ws of workspaces) {
			for (const def of deckDefs) {
				const reg: LensRegistry = { default: 'full', lenses: [{ id: 'full', label: 'Full deck', base: 'all' }, def] };
				const once = upsertLensRegistry('title: Deck', reg, ws);
				expect(upsertLensRegistry(once, parseLensRegistry(once, ws), ws), JSON.stringify(def)).toBe(once);
			}
		}
	});
});
