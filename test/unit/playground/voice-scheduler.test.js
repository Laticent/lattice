/**
 * `docs/src/playground/voice-scheduler.js` is the one gate every voice request passes through
 * (engineering/decisions/2026-11-11-voice-synthesis-spine.md §3.3). These cases run it on a fake clock with a fixed
 * jitter (HARD RULE #32), so each asserts the order and count of work, never a duration measured off the machine.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { classifyVoiceError, createVoiceScheduler, retryAfterMs } from '../../../docs/src/playground/voice-scheduler.js';

/** A clock the test advances by hand; timers fire in time order when it does. */
function fakeClock() {
	let t = 0;
	let seq = 0;
	const timers = new Map();
	const flush = () => new Promise((r) => setImmediate(r));
	return {
		now: () => t,
		setTimer: (fn, ms) => {
			const id = ++seq;
			timers.set(id, { at: t + ms, fn });
			return id;
		},
		clearTimer: (id) => timers.delete(id),
		async advance(ms) {
			const until = t + ms;
			for (;;) {
				await flush();
				const due = [...timers.entries()].filter(([, v]) => v.at <= until).sort((a, b) => a[1].at - b[1].at)[0];
				if (!due) break;
				timers.delete(due[0]);
				t = due[1].at;
				due[1].fn();
			}
			t = until;
			await flush();
		},
		flush,
	};
}

/** A task the test settles by hand. Records every start. */
function controllable() {
	const started = [];
	const make = (key) => (signal) =>
		new Promise((resolve, reject) => {
			started.push({ key, resolve, reject, signal });
			signal.addEventListener('abort', () => reject(Object.assign(new Error('aborted'), { name: 'AbortError' })));
		});
	return { started, make };
}

const sched = (clock, extra = {}) => createVoiceScheduler({ now: clock.now, setTimer: clock.setTimer, clearTimer: clock.clearTimer, jitter: () => 0.5, ...extra });
const err = (status, extra = {}) => Object.assign(new Error(String(status)), { status, ...extra });

test('classifyVoiceError sorts statuses and adapter kinds into the four verdicts', () => {
	assert.equal(classifyVoiceError({ status: 429 }), 'rate');
	assert.equal(classifyVoiceError({ status: 503 }), 'rate');
	assert.equal(classifyVoiceError({ status: 502 }), 'retry');
	assert.equal(classifyVoiceError({ status: 0 }), 'retry');
	assert.equal(classifyVoiceError({ name: 'AbortError' }), 'retry');
	assert.equal(classifyVoiceError({ status: 401 }), 'stop');
	assert.equal(classifyVoiceError({ status: 402 }), 'stop');
	assert.equal(classifyVoiceError({ status: 400 }), 'fail');
	assert.equal(classifyVoiceError({ name: 'AbortError', kind: 'canceled' }), 'fail', 'a canceled export is not a hung request');
	assert.equal(classifyVoiceError({ status: 400, kind: 'billing' }), 'stop', 'a 400 that says "no credit" is final');
	assert.equal(classifyVoiceError(new TypeError('Failed to fetch')), 'retry', 'no answer came back');
	assert.equal(classifyVoiceError(new Error('Gemini returned no audio')), 'fail', 'after a 200, which was billed');
	assert.equal(classifyVoiceError(new SyntaxError('Unexpected token')), 'fail', 'a body that would not parse, after a 200');
	assert.equal(classifyVoiceError({ status: 429, kind: 'billing' }), 'stop', 'a 429 that says "quota exceeded" is final');
});

test('retryAfterMs reads seconds and HTTP dates, and nothing else', () => {
	assert.equal(retryAfterMs('3'), 3000);
	assert.equal(retryAfterMs(new Date(10_000).toUTCString(), 4_000), 6000);
	assert.equal(retryAfterMs(null), null);
	assert.equal(retryAfterMs('soon'), null);
});

test('runs at most `limit` at once, and the highest lane takes a free slot first', async () => {
	const clock = fakeClock();
	const s = sched(clock, { cap: 2 });
	const { started, make } = controllable();
	s.run('b1', 'bulk', make('b1'));
	s.run('b2', 'bulk', make('b2'));
	s.run('b3', 'bulk', make('b3'));
	s.run('n1', 'now', make('n1'));
	await clock.flush();
	assert.deepEqual(started.map((x) => x.key), ['b1', 'b2']);
	started[0].resolve('ok');
	await clock.flush();
	assert.deepEqual(started.map((x) => x.key), ['b1', 'b2', 'n1'], 'the playing sentence jumps the export');
});

