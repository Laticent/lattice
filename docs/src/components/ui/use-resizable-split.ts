"use client"

import * as React from "react"
import { type Layout, type LayoutChangedMeta, useGroupRef, usePanelRef } from "react-resizable-panels"

// Shared editor|preview split state for the Playground + Studio, backed by
// react-resizable-panels v4 (2026-07-19 splitter migration). It presents the
// SAME surface the hand-rolled useSplit did — `{ collapsed, dragging, expand,
// collapse, reset }` — so the ~20 consumer call sites keep working; only the
// render (a <ResizablePanelGroup> instead of a CSS grid) changes.
//
// The library owns pointer capture, keyboard/ARIA, and double-click reset. The
// consumer owns the two things no splitter solves — the srcdoc preview-iframe
// pointer shield and the FIT re-fit — via onDragStart/onDragEnd (suspend the FIT
// agent on the first layout change of a drag, re-fit once on release) and
// onCollapse/onExpand/onSettle.
//
// PERSISTENCE is hand-rolled (localStorage ratio + sessionStorage collapse),
// NOT useDefaultLayout: that hook's save and restore paths key storage
// differently in v4.12 and never round-trip a two-panel layout (verified). We
// persist exactly what the old useSplit did — the editor's share of the pair
// (survives reload) and the collapsed side (survives reload, not a new tab) —
// and restore post-mount via the panel imperative API (editorRef.resize /
// panelRef.collapse), the same post-hydration-restore contract useSplit used.

export type SplitSide = "a" | "b"

const RATIO_MIN = 5
const RATIO_MAX = 95

function ratioKey(storageKey: string) {
	return storageKey
}
function collapseKey(storageKey: string) {
	return `${storageKey}-collapsed`
}

/** Read the persisted editor share (%). Sanitize-on-read: out-of-band → null. */
function readStoredRatio(storageKey: string): number | null {
	try {
		const raw = localStorage.getItem(ratioKey(storageKey))
		if (raw == null) return null
		const n = Number(raw)
		return Number.isFinite(n) && n >= RATIO_MIN && n <= RATIO_MAX ? n : null
	} catch {
		return null
	}
}
function writeStoredRatio(storageKey: string, pct: number) {
	try {
		localStorage.setItem(ratioKey(storageKey), String(Math.round(pct * 100) / 100))
	} catch {
		/* private mode — the ratio still applies for the session */
	}
}
function readStoredCollapse(storageKey: string): SplitSide | null {
	try {
		const v = sessionStorage.getItem(collapseKey(storageKey))
		return v === "a" || v === "b" ? v : null
	} catch {
		return null
	}
}
function writeStoredCollapse(storageKey: string, side: SplitSide | null) {
	try {
		if (side) sessionStorage.setItem(collapseKey(storageKey), side)
		else sessionStorage.removeItem(collapseKey(storageKey))
	} catch {
		/* storage disabled */
	}
}

export interface UseResizableSplitOptions {
	/** localStorage key for the persisted editor ratio (per surface). */
	storageKey: string
	/** When false (mobile tabs own layout / Fabricate hides the grid) the hook
	 *  keeps its state inert: `collapsible` stays off and nothing collapses. */
	active: boolean
	/** Editor's default share of the pair (%). The ⌘K / double-click reset target. */
	defaultRatio: number
	onCollapse?: (side: SplitSide) => void
	onExpand?: (side: SplitSide) => void
	/** Once per committed resize (drag release or keyboard step). */
	onSettle?: () => void
	/** First layout change of a drag — raise the iframe shield + suspend FIT. */
	onDragStart?: () => void
	/** Drag release — lower the shield + run one authoritative re-fit. */
	onDragEnd?: () => void
}

export interface ResizableSplit {
	editorRef: React.RefObject<import("react-resizable-panels").PanelImperativeHandle | null>
	previewRef: React.RefObject<import("react-resizable-panels").PanelImperativeHandle | null>
	collapsed: SplitSide | null
	dragging: boolean
	/** True after mount — gate `collapsible` on this so hydration's 0-width measure
	 *  can't auto-collapse a pane. */
	ready: boolean
	collapse: (side: SplitSide) => void
	expand: (side: SplitSide) => void
	reset: () => void
	/** Spread onto the <ResizablePanelGroup>. */
	groupProps: {
		groupRef: React.RefObject<import("react-resizable-panels").GroupImperativeHandle | null>
		onLayoutChange: (layout: Layout) => void
		onLayoutChanged: (layout: Layout, meta: LayoutChangedMeta) => void
	}
	/** Attach to the editor / preview Panel `onResize` — drives collapse tracking. */
	onEditorResize: () => void
	onPreviewResize: () => void
}

