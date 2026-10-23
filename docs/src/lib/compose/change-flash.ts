import type { Node as PMNode } from 'prosemirror-model';
import { Plugin, PluginKey } from 'prosemirror-state';
import { Decoration, DecorationSet, type EditorView } from 'prosemirror-view';

// "Show what an outside change changed." An edit that lands from outside Compose (an AI apply, an Inspector
// stamp, an undo) re-imports the deck, so the author sees new words with no cue to where. This module finds the
// changed text and paints it for a moment: a tint with an accent rule on the line, a stronger tint on the exact
// words, then both fade. The paint is decorations only, so it never reaches the deck's bytes or the undo history.
// followups.d/2861-p3; engineering/decisions/2026-10-21-compose-point-and-click.md §8d.

export type FlashRange = { from: number; to: number };
export type FlashSpec = {
	/** The textblocks that changed: the whole line gets the tint and the rule. */
	blocks: FlashRange[];
	/** The inserted words inside a changed line. */
	spans: FlashRange[];
	/** Where words were deleted and nothing was inserted: a thin accent mark stands there. */
	gaps: number[];
};

/** More changed lines than this and the change is too wide to point at (a slide moved, a deck replaced), so nothing is painted. */
export const FLASH_MAX_BLOCKS = 8;

type Block = { pos: number; node: PMNode };

function textblocks(doc: PMNode): Block[] {
	const out: Block[] = [];
	doc.descendants((node, pos) => {
		if (node.isTextblock) {
			out.push({ pos, node });
			return false;
		}
		return true;
	});
	return out;
}

/** The part of `b` that differs from `a`, in `b`'s positions. `findDiffEnd` can report an end before the start when the change is a pure repeat of
 *  neighboring text ("ab" to "abab"), so the end is pushed out to the start. Null when the two are equal. */
function changedRange(b: PMNode['content'], a: PMNode['content']): FlashRange | null {
	const start = b.findDiffStart(a);
	if (start == null) return null;
	const end = b.findDiffEnd(a);
	if (!end) return { from: start, to: start };
	// `a` is the end in this fragment (the new one), `b` the end in the other.
	let { a: endNew, b: endOld } = end;
	if (endNew < start || endOld < start) {
		const overlap = start - Math.min(endNew, endOld);
		endNew += overlap;
		endOld += overlap;
	}
	return { from: start, to: Math.max(start, endNew) };
}

/** What changed between two versions of the deck, as ranges in `next`. Null when nothing can be pointed at: the docs are equal, or the change
 *  is wider than `FLASH_MAX_BLOCKS` lines, or it only removed whole blocks. */
export function diffFlash(prev: PMNode, next: PMNode): FlashSpec | null {
	if (prev.eq(next)) return null;
	const a = textblocks(prev);
	const b = textblocks(next);
	const spec: FlashSpec = { blocks: [], spans: [], gaps: [] };
	const mark = (nb: Block, ob: Block | null) => {
		spec.blocks.push({ from: nb.pos, to: nb.pos + nb.node.nodeSize });
		if (!ob) return;
		const r = changedRange(nb.node.content, ob.node.content);
		if (!r) return;
		const from = nb.pos + 1 + r.from;
		const to = nb.pos + 1 + r.to;
		if (to > from) spec.spans.push({ from, to });
		else spec.gaps.push(from);
	};
	if (a.length === b.length) {
		for (let i = 0; i < b.length; i++) {
			const nb = b[i] as Block;
			const ob = a[i] as Block;
			if (!nb.node.eq(ob.node)) mark(nb, ob);
			if (spec.blocks.length > FLASH_MAX_BLOCKS) return null;
		}
	} else {
		// A line was added or removed: every line after it shifts, so lines cannot be paired by position. Lines that are equal at the start and at the
		// end are the same lines; what sits between them changed. Words are pointed out only when one line replaced one line.
		const most = Math.min(a.length, b.length);
		let head = 0;
		while (head < most && (a[head] as Block).node.eq((b[head] as Block).node)) head++;
		let tail = 0;
		while (tail < most - head && (a[a.length - 1 - tail] as Block).node.eq((b[b.length - 1 - tail] as Block).node)) tail++;
		const was = a.slice(head, a.length - tail);
		const now = b.slice(head, b.length - tail);
		if (now.length === 0 || now.length > FLASH_MAX_BLOCKS) return null;
		if (now.length === 1 && was.length === 1) mark(now[0] as Block, was[0] as Block);
		else for (const t of now) spec.blocks.push({ from: t.pos, to: t.pos + t.node.nodeSize });
	}
	return spec.blocks.length ? spec : null;
}

