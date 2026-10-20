import { beforeEach, describe, expect, it, vi } from 'vitest';

const complete = vi.hoisted(() => vi.fn());
const generation = vi.hoisted(() => ({ v: 'openrouter' }));
const block = vi.hoisted(() => ({ v: null as string | null }));
vi.mock('./architect', () => ({
	architectModel: async () => ({ availability: () => ({ generation: generation.v }), complete }),
	cloudBudgetBlock: async () => block.v,
	estTokens: (s: string) => Math.ceil(s.length / 4),
	withStudioVoice: (m: unknown) => m,
}));

import { readSpend } from '@/components/studio/ai/spend.js';
import { summarizeChat } from './chat-compact-run';

beforeEach(() => {
	sessionStorage.clear();
	localStorage.clear();
	complete.mockReset();
	generation.v = 'openrouter';
	block.v = null;
});

describe('summarizeChat', () => {
	it('returns the briefing and records the call in the spend tally', async () => {
		complete.mockImplementation(async (o: { onUsage: (u: unknown) => void }) => {
			o.onUsage({ cost: 0.004, prompt_tokens: 900, completion_tokens: 200 });
			return '  Board deck, Q3 numbers.  ';
		});
		const out = await summarizeChat('Author: hi');
		expect(out).toEqual({ status: 'ok', summary: 'Board deck, Q3 numbers.', cost: 0.004 });
		expect(readSpend().session).toBeCloseTo(0.004);
	});

	it('refuses a briefing that was cut off at the token ceiling', async () => {
		complete.mockImplementation(async (o: { onFinishReason: (r: string) => void }) => {
			o.onFinishReason('length');
			return 'The author wants a board deck and the revenue is';
		});
		expect(await summarizeChat('Author: hi')).toEqual({ status: 'nochange' });
	});

	it('does not run on a tier that is not the cloud, or past the budget cap', async () => {
		generation.v = 'floor';
		expect(await summarizeChat('Author: hi')).toEqual({ status: 'offline' });
		generation.v = 'openrouter';
		block.v = 'Budget cap reached';
		expect(await summarizeChat('Author: hi')).toEqual({ status: 'blocked', note: 'Budget cap reached' });
		expect(complete).not.toHaveBeenCalled();
	});

	it('changes nothing on an empty reply or a failed call', async () => {
		complete.mockResolvedValueOnce('   ');
		expect(await summarizeChat('Author: hi')).toEqual({ status: 'nochange' });
		complete.mockRejectedValueOnce(new Error('network'));
		expect(await summarizeChat('Author: hi')).toEqual({ status: 'offline' });
	});
});
