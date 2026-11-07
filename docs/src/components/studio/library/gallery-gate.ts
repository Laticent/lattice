// Does a component package's sample slide (`gallery.md`) fetch anything from the network?
// The Studio's half of the check; the CLI's is `lib/cli/gallery-gate.js`, and both read the
// rendered markup with the same `lib/core/remote-ref.js` `remoteRefsInHtml` (HARD RULE #22).
//
// Insert makes a gallery the user's own deck content, so a remote image in it is a beacon in
// every preview and every export. The gallery is RENDERED through the Studio's own engine and
// read by `scanHtml`, the reader the preview and every export already use, because that is the
// markup the preview frame will load, after front matter, directives, component transforms and
// markdown-it have had their say. Where the HTML tree builder could read it differently, the
// gallery is refused (Segno R4). `remote-ref.js`'s header lists the eleven source spellings a
// regex scan missed.
//
// Loaded by `import()` from the import gate, so the Studio's eager bundle carries none of it.

import { normalizeSourceText } from '@/lib/normalize-source-text';
import { renderMarkdown } from '@/lib/render-engine';
import fenceShaped from '../../../../../lib/core/fence-shaped-bodies.js';
import { fencesOfPlugin } from '../../../../../lib/core/plugin-fences.mjs';
import remoteRef from '../../../../../lib/core/remote-ref.js';

// A DEFAULT import: it is a CommonJS leaf (docs/src/plugins/vite-cjs-lib-dev.mjs).
const { remoteRefsInHtml, mermaidRemoteRefs, frontMatterRemoteRefs, frontMatterOf, isRemoteUrl, galleryRefusal } = remoteRef;
const { fenceShapedMermaidBodies } = fenceShaped;
// Every Mermaid fence, as the ENGINE parses the gallery (lib/core/plugin-fences.mjs): the fences the export draws. The
// reader is the engine's own parse, so it never comes back unreadable.
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

/** The remote fetch targets in a gallery, rendered. Unique, in document order. */
export async function galleryRemoteRefs(source: string): Promise<string[]> {
	// Line endings as the CLI reads a deck: a CRLF fence the fence walker would not match raw is
	// still drawn once the deck is exported.
	const md = normalizeSourceText(String(source || ''));
	if (!md.trim()) return [];
	const pg = await engine();
	// An engine without the reference read can't finish the check, so it doesn't pass it.
	if (!pg.referenceTargets || !pg.pluginService) throw new Error('the render engine is out of date');
	// `warmDraw: false`: this render is read as markup and never shown, so it must not reopen a draw frame
	// the preview closed (web-images.ts scans the same way).
	const { html } = await renderMarkdown(pg, md, CHECK_THEME, { assetUrls: {}, warmDraw: false });
	// A reference definition renders nothing where it is written, yet resolves an image in the
	// deck the slide is inserted into, so every one is read too.
	const defined = pg.referenceTargets(md).filter((t) => isRemoteUrl(t));
	// Every fence the CLI export would hand to Mermaid, read off the SOURCE: one inside an HTML
	// block is plain text in the page yet is drawn once the deck is exported.
	// The engine's fences, and every fence-SHAPED block besides (an HTML block's, an unclosed one): a security gate
	// over-reports (lib/core/fence-shaped-bodies.js).
	const fenced = [...fencesOfPlugin('mermaid', md).map((f: { body: string }) => f.body), ...(fenceShapedMermaidBodies(md) as string[])].flatMap((b: string) => mermaidRemoteRefs(b) as string[]);
	// Read it twice: alone, and AS INSERTED. Insert splices the gallery after a slide and a
	// `---`, so its front matter stops being front matter and renders.
	const inserted = (await renderMarkdown(pg, `# x\n\n---\n\n${md.trim()}\n`, CHECK_THEME, { assetUrls: {}, warmDraw: false })).html;
	const fm = frontMatterOf(md) as string | null;
	return [
		...new Set([
			...(remoteRefsInHtml(html) as string[]),
			...(remoteRefsInHtml(inserted) as string[]),
			...defined,
			...fenced,
			...(fm == null ? [] : (frontMatterRemoteRefs(fm) as string[])),
		]),
	];
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