type FlashMeta = { flash: FlashSpec } | { clear: true };
export const flashKey = new PluginKey<DecorationSet>('cs-flash');

function gapMark(): HTMLElement {
	const el = document.createElement('span');
	el.className = 'cs-flash-gap';
	el.setAttribute('aria-hidden', 'true');
	return el;
}

/** Held this long, then removed, when the author asked for reduced motion: the tint shows, with no fade. */
export const FLASH_STILL_MS = 1400;
/** The longest a flash stays if its animation never ends (a folded slide, a hidden pane draw nothing to end). */
const FLASH_LIMIT_MS = 7000;

/** The paint for a change. Feed it with `view.dispatch(tr.setMeta(flashKey, { flash: spec }))`; it removes itself when the CSS fade ends. */
export function changeFlashPlugin(opts: { onClear?: () => void } = {}) {
	return new Plugin<DecorationSet>({
		key: flashKey,
		state: {
			init: () => DecorationSet.empty,
			apply(tr, set) {
				const meta = tr.getMeta(flashKey) as FlashMeta | undefined;
				if (meta && 'clear' in meta) return DecorationSet.empty;
				if (meta && 'flash' in meta) {
					const decos: Decoration[] = [];
					for (const r of meta.flash.blocks) decos.push(Decoration.node(r.from, r.to, { class: 'cs-flash-block' }));
					for (const r of meta.flash.spans) decos.push(Decoration.inline(r.from, r.to, { class: 'cs-flash-span' }));
					for (const g of meta.flash.gaps) decos.push(Decoration.widget(g, gapMark, { side: -1, key: `cs-flash-gap-${g}` }));
					return DecorationSet.create(tr.doc, decos);
				}
				return set.map(tr.mapping, tr.doc);
			},
		},
		props: {
			decorations(state) {
				return flashKey.getState(state);
			},
		},
		view(editorView: EditorView) {
			let timer: ReturnType<typeof setTimeout> | undefined;
			const clear = () => {
				clearTimeout(timer);
				timer = undefined;
				if (editorView.isDestroyed || flashKey.getState(editorView.state) === DecorationSet.empty) return;
				editorView.dispatch(editorView.state.tr.setMeta(flashKey, { clear: true }));
				opts.onClear?.();
			};
			// The block fades first and the words fade last, so the flash is over when the last running fade ends.
			const onEnd = (e: Event) => {
				if (!(e as AnimationEvent).animationName?.startsWith('cs-flash-out')) return;
				const running = typeof editorView.dom.getAnimations === 'function' ? editorView.dom.getAnimations({ subtree: true }).some((x) => x.playState === 'running' && (x as CSSAnimation).animationName?.startsWith('cs-flash')) : false;
				if (!running) clear();
			};
			editorView.dom.addEventListener('animationend', onEnd);
			return {
				update(v, prevState) {
					const now = flashKey.getState(v.state);
					if (now === flashKey.getState(prevState) || !now || now === DecorationSet.empty) return;
					clearTimeout(timer);
					const still = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
					timer = setTimeout(clear, still ? FLASH_STILL_MS : FLASH_LIMIT_MS);
				},
				destroy() {
					clearTimeout(timer);
					editorView.dom.removeEventListener('animationend', onEnd);
				},
			};
		},
	});
}

/** The stylesheet for the paint. Colors come from the Studio's accent tokens, the same pair the note panel uses (a 2px accent rule on the leading edge,
 *  the soft accent tint). Timing comes from four variables on the host so a curve is a one-line change: `--cs-flash-in`, `--cs-flash-hold`,
 *  `--cs-flash-out` and `--cs-flash-lag` (the words start this much after the line). The chip sits just under the slide's sticky control bar for both directions: the bottom is where the undo toast lands. `data-flash-curve` on the host picks a named curve. */
