// Cenno card — the optional standard anatomy, built from nodes the host supplies.
//
//   header: [lead] [title] [value]     a row: a small mark, the name, a trailing figure
//   body                               the description
//   footer                             a quiet last line (a source, a date)
//
// Each element carries `data-cenno-part` (and the same name as `part`, so a card mounted inside a
// shadow root can be styled with `::part()`). The names are public API: renaming one is a breaking
// change. Strings become text nodes, never parsed markup, so a host cannot inject HTML by accident.
// A host that wants its own structure skips this and hands `open` any node.

export interface CardParts {
	lead?: Node | string | null;
	title?: Node | string | null;
	value?: Node | string | null;
	body?: Node | string | null;
	footer?: Node | string | null;
}

/** Every part name a host can style. */
export const CARD_PARTS = ['card', 'arrow', 'content', 'header', 'lead', 'title', 'value', 'body', 'footer'] as const;
export type CardPart = (typeof CARD_PARTS)[number];

/** Give an element a part name, for `[data-cenno-part=…]` and `::part(…)`. */
export function markPart(el: Element, name: CardPart): void {
	el.setAttribute('data-cenno-part', name);
	el.setAttribute('part', name);
}

function partEl(doc: Document, name: CardPart, value: Node | string): HTMLElement {
	const el = doc.createElement('div');
	markPart(el, name);
	el.append(typeof value === 'string' ? doc.createTextNode(value) : value);
	return el;
}

const given = (v: Node | string | null | undefined): v is Node | string => v != null && v !== '';

/** Build the standard anatomy. Parts left out are not rendered at all. */
export function buildCard(doc: Document, parts: CardParts): DocumentFragment {
	const frag = doc.createDocumentFragment();
	if (given(parts.lead) || given(parts.title) || given(parts.value)) {
		const header = doc.createElement('div');
		markPart(header, 'header');
		if (given(parts.lead)) header.append(partEl(doc, 'lead', parts.lead));
		if (given(parts.title)) header.append(partEl(doc, 'title', parts.title));
		if (given(parts.value)) header.append(partEl(doc, 'value', parts.value));
		frag.append(header);
	}
	if (given(parts.body)) frag.append(partEl(doc, 'body', parts.body));
	if (given(parts.footer)) frag.append(partEl(doc, 'footer', parts.footer));
	return frag;
}

/** True for a parts object, false for a DOM node. */
export function isParts(v: unknown): v is CardParts {
	return v != null && typeof v === 'object' && typeof (v as Node).nodeType !== 'number';
}
