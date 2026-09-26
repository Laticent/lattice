// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { __resetScaleCapForTest, applyScaleCap, deckAsksForScale, knownScaleCap, readScaleCap, SCALE_CAP_ATTR, trackScaleCap } from './scale-cap';

// The host half of the one-size rule for one-slide frames (scale-cap.ts): which decks are
// measured, how the shared rung is read off a measured deck, and that a frame is capped,
// re-swept, and left alone while a measurement is still pending.

function hostWithFrame(): { host: HTMLElement; frame: HTMLIFrameElement; sweeps: () => number } {
	const host = document.createElement('div');
	const frame = document.createElement('iframe');
	frame.className = 'live';
	host.append(frame);
	document.body.append(host);
	let n = 0;
	(frame.contentWindow as unknown as { latticeSweep: { sweep: () => void } }).latticeSweep = { sweep: () => { n++; } };
	return { host, frame, sweeps: () => n };
}

afterEach(() => {
	__resetScaleCapForTest();
	document.body.innerHTML = '';
	vi.useRealTimers();
});

describe('deckAsksForScale', () => {
	it('is true for a venue above laptop, a scale class, or a venue class', () => {
		expect(deckAsksForScale('---\nvenue: conference\n---\n# x')).toBe(true);
		expect(deckAsksForScale('---\nclass: scale-xl\n---\n# x')).toBe(true);
		expect(deckAsksForScale('<!-- _class: list venue-hall -->')).toBe(true);
	});
	it('is false for the designed size', () => {
		expect(deckAsksForScale('---\nvenue: laptop\n---\n# x')).toBe(false);
		expect(deckAsksForScale('---\ntheme: indaco\n---\n# scale is a word')).toBe(false);
	});
});

describe('readScaleCap', () => {
	it('reads the rung per ask off the stepped sections, and nothing when none stepped', () => {
		document.body.innerHTML =
			'<section data-lattice-slide="1" data-lattice-scale-step="1.3>1.15"></section>' +
			'<section data-lattice-slide="2" data-lattice-scale-step="1.3>1.15"></section>' +
			'<section data-lattice-slide="3"></section>';
		expect(readScaleCap(document)).toBe('1.3>1.15');
		document.body.innerHTML = '<section data-lattice-slide="1"></section>';
		expect(readScaleCap(document)).toBe('');
	});
});

describe('trackScaleCap + applyScaleCap', () => {
	it('caps the frame once measured, re-sweeps, and leaves it alone while pending', async () => {
		vi.useFakeTimers();
		const { host, frame, sweeps } = hostWithFrame();
		const root = frame.contentDocument!.documentElement;
		trackScaleCap(host, 'deck-a', async () => '1.3>1');
		expect(root.hasAttribute(SCALE_CAP_ATTR)).toBe(false); // pending: nothing written
		await vi.runAllTimersAsync();
		expect(root.getAttribute(SCALE_CAP_ATTR)).toBe('1.3>1');
		expect(sweeps()).toBe(1);
		applyScaleCap(host); // unchanged → no second sweep
		expect(sweeps()).toBe(1);
	});

	it('a deck that asks for no scale drops a stale cap', async () => {
		vi.useFakeTimers();
		const { host, frame } = hostWithFrame();
		trackScaleCap(host, 'deck-a', async () => '1.3>1');
		await vi.runAllTimersAsync();
		trackScaleCap(host, undefined, async () => null);
		expect(frame.contentDocument!.documentElement.hasAttribute(SCALE_CAP_ATTR)).toBe(false);
	});

	it('a failed measurement caps nothing', async () => {
		vi.useFakeTimers();
		const { host, frame } = hostWithFrame();
		trackScaleCap(host, 'deck-b', async () => null);
		await vi.runAllTimersAsync();
		expect(frame.contentDocument!.documentElement.hasAttribute(SCALE_CAP_ATTR)).toBe(false);
	});

	it('two decks debounce separately: one never cancels the other\'s measurement', async () => {
		vi.useFakeTimers();
		const a = hostWithFrame();
		const b = hostWithFrame();
		trackScaleCap(a.host, 'deck-a', async () => '1.3>1');
		trackScaleCap(b.host, 'deck-b', async () => '1.5>1.15');
		await vi.runAllTimersAsync();
		expect(a.frame.contentDocument?.documentElement.getAttribute(SCALE_CAP_ATTR)).toBe('1.3>1');
		expect(b.frame.contentDocument?.documentElement.getAttribute(SCALE_CAP_ATTR)).toBe('1.5>1.15');
		expect(knownScaleCap('deck-a')).toBe('1.3>1');
		expect(knownScaleCap(undefined)).toBeUndefined();
	});
});
