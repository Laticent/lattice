import { closeHistory, isHistoryTransaction } from 'prosemirror-history';
import { DOMSerializer, Fragment, type Node as PMNode } from 'prosemirror-model';
import { type EditorState, NodeSelection, Plugin, TextSelection, type Transaction } from 'prosemirror-state';
// DEFAULT imports: both are CommonJS leaves (docs/src/plugins/vite-cjs-lib-dev.mjs).
import paneCatalog from '../../../../lib/authoring/pane-lint.generated.js';
import paneSpec from '../../../../lib/core/pane-spec.js';
import { normalizeSourceText } from '../normalize-source-text';
import { parseSlideProse } from './deck-markdown';
import { hasLossyConstruct } from './deck-source';
import type { PaneMark, PaneNeeds } from './pane-needs';

// The panes of a `columns` / `rows` slide, read off the Compose document — so the editor can show
// each pane's component as a picker and its `###` title as a field
// (engineering/decisions/2026-09-28-generic-pane-layouts-authoring.md §7.2).
//
// ONE RULE FOR WHERE A PANE STARTS, and it is the kernel's. Where a pane starts is not obvious
// (§2.2: a `###` right under a marker titles it, any other top-level `###` starts a new `content`
// pane, a component that owns its `###`s keeps them), and the linter and the engine already agree
// on it through `scanPanes` (lib/core/pane-spec.js, pinned against the engine by
// test/unit/core/pane-contract.test.js). So this module does not re-derive it from nodes. It writes
// the slide's top-level blocks out as a stand-in text — each block as one line the scanner reads the
// same way (a comment as its source, a `###` as a `###`, a pill as a pill, anything else as a word)
// — runs the kernel on that text, and maps the lines it returns back to the blocks.

type Spec = { side?: number | false; stack?: number | false; host?: boolean; h3?: boolean };
const SPECS = (paneCatalog as { spec: Record<string, Spec> }).spec;

export type PaneDirection = 'side' | 'stack';

export type PaneInfo = {
	/** 0 or 1 — the engine renders two panes (a third folds into the second). */
	index: number;
	/** The component the pane renders (`content` when it names none). */
	cls: string;
	/** The pane's own words (`no-title`) and the component's modifiers, as the marker wrote them. */
	mods: string[];
	modifiers: string[];
	/** The pane's `_pane` marker block, when it has one: its child index in the slide. */
	marker: number | null;
	/** The pane's `###` title block, when it has one. */
	title: number | null;
	/** The block a new marker goes before when the pane has none: the `###` that starts it. A pill
	 *  above that `###` stays where it is, the tail of the pane before (the engine renders it there),
	 *  so the marker goes under it. */
	anchor: number;
	/** The pane's share of the slide, in percent (the `ratio-NN-NN` weight). */
	share: number;
};

export type SlidePanes = { direction: PaneDirection; panes: PaneInfo[] };

/** Whether a paragraph is a pill: one run of inline code and nothing else — code ONLY, as the
 *  kernel's `isPillLine` and the engine's code-only paragraph read it (a bold pill is not one). */
function isPill(node: PMNode): boolean {
	if (node.type.name !== 'paragraph' || node.childCount !== 1) return false;
	const only = node.firstChild;
	return !!only?.isText && only.marks.length === 1 && only.marks[0].type.name === 'code';
}

/** The lines the scanner reads a top-level block as. A comment keeps its source, line for line (a
 *  `_pane` marker IS a comment, and a multi-line note between a marker and its `###` must stay as
 *  many lines as it is, or the kernel's "only a pill between them" test reads it differently); a
 *  `###` stays a `###`, a pill a pill; everything else is a plain word, which is all the pane rule
 *  needs to know about it. */
function standIn(node: PMNode): string[] {
	if (node.type.name === 'comment') return String(node.attrs.text || '').split('\n');
	if (node.type.name === 'heading' && node.attrs.level === 3) return ['### title'];
	if (isPill(node)) return ['`pill`'];
	return ['text'];
}

/** The pane layout a slide's directives name (`columns` / `rows`), or null. */
export function paneDirectionOf(directives: string[]): PaneDirection | null {
	for (const d of directives) {
		const cls = paneSpec.classOf(d.trim());
		if (cls === null) continue;
		const layout = paneSpec.classLayout(cls);
		return layout ? (paneSpec.parseLayout(layout.spec).direction as PaneDirection) : null;
	}
	return null;
}