test('a second caller for the same key joins the first request, and a higher lane promotes it', async () => {
	const clock = fakeClock();
	const s = sched(clock, { cap: 1 });
	const { started, make } = controllable();
	s.run('busy', 'bulk', make('busy'));
	const prefetch = s.run('k', 'next', make('k'));
	s.run('other', 'next', make('other'));
	const playing = s.run('k', 'now', make('k-dup'));
	await clock.flush();
	started[0].resolve('done');
	await clock.flush();
	assert.deepEqual(started.map((x) => x.key), ['busy', 'k'], 'k was promoted past "other", and started once');
	started[1].resolve('clip');
	assert.equal(await prefetch, 'clip');
	assert.equal(await playing, 'clip');
});

test('a 429 halves the limit, pauses the provider for its Retry-After, then retries the same job', async () => {
	const clock = fakeClock();
	const s = sched(clock, { cap: 4 });
	const { started, make } = controllable();
	const results = ['a', 'b', 'c', 'd'].map((k) => s.run(k, 'bulk', make(k)));
	await clock.flush();
	assert.equal(started.length, 4);
	started[0].reject(Object.assign(new Error('rate'), { status: 429, retryAfter: '2' }));
	await clock.flush();
	assert.equal(s.state().limit, 2);
	for (const x of started.slice(1, 4)) x.resolve(x.key);
	await clock.advance(1999);
	assert.equal(started.length, 4, 'nothing starts inside the Retry-After window');
	await clock.advance(1);
	assert.equal(started.length, 5);
	assert.equal(started[4].key, 'a');
	started[4].resolve('a');
	assert.deepEqual(await Promise.all(results), ['a', 'b', 'c', 'd']);
});

test('the limit climbs back one slot per clean window, never past the cap', async () => {
	const clock = fakeClock();
	const s = sched(clock, { cap: 3, start: 1 });
	const { started, make } = controllable();
	for (let i = 0; i < 8; i++) s.run(`k${i}`, 'bulk', make(`k${i}`));
	for (let i = 0; i < 8; i++) {
		await clock.flush();
		const open = started.filter((x) => !x.done);
		for (const x of open) {
			x.done = true;
			x.resolve(x.key);
		}
	}
	await clock.flush();
	assert.equal(s.state().limit, 3);
	s.setCap(2);
	assert.equal(s.state().limit, 2, 'lowering the cap lowers the limit at once');
});

test('a key error fails the job and every job queued behind it, with no further requests', async () => {
	const clock = fakeClock();
	const s = sched(clock, { cap: 1 });
	const { started, make } = controllable();
	const first = s.run('a', 'bulk', make('a'));
	const second = s.run('b', 'bulk', make('b'));
	await clock.flush();
	started[0].reject(Object.assign(new Error('dead key'), { status: 401 }));
	await assert.rejects(first, /dead key/);
	await assert.rejects(second, /dead key/);
	assert.equal(started.length, 1);
});

test('a 400 is not retried', async () => {
	const clock = fakeClock();
	const s = sched(clock, { cap: 1 });
	const { started, make } = controllable();
	const p = s.run('a', 'bulk', make('a'));
	await clock.flush();
	started[0].reject(Object.assign(new Error('bad voice'), { status: 400 }));
	await assert.rejects(p, /bad voice/);
	await clock.advance(60_000);
	assert.equal(started.length, 1);
});

test('consecutive failures open the breaker; one probe goes through after the cooldown and closes it on success', async () => {
	const clock = fakeClock();
	const s = sched(clock, { cap: 2, breakerAfter: 2, breakerCooldownMs: 10_000, baseBackoffMs: 100 });
	const { started, make } = controllable();
	const a = s.run('a', 'bulk', make('a'));
	const b = s.run('b', 'bulk', make('b'));
	await clock.flush();
	started[0].reject(Object.assign(new Error('502'), { status: 502 }));
	started[1].reject(Object.assign(new Error('502'), { status: 502 }));
	await clock.flush();
	assert.equal(s.state().breaker, 'open');
	await clock.advance(9_999);
	assert.equal(started.length, 2, 'nothing is sent while the breaker is open');
	await clock.advance(1);
	assert.equal(started.length, 3, 'exactly one probe');
	started[2].resolve('ok');
	await clock.flush();
	assert.equal(s.state().breaker, 'closed');
	assert.equal(started.length, 4, 'the rest follow once the probe succeeds');
	started[3].resolve('ok');
	assert.deepEqual((await Promise.all([a, b])).length, 2);
});

test('the playing sentence gives up sooner than the export does', async () => {
	const clock = fakeClock();
	const s = sched(clock, { cap: 1, retries: { now: 1, bulk: 3 }, baseBackoffMs: 10 });
	const { started, make } = controllable();
	const live = s.run('live', 'now', make('live'));
	for (let i = 0; i < 2; i++) {
		await clock.advance(1_000);
		started.at(-1)?.reject(Object.assign(new Error('502'), { status: 502 }));
	}
	await assert.rejects(live, /502/);
	assert.equal(started.length, 2, 'one attempt plus one retry');
});

