import { describe, expect, it } from 'vitest';
import type { Scene } from '@/lib/anima';
import { saveStudioScene, sceneEngine, slugify } from './scene-library';

const builtSpec = { source: 'built', duration: 6000, hero: 0.4, elements: [{ id: 'rotor', shape: 'cone', motion: [{ verb: 'spin', axis: 'y', period: 6000 }] }] } as unknown as Scene;
const svgSpec = { source: 'svg', duration: 4000, hero: 1, asset: 'route.svg', elements: [{ id: 'p', pathRef: 'p1', motion: [{ verb: 'draw', span: 1 }] }] } as unknown as Scene;

describe('sceneEngine', () => {
	it('maps a built scene to zdog and an svg scene to vivus', () => {
		expect(sceneEngine(builtSpec)).toBe('zdog');
		expect(sceneEngine(svgSpec)).toBe('vivus');
	});
});

describe('slugify', () => {
	it('lowercases, hyphenates, and trims', () => {
		expect(slugify('My Gyroscope!')).toBe('my-gyroscope');
		expect(slugify('  --Route 66-- ')).toBe('route-66');
		expect(slugify('###')).toBe('');
	});
});

describe('saveStudioScene', () => {
	it('rejects an invalid spec BEFORE touching the store (fail-closed)', async () => {
		const bad = { source: 'built', duration: -1, hero: 5, elements: [] } as unknown as Scene;
		await expect(saveStudioScene({ name: 'broken', spec: bad })).rejects.toThrow(/invalid scene spec/i);
	});
});