/** The panes of one Compose slide node, or null when it is not a pane slide with two panes. Both
 *  where each pane starts and which `###` titles it come from the kernel (`scanPanes`). */
const PANES_OF = new WeakMap<PMNode, SlidePanes | null>();
export function slidePanes(slide: PMNode): SlidePanes | null {
	// Nodes are immutable, so a slide's panes are memoized by node identity: the marker guard reads
	// every slide of two docs per transaction, and a 300-pane-slide deck cost 14.6ms a keystroke
	// before this (the second review's measurement).
	if (PANES_OF.has(slide)) return PANES_OF.get(slide) ?? null;
	const read = readSlidePanes(slide);
	PANES_OF.set(slide, read);
	return read;
}
function readSlidePanes(slide: PMNode): SlidePanes | null {
	const directives = (slide.attrs.directives as string[]) || [];
	if (!paneDirectionOf(directives)) return null;
	// The directives, a blank line, then each block's lines with a blank line between: the blank
	// lines keep each stand-in its own block, as the blocks are. `blockAt` maps a block's FIRST line
	// back to its child index; a pane start and a title are always a block's first line.
	const lines = [...directives.flatMap((d) => d.split('\n')), ''];
	const blockAt = new Map<number, number>();
	let k = 0;
	slide.forEach((child) => {
		blockAt.set(lines.length, k++);
		lines.push(...standIn(child), '');
	});
	// `specs` defaults to null in the kernel's signature, which the checker reads as its only type.
	const { split } = paneSpec.scanPanes(lines.join('\n'), SPECS as unknown as null);
	if (!split) return null;
	const { layout } = split;
	const block = (line: number | null) => (line === null ? null : (blockAt.get(line) ?? null));
	const panes: PaneInfo[] = split.panes.map((p: { cls: string; host?: string; mods: string[]; modifiers: string[]; line: number; heading: boolean; title: number | null }, index: number) => {
		const at = block(p.line) as number;
		return { index, cls: p.host ?? p.cls, mods: p.mods, modifiers: p.modifiers, marker: p.heading ? null : at, title: block(p.title), anchor: at, share: index === 0 ? layout.a : layout.b };
	});
	return { direction: layout.direction as PaneDirection, panes };
}

/** The components a pane of `direction` at `share` may hold, `content` first, the rest by name.
 *  A host (`columns`, `rows`) never goes inside a pane, and a component whose manifest says it
 *  does not fit that direction at that share is left out — the same `fits` the linter uses. */
export function paneChoices(direction: PaneDirection, share: number): string[] {
	const names = Object.keys(SPECS)
		.filter((name) => !SPECS[name].host && paneSpec.fits(SPECS[name], direction, share))
		.sort();
	return ['content', ...names.filter((n) => n !== 'content')];
}

/** The `_pane` marker an author writes for `cls`, keeping the pane's own `no-title`. A component's
 *  modifiers belong to that component, so they are dropped when the component changes. */
export function paneMarkerText(cls: string, mods: string[] = []): string {
	const words = [cls, ...mods.filter((w) => w === 'no-title')];
	return `<!-- _pane: ${words.join(' ')} -->`;
}

/** What a pane's place in the layout is called, for the Studio user who never sees the syntax. */
export function paneLabel(direction: PaneDirection, index: number): string {
	if (direction === 'stack') return index === 0 ? 'Top pane' : 'Bottom pane';
	return index === 0 ? 'Left pane' : 'Right pane';
}

/** The slide node at `slidePos` in `doc` and the position of its first child, or null. */
function slideAt(doc: PMNode, slidePos: number): { slide: PMNode; start: number } | null {
	const slide = doc.nodeAt(slidePos);
	return slide && slide.type.name === 'slide' ? { slide, start: slidePos + 1 } : null;
}

/** The position of child `k` of a node whose content starts at `start`. */
function childPos(parent: PMNode, start: number, k: number): number {
	let pos = start;
	for (let i = 0; i < k; i++) pos += parent.child(i).nodeSize;
	return pos;
}

