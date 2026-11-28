/**
 * `tools/stop-billing-probe.mjs` measures whether OpenRouter bills a stopped chat request, and from which point. It
 * spends real credits, so it runs only on the owner's word; this file holds the parts that decide what its numbers mean,
 * and drives its request flow against a stubbed fetch, so a paid run is not the first time the code executes.
 * No network: every fetch is a stub (HARD RULE #24, #32).
 */
import assert from 'node:assert/strict';
import { afterEach, describe, it } from 'node:test';
import {
	ANTHROPIC_CASES,
	ANTHROPIC_LEDGER_RULE,
	ANTHROPIC_TOL,
	anthropicBody,
	billedFromUsage,
	bucketUsage,
	CASES,
	LEDGER_RULE,
	ledgerEstimate,
	matchKeyId,
	nextSlot,
	probePrompt,
	runAnthropicCase,
	runCase,
	settleFromReport,
	verdict,
} from '../../../tools/stop-billing-probe.mjs';

const realFetch = globalThis.fetch;
afterEach(() => {
	globalThis.fetch = realFetch;
});

/** A 200 whose body streams the given SSE lines one read at a time, and errors as an abort when the signal fires. */
function streamingResponse(lines, signal) {
	const enc = new TextEncoder();
	let i = 0;
	const body = new ReadableStream({
		start(c) {
			signal?.addEventListener('abort', () => c.error(new DOMException('aborted', 'AbortError')));
		},
		pull(c) {
			if (i < lines.length) c.enqueue(enc.encode(`${lines[i++]}\n\n`));
			else c.close();
		},
	});
	return new Response(body, { status: 200 });
}

const chunk = (content, extra = {}) => `data: ${JSON.stringify({ id: 'gen-1', choices: [{ delta: { content } }], ...extra })}`;

