import { Fragment, type Node as PMNode, Schema } from 'prosemirror-model';
import segnoSlots from '../../../../lib/core/segno-slots.generated.js';
import { slideRanges } from '../deck-lint';
import { stripFrontMatter } from '../front-matter';
import { CLIP_ORIGIN } from './clip-origin';
import { latticeMarkdownSerializer, parseSlideProse, proseSchema, topLevelSpans } from './deck-markdown';
import { classNameOf, composeSlideChunk, hasLossyConstruct, normalizeSource, parseDeck, splitSlideDirectives } from './deck-source';

// The ONE-DOCUMENT model (Option B). The whole deck is a single ProseMirror
// document: `doc → slide+`, each `slide` a block container carrying its own
// `_class`/`_x` directives, the deck front-matter parked on the doc. Because it
// is one document, selection / copy / undo span slides natively — the thing N
// stacked editors structurally could not do — and a stray `---` typed in prose is
// just text: only the slide-node boundary makes a slide, so boundaries can't be
// corrupted (the containment win, kept, without the fragmentation).

const nodes = proseSchema.spec.nodes
	// `head` and `tail`: the bytes before the first slide and after the last, as written (a deck's trailing newline, a blank
	// line after the front matter). With each slide's `sep` they make an untouched deck emit its own bytes, not a
	// canonical spelling of them (2026-11-10-compose-first.md §6).
	.update('doc', { content: 'slide+', attrs: { frontMatter: { default: '' }, head: { default: '' }, tail: { default: '' } } })
	.addToEnd('slide', {
		content: 'block+',
		// `raw` = the slide's ORIGINAL source chunk, carried so an untouched slide can
		// be re-emitted byte-for-byte (never re-serialized → never degraded). Edit-local
		// emit: only a slide whose node identity changed is re-serialized (emitDeck).
		// `locked` = the prose carries a construct the Compose round-trip would corrupt
		// (table, block HTML, strikethrough, tasklist, footnote); the editor blocks edits
		// to a locked slide so its identity never changes → it always emits `raw`.
		// `sep` = the separator written before this slide (`\n\n---\n\n`, `\n---\n`, …), so the deck keeps the author's
		// spelling. A new or pasted slide has none and takes the canonical one; the FIRST slide's is never used (`head` is).
		attrs: { directives: { default: [] as string[] }, raw: { default: '' }, locked: { default: false }, sep: { default: '' } },
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
 * The provenance token guarding a pasted slide's directives now lives in `./clip-origin` — ONE
 * token for the whole editor, because `comment-block` needs the same guarantee for a comment's
 * text and a second, independently-generated token would mean two editors' worth of trust.
 *
 * Why it exists, kept here because this is where it was measured: `parseDOM` matches
 * `section.cs-slide` in ANY pasted HTML, including HTML from a page the author does not control.
 * Directive strings are not content — `composeSlideChunk` joins them and prepends them to the
 * slide's prose, so whatever a foreign page puts in `data-directives` lands in the DECK SOURCE and
 * from there in the exported artifact. Measured on the real Studio: a crafted `section.cs-slide`
 * carrying `<!-- _backgroundImage: url(https://evil.example/beacon.png) -->` pasted over one
 * slide-scoped selection put that URL into the exported HTML three times, with nothing visible in
 * Compose. A directive string containing newlines could also forge `---` slide boundaries and
 * smuggle a `<style>` block into the export.
 *
 * A shape check alone does not close it, because `_backgroundImage: url(…)` is a perfectly
 * well-formed, KNOWN directive. What separates the two cases is PROVENANCE.
 *
 * Cost, stated plainly: copying a slide between two Studio TABS no longer carries its `_class`.
 * That is the pre-bridge behavior for that path, and it is the safe direction — an author who
 * wants the class across tabs has the Markdown pane.
 */

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
// The `code` mark opts out of spellcheck. Inline code in a deck is notation — `{SHIPPED, c2}`,
// `~{12 14 17}`, `!{Ada Okafor, hair=coily}` — so a red squiggle under it reads as an error in
// the very syntax Compose is meant to hide. Prose keeps its spellcheck; Chrome and Safari honor
// `spellcheck="false"` on a descendant of a spellchecked editable.
const codeMark = proseSchema.spec.marks.get('code');
if (!codeMark) throw new Error("prosemirror-markdown's schema lost its `code` mark");
const marks = proseSchema.spec.marks.update('code', { ...codeMark, toDOM: () => ['code', { spellcheck: 'false' }] });
export const deckSchema = new Schema({ nodes, marks });

const EMPTY_PARAGRAPH = () => Fragment.from(deckSchema.nodes.paragraph.create());

/**
 * What sits around and between a deck's slides, as written: the bytes before the first (`head`) and after the last
 * (`tail`), and the separator before each slide (`seps[0]` is ''). All '' when the chunks do not line up with `raws`
 * (then the canonical spelling is used). The same chunking `parseDeck` uses, so range i is slide i's `raw`.
 */
export function deckFrame(source: string, raws: readonly string[]): { head: string; tail: string; seps: string[] } {
	const body = stripFrontMatter(normalizeSource(source));
	const ranges = raws.length ? slideRanges(body) : [];
	if (!ranges.length || ranges.length !== raws.length || !ranges.every((r, i) => body.slice(r.from, r.to) === raws[i])) return { head: '', tail: '', seps: raws.map(() => '') };
	return {
		head: body.slice(0, ranges[0].from),
		tail: body.slice(ranges[ranges.length - 1].to),
		seps: ranges.map((r, i) => (i > 0 ? body.slice(ranges[i - 1].to, r.from) : '')),
	};
}

/** The separator written before slide `i` of `doc` ('' for the first). */
export function slideSep(doc: PMNode, i: number): string {
	return i > 0 ? (doc.child(i).attrs.sep as string) || SEP : '';
}

/** A slide's prose → its block content in the deck schema. Bridged by JSON (the block node and mark names are the
 *  prose schema's, so it re-validates cleanly), with a chart slide's row lists tightened. */
function slideContent(prose: string, directives: string[]): Fragment {
	const json = tightenChartLists(parseSlideProse(prose).content.toJSON(), directives);
	const content = json ? Fragment.fromJSON(deckSchema, json) : EMPTY_PARAGRAPH();
	return content.childCount === 0 ? EMPTY_PARAGRAPH() : content;
}

/** Deck source → one ProseMirror document. Each slide's prose is parsed (lossless,
 *  markdown-it based) and bridged into a `slide` node carrying its directives; the
 *  front-matter rides on the doc. */
export function deckToDoc(source: string): PMNode {
	const { fm, slides } = parseDeck(source);
	const list = slides.length ? slides : [{ directives: [] as string[], prose: '', raw: '' }];
	const { head, tail, seps } = deckFrame(source, slides.map((x) => x.raw));
	const sepOf = (i: number) => seps[i] ?? '';
	const slideNodes = list.map((s, i) => {
		const content = slideContent(s.prose || '', s.directives);
		// `raw` carries the slide's original source chunk so an UNTOUCHED slide is
		// re-emitted byte-for-byte (never round-tripped through the serializer, so a
		// lossy construct — a table, math, raw HTML — on a slide the author never
		// touches can never degrade). `emitDeck` reads it via node identity. `locked`
		// marks a slide whose prose Compose can't round-trip losslessly (edit in Markdown).
		return deckSchema.nodes.slide.create({ directives: s.directives, raw: s.raw, locked: hasLossyConstruct(s.prose || ''), sep: sepOf(i) }, content);
	});
	return deckSchema.nodes.doc.create({ frontMatter: fm, head, tail }, slideNodes);
}

/**
 * The charts whose rows are a list Compose may tighten: the ones that read a row's `>`. That is
 * every chart whose row schema says a `>` under a row is its description (`rows.quotes` in its
 * manifest's `segno` block, the same test lib/core/chart-rows.js `DETAIL_CHARTS` makes), plus the two charts that read a
 * row's `>` through their own grammar (chart-rows.js `QUOTE_CHARTS`). Read from the generated
 * catalog because it requires nothing, which the dev server's CJS shim needs.
 */
const ROW_LIST_CHARTS = new Set<string>([
	...Object.entries(segnoSlots as Record<string, Record<string, { rows?: { quotes?: boolean } }>>)
		.filter(([, slots]) => Object.values(slots).some((slot) => slot.rows?.quotes === true))
		.map(([chart]) => chart),
	'flowchart',
	'state-chart',
]);

/**
 * A chart's rows are data, so a blank line between them means nothing: the chart draws the same
 * either way. Compose used to save a row's `>` description with blank lines around it, and those
 * made the whole list loose, so every later save kept a blank line between every row and the
 * card spaced its sublist apart (the owner's deck on #2690). On a chart slide every list is
 * marked tight when the slide is read, so the next save writes the rows back together. A slide
 * the author never touches still re-emits its own bytes (`raw`), so nothing changes unasked.
 */
function tightenChartLists(json: unknown, directives: string[]): unknown {
	const cls = directives.map(classNameOf).find(Boolean);
	if (!cls || !ROW_LIST_CHARTS.has(cls) || !Array.isArray(json)) return json;
	const walk = (node: { type?: string; attrs?: Record<string, unknown>; content?: unknown[] }) => {
		if (node.type === 'bullet_list' || node.type === 'ordered_list') node.attrs = { ...node.attrs, tight: true };
		for (const child of node.content ?? []) walk(child as typeof node);
	};
	for (const node of json) walk(node);
	return json;
}

export const SEP = '\n\n---\n\n';

/** The deck body from its slides' text: each slide after the first behind the separator it was written with (else the
 *  canonical one), the bytes before the first slide and after the last as they were. */
function joinSlides(doc: PMNode, parts: string[]): string {
	let body = (doc.attrs.head as string) || '';
	for (let i = 0; i < parts.length; i++) body += slideSep(doc, i) + parts[i];
	return body + ((doc.attrs.tail as string) || '');
}

/** Serialize ONE slide node → its source chunk (directives head + serialized prose).
 *  serialize(node) renders the node's CHILDREN — i.e. this slide's block prose. */
export function serializeSlideNode(slide: PMNode): string {
	const prose = latticeMarkdownSerializer.serialize(slide);
	const directives = (slide.attrs.directives as string[]) || [];
	return composeSlideChunk(directives, prose);
}

/** `serializeSlideNode`, written back faithfully where the slide was read from the deck (see `faithfulSlide`). The
 *  editor's write-back (`emitDeck`) uses it; `docToDeck` stays the plain canonical form. */
export function serializeSlideFaithfully(slide: PMNode): string {
	const prose = latticeMarkdownSerializer.serialize(slide);
	const directives = (slide.attrs.directives as string[]) || [];
	return faithfulSlide(slide, directives, prose) ?? composeSlideChunk(directives, prose);
}

// ── Faithful write-back (2026-11-10-compose-first.md §6) ──────────────────────
// Compose is the default editor, so an edit must change only what the author changed. The serializer writes ONE spelling
// of Markdown (`*em*`, `-` bullets, padded tables), and an edited slide used to go through it whole: one typed character
// rewrote every other line of the slide that the author had spelled another way. A slide that was read from the deck
// (`raw`) is now written back block by block: a block whose Markdown reads the same as one of the slide's original blocks
// keeps that block's original bytes, and the space between two original neighbors stays as written. Only the blocks the
// author changed go through the serializer. The result is checked: it must read back to what the canonical serializer
// would have written, else the canonical form is used, so fidelity never costs correctness.

type Original = { directives: string[]; prose: string; spans: Array<{ from: number; to: number }>; keys: string[] };
const ORIGINALS = new Map<string, Original | null>();

/** One block, written alone by the canonical serializer: the key two blocks are matched by. */
function blockKey(block: PMNode): string {
	return latticeMarkdownSerializer.serialize(deckSchema.nodes.slide.create(null, block)).replace(/\n+$/, '');
}

/** The slide `raw` was read from: its directives, its prose, each top-level block's span and key; null when the spans
 *  cannot be lined up with the parsed blocks. Cached by `raw` (an edited slide is re-read on every keystroke). */
function originalOf(raw: string): Original | null {
	if (ORIGINALS.has(raw)) return ORIGINALS.get(raw) ?? null;
	let out: Original | null = null;
	try {
		const { directives, prose } = splitSlideDirectives(raw);
		const content = slideContent(prose, directives);
		const spans = topLevelSpans(prose);
		if (prose && spans && spans.length === content.childCount) {
			// A block Compose changed on reading (a chart's row list made tight) is not what its bytes say: it is never kept
			// as written, so the save writes the change, as it always did. Its key cannot match any block.
			const read = parseSlideProse(prose).content;
			const keys: string[] = [];
			content.forEach((b, _o, i) => {
				const same = read.childCount === content.childCount && JSON.stringify(read.child(i).toJSON()) === JSON.stringify(b.toJSON());
				keys.push(same ? blockKey(b) : `\u0000changed-on-read ${i}`);
			});
			out = { directives, prose, spans, keys };
		}
	} catch {
		out = null;
	}
	if (ORIGINALS.size > 256) ORIGINALS.clear();
	ORIGINALS.set(raw, out);
	return out;
}

/** For each of `now`, the index of the original block it keeps (a longest common subsequence of keys), else -1. */
function alignBlocks(now: string[], was: string[]): number[] {
	const n = now.length;
	const m = was.length;
	const L: number[][] = Array.from({ length: n + 1 }, () => new Array<number>(m + 1).fill(0));
	for (let i = n - 1; i >= 0; i--) for (let j = m - 1; j >= 0; j--) L[i][j] = now[i] === was[j] ? L[i + 1][j + 1] + 1 : Math.max(L[i + 1][j], L[i][j + 1]);
	const at = new Array<number>(n).fill(-1);
	for (let i = 0, j = 0; i < n && j < m; ) {
		if (now[i] === was[j]) {
			at[i++] = j++;
		} else if (L[i + 1][j] >= L[i][j + 1]) i++;
		else j++;
	}
	// An edited block stands where the original it replaced stood: one unmatched block between the same two matched
	// neighbors (or ends) as one unmatched original takes that original's place, and so the spacing around it.
	const place = at.slice();
	for (let i = 0; i < n; i++) {
		if (place[i] !== -1) continue;
		const prev = i > 0 ? at[i - 1] : -1;
		const nextNow = i + 1 < n ? at[i + 1] : m;
		if (nextNow !== -1 && (i === 0 || prev !== -1) && nextNow - prev === 2) place[i] = prev + 1;
	}
	return place.map((p, i) => (at[i] === -1 && p !== -1 ? -(p + 2) : p));
}

/**
 * `canonical` with `raw`'s own lines put back wherever they say the same thing: lines of an edited block that the edit did
 * not touch (the other items of a list, the other rows of a table, its alignment row) keep their spelling. Only when the
 * original's canonical form has one line per written line, so the two line up.
 */
function keepLines(raw: string, wasCanonical: string, canonical: string): string {
	const rawLines = raw.split('\n');
	const was = wasCanonical.split('\n');
	if (rawLines.length !== was.length) return canonical;
	const now = canonical.split('\n');
	const at = alignBlocks(now, was);
	const sameShape = now.length === was.length;
	return now.map((line, i) => (at[i] >= 0 ? rawLines[at[i]] : respell(line, sameShape ? rawLines[i] : undefined))).join('\n');
}

/**
 * An edited line in the author's spelling where the serializer's differs only in form: a hard break the original line
 * wrote as two trailing spaces (the serializer writes a backslash), and a lone `~` (the serializer escapes every one, for a
 * strikethrough `~~` the engine reads only doubled). `faithfulSlide`'s read-back check rejects either if it changes the meaning.
 */
function respell(line: string, original: string | undefined): string {
	let out = line;
	const spaces = original?.match(/ {2,}$/)?.[0];
	if (spaces && out.endsWith('\\') && !out.endsWith('\\\\')) out = out.slice(0, -1) + spaces;
	return out.replace(/\\~/g, (m, i: number, str: string) => (str[i - 1] === '~' || str[i + 2] === '~' || str.slice(i + 2, i + 4) === '\\~' ? m : '~'));
}

/** The slide written back faithfully, or null to use the canonical form. `canonicalProse` is what the serializer wrote. */
function faithfulSlide(slide: PMNode, directives: string[], canonicalProse: string): string | null {
	const raw = slide.attrs.raw as string;
	if (!raw || slide.attrs.locked) return null;
	const o = originalOf(raw);
	if (!o) return null;
	const blocks: PMNode[] = [];
	slide.forEach((b) => {
		blocks.push(b);
	});
	// The canonical text, block by block IN CONTEXT: its spacing is right where a block changed (a record that hugs its
	// fence, a list right under its paragraph); the original's is right where two original neighbors still stand.
	const canon = canonicalProse.replace(/\n+$/, '');
	const spans = topLevelSpans(canon);
	if (!spans || spans.length !== blocks.length) return null;
	const place = alignBlocks(blocks.map(blockKey), o.keys);
	// place[i] >= 0: an original kept as written; <= -2: an edited block standing in original -(p + 2)'s place; -1: new.
	const orig = (p: number) => (p >= 0 ? p : p <= -2 ? -(p + 2) : -1);
	let prose = '';
	for (let i = 0; i < blocks.length; i++) {
		if (i > 0) {
			const a = orig(place[i - 1]);
			const b = orig(place[i]);
			prose += place[i - 1] >= 0 && place[i] >= 0 && b === a + 1 ? o.prose.slice(o.spans[a].to, o.spans[b].from) : canon.slice(spans[i - 1].to, spans[i].from);
		}
		const text = canon.slice(spans[i].from, spans[i].to);
		const p = orig(place[i]);
		prose += place[i] >= 0 ? o.prose.slice(o.spans[p].from, o.spans[p].to) : p >= 0 ? keepLines(o.prose.slice(o.spans[p].from, o.spans[p].to), o.keys[p], text) : text;
	}
	// It must say what the canonical form says; a spelling that would read differently in this context (a list item
	// that now continues the list above, a line that now opens a block) falls back.
	try {
		if (latticeMarkdownSerializer.serialize(deckSchema.nodes.slide.create(null, slideContent(prose, directives))) !== canonicalProse) return null;
	} catch {
		return null;
	}
	const same = directives.length === o.directives.length && directives.every((d, i) => d === o.directives[i]);
	const at = raw.indexOf(o.prose);
	if (same && at >= 0 && raw.indexOf(o.prose, at + 1) < 0) return raw.slice(0, at) + prose + raw.slice(at + o.prose.length);
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

/** Re-point an emit baseline at `doc`'s slide nodes WITHOUT touching the bytes it caches.
 *
 *  For a transaction that changes how a slide is REPRESENTED but not what it says: the inline-object
 *  pass turns `{SHIPPED, c2}` code spans into atom nodes that serialize back to the same bytes.
 *  Those slides get new node identities, and without this `emitDeck` would take each for an edited
 *  slide and re-serialize it, rewriting an untouched slide's bytes (a `*` bullet becoming `-`)
 *  merely because the deck was opened. The slide count must not have changed. */
export function rebaselineSlides(doc: PMNode, baseline: EmitBaseline): void {
	if (doc.childCount !== baseline.nodes.length) return;
	doc.forEach((slide, _offset, i) => {
		baseline.nodes[i] = slide;
	});
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
		parts[i] = cached !== undefined ? cached : serializeSlideFaithfully(slide);
		nextNodes[i] = slide;
	}
	baseline.nodes = nextNodes;
	baseline.raws = parts.slice();
	const body = joinSlides(doc, parts);
	const fm = (doc.attrs.frontMatter as string) || '';
	return fm ? fm + body : body;
}
