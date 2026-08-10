"use client"

import * as React from "react"
import { type Layout, type LayoutChangedMeta, useGroupRef, usePanelRef } from "react-resizable-panels"
// The storage FORMAT lives in its own dependency-free module because the Studio's pre-paint
// shell has to read it before React exists (#1495). This hook owns the behavior; it does not
// own the shape of the strings.
import { bucketFor, collapseKeyFor } from "./split-storage"

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
// Write, …) keeps its own remembered widths. Restore has TWO tiers (#1553):
//   · a `client:only` consumer opts into the SEED by passing `clientOnlyPanelIds`, and the
//     saved layout becomes the group's `defaultLayout` — it initializes at the remembered
//     widths and the default share is never laid out at all;
//   · every consumer gets the BACKSTOP — groupRef.setLayout from a LAYOUT effect, so it lands
//     before the browser paints, re-asserted until the group reports it back.
// A hydrated (server-rendered) consumer gets the backstop ONLY. `defaultLayout` reaches the
// panel's inline style during render, and React 19 does not patch inline-style hydration
// mismatches, so seeding one freezes its flex-basis permanently — see `clientOnlyPanelIds`.
// Collapse is sessionStorage (survives reload, not a new tab), restored via
// panelRef.collapse().

export type SplitSide = "a" | "b"

type LayoutMap = Record<string, number>
type LayoutStore = Record<string, LayoutMap>

/**
 * `useLayoutEffect` on the client, `useEffect` on the server.
 *
 * The Playground mounts this hook through a `client:load` island, so the module DOES run
 * under Astro's server render, where React logs a warning for every `useLayoutEffect` and
 * runs none of them. The restore below has to be a LAYOUT effect on the client (see its
 * note) and is a no-op on the server either way, so this is the standard swap rather than a
 * behavior choice.
 */
const useIsomorphicLayoutEffect = typeof window === "undefined" ? React.useEffect : React.useLayoutEffect

/**
 * How long the BACKSTOP restore keeps trying, in ms.
 *
 * A deadline rather than a frame count on purpose. Frames are exactly what is scarce here —
 * on the Studio the group settles behind a ~505KB engine fetch — so a budget of "ten frames"
 * can expire in a tenth of a second on an idle page or take most of a second on a busy one:
 * the wrong unit for "has this group settled yet".
 *
 * 3s is a ceiling, not an expectation. The loop stops the moment the group reports the saved
 * layout back (usually the first attempt, and on a fresh load `defaultLayout` has already
 * done the job before this runs at all). It only runs to the end for a group that never
 * measures — mounted under `display:none` for the whole session — at the cost of one
 * canceled frame callback.
 */
const RESTORE_DEADLINE_MS = 3000

/**
 * How many times the backstop re-asserts the saved layout before accepting what it gets.
 *
 * It re-asserts at all because a `setLayout` issued while the library is still initializing is
 * DISCARDED, silently and by design: the group's imperative `setLayout` returns the current
 * layout without emitting while `defaultLayoutDeferred` is set, and the group listener
 * suppresses `onLayoutChanged` in the same state. That is precisely the window a LAYOUT effect
 * lands in — which is the price of running before paint. So the backstop cannot treat "I called
 * setLayout" as done; it re-asserts until the group reports the target back. Removing this and
 * re-running the suite is what proved it load-bearing: the Playground stopped restoring at all
 * (472px dragged, 672px after reload).
 *
 * It stops after a few because the group may legitimately refuse: a saved share below a pane's
 * px minimum is CLAMPED, so the reported layout will never equal the target and re-asserting
 * would just burn frames arguing with the clamp. Eight is far more than the one or two an
 * initializing group needs, and still ends promptly.
 */
const RESTORE_MAX_ATTEMPTS = 8

/** Layouts agree to within half a percent — tolerance for the library's own rounding. */
function layoutsMatch(a: LayoutMap, b: LayoutMap): boolean {
	const ids = Object.keys(b)
	if (ids.length !== Object.keys(a).length) return false
	return ids.every((id) => typeof a[id] === "number" && Math.abs(a[id] - b[id]) < 0.5)
}

/**
 * The saved layout for an EXACT panel set, or undefined if there isn't a complete one.
 *
 * Complete is the operative word: `defaultLayout` is ignored by the library unless it covers
 * every panel in the group, and a partial layout would be worse than none — so a set missing
 * even one id resolves to undefined and the panels' own defaults stand.
 */
function readSavedLayout(storageKey: string, panelIds: readonly string[] | undefined): LayoutMap | undefined {
	if (!panelIds?.length || typeof window === "undefined") return undefined
	const saved = readLayoutStore(storageKey)[bucketFor(panelIds)]
	if (!saved) return undefined
	const out: LayoutMap = {}
	for (const id of panelIds) {
		if (typeof saved[id] !== "number") return undefined
		out[id] = saved[id]
	}
	return out
}

