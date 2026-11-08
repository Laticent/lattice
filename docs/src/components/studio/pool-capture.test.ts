// captureSlot's last check before it clones a slide: the scroller is still quiet once the capture code has loaded.
// studio-map-posters.spec.ts saw a capture start within 250 ms of a scroll (#3045): the pool checked for a quiet
// scroller, then the capture awaited its imports, and a scroll landed in between.
import { afterEach, describe, expect, it, vi } from 'vitest';

const toCanvas = vi.fn(async () => {
	throw new Error('stop after the clone starts: this test is about whether it starts');
});
vi.mock('html-to-image', () => ({ toCanvas }));

import { captureSlot, SCROLLED } from './pool-capture';

function slot() {
	const s = document.createElement('div');
	const f = document.createElement('iframe');
	s.appendChild(f);
	document.body.appendChild(s);
	f.contentDocument?.body.insertAdjacentHTML('beforeend', '<div class="lattice"><section></section></div>');
	const section = f.contentDocument?.querySelector('section') as HTMLElement;
	// jsdom lays nothing out: give the slide and its slot the sizes a real one has.
	Object.defineProperty(section, 'offsetWidth', { value: 1280 });
	Object.defineProperty(section, 'offsetHeight', { value: 720 });
	s.getBoundingClientRect = () => ({ width: 160, height: 90, top: 0, left: 0, right: 160, bottom: 90, x: 0, y: 0, toJSON: () => ({}) });
	return s;
}

afterEach(() => {
	toCanvas.mockClear();
	document.body.replaceChildren();
});

describe('captureSlot asks once more whether the reader is scrolling, after its code has loaded', () => {
	it('clones nothing and answers SCROLLED when a scroll landed while it loaded', async () => {
		let asked = 0;
		const got = await captureSlot(slot(), () => true, () => {
			asked++;
			return false;
		});
		expect(got).toBe(SCROLLED);
		expect(asked).toBe(1);
		expect(toCanvas).not.toHaveBeenCalled();
	});
	it('starts the clone when the scroller is still quiet', async () => {
		const got = await captureSlot(slot(), () => true, () => true);
		expect(toCanvas).toHaveBeenCalledTimes(1);
		expect(got).toBe(null); // the mocked clone throws, which a capture answers with null
	});
});
