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
// code theme is set here without touching any other page. The theme's colors are CSS
// variables (--code-*), declared in styles/catalog.css from the site's palette tokens — so a
// code block follows the theme picker and the light/dark toggle like everything else, and
// no color is a literal. (Shiki's own two-theme mode would read --shiki-light/--shiki-dark,
// which it writes inline where the ownership gate can't see them declared.)
// Spelled out in full, not built from a template, so the ownership gate can match each read
// to its declaration in catalog.css.
const v = {
	fg: 'var(--code-fg)',
	bg: 'var(--code-bg)',
	comment: 'var(--code-comment)',
	string: 'var(--code-string)',
	constant: 'var(--code-constant)',
	keyword: 'var(--code-keyword)',
	function: 'var(--code-function)',
	property: 'var(--code-property)',
	punctuation: 'var(--code-punctuation)',
};
const CODE_THEME = {
	name: 'lattice-catalog',
	type: 'light',
	colors: { 'editor.foreground': v.fg, 'editor.background': v.bg },
	tokenColors: [
		{ settings: { foreground: v.fg, background: v.bg } },
		{ scope: ['comment', 'punctuation.definition.comment'], settings: { foreground: v.comment, fontStyle: 'italic' } },
		{ scope: ['string', 'string.quoted', 'string.template', 'markup.inline.raw', 'markup.fenced_code'], settings: { foreground: v.string } },
		{ scope: ['constant', 'constant.numeric', 'constant.language', 'support.constant'], settings: { foreground: v.constant } },
		{ scope: ['keyword', 'storage', 'storage.type', 'keyword.operator.new', 'markup.heading'], settings: { foreground: v.keyword } },
		{ scope: ['entity.name.function', 'support.function', 'meta.function-call', 'entity.name.tag'], settings: { foreground: v.function } },
		{ scope: ['variable.parameter', 'entity.other.attribute-name', 'support.type.property-name', 'meta.object-literal.key'], settings: { foreground: v.property } },
		{ scope: ['punctuation', 'keyword.operator', 'meta.brace'], settings: { foreground: v.punctuation } },
	],
};

/** Wrap each rendered table in a frame that scrolls sideways on a narrow screen (catalog.css
 *  `.cat-prose-table-frame`), so the table itself can stay a table and fill the column. The
 *  outer element takes the prose flow's padding-top, which inside the border would show as a
 *  strip above the header band. */
export function wrapTables(html) {
	return html.replace(/<table>/g, '<div class="cat-prose-table"><div class="cat-prose-table-frame" tabindex="0"><table>').replace(/<\/table>/g, '</table></div></div>');
}

let processorPromise;
export async function renderCatalogMarkdown(source) {
	if (!processorPromise) {
		processorPromise = import('@astrojs/markdown-remark').then(({ createMarkdownProcessor }) =>
			createMarkdownProcessor({
				shikiConfig: { theme: CODE_THEME },
			}),
		);
	}
	const processor = await processorPromise;
	const { code, metadata } = await processor.render(source);
	return { html: wrapTables(code), headings: metadata.headings };
}
