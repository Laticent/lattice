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

/**
 * The persistence bucket for a layout = its panel-id set, sorted + joined. Derived
 * from the ACTUAL panels present (not a hand-maintained configKey), so a saved
 * layout can never be applied to a different panel set — the worst case of a
 * forgotten configKey extension is "no restore", never "wrong widths" (red-team F3
 * / Munger #2). `configKey` remains only the effect's re-run trigger.
 */
function bucketOf(layout: Record<string, unknown>): string {
	return Object.keys(layout).sort().join(",")
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
function writeLayout(storageKey: string, bucket: string, layout: LayoutMap) {
	try {
		const store = readLayoutStore(storageKey)
		store[bucket] = layout
		localStorage.setItem(storageKey, JSON.stringify(store))
	} catch {
		/* private mode — the layout still applies for the session */
	}
}
function clearLayout(storageKey: string, bucket: string) {
	try {
		const store = readLayoutStore(storageKey)
		delete store[bucket]
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
	/** A string that CHANGES whenever the set of present panels changes — the
	 *  restore effect's re-run trigger (so a toggled panel gets its remembered
	 *  width back). The storage bucket itself is derived from the real panel ids
	 *  (see bucketOf), so this only needs to change on a config change; it can't
	 *  cause a wrong-config restore even if it under-specifies. */
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
	// Collapse tracking state — declared here so the restore effect below can read
	// it (skip a width-restore while a pane is collapsed, so setLayout doesn't pop
	// the pane back open). Updated by pollCollapse (onResize).
	const collapsedRef = React.useRef({ a: false, b: false })
	// True during the brief window after a config change (a panel toggled) while
	// the library re-lays-out. Adding/removing a panel makes the library expand a
	// collapsed pane; we re-collapse it and, during this window, treat pollCollapse's
	// transient expand/collapse as noise (no persist, no callbacks).
	const configChangingRef = React.useRef(false)

	// `configKey` is deliberately a RE-RUN TRIGGER, not a value this effect reads — see
	// the header note, "`configKey` remains only the effect's re-run trigger". Dropping it
	// is behavior loss: the effect must fire again when a panel is toggled, which is
	// exactly when the library expands a collapsed pane and this puts it back.
	// biome-ignore lint/correctness/useExhaustiveDependencies: re-run trigger, see above.
	React.useEffect(() => {
		if (!ready || !active) return
		// Cancel BOTH frames on cleanup: without capturing the inner handle a stale
		// config's layout could still apply if configKey churns within two frames.
		let inner = 0
		const outer = requestAnimationFrame(() => {
			inner = requestAnimationFrame(() => {
				const g = groupRef.current
				if (!g) return
				// Don't disturb a collapsed pane: we never save a layout while collapsed,
				// so the saved one has the pane EXPANDED — setLayout would pop it open
				// (collapse restore is the separate effect below).
				if (collapsedRef.current.a || collapsedRef.current.b) return
				const current = g.getLayout()
				const ids = Object.keys(current)
				// getLayout() is {} while the group is measured at 0 width (hydration /
				// deferred); setLayout({}) would THROW. Skip until it has real panels.
				if (ids.length === 0) return
				// Bucket by the ACTUAL present ids (see bucketOf), so a saved layout is
				// only ever applied to the exact panel set it was saved for.
				const saved = readLayoutStore(storageKey)[bucketOf(current)]
				if (!saved) return
				const next: LayoutMap = {}
				for (const id of ids) {
					if (typeof saved[id] !== "number") return // incomplete → leave the layout alone
					next[id] = saved[id]
				}
				g.setLayout(next)
			})
		})
		return () => {
			cancelAnimationFrame(outer)
			if (inner) cancelAnimationFrame(inner)
		}
	}, [ready, active, configKey, storageKey, groupRef])

	// Restore / re-apply the collapsed side after the group lays out — on mount AND
	// on every config change (a panel toggle makes the library expand a collapsed
	// pane; we put it back). `configChangingRef` suppresses the transient so
	// pollCollapse doesn't clear the persisted collapse or fire spurious callbacks.
	// `configKey` is deliberately a RE-RUN TRIGGER, not a value this effect reads — see
	// the header note, "`configKey` remains only the effect's re-run trigger". Dropping it
	// is behavior loss: the effect must fire again when a panel is toggled, which is
	// exactly when the library expands a collapsed pane and this puts it back.
	// biome-ignore lint/correctness/useExhaustiveDependencies: re-run trigger, see above.
	React.useEffect(() => {
		if (!ready || !active) return
		const side = readStoredCollapse(storageKey)
		if (!side) return
		configChangingRef.current = true
		let inner = 0
		const outer = requestAnimationFrame(() => {
			inner = requestAnimationFrame(() => {
				if (!panelRefOf(side).current?.isCollapsed()) panelRefOf(side).current?.collapse()
				configChangingRef.current = false
			})
		})
		return () => {
			cancelAnimationFrame(outer)
			if (inner) cancelAnimationFrame(inner)
			configChangingRef.current = false
		}
	}, [ready, active, configKey, storageKey, panelRefOf])

	// Track collapse via the panel's authoritative isCollapsed() (the library has
	// no onCollapse event; onResize is our poll). Per-side prev guards the edge so
	// the callbacks + collapse persistence fire once per transition, not per frame.
	const pollCollapse = React.useCallback(
		(side: SplitSide) => {
			const now = panelRefOf(side).current?.isCollapsed() ?? false
			if (now === collapsedRef.current[side]) return
			collapsedRef.current[side] = now
			// Reflect the live state in the UI always…
			if (now) setCollapsed(side)
			else setCollapsed((c) => (c === side ? null : c))
			// …but during a config-change re-layout, the expand/collapse is the library
			// churning, not the user — don't persist it or fire callbacks.
			if (configChangingRef.current) return
			if (now) {
				writeStoredCollapse(storageKey, side)
				optsRef.current.onCollapse?.(side)
			} else {
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
	// layout + collapse, and restore the DEFAULT editor share of the PAIR — keeping
	// any docked Studio side panels where they are.
	const reset = React.useCallback(() => {
		if (collapsedRef.current.a) editorRef.current?.expand()
		if (collapsedRef.current.b) previewRef.current?.expand()
		writeStoredCollapse(storageKey, null)
		const g = groupRef.current
		if (g) clearLayout(storageKey, bucketOf(g.getLayout()))
		// resize() is GROUP-relative, but the default ratio is a share of the
		// editor|preview PAIR — so scale it by the pair's current share of the group
		// (side panels keep their width). Deferred a frame so any expand() above has
		// committed before we read the sizes.
		requestAnimationFrame(() => {
			const e = editorRef.current?.getSize().asPercentage ?? 0
			const p = previewRef.current?.getSize().asPercentage ?? 0
			const pair = e + p || 100
			// A bare number is PIXELS to the library; a "%" string is a percentage.
			editorRef.current?.resize(`${(optsRef.current.defaultRatio / 100) * pair}%`)
		})
	}, [storageKey, editorRef, previewRef, groupRef])

	const onLayoutChange = React.useCallback(() => {
		if (active) setDrag(true)
	}, [active, setDrag])
	const onLayoutChanged = React.useCallback(
		(layout: Layout, meta: LayoutChangedMeta) => {
			setDrag(false)
			if (!meta.isUserInteraction) return
			// Persist the full layout for the ACTUAL present panel set UNLESS a pane is
			// collapsed — a collapse is its own (sessionStorage) state, and its
			// collapsedSize would poison the remembered widths.
			if (!collapsedRef.current.a && !collapsedRef.current.b) {
				writeLayout(storageKey, bucketOf(layout as LayoutMap), layout as LayoutMap)
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
