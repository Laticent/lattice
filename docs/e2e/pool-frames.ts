import type { Page } from '@playwright/test';

/**
 * The preview frames serving the surface at `scope` — wherever they live.
 *
 * A pooled grid either keeps its frames in its own layer (inside the surface) or borrows them
 * from the Studio's frame dock (`#lattice-frame-dock`, at the end of `<body>`, placed over each
 * tile by CSS anchor positioning — docs/src/components/studio/frame-dock.tsx). A descendant
 * selector finds only the first kind, which is how every pool oracle here went blind when the
 * dock landed. This returns ONE selector that matches both: the surface's own frames, and the
 * dock frames currently SHOWN for a pool inside it.
 *
 * Resolved at call time, because pool ids are assigned at mount.
 */
export async function poolFrameSelector(page: Page, scope: string): Promise<string> {
	const ids = await page.evaluate((scope) => {
		const root = document.querySelector(scope);
		return root ? [...root.querySelectorAll('[data-preview-pool]')].map((e) => e.getAttribute('data-preview-pool')) : [];
	}, scope);
	const docked = ids.map((id) => `#lattice-frame-dock [data-dock-owner="${id}"][data-dock-shown] iframe.live`);
	return [`${scope} iframe.live`, ...docked].join(', ');
}

/**
 * The dock slots currently SHOWN for the pools inside `scope`. Capture these while a surface is
 * open: once it closes, its pool ids are gone with it, so `poolFrameSelector` can only see the
 * surface's own layer and a "nothing left on screen" check through it passes whatever the dock
 * does. `shownDockFrames` then asks about these exact slots.
 */
export async function servingDockSlots(page: Page, scope: string): Promise<string[]> {
	return page.evaluate((scope) => {
		const root = document.querySelector(scope);
		const ids = root ? [...root.querySelectorAll('[data-preview-pool]')].map((e) => e.getAttribute('data-preview-pool')) : [];
		return [...document.querySelectorAll('#lattice-frame-dock [data-dock-slot][data-dock-shown]')]
			.filter((s) => ids.includes(s.getAttribute('data-dock-owner')))
			.map((s) => `[data-dock-slot="${s.getAttribute('data-dock-slot')}"][data-dock-owner="${s.getAttribute('data-dock-owner')}"]`);
	}, scope);
}

/** How many live frames in the given dock slots are still shown FOR THE SAME POOL — a slot the
 *  closed surface gave back may already be serving another one, which is correct. */
export async function shownDockFrames(page: Page, slots: string[]): Promise<number> {
	return page.evaluate(
		(slots) => slots.reduce((n, id) => n + document.querySelectorAll(`#lattice-frame-dock ${id}[data-dock-shown] iframe.live`).length, 0),
		slots,
	);
}

/**
 * Count every preview DOCUMENT the page creates: each `<iframe>` made and each `srcdoc` written.
 * Call before the first navigation.
 *
 * Counting `iframe.live` elements cannot see the failure that matters on WebKit. A dock slot
 * rebuilt in place (a frame of one identity remounted for another) or a full `srcdoc` rewrite
 * into a kept frame leaves the element count exactly where it was, and each one is a document
 * WebKit never gives back. Measured by the inversion review of the frame dock: past the dock's
 * ceiling every reopen made 4–5 documents while the element count stayed flat at 29–30.
 */
export async function countDocuments(page: Page): Promise<void> {
	await page.addInitScript(() => {
		const w = window as unknown as { __latticeDocs: number };
		w.__latticeDocs = 0;
		const d = Object.getOwnPropertyDescriptor(HTMLIFrameElement.prototype, 'srcdoc');
		if (d?.set) {
			const set = d.set;
			Object.defineProperty(HTMLIFrameElement.prototype, 'srcdoc', {
				...d,
				set(v: string) {
					w.__latticeDocs++;
					set.call(this, v);
				},
			});
		}
		const setAttr = Element.prototype.setAttribute;
		Element.prototype.setAttribute = function (name: string, value: string) {
			if (this instanceof HTMLIFrameElement && name.toLowerCase() === 'srcdoc') w.__latticeDocs++;
			return setAttr.call(this, name, value);
		};
		const ce = Document.prototype.createElement;
		Document.prototype.createElement = function (this: Document, tag: string, opts?: ElementCreationOptions) {
			if (String(tag).toLowerCase() === 'iframe') w.__latticeDocs++;
			return ce.call(this, tag, opts);
		} as typeof Document.prototype.createElement;
	});
}

/** Documents created since the page loaded — see `countDocuments`. */
export function documentsMade(page: Page): Promise<number> {
	return page.evaluate(() => (window as unknown as { __latticeDocs?: number }).__latticeDocs ?? 0);
}
