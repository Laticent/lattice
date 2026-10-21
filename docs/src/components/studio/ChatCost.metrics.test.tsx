import { describe, expect, it } from 'vitest';
import { contextFill, fmtTok, lastUsage, withCurrentWindow } from './ChatCost';
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

	it('measures the thread against the model chosen now, not the one that wrote the reply', () => {
		const last = usage({ prompt: 100_000, window: 200_000 });
		expect(contextFill(withCurrentWindow(last, 1_000_000))).toBeCloseTo(0.1);
		expect(contextFill(withCurrentWindow(last, 128_000))).toBeCloseTo(0.78125);
		// Catalog not loaded, or an alias with no window of its own: keep what the reply saved.
		expect(withCurrentWindow(last, null)).toBe(last);
		expect(withCurrentWindow(last, undefined)).toBe(last);
		expect(withCurrentWindow(null, 128_000)).toBeNull();
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
