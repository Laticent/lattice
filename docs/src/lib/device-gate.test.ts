import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// The eager gate (device-capability-tiers §6): it reads the attribute and loads the decline screen on demand. The screen
// module is stubbed; the tier is set by hand, so the runner's machine never decides (HARD RULE #32).

const screen = { showDecline: vi.fn(), hideDecline: vi.fn(), showLiteBanner: vi.fn(), hideLiteBanner: vi.fn() };
vi.mock('./decline-screen', () => screen);
const ensure = vi.fn();
vi.mock('./device-tier', () => ({ ensureDeviceTier: ensure }));

const { startDeviceGate } = await import('./device-gate');
const root = document.documentElement;

beforeEach(() => {
	root.removeAttribute('data-device-tier');
	sessionStorage.clear();
	localStorage.clear();
	for (const f of Object.values(screen)) f.mockReset();
});
afterEach(() => root.removeAttribute('data-device-tier'));

describe('startDeviceGate', () => {
	it('shows the decline when the tier reads unsupported, and hides it when the tier moves off', async () => {
		startDeviceGate();
		expect(screen.showDecline).not.toHaveBeenCalled();
		// The observer reports on a microtask and the screen module loads on demand: wait for the calls, not a duration.
		root.setAttribute('data-device-tier', 'unsupported');
		await vi.waitFor(() => expect(screen.showDecline).toHaveBeenCalledTimes(1));
		root.setAttribute('data-device-tier', 'lite');
		await vi.waitFor(() => expect(screen.hideDecline).toHaveBeenCalledTimes(1));
	});

	it('a session that continued past the decline turns it to LITE at once and keeps the banner, with no screen', async () => {
		sessionStorage.setItem('lattice-device-continue', '1');
		root.setAttribute('data-device-tier', 'unsupported');
		startDeviceGate();
		// The flip to LITE is synchronous; the banner arrives with its module.
		expect(root.getAttribute('data-device-tier')).toBe('lite');
		await vi.waitFor(() => expect(screen.showLiteBanner).toHaveBeenCalled());
		expect(screen.showDecline).not.toHaveBeenCalled();
	});

	it('with decide, applies a pin, else the saved tier, before the app runs; a value that is not a tier is ignored', () => {
		localStorage.setItem('lattice-device-tier', 'lite');
		startDeviceGate({ decide: true });
		expect(root.getAttribute('data-device-tier')).toBe('lite');
		root.removeAttribute('data-device-tier');
		localStorage.setItem('lattice-device-tier', 'turbo');
		startDeviceGate({ decide: true });
		expect(root.hasAttribute('data-device-tier')).toBe(false);
	});
});
