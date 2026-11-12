// writeSrcdoc (docs/src/lib/srcdoc-write.js): a srcdoc write into a frame already in a page a service worker controls
// re-inserts the frame, so Firefox gives the new document the worker (a srcdoc set on a live frame otherwise gets none, and
// offline the preview's runtime, fonts and Mermaid fail), unless the one-off probe has shown this engine keeps the
// controller. Everything else is a plain assignment. jsdom does not run a
// worker or load frames, so these pin the DOM mechanics; the behavior itself is pinned on real Firefox by
// docs/e2e/studio-warm-offline.spec.ts. Record: engineering/decisions/2026-11-12-gecko-srcdoc-rewrite-controller.md.

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { _setSrcdocRewriteVerdict, probeSrcdocRewrite, srcdocRewriteNeedsReinsert, writeSrcdoc } from './srcdoc-write.js';

const realSW = Object.getOwnPropertyDescriptor(navigator, 'serviceWorker');
function controlled(on: boolean) {
	Object.defineProperty(navigator, 'serviceWorker', { configurable: true, value: on ? { controller: {} } : { controller: null } });
}

/** Every childList change under `root` while `fn` runs: one entry per removal or insertion of an iframe. */
function moves(root: Node, fn: () => void): string[] {
	const seen: string[] = [];
	const mo = new MutationObserver(() => {});
	mo.observe(root, { childList: true, subtree: true });
	fn();
	for (const r of mo.takeRecords()) {
		for (const n of r.removedNodes) if (n.nodeName === 'IFRAME') seen.push('removed');
		for (const n of r.addedNodes) if (n.nodeName === 'IFRAME') seen.push('added');
	}
	mo.disconnect();
	return seen;
}

let box: HTMLDivElement;
let before: HTMLSpanElement;
let after: HTMLSpanElement;
let frame: HTMLIFrameElement;
beforeEach(() => {
	box = document.createElement('div');
	before = document.createElement('span');
	after = document.createElement('span');
	frame = document.createElement('iframe');
	frame.className = 'live';
	frame.id = 'f';
	box.append(before, frame, after);
	document.body.append(box);
	_setSrcdocRewriteVerdict(true);
});
afterEach(() => {
	box.remove();
	_setSrcdocRewriteVerdict(null);
	for (const f of document.querySelectorAll('body > iframe')) f.remove();
	if (realSW) Object.defineProperty(navigator, 'serviceWorker', realSW);
	else delete (navigator as { serviceWorker?: unknown }).serviceWorker;
});

describe('writeSrcdoc', () => {
	it('re-inserts the same element at the same place on a rewrite under a worker', () => {
		controlled(true);
		frame.srcdoc = '<p>one';
		const onload = () => {};
		frame.onload = onload;
		const seen = moves(box, () => writeSrcdoc(frame, '<p>two'));
		expect(seen).toEqual(['removed', 'added']);
		expect(frame.getAttribute('srcdoc')).toBe('<p>two');
		expect([...box.children]).toEqual([before, frame, after]);
		expect(frame.onload).toBe(onload);
		expect(frame.className).toBe('live');
	});

	it('puts a last child back last', () => {
		controlled(true);
		after.remove();
		frame.srcdoc = '<p>one';
		writeSrcdoc(frame, '<p>two');
		expect(box.lastElementChild).toBe(frame);
	});

	it('gives focus back to a frame that had it', () => {
		controlled(true);
		frame.srcdoc = '<p>one';
		frame.focus();
		expect(document.activeElement).toBe(frame);
		writeSrcdoc(frame, '<p>two');
		expect(document.activeElement).toBe(frame);
	});

	it('does not take focus a frame did not have', () => {
		controlled(true);
		const input = document.createElement('input');
		document.body.append(input);
		input.focus();
		frame.srcdoc = '<p>one';
		writeSrcdoc(frame, '<p>two');
		expect(document.activeElement).toBe(input);
		input.remove();
	});

	it('re-inserts on the FIRST write into a frame already in the page: Firefox controls only a frame written before insertion', () => {
		controlled(true);
		expect(moves(box, () => writeSrcdoc(frame, '<p>one'))).toEqual(['removed', 'added']);
		expect(frame.getAttribute('srcdoc')).toBe('<p>one');
	});

	it('writes a frame not yet in the page, THEN appends it to the parent given: the shape Firefox controls, with no probe', () => {
		controlled(true);
		_setSrcdocRewriteVerdict(null);
		const fresh = document.createElement('iframe');
		const order: string[] = [];
		const mo = new MutationObserver((rs) => {
			for (const r of rs) for (const n of r.addedNodes) if (n === fresh) order.push('added:' + fresh.getAttribute('srcdoc'));
		});
		mo.observe(box, { childList: true });
		writeSrcdoc(fresh, '<p>first', box);
		for (const r of mo.takeRecords()) for (const n of r.addedNodes) if (n === fresh) order.push('added:' + fresh.getAttribute('srcdoc'));
		mo.disconnect();
		expect(order).toEqual(['added:<p>first']);
		expect(box.lastElementChild).toBe(fresh);
		expect([...document.body.children].some((n) => n.tagName === 'IFRAME' && n.getAttribute('aria-hidden') === 'true')).toBe(false);
	});

	it('assigns in place when no worker controls the page: there is nothing to lose', () => {
		controlled(false);
		frame.srcdoc = '<p>one';
		expect(moves(box, () => writeSrcdoc(frame, '<p>two'))).toEqual([]);
		expect(frame.getAttribute('srcdoc')).toBe('<p>two');
	});

	it('assigns in place on a detached frame, and does not attach it', () => {
		controlled(true);
		frame.srcdoc = '<p>one';
		frame.remove();
		writeSrcdoc(frame, '<p>two');
		expect(frame.isConnected).toBe(false);
		expect(frame.getAttribute('srcdoc')).toBe('<p>two');
	});

	it('assigns in place when the browser has no service worker API', () => {
		Object.defineProperty(navigator, 'serviceWorker', { configurable: true, value: undefined });
		frame.srcdoc = '<p>one';
		expect(srcdocRewriteNeedsReinsert(frame)).toBe(false);
		expect(moves(box, () => writeSrcdoc(frame, '<p>two'))).toEqual([]);
	});
});

