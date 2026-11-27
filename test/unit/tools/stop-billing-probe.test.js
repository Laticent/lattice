/**
 * `tools/stop-billing-probe.mjs` measures whether OpenRouter bills a stopped chat request, and from which point. It
 * spends real credits, so it runs only on the owner's word; this file holds the parts that decide what its numbers mean,
 * and drives its request flow against a stubbed fetch, so a paid run is not the first time the code executes.
 * No network: every fetch is a stub (HARD RULE #24, #32).
 */
import assert from 'node:assert/strict';
import { afterEach, describe, it } from 'node:test';
import { CASES, LEDGER_RULE, ledgerEstimate, probePrompt, runCase, verdict } from '../../../tools/stop-billing-probe.mjs';

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
		assert.equal(LEDGER_RULE['at-200'], 'estimate');
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
		assert.match(verdict({ case: 'at-200', billed: 0, estimate: 0.006 }), /^OVERCHARGED/);
		assert.match(verdict({ case: 'at-200', billed: 0.003, estimate: 0.006 }), /2\.00x/);
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
});
