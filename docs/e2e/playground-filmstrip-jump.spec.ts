import { expect, test } from '@playwright/test';

/**
 * A jump in the virtual filmstrip must leave real slides in view, never a placeholder.
 *
 * The filmstrip mounts only the slides near the view and returns the rest to empty placeholders
 * (playground/deck-render.js). A scroll that jumps far (a scrollbar drag, a link, a map pick) has to
 * mount what it lands on, and a placeholder left in view is that design's one visible failure.
 *
 * THE ORACLE IS "EVERY SLIDE TOUCHING THE VIEWPORT IS A SECTION", not "the element at the middle".
 * An earlier probe read the element under the frame's vertical middle on real WebKit at the tablet
 * box and called a jump to 25% of the 15-slide deck a placeholder: the point fell in the 29px gap
 * between two slides, where `elementFromPoint` answers with the `.lattice` container. Both slides in
 * view were real sections (followups.d/2782-p3-playground-tablet-placeholder-in-view, now closed).
 * Reading each slide's rectangle against the viewport asks the question the defect would be.
 */

const FRACTIONS = [0.1, 0.25, 0.5, 0.75, 0.9];

test('@crosswidth @webkit-tablet after a jump no slide in view is a placeholder', async ({ page }) => {
	await page.goto('/playground/?c=kpi&view=read', { waitUntil: 'domcontentloaded' });
	await expect(page.locator('#pg-walk .pg-walk-pos')).toContainText('/');
	await expect(page.locator('.pg-preview-wrap')).toHaveClass(/is-live/);
	for (const f of FRACTIONS) {
		await page.evaluate(() => (document.getElementById('preview') as HTMLIFrameElement).contentWindow?.scrollTo(0, 0));
		await page.evaluate((frac) => {
			const w = (document.getElementById('preview') as HTMLIFrameElement).contentWindow as Window;
			w.scrollTo(0, frac * (w.document.documentElement.scrollHeight - w.innerHeight));
		}, f);
		// The window moves on a frame and settles after the scroll: poll for the state, not a delay.
		await expect
			.poll(
				() =>
					page.evaluate(() => {
						const w = (document.getElementById('preview') as HTMLIFrameElement).contentWindow as Window;
						const slides = Array.from(w.document.querySelectorAll('.lattice > section, .lattice > div[data-lv-ph]'));
						const inView = slides.filter((s) => {
							const r = s.getBoundingClientRect();
							return r.bottom > 0 && r.top < w.innerHeight;
						});
						return { inView: inView.length, placeholders: inView.filter((s) => s.hasAttribute('data-lv-ph')).length };
					}),
				{ message: `a placeholder stayed in view after a jump to ${f * 100}%`, timeout: 5_000 },
			)
			.toMatchObject({ placeholders: 0 });
		const seen = await page.evaluate(() => {
			const w = (document.getElementById('preview') as HTMLIFrameElement).contentWindow as Window;
			return Array.from(w.document.querySelectorAll('.lattice > section, .lattice > div[data-lv-ph]')).filter((s) => {
				const r = s.getBoundingClientRect();
				return r.bottom > 0 && r.top < w.innerHeight;
			}).length;
		});
		expect(seen, 'the oracle saw slides in view').toBeGreaterThan(0);
	}
});

test('@crosswidth the oracle can see a placeholder in view (the failing arm)', async ({ page }) => {
	await page.goto('/playground/?c=kpi&view=read', { waitUntil: 'domcontentloaded' });
	await expect(page.locator('.pg-preview-wrap')).toHaveClass(/is-live/);
	const placeholders = await page.evaluate(() => {
		const w = (document.getElementById('preview') as HTMLIFrameElement).contentWindow as Window;
		const first = w.document.querySelector('.lattice > section') as HTMLElement;
		const ph = w.document.createElement('div');
		ph.setAttribute('data-lv-ph', '');
		ph.style.cssText = `display:block;height:${first.getBoundingClientRect().height}px`;
		first.replaceWith(ph);
		const slides = Array.from(w.document.querySelectorAll('.lattice > section, .lattice > div[data-lv-ph]'));
		return slides.filter((s) => {
			const r = s.getBoundingClientRect();
			return r.bottom > 0 && r.top < w.innerHeight && s.hasAttribute('data-lv-ph');
		}).length;
	});
	expect(placeholders).toBeGreaterThan(0);
});
