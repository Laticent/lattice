// THE PLAYGROUND'S FOCUS SYNC — one hub joins the editor, the preview and the slide map, and an
// alignment keeps the editor and the preview scrolled together.
//
// Before this, the Playground kept two unconnected answers to "which slide is the reader on": the
// caret moved the preview through a regex scanner over the preview's own text (`caretSlideIndex`)
// and a 140 ms timer, and the slide map ran a Fuoco hub of its own that the editor never heard. So
// scrolling the preview moved the map and nothing else.
//
// This module owns the one hub (docs/src/lib/fuoco) and the rules for who moves whom:
//
//   EITHER PANE DRIVES THE OTHER.
//     Scrolling the preview scrolls the editor, and scrolling the editor scrolls the preview, by one
//     map between their scroll positions (fuoco/align.ts): the first slide is level at the top, the
//     last at the bottom, every slide between centered in both. The slide the scrolled pane is on is
//     marked in BOTH: a band over its lines in the editor (`---` fences included) and an outline
//     around it in the preview.
//
//   THE CARET IS THE READER'S, AND PARKS.
//     A scroll in either pane changes what is VIEWED, never where the caret is. The next key the
//     reader presses in the editor reports the caret, the hub sees it is on a different slide, and
//     the marks return to it; CodeMirror scrolls its own caret into view, which drives the preview
//     back. Nothing is stored for that: CodeMirror holds the caret, and the hub learns of it again
//     on the next report.
//
//   A PICK MOVES THE CARET.
//     A click on a slide in the preview, or on a tile in the map, is an intent to edit that slide:
//     the caret goes to the end of its title, and the alignment puts its text beside its picture.
//
// Origins say who moved: 'editor' (a caret move or an edit), 'editor-view' (the editor scrolled),
// 'preview' (the preview scrolled, or a walk step), 'preview-pick' (a click on a slide), 'rail' (a
// map tile). A pane never reacts to its own origin.
//
// ECHOES. Setting a pane's scroll makes that pane scroll, and its scroll event would drive the
// other pane straight back. Each move records where it landed (`echo`), and the event that arrives
// at that position within a moment is the move's own and is dropped.
//
// TWO TEXTS. The hub holds the editor's live text; the rendered index (rendered-index.ts) is about
// the text last RENDERED, which trails typing by a debounce. A flat slide number means the same
// thing in both only when the two texts are equal, so every use of the index checks that first.
// While they differ the panes are left where they are, and the render that lands realigns them.
//
// This file imports no DOM and no React: everything it touches comes in through `SyncPorts`, so the
// rules above run under a fake in a unit test (playground-sync.test.ts).

import { deckFrame, deckTitleEnd } from './deck-outline/deck-frame';
import { centeredAt, createScrollMap, maxScroll, type ScrollMap, sectionAt, type ViewLayout } from './fuoco/align';
import type { FocusHub } from './fuoco/hub';
import { partCount, partOfFlat } from './fuoco/outline';
import { flatOfPage, pageOfFlat, type RenderedIndex } from './rendered-index';

/** A view's measurements and where it is scrolled. */
export type ScrolledLayout = ViewLayout & { scroll: number };

/** What the sync asks of the editor. A subset of `EditorAdapter` (components/playground/EditorHost.tsx). */
export interface SyncEditor {
	setBand(range: { from: number; to: number } | null): void;
	revealSlide(at: { from: number; to: number; caret: number; grab?: boolean; frame?: boolean }): void;
	getLayout(ranges: ReadonlyArray<{ from: number; to: number }>): ScrolledLayout;
	getScroll(): number;
	setScroll(y: number): number;
}

