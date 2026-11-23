// The draw host's own rules, with a fake frame (the frame's drawing is proven in a real browser by
// test/integration/export/draw-frame.test.js): the library is held to its pin before it is run, a frame stays open
// between draws, a draw that overruns spends its frame and the next one opens a fresh one, and a closed host draws nothing.

import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SHELL_DOC, SHELL_READY } from '../../../../lib/packages/sandbox-shell.mjs';
import { createDrawHost, type DrawJob, type DrawLibrary, OFFLINE_SHELL_MESSAGE } from './draw-host';

const ROOT = path.join(__dirname, '../../../..');
const PLOT_LIB = fs.readFileSync(path.join(ROOT, 'lib/plugins/function-plot/vendor/function-plot.js'), 'utf8');
const JOB: DrawJob = { kind: 'function-plot', configB64: 'e30=', configText: '{}', width: 600, height: 300, index: 0 };

type Fake = { frame: unknown; posted: Array<Record<string, unknown>>; doc?: string; removed: boolean; reply: (data: unknown) => void };

function rig(opts: { fetchText?: (url: string) => Promise<string>; autoReady?: boolean; hello?: boolean; libraries?: Record<string, DrawLibrary> } = {}) {
	const frames: Fake[] = [];
	const doc = {
		body: {
			appendChild(el: { __fake: Fake }) {
				const f = el.__fake;
				// The frame loads the sandbox shell, which says hello; the host then hands it the document
				// (lib/packages/sandbox-shell.mjs), and the frame says it is ready once that is in.
				if (opts.hello !== false) queueMicrotask(() => f.reply({ t: SHELL_READY }));
			},
		},
		createElement() {
			const fake: Fake = { frame: null, posted: [], removed: false, reply: () => {} };
			const contentWindow = {
				postMessage: (m: Record<string, unknown>) => {
					if (m.t !== SHELL_DOC) return void fake.posted.push(m);
					fake.doc = String(m.html);
					if (opts.autoReady !== false) queueMicrotask(() => fake.reply({ t: 'ready' }));
				},
			};
			const el = {
				__fake: fake,
				contentWindow,
				dataset: {} as Record<string, string>,
				style: {} as Record<string, string>,
				title: '',
				src: '',
				setAttribute() {},
				remove() {
					fake.removed = true;
				},
			};
			fake.frame = el;
			fake.reply = (data) => window.dispatchEvent(Object.assign(new Event('message'), { source: contentWindow, data }));
			frames.push(fake);
			return el;
		},
	} as unknown as Document;
	const host = createDrawHost({ libraryUrl: (file) => `/assets/${file}`, fetchText: opts.fetchText ?? (async () => PLOT_LIB), doc, ...(opts.libraries ? { libraries: opts.libraries } : {}) });
	return { host, frames };
}

/** Wait until frame `i` is open and has been sent `n` draws: the host's own signal, where the test used to sleep and hope. */
const sent = (frames: Fake[], i: number, n: number) => vi.waitFor(() => expect(frames[i]?.posted.length ?? 0).toBe(n), { timeout: 10_000, interval: 1 });

/** Pass the offline hello deadline: the 2 s timer, then the message it posts to decide after queued messages (jsdom delivers a posted message on a short timer of its own, which the fake clock drives). */
const passHelloDeadline = async () => {
	await vi.advanceTimersByTimeAsync(2_000);
	await vi.advanceTimersByTimeAsync(10);
};

/** Wait (on real turns of the event loop, which the library's hashing needs) until the host has made its frame: its open timer is set in the same step. */
const frameCreated = async (frames: Fake[]) => {
	while (!frames.length) await new Promise((r) => setImmediate(r));
};

// The draw host runs on pages with a content policy (every docs page that previews a deck), so the rig
// gives the page one: the frame then opens through the sandbox shell (lib/packages/sandbox-shell.mjs).
beforeEach(() => {
	const meta = document.createElement('meta');
	meta.setAttribute('http-equiv', 'Content-Security-Policy');
	meta.setAttribute('content', "script-src 'self'");
	meta.dataset.testPolicy = '';
	document.head.appendChild(meta);
});
afterEach(() => {
	for (const m of document.querySelectorAll('meta[data-test-policy]')) m.remove();
});

