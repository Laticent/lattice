import { describe, expect, it } from 'vitest';
import type { Scene } from '@/lib/anima/types';
import { defaultMotion, elementAt, flatten, removeAt, setMotionAt } from './MotionStudio';

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

describe('elementAt — read the element at a path', () => {
	it('resolves a nested and a top-level element', () => {
		expect(elementAt(scene, [0, 1])?.id).toBe('rotor');
		expect(elementAt(scene, [1])?.id).toBe('base');
	});
	it('returns null on a bad or empty path', () => {
		expect(elementAt(scene, [0, 9])).toBeNull();
		expect(elementAt(scene, [])).toBeNull();
	});
});

describe('setMotionAt — immutable motion edit at a path', () => {
	it('sets a new motion array without mutating the input', () => {
		const next = setMotionAt(scene, [1], [{ verb: 'reveal', at: 0.2 }]);
		expect(elementAt(next, [1])?.motion).toEqual([{ verb: 'reveal', at: 0.2 }]);
		expect(elementAt(scene, [1])?.motion).toBeUndefined(); // input untouched
	});
	it('clears the motion key when set to an empty array', () => {
		const next = setMotionAt(scene, [0], []); // drop rig's spin
		expect(elementAt(next, [0])?.motion).toBeUndefined();
		expect('motion' in (elementAt(next, [0]) as object)).toBe(false);
	});
	it('is a no-op ref-return on a bad or empty path', () => {
		expect(setMotionAt(scene, [0, 9], [{ verb: 'reveal' }])).toBe(scene);
		expect(setMotionAt(scene, [], [{ verb: 'reveal' }])).toBe(scene);
	});
});

describe('defaultMotion — a newly-toggled verb is born schema-valid', () => {
	it('gives spin/orbit an axis + a readable period', () => {
		expect(defaultMotion('spin')).toEqual({ verb: 'spin', axis: 'y', period: 3000 });
		expect(defaultMotion('orbit')).toEqual({ verb: 'orbit', axis: 'y', period: 3000 });
	});
	it('gives explode a non-negative distance and fill a level', () => {
		expect(defaultMotion('explode')).toEqual({ verb: 'explode', distance: 1 });
		expect(defaultMotion('fill')).toEqual({ verb: 'fill', to: 1 });
	});
	it('gives windowed verbs a bare valid shape', () => {
		expect(defaultMotion('reveal')).toEqual({ verb: 'reveal' });
		expect(defaultMotion('sequence')).toEqual({ verb: 'sequence' });
	});
});