describe('the probe decides', () => {
	it('an engine that keeps the controller writes in place', () => {
		controlled(true);
		_setSrcdocRewriteVerdict(false);
		frame.srcdoc = '<p>one';
		expect(moves(box, () => writeSrcdoc(frame, '<p>two'))).toEqual([]);
		expect(frame.getAttribute('srcdoc')).toBe('<p>two');
	});

	it('before the probe answers, a rewrite re-inserts and starts the probe once', () => {
		controlled(true);
		_setSrcdocRewriteVerdict(null);
		frame.srcdoc = '<p>one';
		expect(moves(box, () => writeSrcdoc(frame, '<p>two'))).toEqual(['removed', 'added']);
		const probes = () => [...document.body.children].filter((n) => n.tagName === 'IFRAME' && n.getAttribute('aria-hidden') === 'true');
		expect(probes()).toHaveLength(1);
		expect(probes()[0].getAttribute('srcdoc')).toBe('<p></p>');
		writeSrcdoc(frame, '<p>three');
		expect(probes()).toHaveLength(1);
	});

	it('the probe reads a rewrite that lost the controller as "drops", and one that kept it as "keeps"', async () => {
		for (const [second, expected] of [[null, ['removed', 'added']], [{}, []]] as const) {
			controlled(true);
			_setSrcdocRewriteVerdict(null);
			const done = probeSrcdocRewrite(document);
			const probe = [...document.body.children].find((n) => n.tagName === 'IFRAME' && n.getAttribute('aria-hidden') === 'true') as HTMLIFrameElement;
			const win = probe.contentWindow as Window;
			Object.defineProperty(win.navigator, 'serviceWorker', { configurable: true, value: { controller: {} } });
			probe.onload?.(new Event('load'));
			expect(probe.getAttribute('srcdoc')).toBe('<p></p><p></p>');
			Object.defineProperty(win.navigator, 'serviceWorker', { configurable: true, value: { controller: second } });
			probe.onload?.(new Event('load'));
			await done;
			expect(probe.isConnected).toBe(false);
			frame.srcdoc = '<p>one';
			expect(moves(box, () => writeSrcdoc(frame, '<p>two'))).toEqual(expected);
		}
	});

	it('an engine whose first srcdoc document has no controller is told to stop re-inserting', async () => {
		controlled(true);
		_setSrcdocRewriteVerdict(null);
		const done = probeSrcdocRewrite(document);
		const probe = [...document.body.children].find((n) => n.tagName === 'IFRAME' && n.getAttribute('aria-hidden') === 'true') as HTMLIFrameElement;
		Object.defineProperty((probe.contentWindow as Window).navigator, 'serviceWorker', { configurable: true, value: { controller: null } });
		probe.onload?.(new Event('load'));
		await done;
		frame.srcdoc = '<p>one';
		expect(moves(box, () => writeSrcdoc(frame, '<p>two'))).toEqual([]);
	});
});