const collapseKey = collapseKeyFor

/**
 * The persistence bucket for a layout = its panel-id set, sorted + joined. Derived
 * from the ACTUAL panels present (not a hand-maintained configKey), so a saved
 * layout can never be applied to a different panel set — the worst case of a
 * forgotten configKey extension is "no restore", never "wrong widths" (red-team F3
 * / Munger #2). `configKey` remains only the effect's re-run trigger.
 *
 * The derivation itself is `bucketFor` in ./split-storage — shared with the pre-paint
 * seed, which has to compute the same bucket from statically-known ids. This wrapper is
 * the layout-object-shaped call site the hook uses.
 */
function bucketOf(layout: Record<string, unknown>): string {
	return bucketFor(Object.keys(layout))
}

/**
 * Read the full per-config layout store. Sanitize-on-read: anything that isn't a plain object → {}.
 *
 * `Array.isArray` is load-bearing, not defensive noise. `typeof [] === "object"`, so an array
 * value used to pass this guard — and then `writeLayout` would do `store[bucket] = layout` on an
 * array and `JSON.stringify` would drop the non-index property, so the layout round-tripped to
 * `[1,2,3]` and EVERY save silently no-opped for the rest of that browser profile's life, with
 * no error anywhere. Reachable only by a corrupt or hand-edited value, which is exactly the kind
 * of thing that survives forever because nothing complains.
 */
function readLayoutStore(storageKey: string): LayoutStore {
	try {
		const raw = localStorage.getItem(storageKey)
		if (raw == null) return {}
		const parsed: unknown = JSON.parse(raw)
		return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? (parsed as LayoutStore) : {}
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
	/** The ids of the panels the consumer is about to render, in any order —
	 *  **only from an island that NEVER server-renders** (`client:only`). The name carries the
	 *  constraint because passing it from a hydrated island is silently destructive, and a
	 *  comment nobody reads was not enough (#1553).
	 *
	 *  WHAT IT BUYS. It lets the saved layout be handed to the library as its `defaultLayout`,
	 *  so the group INITIALIZES at the remembered widths instead of laying out at the panels'
	 *  defaults and being corrected afterwards. The hook cannot derive the ids itself: the only
	 *  runtime source of the real ones is `groupRef.getLayout()`, which exists no earlier than
	 *  mount — the whole problem.
	 *
	 *  WHY `client:only` IS LOAD-BEARING, and not a nicety. `defaultLayout` is NOT confined to
	 *  the library's init effect: `getPanelStyles` reads it during RENDER and returns
	 *  `{flexGrow}` from it whenever the group has no live state yet
	 *  (react-resizable-panels.js, `if (n?.[P]) return { flexGrow: n?.[P] }`). On a hydrated
	 *  island the server rendered the panel's `defaultSize` and the client's first render
	 *  produces a different inline style — and React 19 does not patch inline-style hydration
	 *  mismatches ("this won't be patched up"). The DOM keeps the server's value while React's
	 *  prop record believes the client's, so `flex-basis` is frozen for the life of the page and
	 *  the divider stops tracking the pointer. Measured on the Playground: a divider dragged to
	 *  412px reloaded to 653px and thereafter mis-tracked every drag. A hydrated consumer must
	 *  simply not pass this — its restore is the backstop below, which lands on the same pixel a
	 *  few hundred ms later (verified: 412px).
	 *
	 *  Getting the CONTENTS wrong costs a jump, never wrong widths: an id set that doesn't match
	 *  the rendered panels yields no saved layout for that bucket, and the post-mount restore
	 *  re-derives the bucket from the ACTUAL panels and puts it right. Note the library is only
	 *  half a safety net here — its INIT path rejects a `defaultLayout` that doesn't cover every
	 *  panel, but `getPanelStyles` renders any per-panel entry it finds with no completeness
	 *  check, so a PARTIAL layout would be applied to whichever panels it covers. `readSavedLayout`
	 *  is all-or-nothing for that reason; don't relax it. Getting the RENDER MODE wrong is the
	 *  one that does real damage. */
	clientOnlyPanelIds?: readonly string[]
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
		/** The remembered layout, handed to the library as the group's STARTING point. */
		defaultLayout: Layout | undefined
		onLayoutChange: (layout: Layout) => void
		onLayoutChanged: (layout: Layout, meta: LayoutChangedMeta) => void
	}
	/** Attach to the editor / preview Panel `onResize` — drives collapse tracking. */
	onEditorResize: () => void
	onPreviewResize: () => void
}

