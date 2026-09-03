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
 * Parse a LITERAL fragment of hostile HTML, exactly as a paste would.
 *
 * `DOMParser.parseFromString` into a detached document, never `el.innerHTML = html`: the
 * assignment form is a real sink and the fragment here never touches the live document.
 *
 * Every caller passes a string built from literals in this file. That matters to CodeQL's
 * "DOM text reinterpreted as HTML" rule, which follows a FLOW rather than a call: it fires
 * when DOM text reaches a markup sink, so a literal argument is inert while a value READ
 * back out of the DOM is not. The round-trip test below therefore parses an Element
 * directly (`parseElement`) instead of reading `innerHTML` and re-parsing it — the first
 * attempt at this fix swapped innerHTML for DOMParser and simply moved the alert down the
 * flow, because the source was never the sink.
 */
function parseForeign(html: string) {
	const parsed = new DOMParser().parseFromString(html, 'text/html');
	return PMDOMParser.fromSchema(deckSchema).parse(parsed.body);
}

/** Parse an already-built DOM subtree. ProseMirror's clipboard parser takes a node, so a
 *  same-session round trip does not need to detour through an HTML string at all. */
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
		const doc = parseForeign(`<section class="cs-slide" data-pm-slice="0 0 []" data-directives='${JSON.stringify([BEACON]).replace(/'/g, '&#39;')}'><p>Q3</p></section>`);
		expect(doc.child(0).attrs.directives).toEqual([]);
		expect(docToDeck(doc)).not.toContain('evil.example');
	});

	it('drops directives from HTML that carries a FORGED provenance token', () => {
		const doc = parseForeign(`<section class="cs-slide" data-lattice-origin="forged" data-directives='${JSON.stringify([BEACON]).replace(/'/g, '&#39;')}'><p>Q3</p></section>`);
		expect(doc.child(0).attrs.directives).toEqual([]);
		expect(docToDeck(doc)).not.toContain('evil.example');
	});

	it('drops a newline-bearing directive even when the token is genuine (shape gate)', () => {
		// Defense in depth: this is the case where the token leaks, or a future change
		// relaxes provenance. A directive is a SINGLE-LINE `<!-- _name: … -->` comment; one
		// carrying a newline could forge `---` boundaries or open a front-matter fence.
		const html = `<section class="cs-slide" data-lattice-origin="${ownOrigin()}" data-directives='${JSON.stringify(['<!-- _class: title -->', FORGERY]).replace(/'/g, '&#39;')}'><p>Q3</p></section>`;
		const doc = parseForeign(html);
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
			const doc = parseForeign(`<section class="cs-slide" data-lattice-origin="${ownOrigin()}" data-directives='${payload.replace(/'/g, '&#39;')}'><p>x</p></section>`);
			expect(doc.child(0).attrs.directives).toEqual([]);
		}
	});
});
