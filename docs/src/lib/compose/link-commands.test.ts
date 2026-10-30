import { EditorState, TextSelection } from 'prosemirror-state';
import { describe, expect, it } from 'vitest';
import { deckToDoc, docToDeck } from './deck-doc';
import { entitySafeHref } from './deck-markdown';
import { LINK_PLACEHOLDER, linkAt, linkBlocker, normalizeHref, removeLink, selectedLink, setLink, startLink } from './link-commands';

const DECK = ['<!-- _class: content -->', '', '## Links', '', 'Read the [launch notes](https://example.com/notes "Notes") today.', '', 'Plain words here.', '', '```text', 'code', '```', '', '---', '', '<!-- _class: content -->', '', '## Locked', '', 'This has ~~strike~~ and [a link](https://x.io).'].join('\n');

/** The document position just before the first occurrence of `text` (inside a text node). */
function posOf(state: EditorState, text: string, nth = 0): number {
	let found = -1;
	let seen = 0;
	state.doc.descendants((node, pos) => {
		if (found >= 0 || !node.isText) return found < 0;
		const i = (node.text ?? '').indexOf(text);
		if (i >= 0 && seen++ === nth) found = pos + i;
		return false;
	});
	if (found < 0) throw new Error(`no ${text}`);
	return found;
}

function stateAt(source: string, from: number | ((s: EditorState) => number), to?: (s: EditorState) => number): EditorState {
	const base = EditorState.create({ doc: deckToDoc(source) });
	const a = typeof from === 'number' ? from : from(base);
	const b = to ? to(base) : a;
	return base.apply(base.tr.setSelection(TextSelection.create(base.doc, a, b)));
}

function run(state: EditorState, cmd: (s: EditorState, d?: (tr: import('prosemirror-state').Transaction) => void) => boolean): { ok: boolean; out: string; state: EditorState } {
	let next = state;
	const ok = cmd(state, (tr) => {
		next = state.apply(tr);
	});
	return { ok, out: docToDeck(next.doc), state: next };
}

describe('normalizeHref', () => {
	it('keeps web, mail, phone, relative and anchor addresses', () => {
		for (const h of ['https://example.com/a?b=1#c', 'http://x.io', 'mailto:ada@example.com', 'tel:+15550100', '/docs/a', './b.md', '#top', '?q=1', "https://en.wikipedia.org/wiki/Ender's_Game"]) expect(normalizeHref(h)).toEqual({ href: h });
	});
	it('adds the missing scheme to a bare host, a host with a port and an email', () => {
		expect(normalizeHref(' example.com/path ')).toEqual({ href: 'https://example.com/path' });
		expect(normalizeHref('www.example.co.uk')).toEqual({ href: 'https://www.example.co.uk' });
		expect(normalizeHref('example.com.')).toEqual({ href: 'https://example.com.' });
		expect(normalizeHref('localhost:3000/x')).toEqual({ href: 'http://localhost:3000/x' });
		expect(normalizeHref('a.b.c:1')).toEqual({ href: 'https://a.b.c:1' });
		expect(normalizeHref('user@example.com')).toEqual({ href: 'mailto:user@example.com' });
	});
	it('writes what the parser would read back, with the characters that would end the destination encoded', () => {
		expect(normalizeHref('https://en.wikipedia.org/wiki/Mercury_(planet)')).toEqual({ href: 'https://en.wikipedia.org/wiki/Mercury_%28planet%29' });
		expect(normalizeHref('/a b')).toEqual({ href: '/a%20b' });
		expect(normalizeHref('https://ex.com/é')).toEqual({ href: 'https://ex.com/%C3%A9' });
		expect(normalizeHref('https://x.io/50%off')).toEqual({ href: 'https://x.io/50%25off' });
		expect(normalizeHref('https://x.io/[x]')).toEqual({ href: 'https://x.io/%5Bx%5D' });
		expect(normalizeHref('https://x.io/"q"<b>`')).toEqual({ href: 'https://x.io/%22q%22%3Cb%3E%60' });
	});
	it('refuses an empty address, an unsafe scheme (a digit after the colon is not a port) and a control character', () => {
		expect(normalizeHref('  ')).toHaveProperty('error');
		for (const h of ['javascript:alert(1)', 'JavaScript:x', 'data:text/html,x', 'vbscript:x', 'file:///etc/passwd', 'javascript:1/alert%28document.domain%29', 'javascript:0,alert(1)', 'JAVASCRIPT:9//x', 'data:1,x']) expect(normalizeHref(h), h).toHaveProperty('error');
		expect(normalizeHref('https://x.io/\na')).toHaveProperty('error');
		// Written with entities, the scheme is still the scheme: the parser decodes them before it judges the link.
		for (const h of ['javascript&colon;alert(1)', '&#106;avascript:alert(1)', '&#x6A;avascript:x', 'https://x.io/&#10;a']) expect(normalizeHref(h), h).toHaveProperty('error');
	});
	it('never makes a URL no browser accepts out of an IPv6 host or a Windows path', () => {
		for (const h of ['[::1]:3000', '\\\\evil.com']) {
			const r = normalizeHref(h);
			expect('href' in r && r.href.startsWith('http'), h).toBe(false);
		}
	});
	it('every address it writes reads back as the same bytes', () => {
		for (const h of ['https://ex.com/é', 'https://x.io/50%off', 'https://x.io/[x]', "https://x.io/Ender's", 'example.com/a b', 'https://x.io/(a)', 'https://x.io/a&amp;b', 'https://x.io/?a=1&b=2', 'https://x.io/a%26amp;b', 'https://x.io/?a=1&b;c', 'https://x.io/?a&amp;lt;b']) {
			const first = normalizeHref(h);
			if (!('href' in first)) throw new Error(h);
			const deck = docToDeck(deckToDoc(`<!-- _class: content -->\n\n## L\n\n[t](${entitySafeHref(first.href)})`));
			expect(deck, h).toContain(`[t](${entitySafeHref(first.href)})`);
			expect(docToDeck(deckToDoc(deck)), h).toBe(deck);
		}
	});
});

