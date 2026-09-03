import { DOMSerializer, DOMParser as PMDOMParser } from 'prosemirror-model';
import { describe, expect, it } from 'vitest';
import { deckSchema, deckToDoc, docToDeck } from './deck-doc';

// THE CLIPBOARD IS A PARSER, AND ITS INPUT IS UNTRUSTED.
//
// `toDOM`/`parseDOM` carry a slide's `directives` so copy/paste stops stripping every
// slide's `_class`. The cost of that bridge is that `parseDOM` matches `section.cs-slide`
// in ANY pasted HTML — including HTML from a page the author does not control — and
// directive strings are NOT content: `composeSlideChunk` joins them and prepends them to
// the slide's prose, so whatever lands there is in the deck source and, from there, in the
// exported artifact.
//
// These tests live at the parser rather than in the e2e suite deliberately. An e2e attempt
// at the same attack could not be made to fail even with both gates removed — driving the
// system clipboard's `text/html` branch through a real paste is too indirect to be a sound
// oracle for a security property. This is the seam, so this is where the test belongs.

/**
 * Build the DOM a hostile paste would produce, and parse it — WITHOUT any HTML string.
 *
 * The attack this file pins is about ATTRIBUTES: `parseDOM` matching `section.cs-slide` and
 * believing its `data-directives`. Constructing the element directly tests exactly that,
 * and it removes the markup sink entirely — no `innerHTML` assignment, no
 * `DOMParser.parseFromString`, so nothing for CodeQL's "DOM text reinterpreted as HTML"
 * rule to follow. Two earlier attempts fixed the SINK and the alert simply moved, because
 * that rule tracks a flow: swapping `innerHTML` for `DOMParser` relocated it one line down,
 * and removing the DOM-text source relocated it again. Having no sink at all is the version
 * that cannot be relocated.
 *
 * This is also the better test. The HTML string was a detour: the values under test are the
 * two attributes, and `setAttribute` puts them there without a parser in between deciding
 * how they are escaped.
 */
function parseSlideSection(attrs: Record<string, string>, text = 'Q3'): ReturnType<PMDOMParser['parse']> {
	const host = document.createElement('div');
	const section = document.createElement('section');
	section.className = 'cs-slide';
	for (const [k, v] of Object.entries(attrs)) section.setAttribute(k, v);
	const p = document.createElement('p');
	p.textContent = text;
	section.appendChild(p);
	host.appendChild(section);
	return PMDOMParser.fromSchema(deckSchema).parse(host);
}

/** Parse an already-built DOM subtree — the same-session round trip, which ProseMirror's
 *  clipboard parser takes as a node rather than a string. */
function parseElement(el: HTMLElement) {
	return PMDOMParser.fromSchema(deckSchema).parse(el);
}

/** The provenance token this session stamps — read back off our OWN serialized output,
 *  because it is deliberately not exported (nothing should be able to ask for it). */
function ownOrigin(): string {
	const doc = deckToDoc('<!-- _class: title -->\n\n# Hi');
	const host = document.createElement('div');
	host.appendChild(DOMSerializer.fromSchema(deckSchema).serializeFragment(doc.content));
	return host.querySelector('section.cs-slide')?.getAttribute('data-lattice-origin') ?? '';
}

const BEACON = '<!-- _backgroundImage: url(https://evil.example/beacon.png) -->';
// A directive carrying newlines: `composeSlideChunk` joins directives with `\n` and
// prepends them, so a newline here forges a slide boundary and smuggles a raw `<style>`
// element into the deck source — which the export writes out verbatim.
const FORGERY = '<!-- _class: x -->\n\n---\n\n<!-- _class: title -->\n\n# FORGED\n\n<style>body{background:url(https://evil.example/b.png)}</style>';

describe('the data-directives clipboard bridge rejects foreign input', () => {
	it('drops directives from HTML that carries no provenance token', () => {
		const doc = parseSlideSection({ 'data-pm-slice': '0 0 []', 'data-directives': JSON.stringify([BEACON]) });
		expect(doc.child(0).attrs.directives).toEqual([]);
		expect(docToDeck(doc)).not.toContain('evil.example');
	});

	it('drops directives from HTML that carries a FORGED provenance token', () => {
		const doc = parseSlideSection({ 'data-lattice-origin': 'forged', 'data-directives': JSON.stringify([BEACON]) });
		expect(doc.child(0).attrs.directives).toEqual([]);
		expect(docToDeck(doc)).not.toContain('evil.example');
	});

	it('drops a newline-bearing directive even when the token is genuine (shape gate)', () => {
		// Defense in depth: this is the case where the token leaks, or a future change
		// relaxes provenance. A directive is a SINGLE-LINE `<!-- _name: … -->` comment; one
		// carrying a newline could forge `---` boundaries or open a front-matter fence.
		const doc = parseSlideSection({ 'data-lattice-origin': ownOrigin(), 'data-directives': JSON.stringify(['<!-- _class: title -->', FORGERY]) });
		expect(doc.child(0).attrs.directives).toEqual(['<!-- _class: title -->']); // the legal one survives
		const src = docToDeck(doc);
		expect(src).not.toContain('FORGED');
		expect(src).not.toContain('<style>');
		expect(src.split('\n---\n')).toHaveLength(1); // no forged slide boundary
	});

	it('KEEPS the directives on a slide copied from this same session', () => {
		// The bridge has to still do its job, or the `_class` wipe comes back.
		const doc = deckToDoc('<!-- _class: title -->\n\n# Hi\n\n---\n\n<!-- _class: big-number -->\n\n- 42\n  - things');
		const div = document.createElement('div');
		div.appendChild(DOMSerializer.fromSchema(deckSchema).serializeFragment(doc.content));
		const round = parseElement(div);
		expect(round.childCount).toBe(2);
		expect(round.child(0).attrs.directives).toEqual(['<!-- _class: title -->']);
		expect(round.child(1).attrs.directives).toEqual(['<!-- _class: big-number -->']);
	});

	it('ignores a non-array, non-string, or malformed payload', () => {
		for (const payload of ['{}', '"a string"', 'not json at all', JSON.stringify([1, null, { a: 1 }])]) {
			const doc = parseSlideSection({ 'data-lattice-origin': ownOrigin(), 'data-directives': payload }, 'x');
			expect(doc.child(0).attrs.directives).toEqual([]);
		}
	});
});
