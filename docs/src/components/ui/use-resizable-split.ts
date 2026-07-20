"use client"

import * as React from "react"
import { type Layout, type LayoutChangedMeta, useGroupRef, usePanelRef } from "react-resizable-panels"

// Shared resizable-workspace state for the Playground + Studio, backed by
// react-resizable-panels v4 (2026-07-19 splitter migration). It presents the
// SAME surface the hand-rolled useSplit did — `{ collapsed, dragging, expand,
// collapse, reset }` — so the ~20 consumer call sites keep working; only the
// render (a <ResizablePanelGroup> instead of a CSS grid) changes.
//
// The library owns pointer capture, keyboard/ARIA, and the visible handle. The
// consumer owns the two things no splitter solves — the srcdoc preview-iframe
// pointer shield and the FIT re-fit — via onDragStart/onDragEnd (suspend the FIT
// agent on the first layout change of a drag, re-fit once on release) and
// onCollapse/onExpand/onSettle.
//
// PERSISTENCE is hand-rolled (NOT useDefaultLayout, whose v4.12 save/restore
// paths key storage differently and never round-trip). It saves the FULL group
// layout — EVERY panel's size, so the Studio's Settings/Assistant column widths
// persist alongside the editor|preview ratio — keyed by `configKey` (which panels
// are present), so each Studio configuration (Coach open, Library open, bare
// Write, …) keeps its own remembered widths. Restored post-mount AND whenever the
// config changes, via groupRef.setLayout — the post-hydration-restore contract
// (React 19 drops inline-style hydration mismatches). Collapse is sessionStorage
// (survives reload, not a new tab), restored via panelRef.collapse().

export type SplitSide = "a" | "b"

type LayoutMap = Record<string, number>
type LayoutStore = Record<string, LayoutMap>

function collapseKey(storageKey: string) {
	return `${storageKey}-collapsed`
}

/** Read the full per-config layout store. Sanitize-on-read: bad JSON → {}. */
function readLayoutStore(storageKey: string): LayoutStore {
	try {
		const raw = localStorage.getItem(storageKey)
		if (raw == null) return {}
		const parsed: unknown = JSON.parse(raw)
		return parsed && typeof parsed === "object" ? (parsed as LayoutStore) : {}
	} catch {
		return {}
	}
}
function writeLayout(storageKey: string, configKey: string, layout: LayoutMap) {
	try {
		const store = readLayoutStore(storageKey)
		store[configKey] = layout
		localStorage.setItem(storageKey, JSON.stringify(store))
	} catch {
		/* private mode — the layout still applies for the session */
	}
}
function clearLayout(storageKey: string, configKey: string) {
	try {
		const store = readLayoutStore(storageKey)
		delete store[configKey]
		localStorage.setItem(storageKey, JSON.stringify(store))
	} catch {
		/* private mode */
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
	/** localStorage key for the persisted layouts (per surface). */
	storageKey: string
	/** When false (mobile tabs own layout / Fabricate hides the grid) the hook
	 *  keeps its state inert: `collapsible` stays off and nothing collapses. */
	active: boolean
	/** Editor's default share of the pair (%). The ⌘K reset target. */
	defaultRatio: number
	/** A string identifying which panels are currently present in the group — the
	 *  persistence bucket. It MUST change whenever a panel is added/removed so each
	 *  configuration keeps (and restores) its own remembered widths. */
	configKey: string
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
	const { storageKey, active, configKey } = options
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

	// Restore the saved layout for the CURRENT config after the group lays out
	// (ready + double rAF) — on mount AND whenever `configKey` changes (a panel
	// toggled → its remembered width comes back). Programmatic setLayout fires
	// onLayoutChanged with isUserInteraction=false, so it never re-saves.
	React.useEffect(() => {
		if (!ready || !active) return
		const raf = requestAnimationFrame(() =>
			requestAnimationFrame(() => {
				const g = groupRef.current
				if (!g) return
				const current = g.getLayout()
				const saved = readLayoutStore(storageKey)[configKey]
				if (saved) {
					// Apply saved sizes ONLY if every present panel has one (the config
					// matches) — else the setLayout would be partial and the library would
					// renormalize into a surprise layout.
					const next: LayoutMap = {}
					let complete = true
					for (const id of Object.keys(current)) {
						if (typeof saved[id] !== "number") {
							complete = false
							break
						}
						next[id] = saved[id]
					}
					if (complete) g.setLayout(next)
				}
			}),
		)
		return () => cancelAnimationFrame(raf)
	}, [ready, active, configKey, storageKey, groupRef])

	// Restore the collapsed side ONCE, after the group lays out.
	const collapseRestoredRef = React.useRef(false)
	React.useEffect(() => {
		if (!ready || !active) return
		const raf = requestAnimationFrame(() =>
			requestAnimationFrame(() => {
				if (collapseRestoredRef.current) return
				collapseRestoredRef.current = true
				const side = readStoredCollapse(storageKey)
				if (side) panelRefOf(side).current?.collapse()
			}),
		)
		return () => cancelAnimationFrame(raf)
	}, [ready, active, storageKey, panelRefOf])

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
	// Reset (⌘K "Reset split"): expand any collapsed pane, clear this config's saved
	// layout + the collapse, and resize the editor to the default share.
	const reset = React.useCallback(() => {
		if (collapsedRef.current.a) editorRef.current?.expand()
		if (collapsedRef.current.b) previewRef.current?.expand()
		writeStoredCollapse(storageKey, null)
		clearLayout(storageKey, optsRef.current.configKey)
		// A bare number is PIXELS to the library; a "%" string is a percentage.
		editorRef.current?.resize(`${optsRef.current.defaultRatio}%`)
	}, [storageKey, editorRef, previewRef])

	const onLayoutChange = React.useCallback(() => {
		if (active) setDrag(true)
	}, [active, setDrag])
	const onLayoutChanged = React.useCallback(
		(layout: Layout, meta: LayoutChangedMeta) => {
			setDrag(false)
			if (!meta.isUserInteraction) return
			// Persist the full layout for this config UNLESS a pane is collapsed — a
			// collapse is its own (sessionStorage) state, and its collapsedSize would
			// poison the remembered widths.
			if (!collapsedRef.current.a && !collapsedRef.current.b) {
				writeLayout(storageKey, optsRef.current.configKey, layout as LayoutMap)
			}
			optsRef.current.onSettle?.()
		},
		[setDrag, storageKey],
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