export const CHANGE_FLASH_CSS = `
	.cs-host{--cs-flash-in:150ms;--cs-flash-hold:1200ms;--cs-flash-out:1600ms;--cs-flash-lag:80ms;--cs-flash-line:color-mix(in oklab,var(--accent,#006fa8),transparent 88%);--cs-flash-words:color-mix(in oklab,var(--accent,#006fa8),transparent 68%)}
	.cs-host[data-flash-curve=quick]{--cs-flash-in:100ms;--cs-flash-hold:500ms;--cs-flash-out:800ms;--cs-flash-lag:60ms}
	.cs-host[data-flash-curve=linger]{--cs-flash-in:200ms;--cs-flash-hold:2200ms;--cs-flash-out:2400ms;--cs-flash-lag:120ms}
	@keyframes cs-flash-in-line{from{background-color:transparent;box-shadow:inset 2px 0 0 transparent}to{background-color:var(--cs-flash-line);box-shadow:inset 2px 0 0 var(--accent,#006fa8)}}
	@keyframes cs-flash-out-line{from{background-color:var(--cs-flash-line);box-shadow:inset 2px 0 0 var(--accent,#006fa8)}to{background-color:transparent;box-shadow:inset 2px 0 0 transparent}}
	@keyframes cs-flash-in-words{from{background-color:transparent}to{background-color:var(--cs-flash-words)}}
	@keyframes cs-flash-out-words{from{background-color:var(--cs-flash-words)}to{background-color:transparent}}
	@keyframes cs-flash-in-mark{from{opacity:0}to{opacity:1}}
	@keyframes cs-flash-out-mark{from{opacity:1}to{opacity:0}}
	.cs-host .cs-flash-block{border-radius:4px;animation:cs-flash-in-line var(--cs-flash-in) ease-out both,cs-flash-out-line var(--cs-flash-out) ease-out calc(var(--cs-flash-in) + var(--cs-flash-hold)) forwards}
	.cs-host .cs-flash-span{border-radius:3px;animation:cs-flash-in-words var(--cs-flash-in) ease-out var(--cs-flash-lag) both,cs-flash-out-words var(--cs-flash-out) ease-out calc(var(--cs-flash-in) + var(--cs-flash-hold) + var(--cs-flash-lag)) forwards}
	.cs-host .cs-flash-gap{display:inline-block;width:0;height:1.1em;vertical-align:text-bottom;border-left:2px solid var(--accent,#006fa8);animation:cs-flash-in-mark var(--cs-flash-in) ease-out var(--cs-flash-lag) both,cs-flash-out-mark var(--cs-flash-out) ease-out calc(var(--cs-flash-in) + var(--cs-flash-hold) + var(--cs-flash-lag)) forwards}
	/* Reduced motion: the tint appears, holds, and is removed in one step (the plugin's timer). No fade. */
	@media (prefers-reduced-motion: reduce){
		.cs-host .cs-flash-block,.cs-host .cs-flash-span,.cs-host .cs-flash-gap{animation:none}
		.cs-host .cs-flash-block{background-color:var(--cs-flash-line);box-shadow:inset 2px 0 0 var(--accent,#006fa8)}
		.cs-host .cs-flash-span{background-color:var(--cs-flash-words)}
	}
	.cs-flash-chip{position:absolute;left:50%;top:96px;transform:translateX(-50%);z-index:30;padding:4px 12px;border:1px solid var(--accent,#006fa8);border-radius:999px;background:var(--bg,#fff);color:var(--accent,#006fa8);font:600 12px/1.4 var(--font-sans,system-ui,sans-serif);cursor:pointer;box-shadow:0 2px 8px -2px color-mix(in oklab,var(--accent,#006fa8),transparent 60%)}
	.cs-flash-chip:hover{background:var(--accent-soft,#eff6fc)}
	.cs-flash-chip:focus-visible{outline:2px solid var(--accent,#006fa8);outline-offset:2px}
`;
