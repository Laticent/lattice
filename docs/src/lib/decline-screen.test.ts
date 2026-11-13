import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Profile } from './device-profile';

// The decline screen's words and behavior (device-capability-tiers §6, §7.2). The tier runtime is stubbed, so the runner's
// own machine never decides what shows (HARD RULE #32).

const state = {
	tier: 'unsupported' as const,
	pinned: null,
	signals: {} as never,
	profile: { tier: 'unsupported', detected: 'unsupported', reasons: [{ code: 'feature:cssHas', kind: 'feature', text: "This browser doesn't support CSS :has()." }] } as Profile,
};
const continueAnyway = vi.fn();
vi.mock('./device-tier', () => ({ ensureDeviceTier: () => ({ state }), continueAnyway: (...a: unknown[]) => continueAnyway(...a) }));

const { declineWords, hideDecline, hideLiteBanner, showDecline, showLiteBanner } = await import('./decline-screen');

const reason = (code: string, kind: 'feature' | 'floor' | 'weak', text: string) => ({ code, kind, text });

describe('declineWords', () => {
	it('names one missing feature, or several, and points at a current browser', () => {
		const one = declineWords({ pinned: null, profile: { tier: 'unsupported', detected: 'unsupported', reasons: [reason('feature:cssHas', 'feature', "This browser doesn't support CSS :has().")] } });
		expect(one).toEqual({ lead: "It needs CSS :has(), which this browser doesn't support.", advice: 'Use a current Chrome, Edge, Safari or Firefox.' });
		const two = declineWords({
			pinned: null,
			profile: {
				tier: 'unsupported',
				detected: 'unsupported',
				reasons: [reason('feature:worker', 'feature', "This browser doesn't support Web Workers."), reason('feature:indexedDB', 'feature', "This browser doesn't support IndexedDB storage."), reason('weak:gpu', 'weak', 'x')],
			},
		});
		expect(two.lead).toBe("It needs Web Workers and IndexedDB storage, which this browser doesn't support.");
	});

	it('names the hardware floors when the hardware declines', () => {
		const w = declineWords({ pinned: null, profile: { tier: 'unsupported', detected: 'unsupported', reasons: [reason('floor:memory', 'floor', 'This device reports 1 GB of memory.'), reason('floor:cores', 'floor', 'This device reports 2 CPU cores.')] } });
		expect(w.lead).toBe('This device is below what Lattice needs: This device reports 1 GB of memory; This device reports 2 CPU cores.');
		expect(w.advice).toMatch(/continue here in Lite mode/);
	});

	it('says a pinned decline is on purpose', () => {
		expect(declineWords({ pinned: 'unsupported', profile: { tier: 'full', detected: 'full', reasons: [] } }).lead).toMatch(/\?tier=unsupported/);
	});
});

describe('showDecline', () => {
	beforeEach(() => {
		document.body.innerHTML = '<main id="app"><button>App</button></main>';
	});
	afterEach(() => {
		hideDecline();
		document.getElementById('lattice-device-banner')?.remove();
		continueAnyway.mockReset();
	});

	it('covers the app as a modal dialog that names the failed check, and makes the app inert', () => {
		showDecline();
		const screen = document.querySelector('[data-testid="device-decline"]') as HTMLElement;
		expect(screen.getAttribute('role')).toBe('alertdialog');
		expect(screen.textContent).toContain("Lattice can't run well in this browser.");
		expect(screen.textContent).toContain("It needs CSS :has(), which this browser doesn't support.");
		expect(document.getElementById('app')?.hasAttribute('inert')).toBe(true);
		expect(document.activeElement?.id).toBe('lattice-device-decline-title');
		showDecline();
		expect(document.querySelectorAll('[data-testid="device-decline"]')).toHaveLength(1);
	});

	it('gives back only the inert it set, makes late arrivals inert, and returns focus (review findings)', async () => {
		document.body.insertAdjacentHTML('beforeend', '<div id="already" inert></div>');
		const app = document.querySelector('#app button') as HTMLButtonElement;
		app.focus();
		showDecline();
		const late = document.createElement('div');
		late.id = 'toast';
		document.body.append(late);
		await vi.waitFor(() => expect(late.hasAttribute('inert')).toBe(true));
		hideDecline();
		expect(document.getElementById('already')?.hasAttribute('inert')).toBe(true);
		expect(document.getElementById('app')?.hasAttribute('inert')).toBe(false);
		expect(late.hasAttribute('inert')).toBe(false);
		expect(document.activeElement).toBe(app);
	});

	it('the banner comes and goes on request', () => {
		showLiteBanner();
		expect(document.querySelectorAll('[data-testid="device-banner"]')).toHaveLength(1);
		hideLiteBanner();
		expect(document.querySelector('[data-testid="device-banner"]')).toBeNull();
	});

	it('continue anyway records the choice, removes the screen, frees the app and puts up the banner', () => {
		showDecline();
		(Array.from(document.querySelectorAll('button')).find((b) => b.textContent === 'Continue anyway') as HTMLButtonElement).click();
		expect(continueAnyway).toHaveBeenCalledTimes(1);
		expect(document.querySelector('[data-testid="device-decline"]')).toBeNull();
		expect(document.getElementById('app')?.hasAttribute('inert')).toBe(false);
		expect(document.querySelector('[data-testid="device-banner"] .lx-banner-long')?.textContent).toMatch(/^Lite mode:/);
	});
});
