import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { applyTag, catalogFromComponents, type LensDef, type LensRegistry, ladderRungs, suggestMembership, validateLadder } from '@/lib/lente';
import { ARCHETYPES } from './lens-archetypes';

// The RUNGS-AND-CUTS decomposition, pinned against the REAL suggester and the REAL component
// catalog (2026-08-25-lens-view-defaults-and-depth.md §4.1).
//
// That note claims the shipped reader views are two different kinds of thing — `brief ⊂ evidence ⊂
// full` is a containment chain (RUNGS, the only ones a "go deeper" affordance could honestly climb),
// while `story` and `ask` are CUTS that contain nothing and are contained by nothing. The claim was
// originally derived by READING suggest.ts against dist/docs/components.json, which is a proxy: it
// was true when read and nothing kept it true.
//
// This is the artifact. It reads the same two sources the claim is about — the real rule table and
// the real classifications — so if either drifts, the doc's motivation for the depth model fails
// here rather than silently rotting into a design that no longer describes the product.
//
// It deliberately lives Studio-side, not in lente/: the library is repo-agnostic and
// catalog-injection-only (its import boundary is gated), while this claim is ABOUT this repo's
// catalog. Reading the built manifest follows the docs/src/lib/intent-search.test.ts precedent.
type CatalogRow = { name: string; bucket: string; function?: string; form?: string };
const manifest = require(join(process.cwd(), '..', 'dist/docs/components.json')) as { components: CatalogRow[] };

const components = (manifest.components ?? []).filter((c) => c?.name);
const catalog = catalogFromComponents(components.map((c) => ({ name: c.name, bucket: c.bucket, function: c.function ?? '', form: c.form ?? '' })));

// One slide per catalog component — the widest deck the suggester can be asked about, so the
// relations below are checked over the whole component space rather than a hand-picked sample.
const slides = components.map((c) => `<!-- _class: ${c.name} -->\n\n# ${c.name}`);

const registry: LensRegistry = {
	default: 'full',
	lenses: [
		{ id: 'full', label: 'Full deck', base: 'none' },
		{ id: 'brief', label: 'Bottom line', base: 'none' },
		{ id: 'story', label: 'The story', base: 'none' },
		{ id: 'evidence', label: 'The evidence', base: 'all' },
	],
};

const suggestions = suggestMembership(slides, registry, catalog);

/** The set a lens would SUGGEST, resolved against its base: an additive lens collects its
 *  inclusions; a subtractive one is every slide minus its exclusions. */
function suggested(lensId: string, base: 'none' | 'all'): Set<number> {
	const mine = suggestions.filter((s) => s.lensId === lensId);
	if (base === 'none') return new Set(mine.filter((s) => s.member).map((s) => s.index));
	const out = new Set(slides.map((_, i) => i));
	for (const s of mine) if (!s.member) out.delete(s.index);
	return out;
}

const contains = (outer: Set<number>, inner: Set<number>) => [...inner].every((i) => outer.has(i));
const names = (set: Set<number>) => [...set].map((i) => components[i]?.name).sort();

describe('reader views decompose into rungs and cuts', () => {
	it('the catalog and the suggester both actually loaded', () => {
		// Guard the guard: an empty catalog would make every containment assertion below vacuously
		// true, which is the one way this test could pass while proving nothing.
		expect(components.length).toBeGreaterThan(20);
		expect(suggested('brief', 'none').size).toBeGreaterThan(0);
		expect(suggested('story', 'none').size).toBeGreaterThan(0);
	});

	it('RUNG: brief ⊂ evidence — every bottom-line slide survives into the evidence view', () => {
		const brief = suggested('brief', 'none');
		const evidence = suggested('evidence', 'all');
		const escaped = [...brief].filter((i) => !evidence.has(i)).map((i) => components[i]?.name);
		expect(escaped, `these brief members are dropped by evidence, breaking the rung chain: ${escaped.join(', ')}`).toEqual([]);
		expect(contains(evidence, brief)).toBe(true);
		expect(brief.size).toBeLessThan(evidence.size); // a strict subset — a rung ABOVE, not the same altitude
	});

	it('RUNG: evidence ⊂ full — the identity contains every view by construction', () => {
		const evidence = suggested('evidence', 'all');
		expect(evidence.size).toBeLessThan(slides.length);
		expect(contains(new Set(slides.map((_, i) => i)), evidence)).toBe(true);
	});

	it('CUT: story is not a rung — it neither contains brief nor is contained by evidence', () => {
		const brief = suggested('brief', 'none');
		const story = suggested('story', 'none');
		const evidence = suggested('evidence', 'all');
		// brief ⊄ story: brief's headline metrics (kpi/stats) are neither anchors nor progression.
		expect(contains(story, brief), `story unexpectedly contains brief (${names(brief)}) — it would be a rung, not a cut`).toBe(false);
		// story ⊄ evidence: story deliberately KEEPS chapter dividers, which evidence deliberately drops.
		expect(contains(evidence, story), 'evidence unexpectedly contains story — the divider split is gone').toBe(false);
	});

	it('CUT: ask is a single slide — an altitude above it is meaningless', () => {
		const askReg: LensRegistry = { ...registry, lenses: [...registry.lenses, { id: 'ask', label: 'The ask', base: 'none', single: true }] };
		const ask = suggestMembership(slides, askReg, catalog).filter((s) => s.lensId === 'ask');
		expect(ask.length).toBeLessThanOrEqual(1); // exactly one, or none when confidence is low
	});
});

