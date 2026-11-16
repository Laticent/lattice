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
/** Every gate a test starts, stopped after it, so none answers a later test's attribute or event. */
const gates: (() => void)[] = [];
const start = (o?: { decide?: boolean }) => {
	const stop = startDeviceGate(o);
	gates.push(stop);
	return stop;
};

afterEach(async () => {
	// Let any screen module a test asked for settle before the next one starts (a signal, not a duration).
	await vi.dynamicImportSettled();
	for (const stop of gates.splice(0)) stop();
	root.removeAttribute('data-device-tier');
	root.removeAttribute('data-old-browser');
});

describe('startDeviceGate', () => {
	it('shows the decline when the tier reads unsupported, and hides it when the tier moves off', async () => {
		start();
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
		start();
		// The flip to LITE is synchronous; the banner arrives with its module.
		expect(root.getAttribute('data-device-tier')).toBe('lite');
		await vi.waitFor(() => expect(screen.showLiteBanner).toHaveBeenCalled());
		expect(screen.showDecline).not.toHaveBeenCalled();
	});

	it('leaves a missing feature to the site-wide old-browser notice: no second screen over it', async () => {
		// The <head> check marked the page and showed its notice (old-browser-check.es5.js); the tier says unsupported too.
		root.setAttribute('data-old-browser', '');
		root.setAttribute('data-device-tier', 'unsupported');
		start();
		// A decline would arrive through a dynamic import: wait until every import has settled (a signal, not a duration).
		await vi.dynamicImportSettled();
		expect(screen.showDecline).not.toHaveBeenCalled();
		expect(root.getAttribute('data-device-tier')).toBe('unsupported');
	});

	it("the notice's Continue anyway runs the app as LITE under its banner, on the notice's event", async () => {
		root.setAttribute('data-old-browser', '');
		root.setAttribute('data-device-tier', 'unsupported');
		start();
		// What the notice does on Continue anyway: set the tier's own continue key, then fire the event.
		sessionStorage.setItem('lattice-device-continue', '1');
		document.dispatchEvent(new Event('lattice-old-browser-continue'));
		expect(root.getAttribute('data-device-tier')).toBe('lite');
		await vi.waitFor(() => expect(screen.showLiteBanner).toHaveBeenCalled());
		expect(screen.showDecline).not.toHaveBeenCalled();
	});

	it('when the notice could not load ("failed"), the gate shows its own screen: never no screen at all', async () => {
		root.setAttribute('data-old-browser', 'failed');
		root.setAttribute('data-device-tier', 'unsupported');
		start();
		await vi.waitFor(() => expect(screen.showDecline).toHaveBeenCalledTimes(1));
	});

	it('a notice that arrives after the gate showed its screen (the mark leaves "failed") takes that screen down', async () => {
		root.setAttribute('data-old-browser', 'failed');
		root.setAttribute('data-device-tier', 'unsupported');
		start();
		await vi.waitFor(() => expect(screen.showDecline).toHaveBeenCalledTimes(1));
		root.setAttribute('data-old-browser', '');
		await vi.waitFor(() => expect(screen.hideDecline).toHaveBeenCalledTimes(1));
	});

	it('a page the notice marked "continued" runs as LITE even when session storage holds nothing', async () => {
		root.setAttribute('data-old-browser', 'continued');
		root.setAttribute('data-device-tier', 'unsupported');
		start();
		expect(root.getAttribute('data-device-tier')).toBe('lite');
		await vi.waitFor(() => expect(screen.showLiteBanner).toHaveBeenCalled());
	});

	it('without the old-browser mark, a hardware decline still gets its own screen', async () => {
		root.setAttribute('data-device-tier', 'unsupported');
		start();
		await vi.waitFor(() => expect(screen.showDecline).toHaveBeenCalledTimes(1));
	});

	it('with decide, applies a pin, else the saved tier, before the app runs; a value that is not a tier is ignored', () => {
		localStorage.setItem('lattice-device-tier', 'lite');
		start({ decide: true });
		expect(root.getAttribute('data-device-tier')).toBe('lite');
		root.removeAttribute('data-device-tier');
		localStorage.setItem('lattice-device-tier', 'turbo');
		start({ decide: true });
		expect(root.hasAttribute('data-device-tier')).toBe(false);
	});
});
