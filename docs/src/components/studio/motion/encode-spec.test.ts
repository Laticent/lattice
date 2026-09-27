import { describe, expect, it } from 'vitest';
import type { Scene } from '@/lib/anima';
import { decodeSpec } from '@/lib/anima/hydrate';
import { encodeSpec } from './MotionStage';

// The Motion stage packs the spec; `hydrate.ts` unpacks it. Both halves must agree on UTF-8, or an
// imported SVG whose author id carries an accent keeps a `pathRef` that matches nothing.
describe('encodeSpec → decodeSpec', () => {
	it('round-trips Latin-1 and wider codepoints in a pathRef', () => {
		const spec = {
			source: 'svg',
			asset: 'café.svg',
			duration: 900,
			hero: 1,
			elements: [
				{ id: 'm1a2-café', pathRef: 'm1a2-café', motion: [{ verb: 'draw', at: 0, span: 1 }] },
				{ id: 'm1a2-x²—', pathRef: 'm1a2-x²—', motion: [{ verb: 'draw', at: 0, span: 1 }] },
			],
		} as Scene;
		const b64 = encodeSpec(spec);
		expect(b64).not.toBeNull();
		const scene = decodeSpec(b64 as string);
		expect(scene?.elements.map((e) => (e as { pathRef: string }).pathRef)).toEqual(['m1a2-café', 'm1a2-x²—']);
	});
});
