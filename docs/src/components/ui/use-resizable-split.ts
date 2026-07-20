"use client"

import * as React from "react"
import { type Layout, type LayoutChangedMeta, useDefaultLayout, useGroupRef, usePanelRef } from "react-resizable-panels"

// Shared editor|preview split state for the Playground + Studio, backed by
// react-resizable-panels v4 (2026-07-19 splitter migration). It presents the
// SAME surface the hand-rolled useSplit did — `{ collapsed, dragging, expand,
// collapse, reset }` — so the ~20 consumer call sites keep working; only the
// render (a <ResizablePanelGroup> instead of a CSS grid) changes.
//
// The library owns pointer capture, keyboard/ARIA, double-click reset, and
// persistence (useDefaultLayout). The consumer owns the two things no splitter
// solves — the srcdoc preview-iframe pointer shield and the FIT re-fit — via the
// callbacks below: onDragStart/onDragEnd fire on the first/last layout change of
// a drag (suspend the FIT agent, then run one authoritative re-fit); onCollapse/
// onExpand fire once per transition; onSettle fires once per committed resize.

const SSR_NOOP_STORAGE = { getItem: () => null, setItem: () => {} }

export type SplitSide = "a" | "b"

export interface UseResizableSplitOptions {
	/** localStorage key for the persisted layout (per surface). */
	storageKey: string
	/** When false (mobile tabs own layout / Fabricate hides the grid) the hook
	 *  keeps its state inert: `collapsible` stays off and nothing collapses. */
	active: boolean
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
	/** Attach to the editor Panel via `panelRef`. */
	editorRef: React.RefObject<import("react-resizable-panels").PanelImperativeHandle | null>
	/** Attach to the preview Panel via `panelRef`. */
	previewRef: React.RefObject<import("react-resizable-panels").PanelImperativeHandle | null>
	/** Which pane is collapsed to its rail, or null. */
	collapsed: SplitSide | null
	/** True while a divider drag is live. */
	dragging: boolean
	/** True after mount — gate `collapsible` on this so hydration's 0-width
	 *  measure can't auto-collapse a pane. */
	ready: boolean
	/** Imperative collapse/expand/reset (header glyphs, ⌘K, programmatic reveal). */
	collapse: (side: SplitSide) => void
	expand: (side: SplitSide) => void
	reset: () => void
	/** Spread onto the <ResizablePanelGroup>. */
	groupProps: {
		groupRef: React.RefObject<import("react-resizable-panels").GroupImperativeHandle | null>
		defaultLayout: Layout | undefined
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

	const persist = useDefaultLayout({
		id: storageKey,
		storage: typeof localStorage !== "undefined" ? localStorage : SSR_NOOP_STORAGE,
	})

	// Track collapse via the panel's authoritative isCollapsed() (the library has
	// no onCollapse event; onResize is our poll). Per-side prev guards the edge so
	// the callbacks fire once per transition, not per frame.
	const collapsedRef = React.useRef({ a: false, b: false })
	const pollCollapse = React.useCallback(
		(side: SplitSide) => {
			const now = panelRefOf(side).current?.isCollapsed() ?? false
			if (now === collapsedRef.current[side]) return
			collapsedRef.current[side] = now
			if (now) {
				setCollapsed(side)
				optsRef.current.onCollapse?.(side)
			} else {
				setCollapsed((c) => (c === side ? null : c))
				optsRef.current.onExpand?.(side)
			}
		},
		[panelRefOf],
	)
	const onEditorResize = React.useCallback(() => pollCollapse("a"), [pollCollapse])
	const onPreviewResize = React.useCallback(() => pollCollapse("b"), [pollCollapse])

	const collapse = React.useCallback((side: SplitSide) => panelRefOf(side).current?.collapse(), [panelRefOf])
	const expand = React.useCallback((side: SplitSide) => panelRefOf(side).current?.expand(), [panelRefOf])
	// Reset restores the persisted default layout (⌘K "Reset split"); the library
	// also resets on separator double-click natively. Clearing storage first makes
	// the default authoritative.
	const reset = React.useCallback(() => {
		try {
			localStorage?.removeItem(storageKey)
		} catch {
			/* private mode */
		}
		if (persist.defaultLayout) groupRef.current?.setLayout(persist.defaultLayout)
	}, [storageKey, persist.defaultLayout, groupRef])

	const onLayoutChange = React.useCallback(() => {
		if (active) setDrag(true)
	}, [active, setDrag])
	const onLayoutChanged = React.useCallback(
		(layout: Layout, meta: LayoutChangedMeta) => {
			persist.onLayoutChanged(layout, meta)
			setDrag(false)
			if (meta.isUserInteraction) optsRef.current.onSettle?.()
		},
		[persist, setDrag],
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
		groupProps: { groupRef, defaultLayout: persist.defaultLayout, onLayoutChange, onLayoutChanged },
		onEditorResize,
		onPreviewResize,
	}
}
