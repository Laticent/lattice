// Does a component package's sample slide (`gallery.md`) fetch anything from the network?
// The Studio's half of the check; the CLI's is `lib/packages/gallery-gate.js`, and both hand
// the parsed elements to the same `lib/core/remote-ref.js` scan (HARD RULE #22).
//
// Insert makes a gallery the user's own deck content, so a remote image in it is a beacon in
// every preview and every export. The gallery is RENDERED through the Studio's own engine and
// parsed with `DOMParser` — an inert document: nothing in it loads, and no script runs —
// because that is the markup the preview frame will load, after front matter, directives,
// component transforms and both parsers have had their say. `remote-ref.js`'s header lists
// the eleven source spellings a regex scan missed.
//
// Loaded by `import()` from the import gate, so the Studio's eager bundle carries none of it.

import { renderMarkdown } from '@/lib/render-engine';
import remoteRef from '../../../../../lib/core/remote-ref.js';

// A DEFAULT import: it is a CommonJS leaf (docs/src/plugins/vite-cjs-lib-dev.mjs).
const { remoteRefsInElements, isRemoteUrl, galleryRefusal } = remoteRef;

/** The theme the check renders with. The markup, not the look, is what is read. */
const CHECK_THEME = 'indaco';
/** How long to wait for the engine, which the Studio loads on mount. */
const ENGINE_WAIT_MS = 15_000;

async function engine() {
	for (let waited = 0; ; waited += 50) {
		const pg = typeof window !== 'undefined' ? window.LatticePlayground : undefined;
		if (pg) return pg;
		if (waited >= ENGINE_WAIT_MS) throw new Error('the render engine did not load');
		await new Promise((r) => setTimeout(r, 50));
	}
}

function* elements(root: ParentNode): Generator<{ tag: string; attrs: [string, string][]; text: string }> {
	for (const el of root.querySelectorAll('*')) {
		yield {
			tag: el.localName.toLowerCase(),
			attrs: [...el.attributes].map((a) => [a.name.toLowerCase(), a.value] as [string, string]),
			text: el.localName === 'style' || /mermaid/.test(el.getAttribute('class') || '') ? el.textContent || '' : '',
		};
		if (el instanceof HTMLTemplateElement) yield* elements(el.content);
	}
}

/** The remote fetch targets in a gallery, rendered. Unique, in document order. */
export async function galleryRemoteRefs(md: string): Promise<string[]> {
	if (!String(md || '').trim()) return [];
	const pg = await engine();
	// An engine without the reference read can't finish the check, so it doesn't pass it.
	if (!pg.referenceTargets) throw new Error('the render engine is out of date');
	const { html } = await renderMarkdown(pg, md, CHECK_THEME);
	const doc = new DOMParser().parseFromString(html, 'text/html');
	// A reference definition renders nothing where it is written, yet resolves an image in the
	// deck the slide is inserted into, so every one is read too.
	const defined = pg.referenceTargets(md).filter((t) => isRemoteUrl(t));
	return [...new Set([...(remoteRefsInElements(elements(doc)) as string[]), ...defined])];
}

/**
 * The import gate's verdict on a sample slide: why it is refused, or null. A slide nobody
 * could check (the engine did not load, or failed to render it) is refused, not waved through.
 */
export async function refuseGallery(md: string, name: string): Promise<{ name: string; why: string } | null> {
	try {
		const refs = await galleryRemoteRefs(md);
		return refs.length ? { name, why: galleryRefusal(refs[0]) } : null;
	} catch (e) {
		return { name, why: `its sample slide could not be checked (${e instanceof Error ? e.message : String(e)}).` };
	}
}