test('a caller that cancels leaves the job; the request is canceled only when nobody is left waiting', async () => {
	const clock = fakeClock();
	const s = sched(clock, { cap: 1 });
	const { started, make } = controllable();
	const exportCtl = new AbortController();
	const fromExport = s.run('k', 'bulk', make('k'), { signal: exportCtl.signal });
	const fromRoom = s.run('k', 'now', make('k-dup'));
	await clock.flush();
	exportCtl.abort();
	await assert.rejects(fromExport, { kind: 'canceled' });
	assert.equal(started[0].signal.aborted, false, 'the room is still waiting, so the request runs on');
	started[0].resolve('clip');
	assert.equal(await fromRoom, 'clip');
});

test('the last caller to leave cancels the request, which is never retried, and a queued one is never sent', async () => {
	const clock = fakeClock();
	const s = sched(clock, { cap: 1 });
	const { started, make } = controllable();
	const a = new AbortController();
	const b = new AbortController();
	const running = s.run('a', 'bulk', make('a'), { signal: a.signal });
	const queued = s.run('b', 'bulk', make('b'), { signal: b.signal });
	await clock.flush();
	b.abort();
	a.abort();
	await assert.rejects(running, { kind: 'canceled' });
	await assert.rejects(queued, { kind: 'canceled' });
	assert.equal(started[0].signal.aborted, true, 'the running request is aborted: it stops spending');
	await clock.advance(60_000);
	assert.equal(started.length, 1, 'no retry, and the queued job was never sent');
});

test('a job keeps the largest retry budget of anyone waiting on it', async () => {
	const clock = fakeClock();
	const s = sched(clock, { cap: 1, retries: { now: 0, bulk: 2 }, baseBackoffMs: 10, breakerAfter: 99 });
	const { started, make } = controllable();
	const fromExport = s.run('k', 'bulk', make('k'));
	await clock.flush();
	const fromRoom = s.run('k', 'now', make('k-dup'));
	for (let i = 0; i < 2; i++) {
		started.at(-1).reject(err(502));
		await clock.advance(1_000);
	}
	assert.equal(started.length, 3, 'a live joiner did not cut the export\'s retries short');
	started.at(-1).resolve('clip');
	assert.equal(await fromExport, 'clip');
	assert.equal(await fromRoom, 'clip');
});

test('a probe that fails for good reopens the breaker instead of leaving it half-open', async () => {
	const clock = fakeClock();
	const s = sched(clock, { cap: 1, breakerAfter: 1, breakerCooldownMs: 1_000, retries: { bulk: 0 } });
	const { started, make } = controllable();
	const first = s.run('a', 'bulk', make('a'));
	await clock.flush();
	started[0].reject(err(502));
	await assert.rejects(first);
	const second = s.run('b', 'bulk', make('b'));
	await clock.advance(1_000);
	assert.equal(started.length, 2, 'the probe');
	started[1].reject(err(502));
	await assert.rejects(second);
	assert.equal(s.state().breaker, 'open');
});

test('a caller who arrives while the last request is being canceled gets a fresh request, not the cancellation', async () => {
	const clock = fakeClock();
	const s = sched(clock, { cap: 2 });
	const { started, make } = controllable();
	const ceiling = new AbortController();
	const first = s.run('k', 'next', make('k'), { signal: ceiling.signal });
	await clock.flush();
	ceiling.abort();
	// The aborted attempt has not rejected yet when the room asks for the same sentence.
	const room = s.run('k', 'now', make('k-again'));
	await assert.rejects(first, { kind: 'canceled' });
	await clock.flush();
	assert.equal(started.length, 2, 'a new request was sent');
	started[1].resolve('clip');
	assert.equal(await room, 'clip');
	// The old job settling late must not erase the new one from the map.
	assert.equal(s.has('k'), false);
});

test('a 429 the browser cannot read Retry-After from pauses 2 s, and a burst of them counts once', async () => {
	const clock = fakeClock();
	const s = sched(clock, { cap: 4 });
	const { started, make } = controllable();
	const all = ['a', 'b', 'c', 'd'].map((k) => s.run(k, 'bulk', make(k)));
	await clock.flush();
	// Four refusals from one moment, none carrying a readable Retry-After (OpenRouter's case in a browser).
	for (const x of started.slice(0, 4)) x.reject(err(429));
	await clock.flush();
	assert.equal(s.state().limit, 2, 'halved once for the burst, not four times');
	await clock.advance(1_999);
	assert.equal(started.length, 4, 'nothing re-sent inside the 2 s pause');
	await clock.advance(1);
	assert.equal(started.length, 6, 'then up to the halved limit');
	for (const x of started.slice(4)) x.resolve(x.key);
	await clock.advance(10);
	for (const x of started.slice(6)) x.resolve(x.key);
	await clock.flush();
	assert.equal((await Promise.all(all)).length, 4);
});