/** Give pane `index` a `###` title right under its marker, with the placeholder selected so the
 *  first keystroke replaces it. Null when the pane already has a title or has no marker to sit
 *  under (a pane with neither starts at its `###`, so it always has one). */
export function addPaneTitle(state: EditorState, slidePos: number, index: number, text = 'Pane title'): Transaction | null {
	const at = slideAt(state.doc, slidePos);
	const info = at && slidePanes(at.slide);
	const pane = info?.panes[index];
	if (!at || !pane || pane.title !== null || pane.marker === null || paneSpec.ownsHeadings(SPECS, pane.cls)) return null;
	const pos = childPos(at.slide, at.start, pane.marker) + at.slide.child(pane.marker).nodeSize;
	const heading = state.schema.nodes.heading.create({ level: 3 }, state.schema.text(text));
	const tr = state.tr.insert(pos, heading);
	return tr.setSelection(TextSelection.create(tr.doc, pos + 1, pos + 1 + text.length));
}

/** Whether a pane of `cls` keeps every `###` as its own anatomy (`team-profile sides`), so it has
 *  no pane title to add. */
export function paneOwnsTitles(cls: string): boolean {
	return paneSpec.ownsHeadings(SPECS, cls);
}


// ── Changing what a pane holds ──────────────────────────────────────────────────────────────────
// Naming a different component does not by itself make a pane's content read as that component:
// "- A point" under `bar` draws no bars. So the Studio offers the change from the slide gallery,
// where each tile says what will happen BEFORE the author picks it — "Keeps your text" when the
// component can read the pane as it stands (`paneFit`), "Starts with an example" when it cannot,
// in which case the pane's body is swapped for that component's own starter (`paneStarter`) and
// an Undo is offered. The pane's title and the slide's Key Insight are never touched.

/** The child range `[from, to)` of pane `index`'s BODY: after its head (marker, title, a subtitle
 *  pill under the title) and before the next pane, less a trailing Key Insight, note or comment,
 *  which the engine gives to the slide. A pane that is nothing but those keeps them as its body. */
export function paneBodyRange(slide: PMNode, info: SlidePanes, index: number): { from: number; to: number } {
	const pane = info.panes[index];
	let from: number;
	if (pane.title !== null) {
		from = pane.title + 1;
		if (from < slide.childCount && isPill(slide.child(from))) from++;
	} else {
		from = (pane.marker ?? pane.anchor) + 1;
		while (from < slide.childCount && slide.child(from).type.name === 'comment') from++;
	}
	const next = info.panes[index + 1];
	let to = next ? (next.marker ?? next.anchor) : slide.childCount;
	const coda = (n: PMNode) => n.type.name === 'comment' || n.type.name === 'blockquote' || (n.type.name === 'paragraph' && /^—\s/.test(n.textContent));
	let end = to;
	while (end > from && coda(slide.child(end - 1))) end--;
	// A body of nothing but blockquotes and `— ` lines is the pane's OWN content, as the engine reads
	// it (lib/core/panes.js: a pane that is all coda-shaped keeps every block) — a quote and its
	// attribution are the quote component's body, not the slide's Key Insight. So all of it is the
	// body: leaving any behind would put it after the starter, where the engine hands it to the slide.
	if (end > from) to = end;
	return { from, to: Math.max(from, to) };
}

/** Whether `cls` can read pane `index`'s body as it stands: every slot its grammar requires is
 *  present (`needs`), a chart has a number to draw, and when the component's example marks every
 *  item (a trailing label, a leading figure, a picture, an arrow) the pane uses one of those marks, so a plain list is
 *  never offered as a contact card (pane-needs.ts `marksOf`). `doc` is the DOM document the schema's
 *  own `toDOM` serializes into, so the test runs on the same shapes the engine will see. */
