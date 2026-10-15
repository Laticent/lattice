// The catalog of libraries and plugins — the shared helpers behind the two hubs
// (/libraries/, /plugins/), every demo page's tab bar and every Learn page.
//
// The content lives in src/content/catalog/<kind>s/<slug>.md (schema: content.config.ts).
// A Learn page teaches in a FIXED order, so a reader who learned one page can skim the
// next: why (the problem), what (the idea), how (how to use it), then the wider field,
// then Lattice's own use, then the honest limits. "Go deeper" is built from the entry's
// `reference` links, so repo docs stay one click away without crowding the prose.

export const REQUIRED_SECTIONS = [
	'The problem',
	'The idea',
	'How to use it',
	'Where else it fits',
	'How Lattice uses it',
	"What it doesn't do",
];

// Where each kind lives. A library's demo is its own standalone page; a plugin's demo is
// the live specimen page under /plugins/<slug>/.
export const KIND = {
	library: { plural: 'libraries', label: 'Library', hub: 'Libraries' },
	plugin: { plural: 'plugins', label: 'Plugin', hub: 'Plugins' },
};

export const slugOf = (entry) => entry.id.split('/').pop();

export function hrefsFor(entry, url) {
	const root = `${KIND[entry.data.kind].plural}/${slugOf(entry)}/`;
	return { demo: url(root), learn: url(`${root}learn/`), hub: url(`${KIND[entry.data.kind].plural}/`) };
}

export const byOrder = (a, b) => a.data.order - b.data.order;

// A catalog intro may quote the syntax in backticks (`^{database}`). These render it as code
// for the page, and strip the backticks for a meta description.
const esc = (t) => t.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
export const inlineCode = (text) => esc(text).replace(/`([^`]+)`/g, '<code>$1</code>');
export const plainText = (text) => text.replace(/`([^`]+)`/g, '$1');

// The Markdown renderer for Learn pages. Its own processor, not the site-wide one, so the
// code theme (the restrained Vitesse pair the docs zone already uses) is set here without
// touching any other page. `defaultColor: false` emits both themes as CSS variables, and
// the Learn page picks one from `data-mode` — so a code block follows the light/dark
// toggle like everything else on the page.
let processorPromise;
export async function renderCatalogMarkdown(source) {
	if (!processorPromise) {
		processorPromise = import('@astrojs/markdown-remark').then(({ createMarkdownProcessor }) =>
			createMarkdownProcessor({
				shikiConfig: { themes: { light: 'vitesse-light', dark: 'vitesse-dark' }, defaultColor: false },
			}),
		);
	}
	const processor = await processorPromise;
	const { code, metadata } = await processor.render(source);
	return { html: code, headings: metadata.headings };
}
