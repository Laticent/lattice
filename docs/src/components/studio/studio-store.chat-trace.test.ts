import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CHAT_TRACE_KEEP, type ChatMessage, loadChat, saveChat, withoutOldTraces } from './studio-store';

// Show-work traces ride the saved chat, so a full storage must cost traces, never a reply.
const trace = { sent: { primer: 1, deck: 1, history: 1, tools: 1, docs: 0, photos: 0 }, rounds: [{ calls: [], cost: 0, prompt: 1, completion: 1, text: 'x'.repeat(8000) }] };
const thread = (n: number): ChatMessage[] => Array.from({ length: n }, (_, i) => (i % 2 === 0 ? { role: 'user' as const, content: `q${i}` } : { role: 'assistant' as const, content: `a${i}`, trace }));

beforeEach(() => localStorage.clear());
afterEach(() => vi.restoreAllMocks());

describe('chat traces and storage', () => {
	it('keeps traces only on the newest replies', () => {
		const out = withoutOldTraces(thread(60), CHAT_TRACE_KEEP);
		expect(out.filter((m) => m.trace).length).toBe(CHAT_TRACE_KEEP);
		expect(out[59].trace).toBeTruthy(); // the newest reply keeps its trace
		expect(out[1].trace).toBeUndefined(); // the oldest does not
		expect(out.map((m) => m.content)).toEqual(thread(60).map((m) => m.content)); // no words were lost
	});

	it('when storage refuses the write, drops traces before it drops the reply', () => {
		const real = Storage.prototype.setItem;
		// A quota that fits the thread's words and a few traces, not twenty.
		vi.spyOn(Storage.prototype, 'setItem').mockImplementation(function (this: Storage, k: string, v: string) {
			if (v.length > 40_000) throw new DOMException('full', 'QuotaExceededError');
			return real.call(this, k, v);
		});
		saveChat('d', thread(60));
		const back = loadChat('d');
		expect(back.length).toBe(60);
		expect(back[59].content).toBe('a59');
		expect(back.filter((m) => m.trace).length).toBeLessThanOrEqual(3);
	});

	it('still saves the words when not even three traces fit', () => {
		const real = Storage.prototype.setItem;
		vi.spyOn(Storage.prototype, 'setItem').mockImplementation(function (this: Storage, k: string, v: string) {
			if (v.includes('xxxx')) throw new DOMException('full', 'QuotaExceededError');
			return real.call(this, k, v);
		});
		saveChat('d', thread(10));
		const back = loadChat('d');
		expect(back.length).toBe(10);
		expect(back.some((m) => m.trace)).toBe(false);
	});
});