export function paneFit(slide: PMNode, info: SlidePanes, index: number, needs: PaneNeeds, doc: Document): (cls: string) => 'keeps' | 'fresh' {
	const { from, to } = paneBodyRange(slide, info, index);
	const nodes: PMNode[] = [];
	for (let k = from; k < to; k++) if (slide.child(k).type.name !== 'comment') nodes.push(slide.child(k));
	const section = doc.createElement('section');
	if (nodes.length) section.append(DOMSerializer.fromSchema(slide.type.schema).serializeFragment(Fragment.from(nodes), { document: doc }));
	const hasNumber = [...section.querySelectorAll('code, td')].some((el) => /\d/.test(el.textContent || ''));
	const items = [...section.querySelectorAll('li')];
	const ownCode = (li: Element) => [...li.querySelectorAll('code')].some((code) => code.closest('li') === li);
	// An item's own line: its text less any nested list.
	const ownText = (li: Element) => [...li.childNodes].filter((n) => n.nodeName !== 'UL' && n.nodeName !== 'OL').map((n) => n.textContent || '').join('').trim();
	const topLevel = items.filter((li) => li.parentElement?.parentElement === section);
	const used: Record<PaneMark, boolean> = {
		label: topLevel.some(ownCode),
		figure: topLevel.some((li) => /^[^\p{L}\p{N}]{0,3}\p{N}/u.test(ownText(li))),
		picture: !!section.querySelector('img'),
		arrow: items.some((li) => /->|=>/.test(li.textContent || '')),
	};
	const matches = (sel: string) => {
		try {
			return !!section.querySelector(sel);
		} catch {
			return false;
		}
	};
	const current = info.panes[index].cls;
	const known = Object.keys(needs).length > 0;
	return (cls) => {
		// A component that owns its `###`s (team-profile) holds them as its own anatomy: under any
		// other they would start new panes, so leaving one always starts fresh.
		if (cls !== current && paneSpec.ownsHeadings(SPECS, current) && !paneSpec.ownsHeadings(SPECS, cls)) return 'fresh';
		// No needs map (the grammar failed to load at build): never replace the author's text on a
		// guess. The pick then only names the component, which loses nothing.
		if (!known) return 'keeps';
		const need = needs[cls];
		if (!need || !nodes.length) return 'fresh';
		const marked = !need.marks?.length || need.marks.some((m) => used[m]);
		return need.slots.every(matches) && (!need.numbers || hasNumber) && marked ? 'keeps' : 'fresh';
	};
}

/** A component's starter as a PANE body: its gallery skeleton less the slide's own parts — the
 *  directives, the `#`/`##` heading with the pills above and below it, and a closing Key Insight
 *  the component does not read as its own (`keepQuote`), which would become the slide's. */
