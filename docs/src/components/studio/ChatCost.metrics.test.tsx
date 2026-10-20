import { describe, expect, it } from 'vitest';
import { contextFill, fmtTok, lastUsage } from './ChatCost';
import type { ChatMessage, ChatUsage } from './studio-store';

const usage = (over: Partial<ChatUsage> = {}): ChatUsage => ({ cost: 0.02, prompt: 20_000, completion: 300, cached: 16_000, reasoning: 0, rounds: 2, window: 200_000, model: 'm', ...over });

describe('chat metrics helpers', () => {
	it('formats token counts compactly', () => {
		expect(fmtTok(512)).toBe('512');
		expect(fmtTok(1234)).toBe('1.2K');
		expect(fmtTok(200_000)).toBe('200K');
		expect(fmtTok(1_000_000)).toBe('1.0M');
	});

	it('reads context fill from the last reply, and says unknown rather than guessing', () => {
		expect(contextFill(usage())).toBeCloseTo(0.1);
		expect(contextFill(usage({ window: null }))).toBeNull();
		expect(contextFill(null)).toBeNull();
		expect(contextFill(usage({ prompt: 300_000 }))).toBe(1);
	});

	it('takes usage from the newest assistant reply that has it', () => {
		const msgs: ChatMessage[] = [
			{ role: 'user', content: 'a' },
			{ role: 'assistant', content: 'b', usage: usage({ prompt: 1 }) },
			{ role: 'user', content: 'c' },
			{ role: 'assistant', content: 'd' }, // a reply saved before usage was kept
		];
		expect(lastUsage(msgs)?.prompt).toBe(1);
		expect(lastUsage([])).toBeNull();
		expect(lastUsage(undefined)).toBeNull();
	});
});
