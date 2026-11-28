import type { Page } from '@playwright/test';

/**
 * Count every preview DOCUMENT the page creates: each `<iframe>` made and each `srcdoc` written.
 * Call before the first navigation.
 *
 * Counting `iframe.live` elements cannot see the failure that matters on WebKit, which never frees
 * a preview document: a frame rebuilt in place, or a full `srcdoc` rewrite into a kept frame, leaves
 * the element count where it was. Measured on an earlier design of the Add slide fix: past its
 * ceiling every reopen made 4–5 documents while the element count stayed flat.
 */
export async function countDocuments(page: Page): Promise<void> {
	await page.addInitScript(() => {
		const w = window as unknown as { __latticeDocs: number; __latticeRewrites: number };
		w.__latticeDocs = 0;
		w.__latticeRewrites = 0;
		// A frame that already holds a document: one more srcdoc on it is a REWRITE (see `rewritesMade`).
		const written = new WeakSet<HTMLIFrameElement>();
		const note = (f: HTMLIFrameElement) => {
			if (written.has(f)) w.__latticeRewrites++;
			else written.add(f);
		};
		const d = Object.getOwnPropertyDescriptor(HTMLIFrameElement.prototype, 'srcdoc');
		if (d?.set) {
			const set = d.set;
			Object.defineProperty(HTMLIFrameElement.prototype, 'srcdoc', {
				...d,
				set(this: HTMLIFrameElement, v: string) {
					w.__latticeDocs++;
					note(this);
					set.call(this, v);
				},
			});
		}
		const setAttr = Element.prototype.setAttribute;
		Element.prototype.setAttribute = function (name: string, value: string) {
			if (this instanceof HTMLIFrameElement && name.toLowerCase() === 'srcdoc') {
				w.__latticeDocs++;
				note(this);
			}
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

/**
 * Full `srcdoc` writes into a frame that already held a document, since the page loaded. A NEW frame (a pool growing to
 * its high-water mark) is not one; a kept frame thrown away and rebuilt in place is, and it is the shape WebKit never
 * frees. `documentsMade` counts both, so it needs slack for honest growth; this one needs none.
 */
export function rewritesMade(page: Page): Promise<number> {
	return page.evaluate(() => (window as unknown as { __latticeRewrites?: number }).__latticeRewrites ?? 0);
}
