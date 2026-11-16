import { expect, gotoStudio, test } from './studio-fixture';

// No pinned tier (playwright.config.ts `tierPin`): the drop needs the live tier.
test.use({ storageState: { cookies: [], origins: [] } });

// A MID-SESSION DROP TO LITE, on the real Studio (lib/device-tier.ts `startDeviceTier`, `onDrop`): a visit that starts at
// Full and is then measured slow switches to Lite at once and says so in a notice. Every page load in the suite starts
// with its engine's tier pinned (playwright.config.ts `tierPin`), which takes the drop away from every spec that does not
// opt out; this one opts out, so the drop is covered here, on purpose.
//
// HARD RULE #32: the runner's machine never decides. Every signal that could start this visit at Lite reads strong:
// - the GPU: a stubbed renderer string, since CI draws in software;
// - memory and cores;
// - the CPU score: a fast cached score, so the probe does not run.
// The one slow signal is caused on purpose: 2.5 s of main-thread work inside the boot window, past the boot probe's 2 s
// (lib/boot-probe.ts `BOOT_SLOW_BLOCKING_MS`). Chromium only: the boot probe reads `longtask` entries, which WebKit and
// Firefox do not report, so an untagged title keeps this on the `desktop` project.

const tier = (page: import('@playwright/test').Page) => page.evaluate(() => document.documentElement.getAttribute('data-device-tier'));

test('a visit measured slow after it starts drops to Lite and says so', async ({ page }) => {
	test.setTimeout(120_000);
	await page.addInitScript(() => {
		const strong = 'ANGLE (NVIDIA, NVIDIA GeForce RTX 3080 Direct3D11 vs_5_0 ps_5_0, D3D11)';
		for (const C of [window.WebGLRenderingContext, window.WebGL2RenderingContext]) {
			if (!C) continue;
			const real = C.prototype.getParameter;
			C.prototype.getParameter = function (p: number) {
				// UNMASKED_RENDERER_WEBGL / UNMASKED_VENDOR_WEBGL (WEBGL_debug_renderer_info)
				if (p === 0x9246) return strong;
				if (p === 0x9245) return 'Google Inc. (NVIDIA)';
				return real.call(this, p);
			};
		}
		Object.defineProperty(navigator, 'hardwareConcurrency', { get: () => 8 });
		Object.defineProperty(navigator, 'deviceMemory', { get: () => 8 });
		try {
			// lib/device-tier.ts CPU_KEY: a fast score from earlier today, so this visit does not probe.
			localStorage.setItem('lattice-device-cpu', JSON.stringify({ score: 500, at: Date.now() }));
		} catch {}
		// The slow boot, caused on purpose and timed by the page, not the test: five 500 ms tasks once the page has loaded,
		// all inside the boot probe's 10 s window. The top page only; this script runs in every frame.
		if (window.top !== window) return;
		window.addEventListener('load', () => {
			let left = 5;
			const block = () => {
				const end = performance.now() + 500;
				while (performance.now() < end) {}
				if (--left > 0) setTimeout(block, 50);
			};
			setTimeout(block, 50);
		});
	});
	await gotoStudio(page);
	// The notice is the proof the visit started at Full: `onDrop` fires only on a change from Full to Lite.
	await expect(page.getByText(/Lattice switched to Lite mode to stay smooth\. Lattice fell behind while starting up\./)).toBeVisible({ timeout: 30_000 });
	expect(await tier(page)).toBe('lite');
	// A drop is this visit's measurement, saved for the next one, and never the person's own choice.
	expect(await page.evaluate(() => [localStorage.getItem('lattice-device-tier'), localStorage.getItem('lattice-device-tier-override')])).toEqual(['lite', null]);
});