export function useResizableSplit(options: UseResizableSplitOptions): ResizableSplit {
	const { storageKey, active, configKey, clientOnlyPanelIds } = options
	const optsRef = React.useRef(options)
	optsRef.current = options

	// THE SEED: the remembered layout, read from storage during RENDER and handed to the
	// library as the group's `defaultLayout`, so it initializes at the user's widths and the
	// default share is never laid out at all.
	//
	// It is opt-in per consumer, and only a `client:only` consumer may opt in — `defaultLayout`
	// reaches the panel's inline style during RENDER, so on a hydrated island it becomes a
	// style mismatch React 19 refuses to patch, freezing the pane's flex-basis for the life of
	// the page. The full account, with the measurement, is on `clientOnlyPanelIds` above; the
	// option is named for the constraint because this failure is silent and permanent.
	//
	// Keyed on the panel ids rather than `configKey`: those ids ARE the storage bucket, so a
	// consumer that renders a different set gets a different (or no) seed, never another
	// config's widths.
	const panelIdsKey = clientOnlyPanelIds ? bucketFor(clientOnlyPanelIds) : ""
	// biome-ignore lint/correctness/useExhaustiveDependencies: `panelIdsKey` IS `clientOnlyPanelIds`, flattened to a primitive so a fresh array literal each render doesn't re-read storage.
	const defaultLayout = React.useMemo(() => readSavedLayout(storageKey, clientOnlyPanelIds), [storageKey, panelIdsKey])

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

	// Collapse tracking state — declared here so the restore effect below can read
	// it (skip a width-restore while a pane is collapsed, so setLayout doesn't pop
	// the pane back open). Updated by pollCollapse (onResize).
	const collapsedRef = React.useRef({ a: false, b: false })
	// True during the brief window after a config change (a panel toggled) while
	// the library re-lays-out. Adding/removing a panel makes the library expand a
	// collapsed pane; we re-collapse it and, during this window, treat pollCollapse's
	// transient expand/collapse as noise (no persist, no callbacks).
	const configChangingRef = React.useRef(false)

	// The pending-restore latch. `pending` is raised when a restore is WANTED (mount, or a
	// config change) and lowered the moment the group can answer — layout applied, or
	// answered "nothing saved for this panel set". `frame` is the queued retry and `deadline`
	// bounds it. Holding the want as a flag, rather than as a chain of frames, is what lets
	// whichever signal arrives first satisfy it: the layout effect, the group's own
	// `onLayoutChanged`, or a frame.
	const restoreRef = React.useRef({ pending: false, frame: 0, deadline: 0, attempts: 0 })

	/**
	 * Assert the saved layout onto the panel set the group ACTUALLY has right now, and report
	 * whether the restore is DONE (it lowers `pending` itself when it is).
	 *
	 * "Done" is deliberately not "I called setLayout" — see RESTORE_MAX_ATTEMPTS: a setLayout
	 * during the library's init window is discarded without a word, and a layout effect runs
	 * inside that window. So the end condition is the group reporting the target BACK.
	 *
	 * UNSETTLED (`false`) covers two states: the group has no layout yet — nothing to key a
	 * bucket off, and `setLayout({})` would throw — or it has one that is not yet the target.
	 */
	const tryRestore = React.useCallback((): boolean => {
		const state = restoreRef.current
		const done = () => {
			state.pending = false
			return true
		}
		const g = groupRef.current
		if (!g) return false
		// Don't disturb a collapsed pane: we never save a layout while collapsed, so the saved
		// one has the pane EXPANDED — setLayout would pop it open (collapse restore is its own
		// effect below). Asked of the PANELS, not of `collapsedRef`: that ref is updated by
		// pollCollapse ← the panel's onResize ← the group's ResizeObserver, whereas this can run
		// synchronously from `onLayoutChanged`, so the ref is structurally one observer tick
		// stale at exactly this call site. The handles answer for now.
		if (editorRef.current?.isCollapsed() || previewRef.current?.isCollapsed()) return done()
		const current = g.getLayout() as LayoutMap
		const ids = Object.keys(current)
		// `{}` until the library has measured the group, and setLayout({}) would THROW.
		// UNSETTLED, not "nothing to do" — treating it as the latter is what dropped the
		// Playground's saved split on every load.
		if (ids.length === 0) return false
		// Bucket by the ACTUAL present ids (see bucketOf), so a saved layout is only ever
		// applied to the exact panel set it was saved for.
		const saved = readLayoutStore(storageKey)[bucketOf(current)]
		if (!saved) return done()
		const target: LayoutMap = {}
		for (const id of ids) {
			if (typeof saved[id] !== "number") return done() // incomplete → leave the layout alone
			target[id] = saved[id]
		}
		// Already there — on a seeded (`clientOnlyPanelIds`) consumer this is the normal path,
		// and the whole backstop is a no-op on the first call.
		if (layoutsMatch(current, target)) return done()
		if (state.attempts++ >= RESTORE_MAX_ATTEMPTS) return done()
		g.setLayout(target)
		return false
	}, [groupRef, editorRef, previewRef, storageKey])

	// THE BACKSTOP behind the `defaultLayout` seed above — a LAYOUT effect, deliberately not
	// `useEffect` + a double rAF.
	//
	// It covers the two cases the seed cannot: a CONFIG CHANGE (a panel toggled mid-session,
	// long after the group initialized) and a consumer that passes no `panelIds`. On an
	// ordinary load it finds the layout already correct and does nothing.
	//
	// WHAT THE RAF FORM COST (#1523), and why this is a layout effect. The old restore waited
	// for `ready` (a post-mount state flip) and then two animation frames — and frames queue
	// behind whatever else the page is doing, which on the Studio is fetching the ~505KB
	// engine. Measured on the built site at 1440x900 with a dragged split (editor 25% /
	// preview 75%): the app mounted at the hardcoded 46/54 default at t=1467ms, the pre-paint
	// instant shell — which had drawn the divider at the REMEMBERED 360.75px since t=320ms —
	// was dismissed at t=2896ms, and the saved layout only landed at t=3317ms. A returning
	// visitor watched the divider sit 302px wrong for ~400ms of naked app, after the
	// placeholder had had it right all along: right, then wrong, then right.
	//
	// It also gave up permanently the first time `getLayout()` came back `{}`, which on the
	// Playground it always did — so a dragged Playground split was persisted on every drag and
	// silently dropped on every load. Here `{}` keeps the restore PENDING, retried from the
	// group's own layout callbacks and, failing those, from frames until RESTORE_DEADLINE_MS.
	//
	// Programmatic setLayout fires onLayoutChanged with isUserInteraction=false, so nothing
	// this does is ever re-saved.
	//
	// `configKey` is deliberately a RE-RUN TRIGGER, not a value this effect reads — see
	// the header note, "`configKey` remains only the effect's re-run trigger". Dropping it
	// is behavior loss: the effect must fire again when a panel is toggled, which is
	// exactly when the library expands a collapsed pane and this puts it back.
	// biome-ignore lint/correctness/useExhaustiveDependencies: re-run trigger, see above.
	useIsomorphicLayoutEffect(() => {
		if (!active) {
			restoreRef.current.pending = false
			return
		}
		const state = restoreRef.current
		state.pending = true
		state.attempts = 0
		state.deadline = performance.now() + RESTORE_DEADLINE_MS
		const attempt = () => {
			state.frame = 0
			if (!state.pending) return
			if (!tryRestore()) {
				// Not settled — the group is unmeasured, or it has not yet reported the
				// asserted layout back. Keep asking until the deadline; the group's own layout
				// callbacks race us to it and usually win, which is the point of holding the
				// want as a flag rather than owning the timing here.
				if (performance.now() < state.deadline) state.frame = requestAnimationFrame(attempt)
				else state.pending = false
			}
		}
		attempt()
		// Drop the pending restore and any queued frame, so a stale config's layout can
		// never apply after `configKey` has moved on.
		return () => {
			state.pending = false
			if (state.frame) cancelAnimationFrame(state.frame)
			state.frame = 0
		}
	}, [active, configKey, tryRestore])

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
			// The group has just told us it HAS a layout — which is exactly what a pending
			// restore was waiting to hear, and it usually arrives before the backstop frame.
			// A user interaction while a restore is still pending abandons it instead: the
			// hand on the divider outranks the remembered position, and re-applying it under
			// the drag would fight the person doing it.
			if (restoreRef.current.pending) {
				if (meta.isUserInteraction) restoreRef.current.pending = false
				else tryRestore()
			}
			if (!meta.isUserInteraction) return
			// Persist the full layout for the ACTUAL present panel set UNLESS a pane is
			// collapsed — a collapse is its own (sessionStorage) state, and its
			// collapsedSize would poison the remembered widths.
			if (!collapsedRef.current.a && !collapsedRef.current.b) {
				writeLayout(storageKey, bucketOf(layout as LayoutMap), layout as LayoutMap)
			}
			optsRef.current.onSettle?.()
		},
		[setDrag, storageKey, tryRestore],
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
		groupProps: { groupRef, defaultLayout, onLayoutChange, onLayoutChanged },
		onEditorResize,
		onPreviewResize,
	}
}