export interface SyncPorts {
	editor(): SyncEditor | null;
	/** The preview's pages grouped by deck part (`RenderedIndex.byFlat`): one section per part, from its first
	 *  page's top to its last page's bottom. Null when the preview cannot be measured (collapsed, not laid out). */
	previewLayout(groups: readonly (readonly number[])[]): ScrolledLayout | null;
	/** Where the preview is scrolled, without measuring anything else. */
	previewScroll(): number;
	/** Scroll the preview to `y`, at once. Returns where it landed. */
	setPreviewScroll(y: number): number;
	/** Mark these pages of the preview as the slide in focus (none: clear the mark). */
	markPages(pages: readonly number[] | null): void;
	/** Bring the preview to `page` the way a pick asks: centered, animated unless `instant`. Returns false when the
	 *  preview cannot move yet (collapsed, not laid out): the sync does not retry. */
	show(page: number, opts: { instant: boolean }): boolean;
	/** The Edit view is showing: the editor's text IS the deck. In Explore the preview can show something the
	 *  editor does not hold (a component's gallery, a plan step), so the render is the text of record. */
	editing(): boolean;
	/** The Edit view with its preview on screen: the only time a click on a slide is a pick. */
	active(): boolean;
	/** Whether a pick may place a caret: false when the editor is not on screen (a phone's single pane). */
	canPick(): boolean;
	now(): number;
	raf(cb: () => void): number;
	cancelRaf(id: number): void;
}

export interface PlaygroundSync {
	/** The editor's text changed. `span` is its own account of the edit. */
	edited(text: string, span?: { from: number; toA: number; toB: number }): void;
	/** The editor's caret moved; `user` says the reader did it. */
	selected(at: { head: number; anchor: number; line: string; user: boolean }): void;
	/** A render landed: `source` is its text, `getIndex` the lazy rendered index. `patched`: the frame kept its
	 *  document. A full write has not replaced it yet (the frame still shows the outgoing one), so nothing may
	 *  scroll until `loaded()`. */
	rendered(source: string, getIndex: (() => Promise<RenderedIndex> | null) | null, patched: boolean): void;
	/** The reader is leaving Edit for Explore. Returns the slide (flat part number) Explore should open on, the one the
	 *  caret is in, or -1 when there is none. The caret stays where it is. */
	enterExplore(): number;
	/** The reader clicked page `page` of the Explore preview. */
	exploreClicked(page: number): void;
	/** The reader is back in Edit. A click in Explore on a slide other than the caret's puts the caret at the end of
	 *  that slide's title; without one the caret and the editor stay exactly as they were. */
	leaveExplore(): void;
	/** The preview scrolled. */
	previewScrolled(): void;
	/** The editor scrolled. */
	editorScrolled(): void;
	/** The preview mounted or replaced slides: put the focus mark back on the right ones. */
	remark(): void;
	/** The reader clicked the slide on `page` of the preview. */
	picked(page: number, opts: { grab: boolean }): void;
	/** A new preview document loaded: realign it with the editor if that was waiting. Returns whether it was. */
	loaded(): boolean;
	/** True while a realign is waiting for the preview or its index. */
	pending(): boolean;
	destroy(): void;
}

/** A pick scrolls the preview, and a scroll in flight passes through every slide on the way. Until it
 *  has been still this long (or `MAX_OWN_MS` has passed) the preview scroll still moves the editor, but does
 *  not report a new focus, so it cannot move the focus off the slide the reader just asked for. */
const SETTLE_MS = 160;
const MAX_OWN_MS = 1500;
/** A scroll on a pane this soon after the sync moved it is that move's own (see `isEcho`). */
const ECHO_MS = 250;
/** Frames this far apart mean the page is dropping them; following on every one of those is what drops them. */
const FRAME_SLOW_MS = 24;
/** Gaps longer than this are a reader who stopped and started again, not a struggling page. */
const FRAME_IDLE_MS = 250;
/** While frames are slow, the follower pane is moved at most this often (about 30 per second). */
const FOLLOW_GAP_MS = 33;
/** An editor scroll this soon after a caret move is the caret being scrolled into view, not the reader scrolling. */
const CARET_SCROLL_MS = 400;

/** An extent ends one past its last character, which for a section that closes on a line break is the
 *  start of the NEXT line. The editor takes lines by offset, so hand it the last character instead. */
