import { afterEach, describe, expect, it, vi } from 'vitest';
import { installState, isStandalone, promptInstall } from './install-app';

type ParkedWindow = Window & { __latticeInstallPrompt?: unknown };

afterEach(() => {
	(window as ParkedWindow).__latticeInstallPrompt = null;
	vi.restoreAllMocks();
});

function mockStandalone(matches: boolean) {
	vi.spyOn(window, 'matchMedia').mockReturnValue({ matches } as MediaQueryList);
}

describe('install-app — state ladder', () => {
	it('standalone wins over everything', () => {
		mockStandalone(true);
		(window as ParkedWindow).__latticeInstallPrompt = { prompt: vi.fn() };
		expect(installState()).toBe('installed');
	});

	it('a parked Chromium prompt makes it promptable', () => {
		mockStandalone(false);
		(window as ParkedWindow).__latticeInstallPrompt = { prompt: vi.fn() };
		expect(installState()).toBe('promptable');
	});

	it('no prompt and no iOS → unsupported (jsdom UA)', () => {
		mockStandalone(false);
		expect(installState()).toBe('unsupported');
	});

	it('isStandalone is false in a plain tab', () => {
		mockStandalone(false);
		expect(isStandalone()).toBe(false);
	});
});

describe('install-app — promptInstall', () => {
	it('drives the parked prompt and reports the user choice', async () => {
		const prompt = vi.fn(async () => {});
		(window as ParkedWindow).__latticeInstallPrompt = { prompt, userChoice: Promise.resolve({ outcome: 'accepted' }) };
		expect(await promptInstall()).toBe('accepted');
		expect(prompt).toHaveBeenCalledOnce();
		// consumed — a second call reports unavailable rather than throwing
		expect(await promptInstall()).toBe('unavailable');
	});

	it('reports unavailable with nothing parked', async () => {
		expect(await promptInstall()).toBe('unavailable');
	});
});
