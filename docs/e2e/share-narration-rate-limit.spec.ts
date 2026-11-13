// A narrated webpage export on a CLOUD voice, against a provider that rate-limits part-way through. It drives the voice
// scheduler (docs/src/playground/voice-scheduler.js) through the real Studio export, end to end
// (2026-11-11-voice-synthesis-spine.md §3.3, the raise loop on PR #3140).
//
// OpenRouter is MOCKED: every request to it is answered here, and none leaves the browser (HARD RULE #24). The mock
// answers each sentence after a short hold, so requests overlap and the test can count how many were in flight at once,
// and it answers a run of requests in the middle of the deck with a 429 and a Retry-After.
//
// What it proves, as counts of work done (HARD RULE #32):
// - the export runs more than the old fixed pool of 3 at once, and never more than the author's cap of 6;
// - after a 429, no NEW request starts inside the pause: the first request the page sends after it reads the refusal is
//   a retry of a refused sentence, and it goes out no sooner than Retry-After when the page can read it, the scheduler's
//   2 s fallback when it cannot (a lower bound: a slow machine only waits longer);
// - every sentence ships, and the provider saw exactly one request per sentence plus one per refusal: nothing was asked
//   twice, so nothing would have been billed twice.
//
// WHERE THE PAUSE STARTS is read in the page, as an order of events, not as a time at the mock. The page learns of a 429
// only after it has read the refusal's body (voice-model.js `openRouterRung`), and until then it rightly keeps starting
// requests; under load such a request reached the mock 259 ms after the 429 left it. The old check called anything past
// 250 ms "started inside the pause" and failed 4 of 16 loaded webkit-phone runs. Here the page's `fetch` is wrapped to
// log each speech request, and `Headers.get('retry-after')` on a 429 logs the refusal: voiceHttpError reads it in the
// same task, a few microtasks before the scheduler pauses, so no other request can start between the two.
import * as fs from 'node:fs';
import { expect, gotoStudio, setEditorContent, test } from './studio-fixture';

test.setTimeout(300_000);

const SLIDES = 30;
const PER_SLIDE = 11;
const CAP = 6;
/** Requests (by arrival order, 1-based) the provider refuses once with a 429. */
const REFUSED = new Set([60, 61, 62, 63, 64, 65]);

