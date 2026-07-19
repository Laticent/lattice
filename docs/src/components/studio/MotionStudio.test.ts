import { describe, expect, it } from 'vitest';
import type { Scene } from '@/lib/anima/types';
import { flatten, removeAt } from './MotionStudio';

// The Motion faculty's pure tree logic (Stage 7a). The live stage + save are exercised on the
// real Studio surface with a real Chromium (HARD RULE #23 — the scene tree renders, the stage
// animates, Save round-trips into the asset store); these cover the DOM-free tree math.

const scene: Scene = {
	source: 'built',
	duration: 3000,
	hero: 0.5,
	elements: [
		{
			id: 'rig',
			shape: 'group',
			motion: [{ verb: 'spin', axis: 'y', period: 3000 }],
			children: [
				{ id: 'ring', shape: 'ellipse' },
				{ id: 'rotor', shape: 'cone' },
			],
		},
		{ id: 'base', shape: 'box' },
	],
};

describe('flatten — the scene tree, depth-first with depth + path', () => {
	it('walks nested children in order, stamping depth and the index path', () => {
		const rows = flatten(scene);
		expect(rows.map((r) => r.el.id)).toEqual(['rig', 'ring', 'rotor', 'base']);
		expect(rows.map((r) => r.depth)).toEqual([0, 1, 1, 0]);
		expect(rows.find((r) => r.el.id === 'rotor')?.path).toEqual([0, 1]);
		expect(rows.find((r) => r.el.id === 'base')?.path).toEqual([1]);
	});
});

describe('removeAt — immutable prune of the element at a path', () => {
	it('removes a nested child without touching the input', () => {
		const next = removeAt(scene, [0, 0]); // drop `ring`
		expect(flatten(next).map((r) => r.el.id)).toEqual(['rig', 'rotor', 'base']);
		expect(flatten(scene).map((r) => r.el.id)).toEqual(['rig', 'ring', 'rotor', 'base']); // input untouched
	});
	it('removes a top-level element', () => {
		expect(flatten(removeAt(scene, [1])).map((r) => r.el.id)).toEqual(['rig', 'ring', 'rotor']);
	});
	it('is a no-op on an out-of-range or bad path (poster stands)', () => {
		expect(removeAt(scene, [0, 5, 2])).toBe(scene); // path into a non-existent child → unchanged ref
		expect(removeAt(scene, [])).toBe(scene);
	});
});
