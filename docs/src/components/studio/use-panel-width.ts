import * as React from 'react';

// Persisted, draggable width for a docked side panel (the Studio's left-docked
// Architect and Settings columns). This is DELIBERATELY simpler than the
// editor|preview split (ui/split.tsx): those two panes share one A/B ratio and
// collapse to a rail stub because they can't otherwise be summoned back. A
// docked assistant/settings panel instead has a FIXED side and closes fully —
// its activity-bar icon is the way back — so it needs only a clamped, persisted
// px width plus a drag handle on its inner (editor-facing) edge. No ratio, no
// collapse-to-rail, no fr-pair void math (#721 lives in splitTracks; this width
// is a plain px grid track that never participates in the flex pair).
//
// HYDRATION CONTRACT (mirrors useSplit): initial state is the DEFAULT so SSR and
// the first client render match exactly; the persisted width is applied in a
// post-mount effect (a normal re-render that patches the DOM). React 19 silently
// drops attribute-level hydration mismatches, and the width reaches the DOM as an
// inline grid-track value, so reading storage in the initializer would restore
// the vDOM but never the real track.

export interface PanelWidthOptions {
	/** localStorage key, stored as a bare integer px string. */
	storageKey: string;
	/** Default width (px) — the SSR/first-paint value. */
	defaultWidth: number;
	/** Clamp floor (px) — also the narrow-fold auto-narrow target. */
	min: number;
	/** Clamp ceiling (px). */
	max: number;
	/** Which edge carries the grip: 'right' widens on drag-right (left-docked
	 *  panels), 'left' widens on drag-left. Studio panels dock left → 'right'. */
	side?: 'left' | 'right';
}

export interface PanelWidthReturn {
	/** The width to render (default until the persisted value is restored post-mount). */
	width: number;
	/** True while a drag is live (drives the grip's accent line). */
	dragging: boolean;
	/** Spread onto the grip element (a thin bar on the panel's inner edge). */
	gripProps: {
		onPointerDown: React.PointerEventHandler<HTMLElement>;
		role: 'separator';
		'aria-orientation': 'vertical';
		'aria-label': string;
		tabIndex: number;
		onKeyDown: React.KeyboardEventHandler<HTMLElement>;
	};
}

const STEP = 16;

function clamp(w: number, min: number, max: number): number {
	return Math.min(max, Math.max(min, Math.round(w)));
}

function readStored(key: string, def: number, min: number, max: number): number {
	let raw: string | null = null;
	try {
		raw = localStorage.getItem(key);
	} catch {
		return def;
	}
	if (raw === null) return def;
	const n = Number.parseInt(raw, 10);
	// Out-of-band / non-numeric → default (and let the next commit heal storage).
	return Number.isFinite(n) && n >= min && n <= max ? n : def;
}

export function usePanelWidth(options: PanelWidthOptions): PanelWidthReturn {
	// `side` is read via optsRef in the drag/keyboard callbacks (stable-closure
	// idiom); only these four are needed as plain locals.
	const { storageKey, defaultWidth, min, max } = options;
	const [width, setWidth] = React.useState(() => clamp(defaultWidth, min, max));
	const [restored, setRestored] = React.useState(false);
	const [dragging, setDragging] = React.useState(false);

	// Latest-value refs so the imperative drag lifecycle never closes over stale
	// render values (the useSplit idiom).
	const widthRef = React.useRef(width);
	widthRef.current = width;
	const optsRef = React.useRef(options);
	optsRef.current = options;
	const dragRef = React.useRef<{ pointerId: number; startX: number; startWidth: number } | null>(null);

	// Apply persisted width post-mount (see the hydration contract above).
	React.useEffect(() => {
		setWidth(readStored(storageKey, optsRef.current.defaultWidth, optsRef.current.min, optsRef.current.max));
		setRestored(true);
	}, [storageKey]);

	const commit = React.useCallback((w: number) => {
		const next = clamp(w, optsRef.current.min, optsRef.current.max);
		widthRef.current = next;
		setWidth(next);
		try {
			localStorage.setItem(optsRef.current.storageKey, String(next));
		} catch {
			/* private mode — width still applies for the session */
		}
	}, []);

	const onMove = React.useCallback((e: PointerEvent) => {
		const drag = dragRef.current;
		if (!drag || e.pointerId !== drag.pointerId) return;
		const dx = e.clientX - drag.startX;
		// Left-docked panel (grip on the right): drag right → wider. A right-docked
		// panel inverts the sign.
		const delta = optsRef.current.side === 'left' ? -dx : dx;
		const next = clamp(drag.startWidth + delta, optsRef.current.min, optsRef.current.max);
		widthRef.current = next;
		setWidth(next);
	}, []);

	// Declared after onMove so both its body AND its dep array can reference it
	// without a render-time TDZ (the dep array is evaluated when useCallback runs).
	const endDrag = React.useCallback(() => {
		if (!dragRef.current) return;
		dragRef.current = null;
		setDragging(false);
		try {
			document.body.style.userSelect = '';
		} catch {
			/* no document (SSR) */
		}
		window.removeEventListener('pointermove', onMove);
		window.removeEventListener('pointerup', endDrag);
		window.removeEventListener('pointercancel', endDrag);
		// Persist the final width (committed state moves live during the drag, but
		// storage writes only here to avoid thrashing localStorage every frame).
		commit(widthRef.current);
	}, [commit, onMove]);

	const onPointerDown = React.useCallback(
		(e: React.PointerEvent<HTMLElement>) => {
			if (e.pointerType === 'mouse' && e.button !== 0) return;
			e.preventDefault();
			dragRef.current = { pointerId: e.pointerId, startX: e.clientX, startWidth: widthRef.current };
			setDragging(true);
			// Suppress text selection everywhere for the duration of the drag — the
			// listeners are window-level, so without this a drag rubber-band-selects
			// editor/panel text. Restored in endDrag.
			try {
				document.body.style.userSelect = 'none';
			} catch {
				/* no document (SSR) */
			}
			window.addEventListener('pointermove', onMove);
			window.addEventListener('pointerup', endDrag);
			window.addEventListener('pointercancel', endDrag);
		},
		[onMove, endDrag],
	);

	const onKeyDown = React.useCallback(
		(e: React.KeyboardEvent<HTMLElement>) => {
			// Keyboard resize: Arrow keys nudge, Home/End jump to the clamp band.
			// A left-docked grip widens on ArrowRight (toward the editor), matching
			// the drag direction.
			const grows = optsRef.current.side === 'left' ? 'ArrowLeft' : 'ArrowRight';
			const shrinks = optsRef.current.side === 'left' ? 'ArrowRight' : 'ArrowLeft';
			let next: number | null = null;
			if (e.key === grows) next = widthRef.current + STEP;
			else if (e.key === shrinks) next = widthRef.current - STEP;
			else if (e.key === 'Home') next = optsRef.current.min;
			else if (e.key === 'End') next = optsRef.current.max;
			if (next === null) return;
			e.preventDefault();
			commit(next);
		},
		[commit],
	);

	// Tear the drag down on unmount so a captured pointer can't ghost-write.
	React.useEffect(() => () => endDrag(), [endDrag]);

	return {
		width: restored ? width : clamp(defaultWidth, min, max),
		dragging,
		gripProps: {
			onPointerDown,
			role: 'separator',
			'aria-orientation': 'vertical',
			'aria-label': 'Resize panel',
			tabIndex: 0,
			onKeyDown,
		},
	};
}
