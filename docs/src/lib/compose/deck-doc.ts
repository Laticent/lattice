import { schema as mdSchema } from 'prosemirror-markdown';
import { Fragment, type Node as PMNode, Schema } from 'prosemirror-model';
import { latticeMarkdownSerializer, parseSlideProse } from './deck-markdown';
import { composeSlideChunk, parseDeck } from './deck-source';

// The ONE-DOCUMENT model (Option B). The whole deck is a single ProseMirror
// document: `doc → slide+`, each `slide` a block container carrying its own
// `_class`/`_x` directives, the deck front-matter parked on the doc. Because it
// is one document, selection / copy / undo span slides natively — the thing N
// stacked editors structurally could not do — and a stray `---` typed in prose is
// just text: only the slide-node boundary makes a slide, so boundaries can't be
// corrupted (the containment win, kept, without the fragmentation).

const nodes = mdSchema.spec.nodes
	.update('doc', { content: 'slide+', attrs: { frontMatter: { default: '' } } })
	.addToEnd('slide', {
		content: 'block+',
		attrs: { directives: { default: [] as string[] } },
		defining: true,
		toDOM: () => ['section', { class: 'cs-slide' }, 0] as const,
		parseDOM: [{ tag: 'section.cs-slide' }],
	});

/** The deck schema — prosemirror-markdown's block/mark set, wrapped in slide nodes. */
export const deckSchema = new Schema({ nodes, marks: mdSchema.spec.marks });

const EMPTY_PARAGRAPH = () => Fragment.from(deckSchema.nodes.paragraph.create());

/** Deck source → one ProseMirror document. Each slide's prose is parsed (lossless,
 *  markdown-it based) and bridged into a `slide` node carrying its directives; the
 *  front-matter rides on the doc. */
export function deckToDoc(source: string): PMNode {
	const { fm, slides } = parseDeck(source);
	const list = slides.length ? slides : [{ directives: [] as string[], prose: '', raw: '' }];
	const slideNodes = list.map((s) => {
		const proseDoc = parseSlideProse(s.prose || '');
		// Bridge the parsed block content into the deck schema by JSON — the block
		// node + mark names are identical, so it re-validates cleanly.
		const json = proseDoc.content.toJSON();
		let content = json ? Fragment.fromJSON(deckSchema, json) : EMPTY_PARAGRAPH();
		if (content.childCount === 0) content = EMPTY_PARAGRAPH();
		return deckSchema.nodes.slide.create({ directives: s.directives }, content);
	});
	return deckSchema.nodes.doc.create({ frontMatter: fm }, slideNodes);
}

/** One ProseMirror document → deck source. Each slide node serializes its prose
 *  (bullets as `-`), re-wraps its directives, joins on the canonical separator, and
 *  the front-matter is re-attached verbatim. */
export function docToDeck(doc: PMNode): string {
	const parts: string[] = [];
	doc.forEach((slide) => {
		// serialize(node) renders the node's CHILDREN — i.e. this slide's block prose.
		const prose = latticeMarkdownSerializer.serialize(slide);
		const directives = (slide.attrs.directives as string[]) || [];
		parts.push(composeSlideChunk(directives, prose));
	});
	const body = parts.join('\n\n---\n\n');
	const fm = (doc.attrs.frontMatter as string) || '';
	return fm ? fm + body : body;
}
