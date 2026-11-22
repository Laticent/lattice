// Post-build step: a plain-Markdown copy ("twin") of every content page, for AI agents and
// anything else that reads text rather than a rendered page (#3207).
//
// WHICH PAGES. Every page that declares itself an article (`og:type=article`): the Starlight docs
// pages, the component pages, the catalog hubs and Learn pages, /comparison/. An app shell (the
// landing, the Studio, the Playground) is a UI, not a text, and a "copy" of one would be a list
// of button labels. The sitemap and llms.txt decide what is findable; this decides what has a
// text form.
//
// WHERE. `/guides/cli/` → `/guides/cli.md`, and the page links it in its <head> with
// `<link rel="alternate" type="text/markdown">` so a crawler can find it from the page. One
// exception: `/components/` already has a Markdown twin, `/components.md`, which
// tools/build-docs-portal.js generates as the whole component reference; it is linked, never
// overwritten.
//
// HOW. A component page's twin is its `<name>.docs.md`, the canonical doc (HARD RULE #6).
// Every other page's twin is made from the BUILT page, not the source. A docs page's source can be MDX whose components
// (a diagram, the front-matter table, a live lab) are calls, not text; the built page is what a
// reader sees. So this reads `<main>`, drops what is interface rather than content (scripts,
// buttons, navigation, the table of contents, "copy" controls, hidden and screen-reader-only
// furniture), and converts the rest with hast-util-to-mdast. Code blocks keep their language
// (Expressive Code puts it on `data-language`). A live CraftLab renders an empty island shell,
// so its props, which Astro serializes onto the island, become the code blocks it would show.
//
// Runs after the steps that rewrite <head> and before csp.mjs. Standalone: `npm run md-twins`.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { fromHtml } from 'hast-util-from-html';
import { select, selectAll } from 'hast-util-select';
import { toMdast } from 'hast-util-to-mdast';
import { gfmToMarkdown } from 'mdast-util-gfm';
import { toMarkdown } from 'mdast-util-to-markdown';
import { EXISTING_TWINS, twinPath } from '../src/lib/discovery.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const DIST = path.join(HERE, '..', 'dist');

// Interface, not content. Matched against the parsed page, then removed before conversion.
const DROP = [
	'script',
	'style',
	'noscript',
	'template',
	'button',
	'nav',
	'form',
	'input',
	'select',
	'textarea',
	'iframe',
	'svg',
	'[hidden]',
	'[aria-hidden="true"]',
	'.sr-only',
	'.sl-anchor-link',
	'starlight-toc',
	'mobile-starlight-toc',
	'.right-sidebar-container',
	'.pagination-links',
	'[data-pagefind-ignore]',
	'.cat-toc',
];

// Formatting that sits flush against its neighbours in prose (`**bold**.`), so no space is
// added beside it. Any other two elements side by side with nothing between them are separate
// items laid out by CSS (a row of links, a row of tags) and get a space, or they read as one
// word ("StatementCanvasProse").
const FLUSH = new Set(['strong', 'em', 'b', 'i', 'code', 'kbd', 'sup', 'sub', 'mark', 'abbr', 's', 'del', 'ins', 'u', 'small', 'br', 'wbr']);

/** Astro serializes island props as `[type, value]` tuples; 0 is a plain value. */
function islandProps(raw) {
	const decode = (v) => {
		if (!Array.isArray(v)) return v;
		const [type, value] = v;
		if (type === 0) return value && typeof value === 'object' ? Object.fromEntries(Object.entries(value).map(([k, x]) => [k, decode(x)])) : value;
		if (type === 1) return value.map(decode);
		return value;
	};
	const parsed = JSON.parse(raw);
	return Object.fromEntries(Object.entries(parsed).map(([k, v]) => [k, decode(v)]));
}

