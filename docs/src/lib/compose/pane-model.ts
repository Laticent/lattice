import type { Node as PMNode } from 'prosemirror-model';
import { type EditorState, TextSelection, type Transaction } from 'prosemirror-state';
// DEFAULT imports: both are CommonJS leaves (docs/src/plugins/vite-cjs-lib-dev.mjs).
import paneCatalog from '../../../../lib/authoring/pane-lint.generated.js';
import paneSpec from '../../../../lib/core/pane-spec.js';

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
export function slidePanes(slide: PMNode): SlidePanes | null {
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

/** Name pane `index`'s component: rewrite its `_pane` marker, or write one right above the `###`
 *  that starts a pane with none. Null when nothing changes —
 *  the slide is not a pane slide, the pane does not exist, or it already renders `cls`. */
export function setPaneComponent(state: EditorState, slidePos: number, index: number, cls: string): Transaction | null {
	const at = slideAt(state.doc, slidePos);
	const info = at && slidePanes(at.slide);
	const pane = info?.panes[index];
	if (!at || !pane || pane.cls === cls) return null;
	const marker = state.schema.nodes.comment.create({ text: paneMarkerText(cls, pane.mods) });
	if (pane.marker !== null) {
		const pos = childPos(at.slide, at.start, pane.marker);
		return state.tr.replaceWith(pos, pos + at.slide.child(pane.marker).nodeSize, marker);
	}
	return state.tr.insert(childPos(at.slide, at.start, pane.anchor), marker);
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

/** Whether child `k` of `slide` is a pane's `_pane` marker (the kernel's reading, not a regex). */
function isPaneMarker(slide: PMNode, k: number): boolean {
	return !!slidePanes(slide)?.panes.some((p) => p.marker === k);
}

/**
 * Two keystrokes would remove a hidden pane marker, and Compose hides it (the pane bar names the
 * component instead), so either would silently turn a pane back into `content` — the footgun the
 * comment pill was made visible to avoid (ComposeView.tsx, "Authoring comments"):
 *   - Backspace at the start of the block right under a marker: `joinBackward` deletes an atom
 *     before a textblock. (At the start of a list under a marker it LIFTS the list, which leaves the
 *     marker alone, so only a top-level textblock is guarded.)
 *   - Delete at the very end of the block right above a marker, at any depth: `joinForward` deletes
 *     the atom after a textblock, and from the end of a list it pulls the marker INTO the list, so
 *     the marker stops marking anything and the two panes' lists merge.
 * These commands swallow exactly those keystrokes; the picker is the way to change a pane's
 * component, and a selection across the marker still deletes it with everything else selected.
 */
export function keepPaneMarker(dir: 'backward' | 'forward') {
	return (state: EditorState): boolean => {
		const { $from, empty } = state.selection;
		if (!empty || $from.depth < 2 || !$from.parent.isTextblock) return false;
		const slide = $from.node(1);
		const k = $from.index(1);
		if (dir === 'backward') return $from.depth === 2 && $from.parentOffset === 0 && k > 0 && isPaneMarker(slide, k - 1);
		// At the very end of slide child k: the end of every node from the textblock up to it.
		for (let d = $from.depth; d >= 2; d--) {
			if (d === $from.depth ? $from.parentOffset !== $from.parent.content.size : $from.index(d) !== $from.node(d).childCount - 1) return false;
		}
		return k + 1 < slide.childCount && isPaneMarker(slide, k + 1);
	};
}
