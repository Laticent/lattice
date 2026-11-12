// writeSrcdoc (docs/src/lib/srcdoc-write.js): a srcdoc REWRITE on a page a service worker controls re-inserts the frame,
// so Firefox gives the new document the worker (a second srcdoc navigation on the same element otherwise gets none, and
// offline the preview's runtime, fonts and Mermaid fail). Everything else is a plain assignment. jsdom does not run a
// worker or load frames, so these pin the DOM mechanics; the behavior itself is pinned on real Firefox by
// docs/e2e/studio-warm-offline.spec.ts. Record: engineering/decisions/2026-11-12-gecko-srcdoc-rewrite-controller.md.

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { srcdocRewriteNeedsReinsert, writeSrcdoc } from './srcdoc-write.js';

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
});
afterEach(() => {
	box.remove();
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

	it('assigns in place on the FIRST write: every engine controls a first srcdoc document', () => {
		controlled(true);
		expect(moves(box, () => writeSrcdoc(frame, '<p>one'))).toEqual([]);
		expect(frame.getAttribute('srcdoc')).toBe('<p>one');
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