const DECK = `---\ntheme: indaco\n---\n\n${Array.from({ length: SLIDES }, (_, s) =>
	`## Slide ${s + 1}\n\n${Array.from({ length: PER_SLIDE }, (_, i) => `Point ${i + 1} of slide ${s + 1} holds.`).join(' ')}`,
).join('\n\n---\n\n')}\n`;

/** One MPEG-1 Layer III frame header and padding: enough for the bake to ship as audio/mpeg (it passes through). */
const MP3 = Buffer.concat([Buffer.from([0xff, 0xfb, 0x90, 0x64]), Buffer.alloc(413)]);

// Two providers. OpenRouter's real 429 sends Retry-After but does not list it in Access-Control-Expose-Headers (checked
// 2026-11-11), so the page cannot read it and the scheduler falls back to its own 2 s pause. A provider that exposes the
// header gets its own wait honored: 4 s here, longer than the fallback, so that arm passes only if the header was read.
for (const { label, retryAfterS, exposed, minPauseMs } of [
	{ label: 'Retry-After hidden from the page, as OpenRouter sends it', retryAfterS: 4, exposed: false, minPauseMs: 2_000 },
	{ label: 'Retry-After exposed to the page', retryAfterS: 4, exposed: true, minPauseMs: 4_000 },
]) {
test(`@crosswidth @webkit-phone @gecko a cloud-voiced export rides out a rate limit (${label}): parallel under the cap, waits, ships every sentence once`, async ({ page, context }, testInfo) => {
	let arrived = 0;
	let inFlight = 0;
	let peak = 0;
	const texts: string[] = [];
	await context.route(/openrouter\.ai/, async (route) => {
		const req = route.request();
		if (!/\/audio\/speech$/.test(new URL(req.url()).pathname) || req.method() !== 'POST') return route.abort();
		const n = ++arrived;
		texts.push(JSON.parse(req.postData() || '{}').input);
		if (REFUSED.has(n)) {
			return route.fulfill({ status: 429, headers: { 'retry-after': String(retryAfterS), 'access-control-allow-origin': '*', ...(exposed ? { 'access-control-expose-headers': 'retry-after' } : {}) }, body: '{"error":{"message":"Rate limit exceeded"}}' });
		}
		inFlight++;
		peak = Math.max(peak, inFlight);
		// Hold the answer so concurrent requests overlap. A waiting signal, not a timing assertion: nothing measures it.
		await new Promise((r) => setTimeout(r, 150)); // flaky-ok: holds the mock answer open so requests overlap; nothing asserts on it
		inFlight--;
		return route.fulfill({ status: 200, contentType: 'audio/mpeg', body: MP3 });
	});
	// The page's own record of what it sent and when it read a refusal, in the order it happened (see the note at the top).
	await context.addInitScript(() => {
		const log: Array<{ kind: 'sent' | 'refused'; text?: string; at: number }> = [];
		Object.defineProperty(window, '__speechLog', { value: log });
		const refusals = new WeakSet<Headers>();
		const fetch0 = window.fetch;
		window.fetch = function (input: RequestInfo | URL, init?: RequestInit) {
			const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
			if (!/openrouter\.ai\/.*\/audio\/speech$/.test(url)) return fetch0.call(this, input, init);
			let text = '';
			try {
				text = JSON.parse(String(init?.body ?? '{}')).input ?? '';
			} catch {
				/* not a speech body: logged with no text, which the checks below treat as a fresh request */
			}
			log.push({ kind: 'sent', text, at: Date.now() });
			return fetch0.call(this, input, init).then((res) => {
				if (res.status === 429) refusals.add(res.headers);
				return res;
			});
		};
		const get0 = Headers.prototype.get;
		Headers.prototype.get = function (name: string) {
			if (refusals.has(this) && String(name).toLowerCase() === 'retry-after') {
				refusals.delete(this);
				log.push({ kind: 'refused', at: Date.now() });
			}
			return get0.call(this, name);
		};
	});
	await context.addInitScript((cap) => {
		try {
			localStorage.setItem('lattice-db-or-key', 'sk-e2e-mock-not-a-real-key');
			localStorage.setItem('lattice-studio-voice-selection', JSON.stringify({ v: 1, source: 'cloud', provider: 'openrouter', model: '', voice: '', last: {} }));
			localStorage.setItem('lattice-voice-parallel', String(cap));
		} catch {
			/* storage unavailable: the test then fails on the enabled check below */
		}
	}, CAP);

	await gotoStudio(page);
	// What is under test is the engine's network and timing behavior, not a layout: every project runs it at a desktop
	// box, where the editor is in view (a phone box hides it behind the Read pane). WebKit and Gecko stay real engines.
	await page.setViewportSize({ width: 1440, height: 900 });
	await setEditorContent(page, DECK);
	await page.getByRole('button', { name: 'Share', exact: true }).click();
	await page.getByRole('button', { name: /Webpage/ }).click();
	const audio = page.getByRole('switch', { name: 'Include narration audio' });
	await expect(audio).toBeEnabled();
	if ((await audio.getAttribute('aria-checked')) !== 'true') await audio.click();

	const [dl] = await Promise.all([page.waitForEvent('download', { timeout: 240_000 }), page.getByRole('button', { name: /Download webpage/ }).click()]);
	const file = testInfo.outputPath('narrated.html');
	await dl.saveAs(file);
	const html = fs.readFileSync(file, 'utf8');
	const log = await page.evaluate(() => (window as unknown as { __speechLog: Array<{ kind: 'sent' | 'refused'; text?: string; at: number }> }).__speechLog);

	// Each slide speaks its heading as well as its points, so the deck's sentence count is read off what was asked.
	const unique = new Set(texts);
	const sentences = unique.size;
	expect(sentences, 'every point (and each slide\'s heading) was asked for').toBeGreaterThanOrEqual(SLIDES * PER_SLIDE);
	expect(arrived, 'one request per sentence, plus one retry per refusal, and nothing else').toBe(sentences + REFUSED.size);
	expect((html.match(/data:audio\/mpeg;base64,/g) ?? []).length, 'every sentence ships with audio').toBeGreaterThanOrEqual(sentences);
	expect(peak, 'more than the old fixed pool of 3 ran at once').toBeGreaterThan(3);
	expect(peak, 'never past the author\'s cap').toBeLessThanOrEqual(CAP);
	// The page read a refusal, and the first request it sent after that is a sentence it had already asked for: nothing new
	// started inside the pause. And that retry left no sooner than the pause the scheduler owed: the refusal is logged before
	// the scheduler computes its pause from its own clock, so the gap can only come out longer than the pause, never shorter.
	const firstRefusal = log.findIndex((e) => e.kind === 'refused');
	expect(firstRefusal, 'the page read a 429').toBeGreaterThan(-1);
	const askedBefore = new Set(log.slice(0, firstRefusal).flatMap((e) => (e.kind === 'sent' ? [e.text] : [])));
	const next = log.slice(firstRefusal + 1).find((e) => e.kind === 'sent');
	expect(next, 'a request followed the refusal').toBeDefined();
	expect(askedBefore.has(next?.text), 'nothing new started inside the pause: the first request after the 429 is a retry').toBe(true);
	expect((next?.at ?? 0) - log[firstRefusal].at, 'the retry waited out the pause').toBeGreaterThanOrEqual(minPauseMs);
});
}
