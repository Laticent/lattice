// @vitest-environment node
// EVERY PICK-ONE SET OF LOOKS IS DECLARED, SO A PICK SWAPS AND NEVER STACKS (PR 3224; owner's call: audit all 40).
//
// The Studio's Look row (Compose's layout menu) and Reshape pick a look with `applyVariant`. A look the manifest does not
// place in an exclusive `variantAxes` axis TOGGLES, so picking `four` on a `pricing two` slide used to write
// `pricing two four`: two alternatives at once, a slide that cannot render. Each manifest now says which of its looks
// exclude each other. This file holds two things to that:
//   1. every exclusive axis, in every manifest, swaps: from each member, picking each other member leaves only the new one;
//   2. the pick-one sets the audit found stay declared (a manifest edit that drops one fails here, not on a slide).
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { getClassTokens, setClassTokens } from '../../lib/slide-directives';
import { applyVariant } from './slide-variants';

type Axis = { label: string; exclusive?: boolean; default?: string; members: string[] };
type Manifest = { name: string; variants?: (string | { name: string })[]; variantAxes?: Axis[] };

const LIB = join(__dirname, '../../../../lib');
function manifests(dir = LIB, out: Manifest[] = []): Manifest[] {
	for (const f of readdirSync(dir)) {
		const p = join(dir, f);
		if (statSync(p).isDirectory()) manifests(p, out);
		else if (f.endsWith('.manifest.json')) out.push(JSON.parse(readFileSync(p, 'utf8')) as Manifest);
	}
	return out;
}
const ALL = manifests();
const variantsOf = (m: Manifest) => (m.variants ?? []).map((v) => (typeof v === 'string' ? v : v.name));

describe('every exclusive axis of looks swaps, in every manifest', () => {
	const cases = ALL.flatMap((m) => (m.variantAxes ?? []).filter((a) => a.exclusive && a.members.length > 1).map((a) => [m, a] as const));
	it('finds the declared axes', () => expect(cases.length).toBeGreaterThan(10));
	for (const [m, axis] of cases) {
		it(`${m.name}: ${axis.label}`, () => {
			for (const from of axis.members) {
				for (const to of axis.members) {
					if (from === to) continue;
					const chunk = setClassTokens(`<!-- _class: ${m.name} -->\n\n## A slide`, [m.name, from]);
					const tokens = getClassTokens(applyVariant(chunk, to, {}, variantsOf(m), m.variantAxes ?? []));
					expect(tokens, `${m.name} ${from} → ${to}`).toContain(to);
					expect(tokens, `${m.name} ${from} → ${to}`).not.toContain(from);
				}
			}
		});
	}
});

// The pick-one sets the audit found, by component: each pair must sit in one exclusive axis. A pair here is two looks that
// set the same thing two ways (a column count, a direction, a list marker), so the slide can show only one.
const PICK_ONE: Record<string, [string, string][]> = {
	'cards-grid': [['three', 'four']],
	pricing: [['two', 'four']],
	flowchart: [['lr', 'tb']],
	'state-chart': [['lr', 'tb']],
	agenda: [['circles', 'checks'], ['progress-1', 'progress-2']],
	'list-steps': [['vertical', 'chevron'], ['phase', 'milestone'], ['lettered', 'roman']],
	line: [['area', 'step']],
	scatter: [['bubble', 'trend']],
	bullet: [['shared-axis', 'own-axis']],
	'policy-recommendation': [['adopt', 'oppose']],
	'list-tabular': [['def', 'metric']],
	'split-panel': [['metric', 'pullquote'], ['cat-1', 'cat-2']],
	video: [['companion', 'gallery']],
	collage: [['above', 'bleed']],
};

describe('the pick-one sets the audit found stay declared', () => {
	for (const [name, pairs] of Object.entries(PICK_ONE)) {
		it(name, () => {
			const m = ALL.find((x) => x.name === name);
			expect(m, `${name} has a manifest`).toBeTruthy();
			for (const [a, b] of pairs) {
				const axis = (m?.variantAxes ?? []).find((x) => x.members.includes(a));
				expect(axis?.exclusive, `${name}: ${a} sits in an exclusive axis`).toBe(true);
				expect(axis?.members, `${name}: ${a} and ${b} share it`).toContain(b);
			}
		});
	}
});