export function useResizableSplit(options: UseResizableSplitOptions): ResizableSplit {
	const { storageKey, active } = options
	const optsRef = React.useRef(options)
	optsRef.current = options

	const groupRef = useGroupRef()
	const editorRef = usePanelRef()
	const previewRef = usePanelRef()
	const panelRefOf = React.useCallback((side: SplitSide) => (side === "a" ? editorRef : previewRef), [editorRef, previewRef])

	const [collapsed, setCollapsed] = React.useState<SplitSide | null>(null)
	const [dragging, setDragging] = React.useState(false)
	const draggingRef = React.useRef(false)
	const setDrag = React.useCallback((on: boolean) => {
		if (draggingRef.current === on) return
		draggingRef.current = on
		setDragging(on)
		if (on) optsRef.current.onDragStart?.()
		else optsRef.current.onDragEnd?.()
	}, [])

	// Gate `collapsible` on a post-mount flag: a collapsible panel snaps collapsed
	// when the group measures 0 width during hydration. Off on the server + first
	// client render (hydration parity), on after mount when width is real.
	const [ready, setReady] = React.useState(false)
	React.useEffect(() => setReady(true), [])

	// Restore the persisted ratio + collapse ONCE, after the group has laid out
	// (ready + double rAF), via the panel imperative API — the post-hydration
	// restore contract (React 19 drops inline-style hydration mismatches, so an
	// initializer-time restore would never reach the DOM).
	const restoredRef = React.useRef(false)
	React.useEffect(() => {
		if (!ready || !active || restoredRef.current) return
		const raf = requestAnimationFrame(() =>
			requestAnimationFrame(() => {
				// Flip the one-shot INSIDE the rAF: if `active` toggles during the
				// 2-frame window the cleanup cancels this rAF, and the re-run must
				// still restore (setting it synchronously would skip it forever).
				restoredRef.current = true
				const pct = readStoredRatio(storageKey)
				// A bare number is PIXELS to the library; a "%"-suffixed string is a
				// percentage — the editor share is a percent.
				if (pct != null) editorRef.current?.resize(`${pct}%`)
				const side = readStoredCollapse(storageKey)
				if (side) panelRefOf(side).current?.collapse()
			}),
		)
		return () => cancelAnimationFrame(raf)
	}, [ready, active, storageKey, editorRef, panelRefOf])

	// Track collapse via the panel's authoritative isCollapsed() (the library has
	// no onCollapse event; onResize is our poll). Per-side prev guards the edge so
	// the callbacks + collapse persistence fire once per transition, not per frame.
	const collapsedRef = React.useRef({ a: false, b: false })
	const pollCollapse = React.useCallback(
		(side: SplitSide) => {
			const now = panelRefOf(side).current?.isCollapsed() ?? false
			if (now === collapsedRef.current[side]) return
			collapsedRef.current[side] = now
			if (now) {
				setCollapsed(side)
				writeStoredCollapse(storageKey, side)
				optsRef.current.onCollapse?.(side)
			} else {
				setCollapsed((c) => (c === side ? null : c))
				writeStoredCollapse(storageKey, null)
				optsRef.current.onExpand?.(side)
			}
		},
		[panelRefOf, storageKey],
	)
	const onEditorResize = React.useCallback(() => pollCollapse("a"), [pollCollapse])
	const onPreviewResize = React.useCallback(() => pollCollapse("b"), [pollCollapse])

	const collapse = React.useCallback((side: SplitSide) => panelRefOf(side).current?.collapse(), [panelRefOf])
	const expand = React.useCallback((side: SplitSide) => panelRefOf(side).current?.expand(), [panelRefOf])
	// Reset restores the default editor share (⌘K "Reset split"): expand any
	// collapsed pane, clear BOTH persisted keys (ratio + collapse) so the default
	// is authoritative on the next load, and resize to the default ratio.
	const reset = React.useCallback(() => {
		if (collapsedRef.current.a) editorRef.current?.expand()
		if (collapsedRef.current.b) previewRef.current?.expand()
		writeStoredCollapse(storageKey, null)
		try {
			localStorage?.removeItem(ratioKey(storageKey))
		} catch {
			/* private mode */
		}
		editorRef.current?.resize(`${optsRef.current.defaultRatio}%`)
	}, [storageKey, editorRef, previewRef])

	const onLayoutChange = React.useCallback(() => {
		if (active) setDrag(true)
	}, [active, setDrag])
	const onLayoutChanged = React.useCallback(
		(_layout: Layout, meta: LayoutChangedMeta) => {
			setDrag(false)
			if (!meta.isUserInteraction) return
			// Persist the editor share only when neither pane is collapsed — a
			// collapse is its own (sessionStorage) state, not the ratio.
			if (!collapsedRef.current.a && !collapsedRef.current.b) {
				const pct = editorRef.current?.getSize().asPercentage
				if (typeof pct === "number" && pct >= RATIO_MIN && pct <= RATIO_MAX) writeStoredRatio(storageKey, pct)
			}
			optsRef.current.onSettle?.()
		},
		[setDrag, storageKey, editorRef],
	)

	return {
		editorRef,
		previewRef,
		collapsed: active ? collapsed : null,
		dragging,
		ready: ready && active,
		collapse,
		expand,
		reset,
		groupProps: { groupRef, onLayoutChange, onLayoutChanged },
		onEditorResize,
		onPreviewResize,
	}
}
