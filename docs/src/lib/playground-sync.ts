// THE PLAYGROUND'S FOCUS SYNC — one hub joins the editor, the preview and the slide map.
//
// Before this, the Playground kept two unconnected answers to "which slide is the reader on":
// the caret moved the preview through a regex scanner over the preview's own text
// (`caretSlideIndex`) and a 140 ms timer, and the slide map ran a Fuoco hub of its own that the
// editor never heard. So scrolling the preview moved the map and nothing else.
//
// This module owns the one hub (docs/src/lib/fuoco) and the rules for who moves whom:
//
//   THE CARET IS THE READER'S, AND PARKS.
//     Scrolling the preview changes what is VIEWED, never where the caret is. The editor scrolls
//     to the viewed slide and marks it (a band over its lines, `---` fences included), and the
//     caret and selection stay exactly where they were. The next key the reader presses in the
//     editor reports the caret, the hub sees it is on a different slide, and the preview and the
//     band return to it. Nothing is stored for that: CodeMirror already holds the caret, and the
//     hub learns of it again on the next report.
//
//   A PICK MOVES THE CARET.
//     A click on a slide in the preview, or on a tile in the map, is an intent to edit that
//     slide: the caret goes to the end of its title, and the whole slide, opening `---` through
//     its closing one, is brought into the editor's view.
//
//   THE PREVIEW FOLLOWS THE CARET, once, when the slide it is on changes or the reader types.
//
// Origins say who moved: 'editor' (a caret move or an edit), 'preview' (a scroll the reader made
// or a walk step), 'preview-pick' (a click on a slide), 'rail' (a map tile). The editor never
// reacts to its own origin and the preview never follows its own.
//
// TWO TEXTS. The hub holds the editor's live text; the rendered index (rendered-index.ts) is
// about the text last RENDERED, which trails typing by a debounce. A flat slide number means the
// same thing in both only when the two texts are equal, so every use of the index checks that
// first. When they differ the move waits (`pending`) and the render that lands asks again.
//
// This file imports no DOM and no React: everything it touches comes in through `SyncPorts`, so
// the rules above run under a fake in a unit test (playground-sync.test.ts).

import { deckFrame, deckTitleEnd } from './deck-outline';
import type { FocusHub } from './fuoco/hub';
import { partOfFlat } from './fuoco/outline';
import { flatOfPage, pageOfFlat, type RenderedIndex } from './rendered-index';

/** What the sync asks of the editor. A subset of `EditorAdapter` (components/playground/EditorHost.tsx). */
export interface SyncEditor {
	setBand(range: { from: number; to: number } | null): void;
	revealSlide(at: { from: number; to: number; caret: number; grab?: boolean }): void;
	showRange(at: { from: number; to: number }): void;
}

export interface SyncPorts {
	editor(): SyncEditor | null;
	/** The page the preview mostly shows, or null when it cannot say. `current` is the page the focus names, `count` how many pages there are. */
	reading(current: number, count: number): number | null;
	/** Bring the preview to `page`. `follow`: the caret asked, so a page already mostly in view stays
	 *  put. Returns false when the preview cannot move yet (collapsed, not laid out): the sync tries again. */
	show(page: number, opts: { follow: boolean; instant: boolean }): boolean;
	/** The Edit view is showing: the editor's text IS the deck. In Explore the preview can show something the
	 *  editor does not hold (a component's gallery, a plan step), so the render is the text of record. */
	editing(): boolean;
	/** The Edit view with its preview on screen: the only time a scroll or a caret move is the reader's. */
	active(): boolean;
	/** The page of a slide-pick that may place a caret: false when the editor is not on screen (a phone's single pane). */
	canPick(): boolean;
	now(): number;
	raf(cb: () => void): number;
	cancelRaf(id: number): void;
	timeout(cb: () => void, ms: number): number;
	clearTimeout(id: number): void;
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
	/** The preview scrolled. */
	scrolled(): void;
	/** The reader clicked the slide on `page` of the preview. */
	picked(page: number, opts: { grab: boolean }): void;
	/** A new preview document loaded: follow the caret if a follow is waiting. Returns whether one was. */
	loaded(): boolean;
	/** True while the preview owes the caret a move it could not make yet. */
	pending(): boolean;
	destroy(): void;
}

/** A pick scrolls the preview, and a scroll in flight passes through every slide on the way. Until it
 *  has been still this long (or `MAX_OWN_MS` has passed) the preview does not report, so it cannot move
 *  the focus off the slide the reader just asked for. */
const SETTLE_MS = 160;
const MAX_OWN_MS = 1500;
/** The caret follow waits this long after the last move, as the follow it replaces did. */
const FOLLOW_MS = 100;

/** An extent ends one past its last character, which for a section that closes on a line break is the
 *  start of the NEXT line. The editor takes lines by offset, so hand it the last character instead. */
const lastChar = (e: { from: number; to: number }) => Math.max(e.from, e.to - 1);

