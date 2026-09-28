/**
 * The app half of the newcomer bake: `adoptBake` hands over the baked render state only for the
 * exact document and deck it describes. Adopting the wrong state would patch one deck's slides
 * against another's list, so every mismatch must answer null and let the app write its own.
 */

import { describe, expect, it } from 'vitest';
import { fingerprint } from '@/lib/playground-controller';
import { adoptBake } from './newcomer-bake';

const SRC = '# actors\n\n---\n\n## second';
const state = { frameSig: 'cuoio|light|1280x720|W:', restyleSig: '1280x720|W:|C:', lastSections: ['<section>a</section>', '<section>b</section>'], writeId: 1 };

function frameWith(opts: { bake?: boolean; write?: string; seed?: unknown } = {}) {
	const doc = document.implementation.createHTMLDocument('bake');
	if (opts.bake !== false) doc.documentElement.setAttribute('data-pg-bake', '');
	doc.documentElement.setAttribute('data-lattice-write', opts.write ?? '1');
	if (opts.seed !== null) {
		const s = doc.createElement('script');
		s.type = 'application/json';
		s.id = 'pg-bake';
		s.textContent = JSON.stringify(opts.seed ?? { v: 1, srcHash: fingerprint(SRC), state });
		doc.body.append(s);
	}
	return { contentDocument: doc } as unknown as HTMLIFrameElement;
}

describe('adoptBake', () => {
	it('hands over the baked state for the deck it was baked from', () => {
		expect(adoptBake(frameWith(), SRC)).toEqual(state);
	});
	it('refuses another deck', () => {
		expect(adoptBake(frameWith(), `${SRC}\n\nedited`)).toBeNull();
	});
	it('refuses a document the app has written over (the write id moved on)', () => {
		expect(adoptBake(frameWith({ write: '2' }), SRC)).toBeNull();
	});
	it('refuses a document that is not a bake, or whose seed has not parsed yet', () => {
		expect(adoptBake(frameWith({ bake: false }), SRC)).toBeNull();
		expect(adoptBake(frameWith({ seed: null }), SRC)).toBeNull();
	});
	it('refuses a seed of another shape', () => {
		expect(adoptBake(frameWith({ seed: { v: 2, srcHash: fingerprint(SRC), state } }), SRC)).toBeNull();
		expect(adoptBake(frameWith({ seed: { v: 1, srcHash: fingerprint(SRC), state: { ...state, lastSections: 'x' } } }), SRC)).toBeNull();
		expect(adoptBake(frameWith({ seed: { v: 1, srcHash: fingerprint(SRC), state: { ...state, writeId: 0 } } }), SRC)).toBeNull();
	});
	it('a frame with no document, or a seed that is not JSON, is null rather than a throw', () => {
		expect(adoptBake({ contentDocument: null } as unknown as HTMLIFrameElement, SRC)).toBeNull();
		const f = frameWith();
		const el = f.contentDocument?.getElementById('pg-bake');
		if (el) el.textContent = '{not json';
		expect(adoptBake(f, SRC)).toBeNull();
	});
});
