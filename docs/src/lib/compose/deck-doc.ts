import { Fragment, type Node as PMNode, Schema } from 'prosemirror-model';
import { latticeMarkdownSerializer, parseSlideProse, proseSchema } from './deck-markdown';
import { composeSlideChunk, hasLossyConstruct, parseDeck } from './deck-source';

// The ONE-DOCUMENT model (Option B). The whole deck is a single ProseMirror
// document: `doc → slide+`, each `slide` a block container carrying its own
// `_class`/`_x` directives, the deck front-matter parked on the doc. Because it
// is one document, selection / copy / undo span slides natively — the thing N
// stacked editors structurally could not do — and a stray `---` typed in prose is
// just text: only the slide-node boundary makes a slide, so boundaries can't be
// corrupted (the containment win, kept, without the fragmentation).

const nodes = proseSchema.spec.nodes
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
		// THE DIRECTIVES RIDE THE DOM, or copy/paste silently strips every slide's `_class`.
		// `toDOM`/`parseDOM` are the CLIPBOARD contract (ProseMirror serializes a copied slice
		// through the schema, not through the nodeView), so an attr this pair does not carry is
		// an attr a paste re-creates at its DEFAULT. With `directives` left off, ⌘A ⌘A ⌘C ⌘V
		// reproduced all seven slides of a deck with `directives: []` — every component
		// assignment gone, the whole deck flattened to plain `content`, in two keystrokes an
		// author reaches by habit. Pasting over one slide-scoped selection cost that one slide
		// its class the same way. Measured on the real Studio, not deduced.
		//
		// `raw` and `locked` are deliberately NOT carried. `raw` is the byte-exact source of a
		// slide the author has not touched, keyed by node IDENTITY in `emitDeck`'s baseline — a
		// pasted slide is a NEW node with no baseline entry, so it must re-serialize from its
		// content; carrying a stale `raw` would emit the bytes of the slide that was COPIED
		// rather than the one that was pasted. `locked` follows from the same reasoning: it is
		// the flag that says "always emit `raw`", so a pasted slide with no `raw` must not be
		// locked. Both defaults are correct here; only `directives` needed the bridge.
		toDOM: (node) =>
			[
				'section',
				{
					class: node.attrs.locked ? 'cs-slide cs-slide-locked' : 'cs-slide',
					'data-directives': JSON.stringify((node.attrs.directives as string[]) || []),
					// The provenance stamp. See CLIP_ORIGIN.
					'data-lattice-origin': CLIP_ORIGIN,
				},
				0,
			] as const,
		parseDOM: [{ tag: 'section.cs-slide', getAttrs: (dom: HTMLElement) => ({ directives: readDirectives(dom.getAttribute('data-directives'), dom.getAttribute('data-lattice-origin')) }) }],
	});

/**
 * A PER-SESSION token stamped on every slide this editor copies, and required before a
 * pasted slide's directives are believed.
 *
 * `parseDOM` matches `section.cs-slide` in ANY pasted HTML, including HTML from a page
 * the author does not control. Directive strings are not content: `composeSlideChunk`
 * joins them and prepends them to the slide's prose, so whatever a foreign page puts in
 * `data-directives` lands in the DECK SOURCE, and from there in the exported artifact.
 * Measured on the real Studio: a crafted `section.cs-slide` carrying
 * `<!-- _backgroundImage: url(https://evil.example/beacon.png) -->` pasted over one
 * slide-scoped selection put that URL into the exported HTML three times, with nothing
 * visible in Compose — directives are an attribute, not content, so the author sees only
 * the innocent paragraph. A directive string containing newlines could also forge `---`
 * slide boundaries and smuggle a `<style>` block into the export.
 *
 * A shape check alone does not close it, because `_backgroundImage: url(…)` is a
 * perfectly well-formed, KNOWN directive. What actually separates the two cases is
 * PROVENANCE: directives are trustworthy when they came out of this editor and never
 * otherwise. The token is random per page load, so a foreign document cannot carry a
 * valid one; a copy from this session round-trips, and anything else falls back to `[]`,
 * which is exactly the pre-bridge behavior and therefore no regression.
 *
 * Cost, stated plainly: copying a slide between two Studio TABS no longer carries its
 * `_class`. That is the pre-bridge behavior for that path, and it is the safe direction —
 * an author who wants the class across tabs has the Markdown pane.
 */
const CLIP_ORIGIN = (() => {
	try {
		const c = globalThis.crypto;
		if (c?.randomUUID) return c.randomUUID();
		if (c?.getRandomValues) return Array.from(c.getRandomValues(new Uint8Array(16)), (b) => b.toString(16).padStart(2, '0')).join('');
	} catch {
		/* no crypto (an old jsdom) — fall through */
	}
	// Last resort. Weaker, but it still has to be GUESSED by an attacker writing a static
	// page, and the fallback only runs where `crypto` is absent.
	return `l${Date.now().toString(36)}${Math.random().toString(36).slice(2)}`;
})();

/** One directive line, as this editor writes them: a single-line `<!-- _name: … -->` HTML
 *  comment. NEWLINES ARE THE POINT — a directive carrying one would forge a `---` slide
 *  boundary (or open a front-matter fence) when `composeSlideChunk` joins it into the source. */
const DIRECTIVE_SHAPE = /^<!--\s*_[A-Za-z][\w-]*:[^\n\r>]*-->$/;

/** Read the `data-directives` bridge back off a copied slide's DOM.
 *
 *  Two gates, and both are load-bearing. PROVENANCE (`data-lattice-origin` must be this
 *  session's token) is what makes foreign HTML inert. SHAPE is defense in depth for the
 *  case where the token leaks or a future change relaxes it: a directive that is not a
 *  single-line `<!-- _name: … -->` comment is dropped, so no pasted string can carry a
 *  newline into the deck source. Anything that fails either gate falls back to `[]` — the
 *  pre-bridge behavior, never an error. */
function readDirectives(raw: string | null, origin: string | null): string[] {
	if (!raw || origin !== CLIP_ORIGIN) return [];
	try {
		const v = JSON.parse(raw);
		if (!Array.isArray(v)) return [];
		return v.filter((d): d is string => typeof d === 'string' && d.length <= 512 && DIRECTIVE_SHAPE.test(d)).slice(0, 16);
	} catch {
		return [];
	}
}

/** The deck schema — prosemirror-markdown's block/mark set + table nodes, wrapped in slide nodes. */
export const deckSchema = new Schema({ nodes, marks: proseSchema.spec.marks });

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
export function serializeSlideNode(slide: PMNode): string {
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