/** A fence longer than any backtick run inside the code, so a sample with its own fence survives. */
const fence = (lang, code) => {
	const longest = Math.max(2, ...[...code.matchAll(/`+/g)].map((m) => m[0].length));
	const f = '`'.repeat(longest + 1);
	return `${f}${lang}\n${code.replace(/\n$/, '')}\n${f}`;
};

/** A live lab's props, as the Markdown a reader can copy. */
function craftLabMarkdown(p) {
	const parts = [`**Try it: ${p.label}.**${p.hint ? ` ${p.hint}` : ''}`];
	if (p.css) parts.push(fence('css', p.css));
	if (p.markdown) parts.push(fence('markdown', p.markdown));
	return parts.join('\n\n');
}

const REPO = path.join(HERE, '..', '..');

/**
 * A component page's twin is its `<name>.docs.md`, verbatim: the canonical agent-facing doc
 * (HARD RULE #6), which the page renders alongside a live specimen that has no text form.
 */
export function componentDoc(route, repo = REPO) {
	const m = route.match(/^\/components\/([^/]+)\/([^/]+)\/$/);
	if (!m) return null;
	const [, bucket, name] = m;
	for (const dir of [`lib/components/${bucket}/${name}`, `lib/plugins/chart-family/kinds/${name}`]) {
		const file = path.join(repo, dir, `${name}.docs.md`);
		if (fs.existsSync(file)) return rebaseLinks(fs.readFileSync(file, 'utf8'), `${dir}/${name}.docs.md`).replace(/\s*$/, '\n');
	}
	return null;
}

const REPO_BLOB = 'https://github.com/Laticent/lattice/blob/main/';

/**
 * A `.docs.md` links its neighbours by repo-relative path (`../../anchor/title/title.docs.md`,
 * `./closing.gallery.light.pdf`), which resolve in the repo and 404 on the site: the first
 * version shipped 472 such links (found by review). Each relative link is resolved against the
 * source file: another component's doc becomes that component's `.md` copy on the site, and
 * anything else becomes the file on GitHub. Code (fenced and inline) is left exactly as written.
 */
export function rebaseLinks(md, sourcePath) {
	const fromDir = path.posix.dirname(sourcePath);
	const target = (href) => {
		if (/^([a-z][a-z0-9+.-]*:|#|\/)/i.test(href)) return href; // absolute, an anchor, or site-rooted
		const [file, anchor = ''] = href.split(/(?=#)/);
		const repoPath = path.posix.normalize(path.posix.join(fromDir, file));
		const doc = repoPath.match(/^lib\/components\/([^/]+)\/([^/]+)\/\2\.docs\.md$/) ?? repoPath.match(/^lib\/plugins\/chart-family\/kinds\/([^/]+)\/\1\.docs\.md$/);
		if (doc) return doc.length === 3 ? `/components/${doc[1]}/${doc[2]}.md${anchor}` : `/components/chart/${doc[1]}.md${anchor}`;
		return `${REPO_BLOB}${repoPath}${anchor}`;
	};
	// Fenced blocks are set aside whole. In the rest, ONE left-to-right scan: a code span or a
	// link, whichever starts first, so `[`title`](…)` (code inside link text) is a link and
	// `` `[x](./y)` `` (a link written inside code) is code.
	const INLINE = /(`+)[^`\n]*?\1|(!?\[(?:[^\]`]|`[^`\n]*`)*\]\()([^)\s]+)((?:\s+"[^"]*")?\))/g;
	return md
		.split(/(^(?:`{3,}|~{3,})[^\n]*\n[\s\S]*?^(?:`{3,}|~{3,})[ \t]*$)/m)
		.map((part, i) => (i % 2 ? part : part.replace(INLINE, (whole, _ticks, open, href, close) => (open ? `${open}${target(href)}${close}` : whole))))
		.join('');
}

/** Convert one built page to its Markdown twin, or null when it is not a content page. */
export function pageToMarkdown(html, route = '') {
	const tree = fromHtml(html);
	if (!select('meta[property="og:type"][content="article"]', tree)) return null;
	const fromSource = componentDoc(route);
	if (fromSource) return fromSource;
	const main = select('main', tree);
	if (!main) return null;

	// Replace each CraftLab island with a placeholder <pre> holding its Markdown, before the
	// DROP pass (which would remove its empty shell). Marked so the handler below emits it raw.
	for (const island of selectAll('astro-island', main)) {
		// hast keeps an unknown attribute under its own name, so `component-url`, not camelCase.
		const url = String(island.properties['component-url'] ?? '');
		if (!/CraftLab/.test(url)) continue;
		const md = craftLabMarkdown(islandProps(String(island.properties.props ?? '{}')));
		Object.assign(island, { tagName: 'div', properties: { dataTwinRaw: md }, children: [] });
	}
	// A Starlight <Card>'s title is a styled paragraph; in text it is the card's heading.
	for (const title of selectAll('article.card > p.title', main)) title.tagName = 'h3';
	for (const sel of DROP) for (const node of selectAll(sel, main)) node.tagName = 'twin-drop';
	// Drop removed elements and every comment (React's `<!-- -->` text separators among them),
	// then space out side-by-side items.
	// Never inside code: there, side-by-side elements are syntax-highlight tokens of ONE line
	// (`<span>"name"</span><span>:</span>`), and a space between them changes the code. The first
	// version spaced them and turned `"name":` into `" name " :` in 38 copies (found by review).
	const strip = (node, inCode = false) => {
		if (!node.children) return node;
		const code = inCode || (node.type === 'element' && (node.tagName === 'pre' || node.tagName === 'code'));
		const kept = node.children.filter((c) => c.type !== 'comment' && !(c.type === 'element' && c.tagName === 'twin-drop')).map((c) => strip(c, code));
		if (code) {
			node.children = kept;
			return node;
		}
		const spaced = [];
		for (const c of kept) {
			const prev = spaced.at(-1);
			if (prev?.type === 'element' && c.type === 'element' && !FLUSH.has(prev.tagName) && !FLUSH.has(c.tagName)) spaced.push({ type: 'text', value: ' ' });
			spaced.push(c);
		}
		node.children = spaced;
		return node;
	};
	strip(main);

	const mdast = toMdast(main, {
		handlers: {
			div(state, node) {
				if (node.properties?.dataTwinRaw) return { type: 'html', value: String(node.properties.dataTwinRaw) };
				return state.toFlow(state.all(node));
			},
			// A definition list (a Learn page's fact sheet): one bullet per term, `**term:** value`.
			dl(state, node) {
				const items = [];
				let term = null;
				for (const child of node.children.filter((c) => c.type === 'element')) {
					const cell = child.tagName === 'div' ? child.children.filter((c) => c.type === 'element') : [child];
					for (const el of cell) {
						if (el.tagName === 'dt') term = toPlainText(el).trim();
						else if (el.tagName === 'dd') {
							const value = state.all(el);
							items.push({
								type: 'listItem',
								spread: false,
								children: [{ type: 'paragraph', children: [{ type: 'strong', children: [{ type: 'text', value: `${term}:` }] }, { type: 'text', value: ' ' }, ...flattenInline(value)] }],
							});
						}
					}
				}
				return { type: 'list', ordered: false, spread: false, children: items };
			},
			pre(state, node) {
				// Expressive Code: one `.ec-line` div per line, language on `data-language`.
				const lines = selectAll('.ec-line', node);
				// An empty line's div holds a bare newline; strip it, or every blank line doubles.
				const text = lines.length ? lines.map((l) => toPlainText(l).replace(/\n$/, '')).join('\n') : toPlainText(node);
				const lang = node.properties?.dataLanguage ?? langFromClass(select('code', node));
				return { type: 'code', lang: lang && lang !== 'plaintext' ? String(lang) : null, value: text.replace(/\n+$/, '') };
			},
		},
	});
	return `${toMarkdown(mdast, { extensions: [gfmToMarkdown({ tablePipeAlign: false })], fences: true, bullet: '-', emphasis: '_', rule: '-' }).trim()}\n`;
}

/** A dd's converted children as inline content: paragraphs unwrapped and joined by a space. */
function flattenInline(nodes) {
	const out = [];
	for (const n of nodes) {
		const inline = n.type === 'paragraph' ? n.children : [n];
		if (out.length) out.push({ type: 'text', value: ' ' });
		out.push(...inline);
	}
	return out;
}

function toPlainText(node) {
	if (node.type === 'text') return node.value;
	return (node.children ?? []).map(toPlainText).join('');
}

function langFromClass(code) {
	const cls = [].concat(code?.properties?.className ?? []).find((c) => String(c).startsWith('language-'));
	return cls ? String(cls).slice('language-'.length) : null;
}

/** Add the <link rel="alternate" type="text/markdown"> to a page's <head>, once. */
export function withTwinLink(html, href) {
	const tag = `<link rel="alternate" type="text/markdown" href="${href}">`;
	const clean = html.replace(/<link rel="alternate" type="text\/markdown" href="[^"]*">/g, '');
	return clean.replace('</head>', `${tag}</head>`);
}

function routes(dist) {
	const out = [];
	(function walk(dir) {
		for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
			const p = path.join(dir, e.name);
			if (e.isDirectory()) {
				if (e.name !== '_astro' && !p.includes(`${path.sep}playground${path.sep}v`)) walk(p);
			} else if (e.name === 'index.html') {
				const rel = path.relative(dist, dir).split(path.sep).join('/');
				out.push({ file: p, route: rel ? `/${rel}/` : '/' });
			}
		}
	})(dist);
	return out;
}

/**
 * Point a twin's site links at the other twins. A page converted from HTML keeps the page's own
 * links (`/guides/cli/`), so an agent reading the 20 KB copy followed a link to 226 KB of HTML:
 * 18 of the 23 internal links in the copies `llms.txt` lists did that (2026-11-17-agent-pack.md §1).
 * A link to a route that has a twin becomes that twin; any other link (a PDF, an app page) is left.
 * Code is left exactly as written, by the same scan `rebaseLinks` uses.
 */
export function pointLinksAtTwins(md, twinRoutes) {
	const INLINE = /(`+)[^`\n]*?\1|(!?\[(?:[^\]`]|`[^`\n]*`)*\]\()([^)\s]+)((?:\s+"[^"]*")?\))/g;
	const target = (href) => {
		const m = href.match(/^(\/[^#?]*?)(#.*)?$/);
		if (!m) return href;
		const route = m[1].endsWith('/') ? m[1] : `${m[1]}/`;
		return twinRoutes.has(route) && !EXISTING_TWINS[route] ? `${twinPath(route)}${m[2] ?? ''}` : href;
	};
	return md
		.split(/(^(?:`{3,}|~{3,})[^\n]*\n[\s\S]*?^(?:`{3,}|~{3,})[ \t]*$)/m)
		.map((part, i) => (i % 2 ? part : part.replace(INLINE, (whole, _ticks, open, href, close) => (open && !open.startsWith('!') ? `${open}${target(href)}${close}` : whole))))
		.join('');
}

/** What a twin must never contain: markup that leaked through instead of becoming text. */
export function twinProblems(md) {
	const problems = [];
	// Code is content: a deck sample is full of `<!-- _class: … -->` and may hold any markup.
	// Only prose outside fenced and inline code is checked for leaks.
	const prose = md.replace(/^(`{3,}|~{3,})[^\n]*\n[\s\S]*?^\1`*\s*$/gm, '').replace(/`+[^`\n]*`+/g, '');
	if (!/^#{1,2} \S/m.test(md)) problems.push('no heading');
	// `\<!--` is the converter escaping a `<` the page shows as text: that is text, not a leak.
	if (/(?<!\\)<!--/.test(prose)) problems.push('an HTML comment outside code');
	if (/<\/?(astro-island|astro-slot|script|style|svg|button)\b/i.test(prose)) problems.push('leftover interface markup outside code');
	// A repo-relative link resolves in the repo and 404s on the site (rebaseLinks fixes them).
	const relative = [...prose.matchAll(/\]\(((?:\.\.?\/)[^)\s]*)/g)].map(([, href]) => href);
	if (relative.length) problems.push(`a repo-relative link: ${relative[0]}`);
	if (md.trim().length < 200) problems.push(`only ${md.trim().length} characters`);
	return problems;
}

function main() {
	const check = process.argv.includes('--check');
	const errors = [];
	let count = 0;
	const pages = [];
	for (const { file, route } of routes(DIST)) {
		const html = fs.readFileSync(file, 'utf8');
		const md = pageToMarkdown(html, route);
		if (md !== null) pages.push({ file, route, html, md });
	}
	const twinRoutes = new Set(pages.map((p) => p.route));
	for (const { file, route, html, md: converted } of pages) {
		const md = pointLinksAtTwins(converted, twinRoutes);
		count++;
		const href = twinPath(route);
		const target = path.join(DIST, href);
		if (check) {
			if (!fs.existsSync(target)) errors.push(`${route}: no twin at ${href}`);
			else {
				const written = fs.readFileSync(target, 'utf8');
				for (const p of twinProblems(written)) errors.push(`${href}: ${p}`);
				if (!EXISTING_TWINS[route] && pointLinksAtTwins(written, twinRoutes) !== written) errors.push(`${href}: links a page whose Markdown copy exists; link the copy`);
			}
			const links = html.match(/<link rel="alternate" type="text\/markdown" href="([^"]*)">/g) ?? [];
			if (links.length !== 1 || !links[0].includes(`href="${href}"`)) errors.push(`${route}: want one <link rel="alternate" type="text/markdown" href="${href}">, found ${links.length}`);
			continue;
		}
		if (!EXISTING_TWINS[route]) fs.writeFileSync(target, md);
		fs.writeFileSync(file, withTwinLink(html, href));
	}
	if (errors.length) {
		console.error(`md-twins: ${errors.length} problem(s)\n  ${errors.join('\n  ')}`);
		process.exit(1);
	}
	console.log(`md-twins: ${check ? 'verified' : 'wrote and linked'} ${count} Markdown twin(s).`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
