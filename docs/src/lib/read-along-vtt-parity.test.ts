import { describe, expect, it } from 'vitest';
import { buildTrack, toVtt } from '@/lib/cadenza';
// The CJS mirror the export pipeline uses. It must stay byte-identical to Cadenza's
// canonical toVtt — this test is the pin (the CJS suite can't import the TS engine,
// so the parity check lives here, where both are reachable).
import { trackToVtt } from '../../../lib/core/read-along-vtt.js';

const corpus = [
	'Revenue grew to $4.2M this quarter, up 18.5% from Q3. That is our best.',
	'We shipped 3.5x faster. Margins held at 30%.',
	'One word.',
	'A finished one. And an unfinished one',
	'',
];

describe('trackToVtt (CJS mirror) is byte-identical to Cadenza.toVtt', () => {
	for (const pace of ['slow', 'moderate', 'fast'] as const) {
		for (const text of corpus) {
			it(`matches on [${pace}] ${JSON.stringify(text).slice(0, 36)}`, () => {
				const track = buildTrack(text, { pace });
				expect(trackToVtt(track)).toBe(toVtt(track));
			});
		}
	}
});