export function createPlaygroundSync(hub: FocusHub, ports: SyncPorts): PlaygroundSync {
	let index: RenderedIndex | null = null;
	let indexSource: string | null = null;
	let renderedSource: string | null = null;
	let owed = false;
	let owedInstant = false;
	let awaitingLoad = false;
	let ownUntil = 0;
	let lastScroll = 0;
	let raf = 0;
	let retry = 0;
	let followTimer = 0;
	let bandRaf = 0;
	let bandKey = '';
	let epoch = 0;
	let dead = false;
	/** The reader moved the caret or typed since the last follow. A replace of the whole document (Deck
	 *  settings, a component pick, a gallery) moves the caret to the top, and the reader did not do that. */
	let userActed = false;

	/** The index, when it describes the text the hub holds. */
	function usable(): RenderedIndex | null {
		const ol = hub.outline();
		return index && ol && indexSource === ol.source ? index : null;
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

	/** Move the preview to the focused slide. Waits (owed) when the index is not for this text yet. */
	function follow(instant: boolean, caret: boolean) {
		const f = hub.get();
		const ix = usable();
		if (!ix || f.unitIndex < 0) {
			owed = true;
			owedInstant ||= instant;
			return;
		}
		const page = pageOfFlat(ix, f.flat);
		if (page < 0) return;
		ownUntil = ports.now() + MAX_OWN_MS;
		const done = ports.show(page, { follow: caret, instant: instant || owedInstant });
		owed = !done;
		if (done) owedInstant = false;
	}

	function followSoon() {
		if (followTimer) ports.clearTimeout(followTimer);
		followTimer = ports.timeout(() => {
			followTimer = 0;
			if (!dead) follow(false, true);
		}, FOLLOW_MS);
	}

	const unsubscribe = hub.subscribe(
		(f) => f,
		(f) => {
			const ol = hub.outline();
			if (dead || !ol || f.unitIndex < 0) return;
			paintBand(f);
			const fromPreview = f.origin === 'preview' || f.origin === 'preview-pick';
			// The editor reacts to anyone but itself. A pick (map tile, preview click) moves the caret;
			// a scroll or a walk step only shows where the preview is.
			// Only in Edit: elsewhere the hub's text is the render's, and its offsets are not the editor's.
			if (f.origin !== 'editor' && ports.editing()) {
				const ed = ports.editor();
				const ext = deckFrame(ol as Parameters<typeof deckFrame>[0], f.unitIndex, f.part);
				if (ed && ext) {
					if ((f.cause === 'nav' || f.cause === 'pick') && f.origin !== 'preview') {
						if (ports.canPick()) ed.revealSlide({ from: ext.from, to: lastChar(ext), caret: deckTitleEnd(ol, f.unitIndex, f.part), grab: f.grab });
					} else if (f.origin === 'preview') ed.showRange({ from: ext.from, to: lastChar(ext) });
				}
			}
			// The preview follows everyone but itself: a tile asks for an exact move, the caret for a
			// gentle one.
			if (!fromPreview) {
				if (f.origin === 'editor') {
					if (userActed) followSoon();
					userActed = false;
				} else follow(false, false);
			}
		},
		{ equals: (a, b) => a.seq === b.seq },
	);

	function read() {
		raf = 0;
		if (dead || !ports.active()) return;
		const now = ports.now();
		if (now < ownUntil && now - lastScroll < SETTLE_MS) {
			retry = ports.timeout(() => {
				retry = 0;
				scrolled();
			}, SETTLE_MS / 2);
			return;
		}
		const ix = usable();
		const ol = hub.outline();
		if (!ix || !ol || !ix.pages.length) return;
		const here = hub.get();
		const page = ports.reading(pageOfFlat(ix, here.flat), ix.pages.length);
		if (page === null) return;
		const flat = flatOfPage(ix, page);
		if (flat < 0 || flat === here.flat) return;
		const at = partOfFlat(ol, flat);
		if (at) hub.reportUnit('preview', { unitIndex: at.unit, part: at.part });
	}

	function scrolled() {
		lastScroll = ports.now();
		if (!raf && !retry) raf = ports.raf(read);
	}

	return {
		edited(text, span) {
			if (!ports.editing()) return;
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
			if (at.user) userActed = true;
			hub.report('editor', { head: at.head, anchor: at.anchor, line: at.line, quiet: !at.user });
		},
		rendered(source, getIndex, patched) {
			renderedSource = source;
			// Outside Edit the render is the text of record: a Playground gallery or a plan walk renders
			// something other than what the editor holds, and the map and the walk speak about that.
			if (!ports.editing()) hub.update(source, { by: 'preview' });
			// A full write: the next document is not on screen yet, so nothing may scroll until `loaded()`.
			if (!patched) awaitingLoad = true;
			const mine = ++epoch;
			const p = getIndex?.();
			if (!p) return;
			p.then((next) => {
				if (dead || mine !== epoch) return;
				index = next;
				indexSource = renderedSource;
				paintBand();
				if (owed && !awaitingLoad) follow(owedInstant, true);
			}).catch(() => {});
		},
		scrolled,
		picked(page, opts) {
			const ix = usable();
			if (!ix || !ports.active()) return;
			const flat = flatOfPage(ix, page);
			if (flat >= 0) hub.go('preview-pick', { flat, grab: opts.grab });
		},
		loaded() {
			awaitingLoad = false;
			if (!owed) return false;
			follow(true, true);
			return true;
		},
		pending: () => owed,
		destroy() {
			dead = true;
			unsubscribe();
			if (raf) ports.cancelRaf(raf);
			if (bandRaf) ports.cancelRaf(bandRaf);
			if (retry) ports.clearTimeout(retry);
			if (followTimer) ports.clearTimeout(followTimer);
		},
	};
}