const opened: Array<() => void> = [];
afterEach(() => {
	for (const close of opened.splice(0)) close();
	// Here, not only in a test's own `finally`: a test that times out never reaches it, and its fake clock would hang the next.
	vi.useRealTimers();
	vi.restoreAllMocks();
});

describe('the draw host', () => {
	it('runs a library only when its text matches the pin in the manifest', async () => {
		const { host, frames } = rig({ fetchText: async () => 'alert(1)' });
		opened.push(host.close);
		await expect(host.draw(JOB)).rejects.toThrow(/does not match its pin/);
		expect(frames).toHaveLength(0);
	});

	it('does not remember a library that failed to load: the next draw tries again', async () => {
		let calls = 0;
		const { host, frames } = rig({
			fetchText: async () => {
				if (++calls === 1) throw new Error('offline');
				return PLOT_LIB;
			},
		});
		opened.push(host.close);
		await expect(host.draw(JOB)).rejects.toThrow('offline');
		const drawn = host.draw(JOB);
		await sent(frames, 0, 1);
		frames[0].reply({ t: 'result', id: 1, out: '<svg/>' });
		await expect(drawn).resolves.toBe('<svg/>');
		expect(calls).toBe(2);
	});

	it('keeps a frame open between draws and answers each draw to its own id', async () => {
		const { host, frames } = rig();
		opened.push(host.close);
		const a = host.draw(JOB);
		await sent(frames, 0, 1);
		expect(frames).toHaveLength(1);
		expect(frames[0].posted[0]).toMatchObject({ t: 'draw', id: 1, kind: 'function-plot', width: 600 });
		frames[0].reply({ t: 'result', id: 1, out: '<svg id="a"/>' });
		await expect(a).resolves.toBe('<svg id="a"/>');
		const b = host.draw(JOB);
		await sent(frames, 0, 2);
		expect(frames).toHaveLength(1);
		frames[0].reply({ t: 'result', id: 2, out: '<svg id="b"/>' });
		await expect(b).resolves.toBe('<svg id="b"/>');
	});

	it('ignores a message from anything but its frame, and a stray one from its frame', async () => {
		const { host, frames } = rig();
		opened.push(host.close);
		const a = host.draw(JOB, 300);
		await sent(frames, 0, 1);
		window.dispatchEvent(Object.assign(new Event('message'), { source: window, data: { t: 'result', id: 1, out: '<svg id="forged"/>' } }));
		frames[0].reply({ t: 'result', id: 99, out: '<svg id="wrong-id"/>' });
		frames[0].reply({ nonsense: true });
		frames[0].reply({ t: 'result', id: 1, out: '<svg id="real"/>' });
		await expect(a).resolves.toBe('<svg id="real"/>');
	});

	it('rejects with the frame\'s own reason when a draw fails', async () => {
		const { host, frames } = rig();
		opened.push(host.close);
		const a = host.draw(JOB);
		await sent(frames, 0, 1);
		frames[0].reply({ t: 'result', id: 1, error: 'functionplot error: bad config' });
		await expect(a).rejects.toThrow('functionplot error: bad config');
	});

	it('offline, a shell that never says hello fails in two seconds and tells the visitor what to do', async () => {
		// Firefox sends a sandboxed frame's navigation past the service worker, so offline a shell it never fetched
		// does not load (followups.d/3277 OFFLINE). The full 30 s outlasted the slide's own budgets (function-plot: 4 s).
		vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
		const onLine = vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false);
		try {
			const { host, frames } = rig({ hello: false });
			opened.push(host.close);
			const draw = host.draw(JOB);
			await frameCreated(frames);
			const failed = expect(draw).rejects.toThrow(OFFLINE_SHELL_MESSAGE);
			await passHelloDeadline();
			await failed;
			// function-plot compiles code, which the page's policy refuses, so it is NOT left to the page: the figure shows this message.
			await expect(draw.catch((e) => (e as { drawUnavailable?: boolean }).drawUnavailable)).resolves.toBeUndefined();
			expect(frames[0].removed).toBe(true);
		} finally {
			onLine.mockRestore();
			vi.useRealTimers();
		}
	});

	it('offline, a failed shell is remembered: the next try fails at once, with no second frame', async () => {
		vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
		vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false);
		const { host, frames } = rig({ hello: false });
		opened.push(host.close);
		const first = host.draw(JOB);
		await frameCreated(frames);
		const failed = expect(first).rejects.toThrow(OFFLINE_SHELL_MESSAGE);
		await passHelloDeadline();
		await failed;
		// Still offline: no second frame, no second wait.
		await expect(host.draw(JOB)).rejects.toThrow(OFFLINE_SHELL_MESSAGE);
		expect(frames).toHaveLength(1);
	});

	it('offline, a shell that says hello is given the full open deadline, even if the frame is ready only after the check', async () => {
		// The real order: hello, then the document, then (much later, once the library loads) ready. The check lands in between,
		// so only the shell's hello stands between it and a false offline verdict.
		vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
		vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false);
		const { host, frames } = rig({ autoReady: false });
		opened.push(host.close);
		const draw = host.draw(JOB);
		let settled = false;
		draw.then(() => (settled = true), () => (settled = true));
		await frameCreated(frames);
		await vi.waitFor(() => expect(frames[0].doc).toBeDefined(), { timeout: 5_000, interval: 1 }); // hello said, document handed over
		await passHelloDeadline();
		expect(settled).toBe(false);
		expect(frames[0].removed).toBe(false);
		frames[0].reply({ t: 'ready' });
		await sent(frames, 0, 1);
		frames[0].reply({ t: 'result', id: 1, out: '<svg/>' });
		await expect(draw).resolves.toBe('<svg/>');
	});

	it('back online, a kind that failed offline is tried again', async () => {
		vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
		const onLine = vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false);
		const { host, frames } = rig({ hello: false });
		opened.push(host.close);
		const first = host.draw(JOB);
		await frameCreated(frames);
		const failed = expect(first).rejects.toThrow(OFFLINE_SHELL_MESSAGE);
		await passHelloDeadline();
		await failed;
		onLine.mockReturnValue(true);
		void host.draw(JOB).catch(() => {});
		await vi.waitFor(() => expect(frames).toHaveLength(2), { timeout: 5_000, interval: 1 });
	});

	it('offline, a hello queued behind a busy page still opens the frame: the deadline decides after queued messages', async () => {
		vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
		vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false);
		const { host, frames } = rig({ hello: false, autoReady: false });
		opened.push(host.close);
		const draw = host.draw(JOB);
		let settled = false;
		draw.then(() => (settled = true), () => (settled = true));
		await frameCreated(frames);
		await vi.advanceTimersByTimeAsync(2_000); // the deadline fires and posts its check…
		frames[0].reply({ t: SHELL_READY }); // …but the shell's hello was already queued ahead of it
		await vi.advanceTimersByTimeAsync(10); // the check is delivered; the frame is not ready yet
		expect(settled).toBe(false);
		frames[0].reply({ t: 'ready' });
		await sent(frames, 0, 1);
		frames[0].reply({ t: 'result', id: 1, out: '<svg/>' });
		await expect(draw).resolves.toBe('<svg/>');
	});

	it('offline, a look-alike check from another frame does not end the wait early', async () => {
		vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
		vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false);
		const { host, frames } = rig({ hello: false, autoReady: false });
		opened.push(host.close);
		const draw = host.draw(JOB);
		let settled = false;
		draw.then(() => (settled = true), () => (settled = true));
		await frameCreated(frames);
		await vi.advanceTimersByTimeAsync(2_000); // the deadline posts its first check
		// Another frame sends every check id it could guess, before the page's own check is delivered.
		const other = {} as Window;
		for (let id = 1; id <= 500; id++) window.dispatchEvent(Object.assign(new Event('message'), { source: other, data: { t: 'lattice-draw-hello-check', id } }));
		frames[0].reply({ t: SHELL_READY }); // the shell's hello, still ahead of the page's own check
		await vi.advanceTimersByTimeAsync(10);
		expect(settled).toBe(false);
		frames[0].reply({ t: 'ready' });
		await sent(frames, 0, 1);
		frames[0].reply({ t: 'result', id: 1, out: '<svg/>' });
		await expect(draw).resolves.toBe('<svg/>');
	});

	it('offline, a kind the page can draw itself is left to the page', async () => {
		vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
		vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false);
		const lib = { file: 'plain.js', sha256: createHash('sha256').update('/* plain */').digest('hex'), global: 'plain', adapter: 'function draw() { return "<svg/>"; }' };
		const { host, frames } = rig({ hello: false, fetchText: async () => '/* plain */', libraries: { plain: lib } });
		opened.push(host.close);
		const draw = host.draw({ kind: 'plain' } as unknown as DrawJob);
		await frameCreated(frames);
		const failed = expect(draw).rejects.toThrow(OFFLINE_SHELL_MESSAGE);
		await passHelloDeadline();
		await failed;
		await expect(draw.catch((e) => (e as { drawUnavailable?: boolean }).drawUnavailable)).resolves.toBe(true);
	});

	it('online, a slow shell keeps the full open deadline', async () => {
		vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
		try {
			const { host, frames } = rig({ hello: false });
			opened.push(host.close);
			const draw = host.draw(JOB);
			await frameCreated(frames);
			let settled = false;
			draw.then(() => (settled = true), () => (settled = true));
			await vi.advanceTimersByTimeAsync(5_000);
			expect(settled).toBe(false);
			const failed = expect(draw).rejects.toThrow(/did not open within 30000 ms/);
			await vi.advanceTimersByTimeAsync(25_000);
			await failed;
			expect(frames[0].removed).toBe(true);
		} finally {
			vi.useRealTimers();
		}
	});

	it('spends a frame whose draw overran, and opens a fresh one for the next draw', async () => {
		const { host, frames } = rig();
		opened.push(host.close);
		await expect(host.draw(JOB, 40)).rejects.toThrow(/did not finish within 40 ms/);
		expect(frames[0].removed).toBe(true);
		const next = host.draw(JOB);
		await sent(frames, 1, 1);
		expect(frames).toHaveLength(2);
		frames[1].reply({ t: 'result', id: 1, out: '<svg/>' });
		await expect(next).resolves.toBe('<svg/>');
	});

	it('warms a frame ahead of the first draw, which then finds it open and posts at once', async () => {
		const { host, frames } = rig();
		opened.push(host.close);
		await host.warm('function-plot');
		expect(frames).toHaveLength(1);
		expect(frames[0].posted).toHaveLength(0);
		const a = host.draw(JOB);
		await sent(frames, 0, 1);
		expect(frames).toHaveLength(1);
		expect(frames[0].posted[0]).toMatchObject({ t: 'draw', id: 1 });
		frames[0].reply({ t: 'result', id: 1, out: '<svg/>' });
		await expect(a).resolves.toBe('<svg/>');
	});

	it('a warm-up that cannot run says why, and the next draw tries again', async () => {
		let calls = 0;
		const { host, frames } = rig({
			fetchText: async () => {
				if (++calls === 1) throw new Error('offline');
				return PLOT_LIB;
			},
		});
		opened.push(host.close);
		await expect(host.warm('function-plot')).rejects.toThrow('offline');
		const a = host.draw(JOB);
		await sent(frames, 0, 1);
		frames[0].reply({ t: 'result', id: 1, out: '<svg/>' });
		await expect(a).resolves.toBe('<svg/>');
	});

	it('draws nothing once closed, and stops its frames', async () => {
		const { host, frames } = rig();
		const a = host.draw(JOB);
		await sent(frames, 0, 1);
		frames[0].reply({ t: 'result', id: 1, out: '<svg/>' });
		await a;
		host.close();
		await vi.waitFor(() => expect(frames[0].removed).toBe(true), { timeout: 10_000, interval: 1 });
		await expect(host.draw(JOB)).rejects.toThrow(/closed/);
	});

	it('says a kind is unavailable when its library cannot be fetched or its frame says it failed to load', async () => {
		const down = rig({ fetchText: async () => 'alert(1)' });
		opened.push(down.host.close);
		await expect(down.host.draw(JOB)).rejects.toMatchObject({ drawUnavailable: true });
		const { host, frames } = rig({ autoReady: false });
		opened.push(host.close);
		const drawing = host.draw(JOB).catch((e) => e);
		await vi.waitFor(() => expect(frames).toHaveLength(1), { timeout: 10_000, interval: 1 });
		frames[0].reply({ t: 'failed' });
		expect(await drawing).toMatchObject({ drawUnavailable: true });
	});

	it('closes a frame whose lazy module failed to load, and sends a draw that never reached a closed frame to a fresh one', async () => {
		const { host, frames } = rig();
		opened.push(host.close);
		const first = host.draw(JOB, 5_000);
		await sent(frames, 0, 1);
		const queued = host.draw(JOB, 5_000);
		// The queued draw's chain is microtasks only (its frame is already open), so one macrotask turn drains it; it posts nothing to wait on.
		await new Promise((r) => setTimeout(r, 0)); // flaky-ok: a 0 ms turn, not a duration: it drains a microtask-only chain with no exposed signal, and the outcome holds either way
		// The first draw's frame reports a module that could not load: it is closed, and the queued draw (never sent) goes to a new frame.
		frames[0].reply({ t: 'result', id: 1, error: 'Failed to fetch dynamically imported module: x', loadFailed: true });
		const failure = await first.catch((e) => e);
		expect(failure.message).toMatch(/dynamically imported/);
		expect(failure.drawUnavailable).toBe(true);
		await sent(frames, 1, 1);
		expect(frames[0].removed).toBe(true);
		expect(frames.length).toBe(2);
		frames[1].reply({ t: 'result', id: 1, out: '<svg/>' });
		await expect(queued).resolves.toBe('<svg/>');
	});

	it('draws a kind it was never written for, from the registry it is given, and sends each font face to a frame once', async () => {
		const library = 'window.sparkLib = {};';
		const sha256 = createHash('sha256').update(library).digest('hex');
		const libraries: Record<string, DrawLibrary> = { sparkline: { file: 'sparkline.js', sha256, global: 'sparkLib', adapter: 'function draw(m, env) { return "x"; }' } };
		const { host, frames } = rig({ libraries, fetchText: async () => library });
		opened.push(host.close);
		const face = { family: 'Brand Sans', weight: '400', style: 'normal', data: 'data:font/woff2;base64,AAAA' };
		const first = host.draw({ kind: 'sparkline', fonts: [face] });
		await sent(frames, 0, 1);
		expect(frames).toHaveLength(1);
		expect(frames[0].doc).toContain('function draw(m, env)');
		// …written through the shell beside the engine, never as a srcdoc the page's policy would govern.
		expect((frames[0].frame as { src: string }).src).toBe('/assets/lattice-sandbox.html');
		expect(frames[0].posted[0].fonts).toEqual([face]);
		frames[0].reply({ t: 'result', id: 1, out: 'a' });
		await expect(first).resolves.toBe('a');
		const second = host.draw({ kind: 'sparkline', fonts: [face, { ...face, family: 'Other' }] });
		await sent(frames, 0, 2);
		expect(frames[0].posted[1].fonts).toEqual([{ ...face, family: 'Other' }]);
		frames[0].reply({ t: 'result', id: 2, out: 'b' });
		await expect(second).resolves.toBe('b');
		await expect(host.draw({ kind: 'math' })).rejects.toThrow(/no draw frame for math/);
	});
});
