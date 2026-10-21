// The draw host's own rules, with a fake frame (the frame's drawing is proven in a real browser by
// test/integration/export/draw-frame.test.js): the library is held to its pin before it is run, a frame stays open
// between draws, a draw that overruns spends its frame and the next one opens a fresh one, and a closed host draws nothing.

import fs from 'node:fs';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { createDrawHost, type DrawJob } from './draw-host';

const ROOT = path.join(__dirname, '../../../..');
const PLOT_LIB = fs.readFileSync(path.join(ROOT, 'lib/plugins/function-plot/vendor/function-plot.js'), 'utf8');
const HYDRATE = 'function hydrate(el, ctx) {}';
const JOB: DrawJob = { kind: 'function-plot', configB64: 'e30=', configText: '{}', width: 600, height: 300, index: 0 };

type Fake = { frame: unknown; posted: Array<Record<string, unknown>>; removed: boolean; reply: (data: unknown) => void };

function rig(opts: { fetchText?: (url: string) => Promise<string>; autoReady?: boolean } = {}) {
	const frames: Fake[] = [];
	const doc = {
		body: {
			appendChild(el: { __fake: Fake }) {
				const f = el.__fake;
				// The frame says it is ready once its document is in.
				if (opts.autoReady !== false) queueMicrotask(() => f.reply({ t: 'ready' }));
			},
		},
		createElement() {
			const fake: Fake = { frame: null, posted: [], removed: false, reply: () => {} };
			const contentWindow = { postMessage: (m: Record<string, unknown>) => fake.posted.push(m) };
			const el = {
				__fake: fake,
				contentWindow,
				dataset: {} as Record<string, string>,
				style: {} as Record<string, string>,
				title: '',
				srcdoc: '',
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
	const host = createDrawHost({ libraryUrl: (file) => `/assets/${file}`, hydrateSource: () => HYDRATE, fetchText: opts.fetchText ?? (async () => PLOT_LIB), doc });
	return { host, frames };
}

const opened: Array<() => void> = [];
afterEach(() => {
	for (const close of opened.splice(0)) close();
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
		await new Promise((r) => setTimeout(r, 20));
		frames[0].reply({ t: 'result', id: 1, out: '<svg/>' });
		await expect(drawn).resolves.toBe('<svg/>');
		expect(calls).toBe(2);
	});

	it('keeps a frame open between draws and answers each draw to its own id', async () => {
		const { host, frames } = rig();
		opened.push(host.close);
		const a = host.draw(JOB);
		await new Promise((r) => setTimeout(r, 20));
		expect(frames).toHaveLength(1);
		expect(frames[0].posted[0]).toMatchObject({ t: 'draw', id: 1, kind: 'function-plot', width: 600 });
		frames[0].reply({ t: 'result', id: 1, out: '<svg id="a"/>' });
		await expect(a).resolves.toBe('<svg id="a"/>');
		const b = host.draw(JOB);
		await new Promise((r) => setTimeout(r, 10));
		expect(frames).toHaveLength(1);
		frames[0].reply({ t: 'result', id: 2, out: '<svg id="b"/>' });
		await expect(b).resolves.toBe('<svg id="b"/>');
	});

	it('ignores a message from anything but its frame, and a stray one from its frame', async () => {
		const { host, frames } = rig();
		opened.push(host.close);
		const a = host.draw(JOB, 300);
		await new Promise((r) => setTimeout(r, 20));
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
		await new Promise((r) => setTimeout(r, 20));
		frames[0].reply({ t: 'result', id: 1, error: 'functionplot error: bad config' });
		await expect(a).rejects.toThrow('functionplot error: bad config');
	});

	it('spends a frame whose draw overran, and opens a fresh one for the next draw', async () => {
		const { host, frames } = rig();
		opened.push(host.close);
		await expect(host.draw(JOB, 40)).rejects.toThrow(/did not finish within 40 ms/);
		expect(frames[0].removed).toBe(true);
		const next = host.draw(JOB);
		await new Promise((r) => setTimeout(r, 30));
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
		await new Promise((r) => setTimeout(r, 0));
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
		await new Promise((r) => setTimeout(r, 20));
		frames[0].reply({ t: 'result', id: 1, out: '<svg/>' });
		await expect(a).resolves.toBe('<svg/>');
	});

	it('draws nothing once closed, and stops its frames', async () => {
		const { host, frames } = rig();
		const a = host.draw(JOB);
		await new Promise((r) => setTimeout(r, 20));
		frames[0].reply({ t: 'result', id: 1, out: '<svg/>' });
		await a;
		host.close();
		await new Promise((r) => setTimeout(r, 10));
		expect(frames[0].removed).toBe(true);
		await expect(host.draw(JOB)).rejects.toThrow(/closed/);
	});

	it('says a kind is unavailable when its library cannot be fetched or its frame says it failed to load', async () => {
		const down = rig({ fetchText: async () => 'alert(1)' });
		opened.push(down.host.close);
		await expect(down.host.draw(JOB)).rejects.toMatchObject({ drawUnavailable: true });
		const { host, frames } = rig({ autoReady: false });
		opened.push(host.close);
		const drawing = host.draw(JOB).catch((e) => e);
		await new Promise((r) => setTimeout(r, 10));
		frames[0].reply({ t: 'failed' });
		expect(await drawing).toMatchObject({ drawUnavailable: true });
	});

	it('closes a frame whose lazy module failed to load, and sends a draw that never reached a closed frame to a fresh one', async () => {
		const { host, frames } = rig();
		opened.push(host.close);
		const first = host.draw(JOB, 5_000);
		await new Promise((r) => setTimeout(r, 10));
		const queued = host.draw(JOB, 5_000);
		await new Promise((r) => setTimeout(r, 10));
		// The first draw's frame reports a module that could not load: it is closed, and the queued draw (never sent) goes to a new frame.
		frames[0].reply({ t: 'result', id: 1, error: 'Failed to fetch dynamically imported module: x', loadFailed: true });
		await expect(first).rejects.toThrow(/dynamically imported/);
		await new Promise((r) => setTimeout(r, 20));
		expect(frames[0].removed).toBe(true);
		expect(frames.length).toBe(2);
		frames[1].reply({ t: 'result', id: 1, out: '<svg/>' });
		await expect(queued).resolves.toBe('<svg/>');
	});
});
