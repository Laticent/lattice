import { schema as mdSchema } from 'prosemirror-markdown';
import { Fragment, type Node as PMNode, Schema } from 'prosemirror-model';
import { latticeMarkdownSerializer, parseSlideProse } from './deck-markdown';
import { composeSlideChunk, hasLossyConstruct, parseDeck } from './deck-source';

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
		// `raw` = the slide's ORIGINAL source chunk, carried so an untouched slide can
		// be re-emitted byte-for-byte (never re-serialized → never degraded). Edit-local
		// emit: only a slide whose node identity changed is re-serialized (emitDeck).
		// `locked` = the prose carries a construct the Compose round-trip would corrupt
		// (table, block HTML, strikethrough, tasklist, footnote); the editor blocks edits
		// to a locked slide so its identity never changes → it always emits `raw`.
		attrs: { directives: { default: [] as string[] }, raw: { default: '' }, locked: { default: false } },
		defining: true,
		toDOM: (node) => ['section', { class: node.attrs.locked ? 'cs-slide cs-slide-locked' : 'cs-slide' }, 0] as const,
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
		// `raw` carries the slide's original source chunk so an UNTOUCHED slide is
		// re-emitted byte-for-byte (never round-tripped through the serializer, so a
		// lossy construct — a table, math, raw HTML — on a slide the author never
		// touches can never degrade). `emitDeck` reads it via node identity. `locked`
		// marks a slide whose prose Compose can't round-trip losslessly (edit in Markdown).
		return deckSchema.nodes.slide.create({ directives: s.directives, raw: s.raw, locked: hasLossyConstruct(s.prose || '') }, content);
	});
	return deckSchema.nodes.doc.create({ frontMatter: fm }, slideNodes);
}

const SEP = '\n\n---\n\n';

/** Serialize ONE slide node → its source chunk (directives head + serialized prose).
 *  serialize(node) renders the node's CHILDREN — i.e. this slide's block prose. */
function serializeSlideNode(slide: PMNode): string {
	const prose = latticeMarkdownSerializer.serialize(slide);
	const directives = (slide.attrs.directives as string[]) || [];
	return composeSlideChunk(directives, prose);
}

/** One ProseMirror document → deck source. Every slide is (re)serialized — the simple,
 *  stateless form, used by tests and the resync equality check. The editor's hot path
 *  uses `emitDeck` instead, which only re-serializes slides that actually changed. */
export function docToDeck(doc: PMNode): string {
	const parts: string[] = [];
	doc.forEach((slide) => {
		parts.push(serializeSlideNode(slide));
	});
	const body = parts.join(SEP);
	const fm = (doc.attrs.frontMatter as string) || '';
	return fm ? fm + body : body;
}

/** An emit baseline: each slide node (by IDENTITY) paired with the exact source bytes it
 *  should emit. `emitDeck` compares against it so an untouched slide re-emits verbatim. */
export type EmitBaseline = { nodes: PMNode[]; raws: string[] };

/** Snapshot a fresh doc as an emit baseline. Seeds each slide's bytes from the `raw`
 *  attr `deckToDoc` carried (the slide's ORIGINAL source chunk) — so an untouched deck's
 *  per-slide bytes survive verbatim, never through the lossy serializer. (Inter-slide
 *  separators are re-emitted canonical `\n\n---\n\n`, so a deck authored with tight/odd
 *  separators normalizes those on first emit; each slide's own bytes are still exact.) */
export function initBaseline(doc: PMNode): EmitBaseline {
	const nodes: PMNode[] = [];
	const raws: string[] = [];
	doc.forEach((slide) => {
		nodes.push(slide);
		const raw = slide.attrs.raw as string;
		raws.push(raw || serializeSlideNode(slide));
	});
	return { nodes, raws };
}

/** One document → deck source, EDIT-LOCAL. A slide whose node identity still matches the
 *  baseline (untouched since the last emit) re-emits its cached bytes VERBATIM — so a
 *  lossy construct (table, math, raw HTML) on a slide the author never touched can never
 *  degrade, and a keystroke costs one slide's serialize, not the whole deck's. Only a
 *  slide that actually changed runs through the serializer.
 *
 *  Reuse is keyed on node IDENTITY through a `Map`, NOT on position — so an untouched
 *  slide stays byte-exact even when a sibling is inserted, deleted, or (via the editor's
 *  boundary guard, which should prevent this) merged and the slide count changes. The old
 *  positional `sameShape` shortcut flattened every untouched slide the instant the count
 *  moved (the adversarial trio's CRITICAL). `baseline` is advanced in place so the next
 *  keystroke is incremental too. */
export function emitDeck(doc: PMNode, baseline: EmitBaseline): string {
	const prev = new Map<PMNode, string>();
	for (let i = 0; i < baseline.nodes.length; i++) prev.set(baseline.nodes[i], baseline.raws[i]);
	const count = doc.childCount;
	const parts: string[] = new Array(count);
	const nextNodes: PMNode[] = new Array(count);
	for (let i = 0; i < count; i++) {
		const slide = doc.child(i);
		const cached = prev.get(slide);
		parts[i] = cached !== undefined ? cached : serializeSlideNode(slide);
		nextNodes[i] = slide;
	}
	baseline.nodes = nextNodes;
	baseline.raws = parts.slice();
	const body = parts.join(SEP);
	const fm = (doc.attrs.frontMatter as string) || '';
	return fm ? fm + body : body;
}