describe('stop-billing-probe', () => {
	it('names a ledger rule for every case it runs', () => {
		assert.deepEqual(Object.keys(LEDGER_RULE).sort(), [...CASES].sort());
		assert.equal(LEDGER_RULE['before-200'], 'nothing');
		assert.equal(LEDGER_RULE['at-200'], 'nothing', 'measured: a Stop on the 200, before any chunk, is not billed');
		assert.equal(LEDGER_RULE['first-chunk'], 'estimate');
	});

	it('sends enough input that the early stops land while the provider is still reading it', () => {
		const chars = probePrompt().reduce((n, m) => n + m.content.length, 0);
		assert.ok(chars / 4 > 5000 && chars / 4 < 8000, `about 6K tokens, got ${chars / 4}`);
	});

	it('prices the estimate the way the ledger does: input text ÷ 4 at the input rate, plus the prose seen', () => {
		const msgs = [{ role: 'user', content: 'x'.repeat(4000) }];
		assert.equal(ledgerEstimate(msgs, 400, { prompt: 0.000001, completion: 0.000005 }), 1000 * 0.000001 + 100 * 0.000005);
	});

	it('reads each case against what the key was billed, and never turns "unsettled" into 0', () => {
		assert.match(verdict({ case: 'before-200', billed: 0.0031, estimate: 0 }), /^UNDERCHARGED/);
		assert.match(verdict({ case: 'before-200', billed: 0, estimate: 0 }), /^match: not billed/);
		assert.match(verdict({ case: 'at-200', billed: 0, estimate: 0 }), /^match: not billed/);
		assert.match(verdict({ case: 'at-200', billed: 0.003, estimate: 0 }), /^UNDERCHARGED/);
		assert.match(verdict({ case: 'first-chunk', billed: 0, estimate: 0.006 }), /^OVERCHARGED/);
		assert.match(verdict({ case: 'first-chunk', billed: 0.003, estimate: 0.006 }), /2\.00x/);
		assert.match(verdict({ case: 'mid-stream', billed: null, estimate: 0.006 }), /^unsettled/);
	});

	it('stops each case at its own point, through the real request flow', async () => {
		const sent = [];
		globalThis.fetch = async (_url, init) => {
			sent.push(JSON.parse(init.body));
			return streamingResponse([chunk(''), chunk('Hello '), chunk('x'.repeat(300)), chunk('y'.repeat(300)), chunk('', { usage: { cost: 0.004 } }), 'data: [DONE]'], init.signal);
		};
		const ctx = { headers: { authorization: 'Bearer test-not-a-key' }, model: 'test/model', messages: probePrompt() };

		const control = await runCase('control', ctx);
		assert.equal(control.streamedChars, 606);
		assert.equal(control.reported, 0.004);
		assert.equal(control.generationId, 'gen-1');

		const first = await runCase('first-chunk', ctx);
		assert.equal(first.streamedChars, 6, 'stops on the first chunk that carries words');

		const mid = await runCase('mid-stream', ctx);
		assert.equal(mid.streamedChars, 606, 'stops once 400 characters have arrived');
		assert.equal(mid.reported, undefined, 'the usage chunk after the stop is never read');

		const at = await runCase('at-200', ctx);
		assert.deepEqual([at.status, at.streamedChars], [200, 0]);

		assert.ok(sent.every((b) => b.stream === true && b.usage?.include === true && b.model === 'test/model'));
	});

	it('aborts the before-200 case while the request is still waiting for its headers', async () => {
		let aborted = false;
		globalThis.fetch = (_url, init) =>
			new Promise((_, reject) => {
				init.signal.addEventListener('abort', () => {
					aborted = true;
					reject(new DOMException('aborted', 'AbortError'));
				});
			});
		const out = await runCase('before-200', { headers: {}, model: 'test/model', messages: probePrompt() });
		assert.equal(aborted, true);
		assert.equal(out.status, null);
	});

	describe('a direct Anthropic key', () => {
		const sseEvent = (ev) => `event: ${ev.type}\ndata: ${JSON.stringify(ev)}`;
		const EVENTS = [
			sseEvent({ type: 'message_start', message: { usage: { input_tokens: 6604 } } }),
			sseEvent({ type: 'content_block_start', index: 0, content_block: { type: 'thinking', thinking: '' } }),
			sseEvent({ type: 'content_block_delta', index: 0, delta: { type: 'thinking_delta', thinking: '' } }),
			sseEvent({ type: 'content_block_delta', index: 0, delta: { type: 'signature_delta', signature: 'sig' } }),
			sseEvent({ type: 'content_block_start', index: 1, content_block: { type: 'text', text: '' } }),
			sseEvent({ type: 'content_block_delta', index: 1, delta: { type: 'text_delta', text: 'Hello ' } }),
			sseEvent({ type: 'content_block_delta', index: 1, delta: { type: 'text_delta', text: 'x'.repeat(500) } }),
			sseEvent({ type: 'message_delta', delta: { stop_reason: 'end_turn' }, usage: { output_tokens: 130 } }),
			sseEvent({ type: 'message_stop' }),
		];

		it('names a ledger rule for every case, and the message_start case is charged nothing', () => {
			assert.deepEqual(Object.keys(ANTHROPIC_LEDGER_RULE).sort(), [...ANTHROPIC_CASES].sort());
			assert.equal(ANTHROPIC_LEDGER_RULE['message-start'], 'nothing');
			assert.equal(ANTHROPIC_CASES.at(-1), 'control', 'control runs last, so its landed bucket vouches for the others');
		});

		it('sends the system turn as `system` and streams', () => {
			const b = anthropicBody(probePrompt());
			assert.equal(b.stream, true);
			assert.match(b.system, /review slide decks/);
			assert.deepEqual(b.messages.map((m) => m.role), ['user']);
		});

		it('stops on message_start, and on the first event the Studio turns into a callback (an empty thought is not one)', async () => {
			const sent = [];
			globalThis.fetch = async (url, init) => {
				sent.push({ url, headers: init.headers });
				return streamingResponse(EVENTS, init.signal);
			};
			const ctx = { key: 'test-not-a-key', messages: probePrompt() };
			const start = await runAnthropicCase('message-start', ctx);
			assert.deepEqual([start.stoppedOn, start.startInputTokens, start.streamedChars], ['message_start', 6604, 0]);
			const first = await runAnthropicCase('first-chunk', ctx);
			assert.deepEqual([first.stoppedOn, first.streamedChars], ['text_delta', 6]);
			const mid = await runAnthropicCase('mid-stream', ctx);
			assert.equal(mid.stoppedOn, '400 characters');
			const control = await runAnthropicCase('control', ctx);
			assert.deepEqual([control.stoppedOn, control.streamedChars], [null, 506]);
			assert.ok(sent.every((x) => x.url === 'https://api.anthropic.com/v1/messages' && x.headers['anthropic-version'] === '2023-06-01'));
		});

		it('prices a usage-report result with the Studio\'s cache rates', () => {
			const u = { uncached_input_tokens: 1000, cache_read_input_tokens: 1000, output_tokens: 100, cache_creation: { ephemeral_5m_input_tokens: 1000, ephemeral_1h_input_tokens: 1000 } };
			const price = { prompt: 1, completion: 10 };
			assert.equal(billedFromUsage(u, price), 1000 + 100 + 1250 + 2000 + 1000);
		});

		it('reads each case from its own minute, and reads every case as unsettled until the control has landed', () => {
			const run = { model: 'claude-haiku-5-5', rows: [
				{ case: 'at-200', minute: '2026-11-28T10:01:00.000Z', streamedChars: 0 },
				{ case: 'message-start', minute: '2026-11-28T10:03:00.000Z', streamedChars: 0 },
				{ case: 'control', minute: '2026-11-28T10:05:00.000Z', streamedChars: 500 },
			] };
			const bucket = (start, results) => ({ starting_at: start, ending_at: start, results });
			const partial = { data: [bucket('2026-11-28T10:01:00Z', []), bucket('2026-11-28T10:03:00Z', [{ uncached_input_tokens: 6604, output_tokens: 0 }])] };
			assert.ok(settleFromReport(run, partial).every((r) => r.billed === null), 'no control bucket yet: nothing settles, nothing reads 0');
			const full = { data: [...partial.data, bucket('2026-11-28T10:05:00Z', [{ uncached_input_tokens: 6604, output_tokens: 130 }])] };
			const rows = settleFromReport(run, full);
			assert.equal(rows[0].billed, 0);
			assert.ok(rows[1].billed > ANTHROPIC_TOL);
			assert.match(verdict(rows[0], ANTHROPIC_TOL, ANTHROPIC_LEDGER_RULE), /^match: not billed/);
			assert.match(verdict(rows[1], ANTHROPIC_TOL, ANTHROPIC_LEDGER_RULE), /^UNDERCHARGED/);
			assert.equal(bucketUsage(full, '2026-11-28T10:09:00Z'), null);
		});

		it('finds the probe key by its last four characters, and refuses a guess', () => {
			const keys = [{ id: 'apikey_a', partial_key_hint: 'sk-ant-api03-R2D...igAA' }, { id: 'apikey_b', partial_key_hint: 'sk-ant-api03-X9Q...zzBB' }];
			assert.equal(matchKeyId(keys, 'igAA'), 'apikey_a');
			assert.throws(() => matchKeyId(keys, 'none'), /0 API keys/);
			assert.throws(() => matchKeyId([...keys, { id: 'apikey_c', partial_key_hint: 'sk-…igAA' }], 'igAA'), /2 API keys/);
		});

		it('gives each case a whole UTC minute, a gap after the first', () => {
			const now = Date.parse('2026-11-28T10:00:41.500Z');
			assert.deepEqual(nextSlot(now), { minute: '2026-11-28T10:01:00.000Z', startAt: Date.parse('2026-11-28T10:01:02Z') });
			assert.equal(nextSlot(now, 2).minute, '2026-11-28T10:02:00.000Z');
		});
	});
});