// ── The SCHEMA half: what the archetypes DECLARE must be what the suggester DOES ─────────────────
//
// Everything above proves a property of the rule table. This half proves the product agrees with it:
// `lens-archetypes.ts` hard-codes a `kind` per view, and `validateLadder` enforces containment on
// whatever an author tags. If those two ever disagree with the relations proved above, the shipped
// Studio either withholds a rung that nests or complains about one that does — and it fails here.

/** The four archetypes as a registry, so the schema is exercised through the same defs the panel writes. */
function archetypeRegistry(over: Record<string, Partial<LensDef>> = {}): LensRegistry {
	const lenses: LensDef[] = [
		{ id: 'full', label: 'Full deck', base: 'all' },
		...ARCHETYPES.map((a) => ({
			id: a.id,
			label: a.label,
			base: a.base,
			...(a.single ? { single: true } : {}),
			...(a.kind === 'rung' ? { kind: 'rung' as const } : {}),
			...(over[a.id] ?? {}),
		})),
	];
	return { default: 'full', lenses };
}

/** The catalog-wide deck with every suggestion actually WRITTEN as `_lens` tags — the membership an
 *  author would end up with by pressing "Accept all" on each view. */
function suggesterTaggedDeck(reg: LensRegistry): string[] {
	const bases = new Map(reg.lenses.map((l) => [l.id, l.base]));
	const out = [...slides];
	for (const s of suggestMembership(slides, reg, catalog)) {
		out[s.index] = applyTag(out[s.index], s.lensId, s.member, bases.get(s.lensId) ?? 'none');
	}
	return out;
}

describe('the depth SCHEMA matches the decomposition', () => {
	it('declares as rungs exactly the views proved to nest', () => {
		const byKind = (k: string) => ARCHETYPES.filter((a) => a.kind === k).map((a) => a.id).sort();
		expect(byKind('rung')).toEqual(['brief', 'evidence']);
		expect(byKind('cut')).toEqual(['ask', 'story']);
	});

	it('derives the ladder as brief → evidence → full over the real catalog', () => {
		const reg = archetypeRegistry();
		expect(ladderRungs(suggesterTaggedDeck(reg), reg).map((l) => l.id)).toEqual(['brief', 'evidence', 'full']);
	});

	it('the containment validator is SILENT on a deck the real suggester tagged', () => {
		const reg = archetypeRegistry();
		expect(validateLadder(suggesterTaggedDeck(reg), reg)).toEqual([]);
	});

	it('…and FIRES the moment `story` is declared a rung — the check is not vacuous', () => {
		// Guard the guard, again. `story` keeps the chapter dividers `evidence` drops and misses brief's
		// headline metrics, so calling it a rung must produce findings. A validator that stayed quiet
		// here would be certifying nothing.
		const reg = archetypeRegistry({ story: { kind: 'rung' } });
		const findings = validateLadder(suggesterTaggedDeck(reg), reg);
		expect(findings.length).toBeGreaterThan(0);
		expect(findings.every((f) => f.code === 'ladder-containment')).toBe(true);
	});
});
