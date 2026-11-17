import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// The chat's draft renders hold the Studio's warm-ups while they run (first-slide.ts `holdWarmUps`), and always let
// go: on a result, on a throw, and at the budget even when the render never settles. Under 4 workers on a Full
// webkit-phone, a warm-up landing beside `render_slide` pushed it past DRAFT_FIT_TIMEOUT_MS. Counted as held or not,
// with fake timers: no wall clock.

const render = vi.hoisted(() => ({ build: vi.fn(), raster: vi.fn(), fit: vi.fn() }));
vi.mock('./share-export', () => ({ buildDeckRender: render.build }));
vi.mock('./export/deck-export.js', () => ({ rasterizeSlidePreview: render.raster, measureDeckFit: render.fit }));

function deferred<T>() {
	let resolve!: (v: T) => void;
	let reject!: (e: unknown) => void;
	const promise = new Promise<T>((res, rej) => {
		resolve = res;
		reject = rej;
	});
	return { promise, resolve, reject };
}

async function load() {
	vi.resetModules();
	const fit = await import('./draft-fit');
	const gate = await import('./first-slide');
	let open = false;
	const isOpen = async () => {
		open = false;
		void gate.whenNotHeld().then(() => {
			open = true;
		});
		await vi.advanceTimersByTimeAsync(0);
		return open;
	};
	return { fit, isOpen };
}

const OPTS = {} as never;

describe('draft-fit holds the warm-ups', () => {
	beforeEach(() => {
		vi.useFakeTimers();
		render.build.mockReset().mockResolvedValue({});
	});
	afterEach(() => vi.useRealTimers());

	it('render_slide holds them until its picture is back', async () => {
		const { fit, isOpen } = await load();
		const shot = deferred<{ url: string; sections: number }>();
		render.raster.mockReturnValue(shot.promise);
		const out = fit.renderDraftSlide(OPTS, '# a', 'indaco', 'light', 1);
		expect(await isOpen()).toBe(false);
		shot.resolve({ url: 'data:image/jpeg;base64,x', sections: 1 });
		expect(await out).toEqual({ url: 'data:image/jpeg;base64,x', sections: 1 });
		expect(await isOpen()).toBe(true);
	});

	it('render_slide lets go when the render throws', async () => {
		const { fit, isOpen } = await load();
		render.raster.mockRejectedValue(new Error('capture failed'));
		expect(await fit.renderDraftSlide(OPTS, '# a', 'indaco', 'light', 1)).toBeNull();
		expect(await isOpen()).toBe(true);
	});

	it('render_slide lets go at the budget even when the render never settles', async () => {
		const { fit, isOpen } = await load();
		render.raster.mockReturnValue(new Promise(() => {}));
		const out = fit.renderDraftSlide(OPTS, '# a', 'indaco', 'light', 1);
		await vi.advanceTimersByTimeAsync(fit.DRAFT_FIT_TIMEOUT_MS - 1);
		expect(await isOpen()).toBe(false);
		await vi.advanceTimersByTimeAsync(1);
		expect(await out).toBeNull();
		expect(await isOpen()).toBe(true);
	});

	it('the fit check holds them too, and lets go with its verdict', async () => {
		const { fit, isOpen } = await load();
		const verdict = deferred<unknown[]>();
		render.fit.mockReturnValue(verdict.promise);
		const out = fit.measureDraftFit(OPTS, '# a', 'indaco', 'light');
		expect(await isOpen()).toBe(false);
		verdict.resolve([{ slide: 1, overflows: false, clipped: false, illegible: false }]);
		expect(await out).toHaveLength(1);
		expect(await isOpen()).toBe(true);
	});
});
