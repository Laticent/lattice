import { describe, expect, it } from 'vitest';
import { applyCompaction, approxTokens, KEEP_RECENT, modelText, shouldSuggestCompaction, splitForCompaction, transcript } from './chat-compact';
import type { ChatMessage } from './studio-store';

const thread = (pairs: number, body = 'x'.repeat(400)): ChatMessage[] =>
	Array.from({ length: pairs * 2 }, (_, i) => (i % 2 === 0 ? { role: 'user' as const, content: `q${i / 2} ${body}` } : { role: 'assistant' as const, content: `a${(i - 1) / 2} ${body}` }));

describe('splitForCompaction', () => {
	it('keeps the latest messages and opens the kept part on an author turn', () => {
		const t = thread(10);
		const s = splitForCompaction(t);
		expect(s).not.toBeNull();
		expect(s?.recent.length).toBeGreaterThanOrEqual(KEEP_RECENT - 1);
		expect(s?.recent[0].role).toBe('user');
		expect(s ? s.older.length + s.recent.length : 0).toBe(t.length);
	});

	it('declines a thread that is too short to be worth a model call', () => {
		expect(splitForCompaction(thread(3))).toBeNull();
		expect(splitForCompaction([])).toBeNull();
	});
});

describe('applyCompaction', () => {
	it('puts the briefing on the first kept message, and the model reads it ahead of that message', () => {
		const t = thread(10);
		const split = splitForCompaction(t);
		if (!split) throw new Error('no split');
		const out = applyCompaction(split, 'The author wants a board deck. Q3 revenue is $4.2M.');
		expect(out.messages.length).toBe(split.recent.length);
		expect(out.messages[0].compacted).toMatchObject({ count: split.older.length });
		expect(modelText(out.messages[0])).toContain('Q3 revenue is $4.2M');
		expect(modelText(out.messages[0])).toContain(split.recent[0].content);
		expect(out.saved).toBeGreaterThan(0);
	});

	it('lowers the meter by what was cut and says it is an estimate, leaving the original usage untouched', () => {
		const t = thread(10);
		t[t.length - 1] = { ...t[t.length - 1], usage: { cost: 0.01, prompt: 30000, completion: 100, cached: 20000, reasoning: 0, rounds: 1, window: 200000, model: 'm' } };
		const split = splitForCompaction(t);
		if (!split) throw new Error('no split');
		const out = applyCompaction(split, 'brief');
		const u = out.messages[out.messages.length - 1].usage;
		expect(u?.estimated).toBe(true);
		expect(u?.prompt).toBe(30000 - out.saved);
		expect(t[t.length - 1].usage?.prompt).toBe(30000);
	});

	it('counts an earlier compaction when compacting again, and feeds its briefing into the next one', () => {
		const t = thread(10);
		const first = splitForCompaction(t);
		if (!first) throw new Error('no split');
		const once = applyCompaction(first, 'first briefing').messages;
		const grown = [...once, ...thread(8)];
		const second = splitForCompaction(grown);
		if (!second) throw new Error('no split');
		expect(transcript(second.older)).toContain('first briefing');
		const twice = applyCompaction(second, 'second briefing');
		expect(twice.messages[0].compacted?.count).toBe(second.older.length + first.older.length);
	});
});

describe('transcript and nudge', () => {
	it('says which proposed edits were applied, because "already done" is what the briefing is for', () => {
		const m: ChatMessage[] = [
			{ role: 'user', content: 'tighten slide 2' },
			{ role: 'assistant', content: 'done', proposed: [{} as never], applied: true },
		];
		expect(transcript(m)).toBe('Author: tighten slide 2\n\nArchitect [edits applied]: done');
	});

	it('clips a long message so one pasted reply cannot dominate the call', () => {
		expect(approxTokens(transcript([{ role: 'user', content: 'y'.repeat(10000) }]))).toBeLessThan(500);
	});

	it('suggests compaction on author-turn count or a filling window, and only when there is something to cut', () => {
		expect(shouldSuggestCompaction(thread(12), null)).toBe(false);
		expect(shouldSuggestCompaction(thread(12), 0.75)).toBe(true);
		expect(shouldSuggestCompaction(thread(21), null)).toBe(true);
		expect(shouldSuggestCompaction(thread(2), 0.95)).toBe(false);
	});
});