export function paneStarter(skeleton: string, keepQuote: boolean): string {
	const lines = normalizeSourceText(String(skeleton || '')).split('\n');
	const isDirective = (l: string) => /^\s*<!--\s*_?[A-Za-z][\w-]*\s*:/.test(l) && l.trim().endsWith('-->');
	const pill = (l: string | undefined) => paneSpec.isPillLine(l || '');
	const body = lines.filter((l) => !isDirective(l));
	const h = body.findIndex((l) => /^ {0,3}#{1,2}(?:\s|$)/.test(l));
	if (h >= 0) {
		let a = h;
		let b = h + 1;
		while (a > 0 && (!body[a - 1].trim() || pill(body[a - 1]))) a--;
		while (b < body.length && !body[b].trim()) b++;
		if (pill(body[b])) b++;
		body.splice(a, b - a);
	}
	let text = body.join('\n').trim();
	if (!keepQuote) {
		const blocks = text.split(/\n{2,}/);
		while (blocks.length > 1 && /^>/.test(blocks[blocks.length - 1].trim())) blocks.pop();
		text = blocks.join('\n\n');
	}
	return text;
}

/** Whether Compose could edit a starter it inserted: one that holds a construct the round-trip
 *  would flatten (a checklist's state markers, a math formula) would lock the slide read-only the moment it landed. */
export function starterEditable(skeleton: string): boolean {
	return !hasLossyConstruct(paneStarter(skeleton, true));
}

export type PaneChoice = { cls: string; modifiers?: string[]; starter: string | null };

/** Make pane `index` hold `choice.cls`: rewrite (or write) its `_pane` marker, keeping `no-title`,
 *  with the look's modifiers; and when `choice.starter` is set, swap the pane's body for it. The
 *  title and the slide's Key Insight stay. Null when nothing would change. Carries the `paneOp`
 *  meta, the one transaction the marker guard lets remove or rewrite a marker. */
export function applyPaneChoice(state: EditorState, slidePos: number, index: number, choice: PaneChoice): Transaction | null {
	const at = slideAt(state.doc, slidePos);
	const info = at && slidePanes(at.slide);
	const pane = info?.panes[index];
	if (!at || !info || !pane) return null;
	const picked = (choice.modifiers || []).filter((w) => /^[a-z][a-z0-9-]*$/.test(w));
	// The pane's own component picked again with no look of its own keeps the look it has.
	const modifiers = choice.cls === pane.cls && !picked.length ? pane.modifiers : picked;
	const sameMarker = pane.cls === choice.cls && modifiers.join(' ') === pane.modifiers.join(' ');
	if (sameMarker && choice.starter === null) return null;
	const tr = state.tr;
	// The body first: it sits after the marker, so replacing it moves nothing the marker needs.
	if (choice.starter !== null) {
		const { from, to } = paneBodyRange(at.slide, info, index);
		const parsed = parseSlideProse(choice.starter).content.toJSON();
		let content = parsed ? Fragment.fromJSON(state.schema, parsed) : Fragment.empty;
		// A speaker note (any comment) inside the replaced body is the author's, not the pane's
		// content: it survives, after the starter.
		for (let k = from; k < to; k++) if (at.slide.child(k).type.name === 'comment') content = content.addToEnd(at.slide.child(k));
		tr.replaceWith(childPos(at.slide, at.start, from), childPos(at.slide, at.start, to), content);
	}
	if (!sameMarker) {
		const words = [choice.cls, ...modifiers, ...pane.mods.filter((w) => w === 'no-title')];
		const marker = state.schema.nodes.comment.create({ text: `<!-- _pane: ${words.join(' ')} -->` });
		if (pane.marker !== null) {
			const pos = childPos(at.slide, at.start, pane.marker);
			tr.replaceWith(pos, pos + at.slide.child(pane.marker).nodeSize, marker);
		} else tr.insert(childPos(at.slide, at.start, pane.anchor), marker);
	}
	// Its own history step, so the notice's Undo takes back the pick and never typing just before it.
	return closeHistory(tr).setMeta(PANE_OP, true);
}

/** The meta a pane command sets so `paneMarkerGuard` lets it through. */
export const PANE_OP = 'cs-pane-op';

/** How many pane markers a doc holds, across its pane slides — what the guard compares. */
function markerCount(doc: PMNode): number {
	let n = 0;
	doc.forEach((slide) => {
		const info = slidePanes(slide);
		if (info) n += info.panes.filter((p) => p.marker !== null).length;
	});
	return n;
}

/**
 * Compose hides a pane's marker (the pane bar names the component in words), and an invisible
 * node is exactly the thing a stray keystroke deletes unseen: Backspace, Shift-Backspace,
 * Mod-Backspace, Delete, the mac Ctrl-h / Alt-Backspace / Ctrl-d chords, or arrowing onto the
 * selectable atom and typing. Binding each key would leave the next chord out, so this guards the
 * RESULT instead: a transaction that would leave a pane slide with fewer markers than it had is
 * refused, unless a pane command made it (`PANE_OP`) or the author's own selection was a range
 * that spanned more than the marker (a deliberate cut or delete of a whole pane). And a selection
 * that lands ON a hidden marker is moved off it, so typing never replaces it.
 */
export function paneMarkerGuard() {
	return new Plugin({
		filterTransaction(tr, state) {
			if (!tr.docChanged || tr.getMeta(PANE_OP) || isHistoryTransaction(tr)) return true;
			// Adding or removing whole slides is the structural guard's business, not this one's.
			if (tr.doc.childCount !== state.doc.childCount) return true;
			const sel = state.selection;
			if (!sel.empty && !(sel instanceof NodeSelection)) return true;
			return markerCount(tr.doc) >= markerCount(state.doc);
		},
		appendTransaction(_trs, old, state) {
			const sel = state.selection;
			if (!(sel instanceof NodeSelection) || sel.node.type.name !== 'comment' || !/^<!--\s*_pane\s*:/.test(String(sel.node.attrs.text))) return null;
			// On in the direction of travel: ArrowUp onto a marker carries on up, or a keyboard user
			// could never arrow from the second pane into the first.
			const up = sel.from < old.selection.from;
			return state.tr.setSelection(TextSelection.near(state.doc.resolve(up ? sel.from : sel.to), up ? -1 : 1));
		},
	});
}
