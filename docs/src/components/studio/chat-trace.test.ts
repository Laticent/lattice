import { describe, expect, it } from 'vitest';
import { boundTrace, callLabel, TRACE_MAX_CHARS, traceCall } from './chat-trace';
import type { ChatTrace } from './studio-store';

const sent = { primer: 16500, deck: 900, history: 200, tools: 1400, docs: 0, photos: 0 };
const round = (over: Partial<ChatTrace['rounds'][number]> = {}): ChatTrace['rounds'][number] => ({ calls: [], cost: 0.01, prompt: 100, completion: 10, ...over });

describe('boundTrace', () => {
	it('clips each command to its caps and collapses whitespace in results', () => {
		const c = traceCall('edit_slides', 'x'.repeat(5000), 'a\n\n  b');
		expect(c.args.length).toBeLessThanOrEqual(1201);
		expect(c.args.endsWith('…')).toBe(true);
		expect(c.result).toBe('a b');
	});

	it('keeps a small trace whole', () => {
		const t: ChatTrace = { sent, rounds: [round({ reasoning: 'thinking', text: 'hello', calls: [{ name: 'read_slides', args: '{"slides":[1]}', result: 'ok' }] })] };
		expect(boundTrace(t)).toEqual(t);
	});

	it('stays under the ceiling by dropping reasoning before commands, oldest round first', () => {
		const big = (i: number) => round({ reasoning: 'r'.repeat(2000), text: 't'.repeat(800), calls: [{ name: 'edit_slides', args: `${i}`.repeat(1200), result: 'z'.repeat(600) }] });
		const t = boundTrace({ sent, rounds: [big(1), big(2), big(3), big(4)] });
		expect(JSON.stringify(t).length).toBeLessThanOrEqual(TRACE_MAX_CHARS);
		expect(t.rounds[0].reasoning).toBeUndefined();
		// Every command is still listed, even when its arguments had to be cut down.
		expect(t.rounds.map((r) => r.calls.length)).toEqual([1, 1, 1, 1]);
	});

	it('labels a command for a person', () => {
		expect(callLabel('read_slides')).toBe('Read slides');
	});
});