describe('a link the author wrote by hand', () => {
	it('keeps its address over two saves when the address holds an entity', () => {
		for (const src of ['[t](https://x.io/?a&amp;lt;b)', '[t](https://x.io/?a=1&b;c)', '[t](https://x.io/?q=&copy=2)']) {
			const deck = `<!-- _class: content -->\n\n## L\n\n${src}`;
			const once = docToDeck(deckToDoc(deck));
			const twice = docToDeck(deckToDoc(once));
			expect(twice, src).toBe(once);
			expect(once, src).toContain(src);
		}
	});
});

describe('linkAt and selectedLink', () => {
	it('finds the whole link from a caret anywhere in it, and at its end', () => {
		const s = stateAt(DECK, (b) => posOf(b, 'notes'));
		const l = linkAt(s.doc, s.selection.from);
		expect(l).toMatchObject({ href: 'https://example.com/notes', title: 'Notes' });
		expect(s.doc.textBetween(l?.from ?? 0, l?.to ?? 0)).toBe('launch notes');
		const end = (l?.to ?? 0);
		expect(linkAt(s.doc, end)?.href).toBe('https://example.com/notes');
	});
	it('is null outside a link, and for a selection that leaves the link', () => {
		expect(linkAt(stateAt(DECK, (b) => posOf(b, 'Plain')).doc, stateAt(DECK, (b) => posOf(b, 'Plain')).selection.from)).toBeNull();
		const s = stateAt(DECK, (b) => posOf(b, 'Read'), (b) => posOf(b, 'notes') + 2);
		expect(selectedLink(s)).toBeNull();
	});
});

describe('setLink', () => {
	it('makes a selection a link and writes Markdown', () => {
		const s = stateAt(DECK, (b) => posOf(b, 'Plain'), (b) => posOf(b, 'Plain') + 5);
		const r = run(s, setLink('example.org'));
		expect(r.ok).toBe(true);
		expect(r.out).toContain('[Plain](https://example.org) words here.');
	});
	it('changes an existing link’s address and keeps its text and title', () => {
		const s = stateAt(DECK, (b) => posOf(b, 'launch') + 2);
		const r = run(s, setLink('https://example.com/v2'));
		expect(r.out).toContain('[launch notes](https://example.com/v2 "Notes")');
		expect(r.out.replace('https://example.com/v2', 'https://example.com/notes')).toBe(docToDeck(deckToDoc(DECK)));
	});
	it('writes the address as the text at an empty caret', () => {
		const s = stateAt(DECK, (b) => posOf(b, 'Plain'));
		expect(run(s, setLink('mailto:ada@example.com')).out).toContain('[ada@example.com](mailto:ada@example.com)Plain');
	});
	it('refuses an unsafe address, a fence and a locked slide, and changes nothing', () => {
		const sel = stateAt(DECK, (b) => posOf(b, 'Plain'), (b) => posOf(b, 'Plain') + 5);
		expect(run(sel, setLink('javascript:alert(1)')).ok).toBe(false);
		const fence = stateAt(DECK, (b) => posOf(b, 'code'));
		expect(linkBlocker(fence)).toMatch(/line of text/);
		expect(run(fence, setLink('https://x.io')).ok).toBe(false);
		const locked = stateAt(DECK, (b) => posOf(b, 'a link') + 1);
		expect(linkBlocker(locked)).toMatch(/edited in Markdown/);
		expect(run(locked, setLink('https://y.io')).ok).toBe(false);
		expect(run(locked, removeLink()).ok).toBe(false);
	});
});

describe('removeLink', () => {
	it('takes the link off and keeps the words', () => {
		const s = stateAt(DECK, (b) => posOf(b, 'notes'));
		const r = run(s, removeLink());
		expect(r.out).toContain('Read the launch notes today.');
	});
	it('is false outside a link', () => {
		expect(run(stateAt(DECK, (b) => posOf(b, 'Plain')), removeLink()).ok).toBe(false);
	});
});

describe('startLink', () => {
	it('writes a selected placeholder at an empty caret', () => {
		const s = stateAt(DECK, (b) => posOf(b, 'Plain'));
		let next = s;
		const range = startLink(s, (tr) => {
			next = s.apply(tr);
		});
		expect(range).not.toBeNull();
		expect(next.doc.textBetween(range?.from ?? 0, range?.to ?? 0)).toBe(LINK_PLACEHOLDER);
		expect(next.selection.from).toBe(range?.from);
		// Not a link yet: an author who closes the panel without an address keeps a plain word.
		expect(linkAt(next.doc, (range?.from ?? 0) + 1)).toBeNull();
	});
	it('returns the selection or the caret’s link without writing', () => {
		const sel = stateAt(DECK, (b) => posOf(b, 'Plain'), (b) => posOf(b, 'Plain') + 5);
		let wrote = false;
		expect(startLink(sel, () => {
			wrote = true;
		})).toEqual({ from: sel.selection.from, to: sel.selection.to });
		const inLink = stateAt(DECK, (b) => posOf(b, 'notes'));
		const l = linkAt(inLink.doc, inLink.selection.from);
		expect(startLink(inLink, () => {
			wrote = true;
		})).toEqual({ from: l?.from, to: l?.to });
		expect(wrote).toBe(false);
	});
	it('declines on a locked slide', () => {
		expect(startLink(stateAt(DECK, (b) => posOf(b, 'This')))).toBeNull();
	});
});
