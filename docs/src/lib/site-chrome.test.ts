import { afterEach, describe, expect, it, vi } from 'vitest';
import { cycleModePref, DEFAULT_PALETTE, getMode, getModePref, getPalette, resolveMode, setMode, setModePref, setPalette, syncFromStorage, systemMode, toggleMode, watchSystemMode } from './site-chrome';

afterEach(() => {
	const r = document.documentElement;
	r.removeAttribute('data-palette');
	r.removeAttribute('data-mode');
	r.removeAttribute('data-theme');
	localStorage.clear();
	vi.unstubAllGlobals();
});

/**
 * Stub `prefers-color-scheme` and hand back a `flip` that fires the change event,
 * so a test can drive an OS mode switch the way a real OS would. jsdom has no
 * matchMedia at all, which is itself a case the controller must survive.
 */
function stubSystem(dark: boolean) {
	const listeners = new Set<() => void>();
	const mq = {
		matches: dark,
		addEventListener: (_: string, fn: () => void) => void listeners.add(fn),
		removeEventListener: (_: string, fn: () => void) => void listeners.delete(fn),
	};
	vi.stubGlobal('matchMedia', () => mq);
	return {
		flip(nowDark: boolean) {
			mq.matches = nowDark;
			for (const fn of listeners) fn();
		},
		listenerCount: () => listeners.size,
	};
}

describe('site-chrome controller', () => {
	it('setPalette writes the attribute + localStorage', () => {
		setPalette('cuoio');
		expect(document.documentElement.getAttribute('data-palette')).toBe('cuoio');
		expect(localStorage.getItem('lattice-docs-palette')).toBe('cuoio');
		expect(getPalette()).toBe('cuoio');
	});

	it('setMode writes data-mode + data-theme in lockstep + both localStorage keys', () => {
		setMode('dark');
		const r = document.documentElement;
		expect(r.getAttribute('data-mode')).toBe('dark');
		expect(r.getAttribute('data-theme')).toBe('dark'); // Starlight lockstep
		expect(localStorage.getItem('lattice-docs-mode')).toBe('dark');
		expect(localStorage.getItem('starlight-theme')).toBe('dark');
	});

	it('getPalette defaults to cuoio when unset', () => {
		expect(getPalette()).toBe(DEFAULT_PALETTE);
		expect(DEFAULT_PALETTE).toBe('cuoio');
	});

	it('syncFromStorage re-applies the stored palette/mode to the attributes', () => {
		localStorage.setItem('lattice-docs-palette', 'onyx');
		localStorage.setItem('lattice-docs-mode', 'dark');
		const s = syncFromStorage();
		expect(s).toEqual({ palette: 'onyx', mode: 'dark', pref: 'dark' });
		expect(document.documentElement.getAttribute('data-palette')).toBe('onyx');
		expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
	});
});

// The third stop (#1285). `system` is a RULE for choosing a mode, never a mode —
// so it lives in storage and must never reach `data-mode`, which the generated
// palette tokens and every deck srcdoc iframe switch on.
describe('site-chrome — the system color-mode stop', () => {
	it('defaults to system when nothing is stored', () => {
		expect(getModePref()).toBe('system');
	});

	it('falls back to system for a value stored by some other build', () => {
		localStorage.setItem('lattice-docs-mode', 'sepia');
		expect(getModePref()).toBe('system');
	});

	it('resolves system from the OS, and never stamps the word "system"', () => {
		stubSystem(true);
		expect(systemMode()).toBe('dark');
		expect(resolveMode('system')).toBe('dark');
		setModePref('system');
		expect(localStorage.getItem('lattice-docs-mode')).toBe('system'); // the preference
		expect(document.documentElement.getAttribute('data-mode')).toBe('dark'); // the resolved mode
		expect(localStorage.getItem('starlight-theme')).toBe('dark'); // Starlight only knows two
	});

	it('a pinned mode ignores the OS entirely', () => {
		stubSystem(true);
		setModePref('light');
		expect(document.documentElement.getAttribute('data-mode')).toBe('light');
	});

	// The order is derived from the OS so the first click is never a visual no-op:
	// system-resolved-light → pinned light would repaint nothing, and a control that
	// looks dead on first press is worse than having no third stop.
	it('cycles system → dark → light → system when the OS says light', () => {
		stubSystem(false);
		expect(cycleModePref()).toBe('dark');
		expect(cycleModePref()).toBe('light');
		expect(cycleModePref()).toBe('system');
	});

	it('cycles system → light → dark → system when the OS says dark', () => {
		stubSystem(true);
		expect(cycleModePref()).toBe('light');
		expect(cycleModePref()).toBe('dark');
		expect(cycleModePref()).toBe('system');
	});

	it('the first click always changes the appearance, whichever way the OS leans', () => {
		for (const osDark of [false, true]) {
			localStorage.clear();
			stubSystem(osDark);
			setModePref('system');
			const before = document.documentElement.getAttribute('data-mode');
			cycleModePref();
			expect(document.documentElement.getAttribute('data-mode')).not.toBe(before);
		}
	});

	// The two-stop callers (Studio top bar, Drawing Board) keep their exact old
	// behavior: flip the resolved mode and pin it. Never lands on `system`.
	it('toggleMode flips and pins the resolved mode, never reaching system', () => {
		stubSystem(false);
		setModePref('system'); // resolves light
		expect(toggleMode()).toBe('dark');
		expect(getMode()).toBe('dark');
		expect(getModePref()).toBe('dark');
		expect(toggleMode()).toBe('light');
		expect(getModePref()).toBe('light');
	});

	it('keeps following the OS while on system — the whole point of the stop', () => {
		const os = stubSystem(false);
		setModePref('system');
		expect(document.documentElement.getAttribute('data-mode')).toBe('light');
		const seen: string[] = [];
		const stop = watchSystemMode((m) => seen.push(m));
		os.flip(true);
		expect(document.documentElement.getAttribute('data-mode')).toBe('dark');
		expect(seen).toEqual(['dark']);
		stop();
		expect(os.listenerCount()).toBe(0);
	});

	it('ignores the OS flip once a mode is pinned', () => {
		const os = stubSystem(false);
		setModePref('dark');
		const stop = watchSystemMode();
		os.flip(true);
		expect(document.documentElement.getAttribute('data-mode')).toBe('dark');
		os.flip(false);
		expect(document.documentElement.getAttribute('data-mode')).toBe('dark'); // still pinned
		stop();
	});

	it('survives an environment with no matchMedia at all', () => {
		vi.stubGlobal('matchMedia', undefined);
		expect(systemMode()).toBe('light');
		expect(() => watchSystemMode()()).not.toThrow();
	});
});