const lastChar = (e: { from: number; to: number }) => Math.max(e.from, e.to - 1);

interface Pair {
	ed: ScrolledLayout;
	pv: ScrolledLayout;
	map: ScrollMap;
	ix: RenderedIndex;
}

export function createPlaygroundSync(hub: FocusHub, ports: SyncPorts): PlaygroundSync {
	let index: RenderedIndex | null = null;
	let indexSource: string | null = null;
	let renderedSource: string | null = null;
	let owed = false;
	let awaitingLoad = false;
	let ownUntil = 0;
	let lastPreviewScroll = 0;
	/** When the reader last moved the caret or typed. The editor scrolling right after is CodeMirror bringing the
	 *  caret into view, and the caret, not the scroll, names the slide. */
	let lastCaretMove = -Infinity;
	/** When the text last changed by typing, and the slide the focus was on before the move being handled. */
	let lastEdit = -Infinity;
	/** When the caret last centered the preview. The editor scrolling right after is CodeMirror following the same caret. */
	let lastCenter = -Infinity;
	/** The slide the caret was in when Explore opened, and the page the reader last clicked there (-1: none). */
	let caretFlat = -1;
	let exploreClick = -1;
	/** When the last scroll frame ran and when the last follower move happened (see `followNow`). */
	let lastDrive = -Infinity;
	let lastFollow = -Infinity;
	let slow = false;
	let lastFlat = -1;
	let previewRaf = 0;
	let settleRaf = 0;
	let editorRaf = 0;
	let bandRaf = 0;
	let bandKey = '';
	let epoch = 0;
	let dead = false;
	const echo: { editor: { y: number; at: number } | null; preview: { y: number; at: number } | null } = { editor: null, preview: null };
	let rangesRev = -1;
	let ranges: Array<{ from: number; to: number }> = [];

	/** The index, when it describes the text the hub holds. */
	function usable(): RenderedIndex | null {
		const ol = hub.outline();
		return index && ol && indexSource === ol.source ? index : null;
	}

	/** Each part's lines in the editor, in flat order. Built once per revision of the text. */
	function rangesOf(): Array<{ from: number; to: number }> | null {
		const ol = hub.outline();
		if (!ol) return null;
		if (rangesRev !== ol.rev) {
			ranges = [];
			for (let flat = 0, n = partCount(ol); flat < n; flat++) {
				const at = partOfFlat(ol, flat);
				const ext = at && deckFrame(ol as Parameters<typeof deckFrame>[0], at.unit, at.part);
				ranges.push(ext ? { from: ext.from, to: lastChar(ext) } : { from: 0, to: 0 });
			}
			rangesRev = ol.rev;
		}
		return ranges;
	}

	/** Both panes' layouts and the map between them, when the two describe the same sections. */
	function pair(): Pair | null {
		if (!ports.editing()) return null;
		const ix = usable();
		const ed = ports.editor();
		if (!ix || !ed) return null;
		const rs = rangesOf();
		if (!rs?.length || ix.byFlat.length !== rs.length) return null;
		const pv = ports.previewLayout(ix.byFlat);
		if (!pv || pv.tops.length !== rs.length) return null;
		const el = ed.getLayout(rs);
		return { ed: el, pv, map: createScrollMap(el, pv), ix };
	}

	function paintBand(f = hub.get()) {
		const ol = hub.outline();
		const ed = ports.editing() ? ports.editor() : null;
		if (!ol || !ed || f.unitIndex < 0) return;
		const key = `${ol.rev}:${f.unitIndex}:${f.part}`;
		if (key === bandKey) return;
		const ext = deckFrame(ol as Parameters<typeof deckFrame>[0], f.unitIndex, f.part);
		if (!ext) return;
		bandKey = key;
		ed.setBand({ from: ext.from, to: lastChar(ext) });
	}

	/** Mark the focused slide's pages in the preview. */
	function paintMark(f = hub.get()) {
		if (!ports.editing()) return ports.markPages(null);
		const ix = usable();
		// Typing runs ahead of the render, and until it lands the index describes older text: leave the mark where it
		// is rather than blink it off on every keystroke. The render that lands paints it again.
		if (!ix) return;
		ports.markPages(f.unitIndex >= 0 ? (ix.byFlat[f.flat] ?? null) : null);
	}

	/** Say which slide a scrolled pane is on, unless that is already the focus. */
	function report(flat: number, origin: 'preview' | 'editor-view') {
		const ol = hub.outline();
		const at = ol && flat >= 0 ? partOfFlat(ol, flat) : null;
		if (at && flat !== hub.get().flat) hub.reportUnit(origin, { unitIndex: at.unit, part: at.part });
	}

	/** A scroll on a pane within a moment of this sync scrolling it is the move's own: the browser's scroll event,
	 *  or CodeMirror re-anchoring after it measured lines it had only estimated. Attributed by TIME, not position, and
	 *  kept for the whole window: a position match breaks when CodeMirror moves `scrollTop` after our write, and
	 *  consuming it on the first event let a stale event eat a newer move's echo (the editor stepped backward under a
	 *  wheel, and a big jump yanked the preview). A reader scrolls one pane at a time, so the pane we just moved is
	 *  not the one they are scrolling. */
	const isEcho = (e: { y: number; at: number } | null) => e !== null && ports.now() - e.at < ECHO_MS;

	/** Note that a scroll event arrived. A scroll event comes once per frame, so the gap between two of them says
	 *  whether the page is keeping up: a gap over a frame and a half means it is dropping frames. */
	function noteScroll() {
		const t = ports.now();
		const dt = t - lastDrive;
		lastDrive = t;
		slow = dt > FRAME_SLOW_MS && dt < FRAME_IDLE_MS;
	}

	/** Whether this scroll frame should move the follower pane. A follower redraw (CodeMirror re-rendering lines, the
	 *  filmstrip mounting slides) is the cost of the whole feature, and it is paid on every frame. While frames are
	 *  already coming slowly the follower moves at most every `FOLLOW_GAP_MS` instead, so the page gets its frame
	 *  budget back; the caller runs the skipped frame again on the next one, so the follower always lands where the
	 *  reader stopped. */
	function followNow(): boolean {
		const t = ports.now();
		if (slow && t - lastFollow < FOLLOW_GAP_MS) return false;
		lastFollow = t;
		return true;
	}

	/** The preview scrolled: the editor follows, and the slide it is on becomes the focus. */
	function drivenByPreview() {
		previewRaf = 0;
		if (dead || !ports.active()) return;
		// The echo of our own move is the common case, and the cheap one to recognize: do it before measuring anything.
		if (isEcho(echo.preview)) return;
		if (!followNow()) {
			if (!previewRaf) previewRaf = ports.raf(drivenByPreview);
			return;
		}
		const L = pair();
		if (!L) return;
		const ed = ports.editor();
		const target = L.map.toA(L.pv.scroll);
		if (ed && Math.abs(target - L.ed.scroll) >= 1) echo.editor = { y: ed.setScroll(target), at: ports.now() };
		// A pick's own scroll passes through slides on the way; it moves the editor along but names no new focus
		// until the preview has been still for a moment, and then names the slide it stopped on.
		if (settling()) {
			if (!settleRaf) settleRaf = ports.raf(settle);
			return;
		}
		report(sectionAt(L.pv, L.pv.scroll), 'preview');
	}

	const settling = () => ports.now() < ownUntil && ports.now() - lastPreviewScroll < SETTLE_MS;

	/** Wait out a pick's scroll (or the reader's, if it came during one), then name the slide the preview stopped on. */
	function settle() {
		settleRaf = 0;
		if (dead || !ports.active()) return;
		if (settling()) {
			settleRaf = ports.raf(settle);
			return;
		}
		const L = pair();
		if (L) report(sectionAt(L.pv, L.pv.scroll), 'preview');
	}

	/** The editor scrolled: the preview follows, and the slide it is on becomes the focus. */
	function drivenByEditor() {
		editorRaf = 0;
		if (dead || !ports.editing()) return;
		if (isEcho(echo.editor)) return;
		// A pick's smooth scroll is still carrying the preview: whatever the editor does meanwhile is a follower
		// re-anchoring, and driving the preview from it cancels the pick halfway.
		if (settling()) return;
		if (!followNow()) {
			if (!editorRaf) editorRaf = ports.raf(drivenByEditor);
			return;
		}
		// The caret just centered the preview; the editor scrolling to show that caret must not pull it elsewhere.
		if (ports.now() - lastCenter < CARET_SCROLL_MS) return;
		const L = pair();
		if (!L) {
			// The render is behind the text (typing, a paste): the preview catches up when the render lands.
			owed = true;
			return;
		}
		const target = L.map.toB(L.ed.scroll);
		if (Math.abs(target - L.pv.scroll) >= 1) echo.preview = { y: ports.setPreviewScroll(target), at: ports.now() };
		if (ports.now() - lastCaretMove < CARET_SCROLL_MS) return;
		report(sectionAt(L.ed, L.ed.scroll), 'editor-view');
	}

	/** Put the preview where the editor says it should be. Waits (owed) until both can be measured. */
	function realign(): boolean {
		const L = pair();
		if (!L) return false;
		const target = L.map.toB(L.ed.scroll);
		if (Math.abs(target - L.pv.scroll) >= 1) echo.preview = { y: ports.setPreviewScroll(target), at: ports.now() };
		return true;
	}

	/** Center slide `flat` in the preview (the first at the top, the last at the bottom: the alignment's own rule). */
	function centerPreview(flat: number): boolean {
		const L = pair();
		if (!L || flat < 0 || flat >= L.pv.tops.length) return false;
		const target = Math.max(0, Math.min(centeredAt(L.pv, flat), maxScroll(L.pv)));
		if (Math.abs(target - L.pv.scroll) >= 1) echo.preview = { y: ports.setPreviewScroll(target), at: ports.now() };
		lastCenter = ports.now();
		return true;
	}

	/** Put the editor where the preview says it should be (a click on a slide: the preview stays, the editor comes to it). */
	function alignEditor(): boolean {
		const L = pair();
		const ed = ports.editor();
		if (!L || !ed) return false;
		const target = L.map.toA(L.pv.scroll);
		if (Math.abs(target - L.ed.scroll) >= 1) echo.editor = { y: ed.setScroll(target), at: ports.now() };
		return true;
	}

	const unsubscribe = hub.subscribe(
		(f) => f,
		(f) => {
			const ol = hub.outline();
			const before = lastFlat;
			if (f.unitIndex >= 0) lastFlat = f.flat;
			if (dead || !ol || f.unitIndex < 0) return;
			paintBand(f);
			paintMark(f);
			// A click or key that puts the caret in another slide brings that slide to the middle of the preview; the
			// editor stays where it is, under the pointer. Typing does not: a `---` typed mid-sentence is not a request.
			if (ports.editing() && f.origin === 'editor' && f.cause === 'caret' && f.flat !== before && ports.now() - lastEdit > CARET_SCROLL_MS) centerPreview(f.flat);
			// Only in Edit: elsewhere the hub's text is the render's, and its offsets are not the editor's.
			if (!ports.editing()) {
				if (f.origin === 'rail') showPage(f);
				return;
			}
			const ed = ports.editor();
			const ext = deckFrame(ol as Parameters<typeof deckFrame>[0], f.unitIndex, f.part);
			// A pick (map tile, click on a slide) moves the caret; a scroll or a walk step only shows where a pane is.
			const picks = (f.cause === 'nav' || f.cause === 'pick') && f.origin !== 'preview' && f.origin !== 'editor-view' && f.origin !== 'editor';
			if (picks && ed && ext && ports.canPick()) {
				// The alignment places the slide; when it cannot yet (the render has not landed) the editor frames it itself.
				// A click on a slide centers it in the preview first, then brings the editor level with it.
				const aligned = f.origin === 'preview-pick' ? centerPreview(f.flat) && alignEditor() : pair() !== null;
				ed.revealSlide({ from: ext.from, to: lastChar(ext), caret: deckTitleEnd(ol, f.unitIndex, f.part), grab: f.grab, frame: !aligned });
			}
			// A tile asks the preview for an exact move; the editor then follows it through the preview's scroll.
			if (f.origin === 'rail') showPage(f);
		},
		{ equals: (a, b) => a.seq === b.seq },
	);

	function showPage(f = hub.get()) {
		const ix = usable();
		const page = ix && f.unitIndex >= 0 ? pageOfFlat(ix, f.flat) : -1;
		if (page < 0) return;
		ownUntil = ports.now() + MAX_OWN_MS;
		ports.show(page, { instant: false });
	}

	return {
		edited(text, span) {
			if (!ports.editing()) return;
			lastEdit = ports.now();
			hub.update(text, { span, by: 'editor' });
			// An edit can move a slide's edges (a `---` typed inside it) with no change of focus to say so.
			if (!bandRaf) {
				bandRaf = ports.raf(() => {
					bandRaf = 0;
					if (!dead) paintBand();
				});
			}
		},
		selected(at) {
			if (at.user) lastCaretMove = ports.now();
			hub.report('editor', { head: at.head, anchor: at.anchor, line: at.line, quiet: !at.user });
		},
		rendered(source, getIndex, patched) {
			renderedSource = source;
			// Outside Edit the render is the text of record: a Playground gallery or a plan walk renders
			// something other than what the editor holds, and the map and the walk speak about that.
			if (!ports.editing()) hub.update(source, { by: 'preview' });
			// A full write: the next document opens at the top, not on the editor's slide, and is not on screen yet.
			if (!patched) {
				awaitingLoad = true;
				owed = ports.editing();
			}
			const mine = ++epoch;
			const p = getIndex?.();
			if (!p) return;
			p.then((next) => {
				if (dead || mine !== epoch) return;
				index = next;
				indexSource = renderedSource;
				paintBand();
				paintMark();
				if (owed && !awaitingLoad && realign()) owed = false;
			}).catch(() => {});
		},
		remark() {
			if (!dead) paintMark();
		},
		enterExplore() {
			const f = hub.get();
			caretFlat = f.unitIndex >= 0 ? f.flat : -1;
			exploreClick = -1;
			return caretFlat;
		},
		exploreClicked(page) {
			exploreClick = page;
		},
		leaveExplore() {
			const page = exploreClick;
			exploreClick = -1;
			const ix = usable();
			if (page < 0 || !ix) return;
			const flat = flatOfPage(ix, page);
			if (flat >= 0 && flat !== caretFlat) hub.go('preview-pick', { flat, grab: false });
		},
		previewScrolled() {
			noteScroll();
			lastPreviewScroll = ports.now();
			if (!previewRaf) previewRaf = ports.raf(drivenByPreview);
		},
		editorScrolled() {
			noteScroll();
			if (!editorRaf) editorRaf = ports.raf(drivenByEditor);
		},
		picked(page, opts) {
			const ix = usable();
			if (!ix || !ports.active()) return;
			const flat = flatOfPage(ix, page);
			if (flat >= 0) hub.go('preview-pick', { flat, grab: opts.grab });
		},
		loaded() {
			awaitingLoad = false;
			if (!owed) return false;
			if (realign()) owed = false;
			return true;
		},
		pending: () => owed,
		destroy() {
			dead = true;
			unsubscribe();
			if (previewRaf) ports.cancelRaf(previewRaf);
			if (settleRaf) ports.cancelRaf(settleRaf);
			if (editorRaf) ports.cancelRaf(editorRaf);
			if (bandRaf) ports.cancelRaf(bandRaf);
		},
	};
}
