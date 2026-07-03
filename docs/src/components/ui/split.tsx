"use client"

import * as React from "react"
import { ChevronLeft, ChevronRight } from "lucide-react"

import { cn } from "@/lib/utils"

// Resizable editor|preview split primitive (Playground + Studio).
// Design contract: engineering/decisions/2026-07-02-resizable-editor-preview-panes.md
// (§1 interaction, §3 keyboard/ARIA, §7 persistence, §8 engineering plan).
//
// The hook owns the split's state machine (ratio, collapse, drag lifecycle,
// persistence, focus handoff); the consumer owns the grid template. The two
// fr tracks read `--split-a` / `--split-b` off the container — the unit lives
// INSIDE the custom property (`0.45fr`), because `var(--split-a)fr` is invalid
// CSS (a var() can't be half a dimension token).

export type SplitSide = "a" | "b"

/** The persisted ratio band; also the keyboard clamp + aria-valuemin/max. */
const RATIO_MIN = 0.2
const RATIO_MAX = 0.8
const STEP = 0.02
const STEP_LARGE = 0.1
/** Pointer travel past a pane's px minimum before release collapses it. */
const ARM_DISTANCE = 48

const clampRatio = (r: number) => Math.min(RATIO_MAX, Math.max(RATIO_MIN, r))
/** Kill float drift (0.45 + 0.02 = 0.47000000000000003) before storing/rendering. */
const roundRatio = (r: number) => Math.round(r * 10000) / 10000

/** One frame for the grid tracks to commit, one for layout to settle on them. */
function afterLayout(fn: () => void) {
	const raf =
		typeof requestAnimationFrame === "function"
			? requestAnimationFrame
			: (cb: FrameRequestCallback) => window.setTimeout(() => cb(0), 0)
	raf(() => raf(fn))
}

/**
 * The emitted flex pair is the ratio DOUBLED — `2r fr / 2(1−r) fr` — never the
 * normalized `r/1−r`. This is load-bearing, not style (CSS Grid §12.7.1): when
 * one pane freezes at its `minmax()` px minimum, the remaining flex factors are
 * re-summed, and a sum BELOW 1 distributes only that fraction of the leftover —
 * the rest becomes an empty void at the grid's edge. With a normalized pair the
 * survivor's factor is always < 1, so dragging a pane under its minimum (or
 * merely reloading with such a ratio stored) leaves a dead strip beside the
 * preview on any container narrow enough to clamp (< ~1600px; every iPad).
 * Doubling keeps the survivor ≥ 1 in the split's whole active band, so it
 * absorbs all leftover, spec-exactly, in every engine. Reproduced + verified
 * on real WebKit and Chromium; do NOT "clean up" the pair back to sum 1 — the
 * unit test on the emitted vars is the tripwire.
 */
function splitFlexPair(ratio: number): [string, string] {
	return [`${roundRatio(2 * ratio)}fr`, `${roundRatio(2 * (1 - ratio))}fr`]
}

/** Write the track vars imperatively (the zero-React-render drag path). */
function writeVars(el: HTMLElement | null, ratio: number) {
	if (!el) return
	const [a, b] = splitFlexPair(ratio)
	el.style.setProperty("--split-a", a)
	el.style.setProperty("--split-b", b)
}

/**
 * Sanitize-on-read for the persisted ratio (the `sanitizePalette` idiom):
 * parse failure / wrong version / non-number / out of [0.2, 0.8] falls back to
 * the default AND rewrites storage so a bad value heals instead of failing
 * every mount. A missing key is a fresh visitor, not a defect — nothing is
 * written. All storage access is try/catch (private mode / storage disabled).
 */
export function sanitizeSplitRatio(storageKey: string, defaultRatio: number): number {
	return readStoredRatio(storageKey, defaultRatio, true)
}

function readStoredRatio(key: string, defaultRatio: number, heal: boolean): number {
	let raw: string | null = null
	try {
		raw = localStorage.getItem(key)
	} catch {
		return defaultRatio
	}
	if (raw === null) return defaultRatio
	try {
		const parsed: unknown = JSON.parse(raw)
		if (typeof parsed === "object" && parsed !== null && (parsed as { v?: unknown }).v === 1) {
			const a = (parsed as { a?: unknown }).a
			if (typeof a === "number" && Number.isFinite(a) && a >= RATIO_MIN && a <= RATIO_MAX) {
				return a
			}
		}
	} catch {
		/* parse failure — heal below */
	}
	if (heal) {
		try {
			localStorage.setItem(key, JSON.stringify({ v: 1, a: defaultRatio }))
		} catch {
			/* storage disabled */
		}
	}
	return defaultRatio
}

function readStoredCollapsed(key: string, heal: boolean): SplitSide | null {
	try {
		const v = sessionStorage.getItem(key)
		if (v === "a" || v === "b") return v
		if (v !== null && heal) sessionStorage.removeItem(key)
	} catch {
		/* storage disabled */
	}
	return null
}

export interface UseSplitOptions {
	/** localStorage key for the ratio, stored as `{"v":1,"a":0.45}`. */
	storageKey: string
	/** Pane A's (the editor's) default share of the editor+preview fr pair. */
	defaultRatio: number
	/** px minimums [paneA, paneB] — aria + collapse-arming math; grid minmax() enforces layout. */
	min: [number, number]
	/** Rail track width in px (28 Playground / 46 Studio) — the surface's grid template reads it. */
	railWidth: number
	/** When false (mobile tabs own layout) the hook renders inert props and writes nothing. */
	active?: boolean
	/** Stable pane element ids for aria-controls; defaults to `${storageKey}-a/-b`. */
	paneIds?: [string, string]
	/** Fired AFTER an expand commit, once layout has settled (double rAF) — re-fit the preview here. */
	onExpand?: (side: SplitSide) => void
	onCollapse?: (side: SplitSide) => void
	/** Fired once per resize commit (end-of-drag, or a keyboard step) with the new ratio. */
	onSettle?: (ratio: number) => void
}

export interface SplitContainerBind {
	ref: (el: HTMLElement | null) => void
	/** Present while dragging — CSS keys iframe pointer-events shielding + user-select off it. */
	"data-split-dragging"?: string
}

export interface SplitHandleBind {
	ref: (el: HTMLDivElement | null) => void
	role: "separator"
	tabIndex: number
	"aria-orientation": "vertical"
	"aria-label": string
	"aria-valuenow": number
	"aria-valuemin": number
	"aria-valuemax": number
	"aria-controls": string
	"data-dragging"?: string
	"data-collapsed"?: SplitSide
	onPointerDown?: React.PointerEventHandler<HTMLDivElement>
	onPointerMove?: React.PointerEventHandler<HTMLDivElement>
	onLostPointerCapture?: React.PointerEventHandler<HTMLDivElement>
	onKeyDown?: React.KeyboardEventHandler<HTMLDivElement>
	onDoubleClick?: React.MouseEventHandler<HTMLDivElement>
}

export interface SplitRailBind {
	ref: (el: HTMLButtonElement | null) => void
	type: "button"
	tabIndex: number
	"aria-expanded": boolean
	"data-side": SplitSide
	"data-visible"?: string
	onClick?: React.MouseEventHandler<HTMLButtonElement>
}

export interface UseSplitReturn {
	ratio: number
	collapsed: SplitSide | null
	dragging: boolean
	/** `{ '--split-a': '0.45fr', '--split-b': '0.55fr' }` — spread onto the container's style. */
	gridVars: React.CSSProperties
	containerProps: SplitContainerBind
	handleProps: SplitHandleBind
	railProps: (side: SplitSide) => SplitRailBind
	expand: (side: SplitSide) => void
	collapse: (side: SplitSide) => void
	reset: () => void
}

interface DragState {
	pointerId: number
	startX: number
	startRatio: number
	pairWidth: number
	lastRatio: number
	armed: SplitSide | null
	canceled: boolean
	frame: number | null
	pendingX: number | null
	/** Touch/pen drags are DEFERRED: the divider line slides under the finger
	 * (a transform on the handle — paint only, zero layout) and the tracks
	 * commit ONCE on release. Live per-frame track resizing on tablets is the
	 * jank the decision doc's coarse-pointer clause exists to prevent: the
	 * iframe re-lays-out every frame against a fit-suspended deck (stale-scaled
	 * slides over background), and iOS WebKit compounds it. */
	deferred: boolean
	/** performance.now() at pointerdown — tap detection for the synthesized
	 * double-tap reset (native dblclick never fires under touch-action:none +
	 * pointer capture on touch, so touch would otherwise have no reset path). */
	downAt: number
	onWindowKeyDown: (e: KeyboardEvent) => void
	onVisibilityChange: () => void
}

export function useSplit(options: UseSplitOptions): UseSplitReturn {
	const { storageKey, active = true } = options
	const collapsedKey = `${storageKey}-collapsed`

	// HYDRATION CONTRACT: initial state is the DEFAULT (matching the server
	// render exactly); persisted state applies in the mount effect below. React
	// 19 hydration silently DROPS attribute-level server/client mismatches in
	// production — and every restored bit here is attribute-level (the inline
	// --split vars, aria-valuenow, data-split-collapsed, inert, the rail's
	// data-visible) — so a storage read in the initializer restores the vDOM but
	// never the DOM, leaving persistence dead and a restored collapse STUCK
	// (renders deferred with both panes visible). A post-mount setState is a
	// normal re-render, which patches the DOM. Found by e2e on the built site.
	const [ratio, setRatio] = React.useState(() => roundRatio(clampRatio(options.defaultRatio)))
	const [collapsed, setCollapsed] = React.useState<SplitSide | null>(null)
	// False until the mount effect applies storage: while false, gridVars emits
	// NO inline vars, so the page's pre-paint seed (the CSS var() fallback chain)
	// carries the first paint at the SAVED ratio — an SSR'd inline --split-a
	// would override the seed and flash the default width instead.
	const [restored, setRestored] = React.useState(false)
	const [dragging, setDragging] = React.useState(false)

	// Latest-value refs: the drag lifecycle is imperative and long-lived, so its
	// listeners must never close over stale render values.
	const optsRef = React.useRef(options)
	optsRef.current = options
	const activeRef = React.useRef(active)
	activeRef.current = active
	const ratioRef = React.useRef(ratio)
	ratioRef.current = ratio
	const collapsedRef = React.useRef(collapsed)
	collapsedRef.current = collapsed

	const containerRef = React.useRef<HTMLElement | null>(null)
	const handleRef = React.useRef<HTMLDivElement | null>(null)
	const railRefs = React.useRef<Record<SplitSide, HTMLButtonElement | null>>({ a: null, b: null })
	const dragRef = React.useRef<DragState | null>(null)
	// Last no-movement release on the handle — the synthesized double-tap reset.
	const lastTapAtRef = React.useRef(0)

	const setContainerEl = React.useCallback((el: HTMLElement | null) => {
		containerRef.current = el
	}, [])
	const setHandleEl = React.useCallback((el: HTMLDivElement | null) => {
		handleRef.current = el
	}, [])
	const setRailAEl = React.useCallback((el: HTMLButtonElement | null) => {
		railRefs.current.a = el
	}, [])
	const setRailBEl = React.useCallback((el: HTMLButtonElement | null) => {
		railRefs.current.b = el
	}, [])

	// Apply persisted state post-mount (see the hydration contract above). Reads
	// sanitize; healing writes only happen while active (no storage writes while
	// the mobile tabs own layout).
	React.useEffect(() => {
		const r = readStoredRatio(storageKey, optsRef.current.defaultRatio, activeRef.current)
		ratioRef.current = r
		setRatio(r)
		const c = readStoredCollapsed(collapsedKey, activeRef.current)
		collapsedRef.current = c
		setCollapsed(c)
		setRestored(true)
		// storageKey identifies the surface; a key change is a different split.
	}, [storageKey, collapsedKey])

	const commitRatio = React.useCallback(
		(r: number, settle: boolean) => {
			const next = roundRatio(clampRatio(r))
			ratioRef.current = next
			setRatio(next)
			try {
				localStorage.setItem(storageKey, JSON.stringify({ v: 1, a: next }))
			} catch {
				/* private mode — state still applies */
			}
			if (settle) optsRef.current.onSettle?.(next)
		},
		[storageKey],
	)

	// collapse/expand can be invoked mid-drag (Enter on the focused separator, a
	// ⌘K command, a header glyph) — tear the drag down first so a captured
	// pointer can't keep ghost-writing over a collapsed layout. Ref-routed to
	// break the definition cycle (endDrag itself calls collapse on armed release).
	const endDragRef = React.useRef<(commit: boolean) => void>(() => {})

	const collapse = React.useCallback(
		(side: SplitSide) => {
			if (!activeRef.current || collapsedRef.current === side) return
			if (dragRef.current) endDragRef.current(false)
			const prev = collapsedRef.current
			collapsedRef.current = side
			setCollapsed(side)
			try {
				sessionStorage.setItem(collapsedKey, side)
			} catch {
				/* storage disabled */
			}
			// Focus handoff: the separator hides with the pane; focus left on it
			// would drop to <body>. The rail is always mounted, so this lands.
			if (handleRef.current && document.activeElement === handleRef.current) {
				railRefs.current[side]?.focus()
			}
			afterLayout(() => {
				optsRef.current.onCollapse?.(side)
				// Collapsing one side while the OTHER was collapsed implicitly
				// reveals it — a swap. Without this, work deferred while that side
				// was hidden (the Playground's paused preview renders) never runs
				// and a stale pane is presented as current.
				if (prev && prev !== side) optsRef.current.onExpand?.(prev)
			})
		},
		[collapsedKey],
	)

	const expand = React.useCallback(
		(side: SplitSide) => {
			if (!activeRef.current || collapsedRef.current !== side) return
			if (dragRef.current) endDragRef.current(false)
			collapsedRef.current = null
			setCollapsed(null)
			try {
				sessionStorage.removeItem(collapsedKey)
			} catch {
				/* storage disabled */
			}
			// Return focus to the separator only when the rail held it — a
			// programmatic reveal (applyDeck toPreview) must not steal focus.
			if (railRefs.current[side] && document.activeElement === railRefs.current[side]) {
				handleRef.current?.focus()
			}
			afterLayout(() => optsRef.current.onExpand?.(side))
		},
		[collapsedKey],
	)

	const reset = React.useCallback(() => {
		if (!activeRef.current) return
		try {
			localStorage.removeItem(storageKey)
		} catch {
			/* storage disabled */
		}
		try {
			sessionStorage.removeItem(collapsedKey)
		} catch {
			/* storage disabled */
		}
		const was = collapsedRef.current
		collapsedRef.current = null
		setCollapsed(null)
		const def = roundRatio(clampRatio(optsRef.current.defaultRatio))
		ratioRef.current = def
		setRatio(def)
		if (was) {
			if (railRefs.current[was] && document.activeElement === railRefs.current[was]) {
				handleRef.current?.focus()
			}
			// Reset implies an expand — the caller must re-fit the revealed pane.
			afterLayout(() => optsRef.current.onExpand?.(was))
		}
	}, [storageKey, collapsedKey])

	// Idempotent end-of-drag: reachable from lostpointercapture (the authority),
	// the Esc canceler, visibilitychange, deactivation, and unmount — whichever
	// fires first wins, the rest no-op on the null dragRef.
	const endDrag = React.useCallback(
		(commit: boolean) => {
			const drag = dragRef.current
			if (!drag) return
			dragRef.current = null
			if (drag.frame !== null) cancelAnimationFrame(drag.frame)
			window.removeEventListener("keydown", drag.onWindowKeyDown, true)
			document.removeEventListener("visibilitychange", drag.onVisibilityChange)
			containerRef.current?.removeAttribute("data-split-arming")
			// Ghost mode leaves a transform on the handle; the committed tracks (or
			// the rewound vars) put the real line where it belongs.
			if (handleRef.current) handleRef.current.style.transform = ""
			if (!commit || drag.canceled) {
				// Esc / teardown: restore the drag-start ratio. React state never
				// changed mid-drag, so only the imperative vars need rewinding.
				writeVars(containerRef.current, drag.startRatio)
			} else if (
				Math.abs(drag.lastRatio - drag.startRatio) * drag.pairWidth < 8 &&
				performance.now() - drag.downAt < 300
			) {
				// A TAP, not a drag. Two taps within 350ms = the synthesized
				// double-tap reset (mouse also has native dblclick → reset, which
				// is idempotent with this path).
				if (performance.now() - lastTapAtRef.current < 350) {
					lastTapAtRef.current = 0
					reset()
				} else {
					lastTapAtRef.current = performance.now()
				}
			} else if (drag.armed) {
				// Release while armed collapses that side; the ratio stays at its
				// pre-drag value so restore returns to the pre-collapse split.
				writeVars(containerRef.current, drag.startRatio)
				collapse(drag.armed)
			} else {
				commitRatio(drag.lastRatio, true)
			}
			setDragging(false)
		},
		[collapse, commitRatio, reset],
	)
	endDragRef.current = endDrag

	const onHandlePointerDown = React.useCallback(
		(e: React.PointerEvent<HTMLDivElement>) => {
			if (!activeRef.current || collapsedRef.current || dragRef.current) return
			if (e.pointerType === "mouse" && e.button !== 0) return
			// The fr pair distributes the container minus the 1px handle track
			// (rails are 0px while both panes are open, so they don't enter).
			const width = containerRef.current?.getBoundingClientRect().width ?? 0
			const pairWidth = Math.max(1, width - 1)
			const drag: DragState = {
				pointerId: e.pointerId,
				startX: e.clientX,
				startRatio: ratioRef.current,
				pairWidth,
				lastRatio: ratioRef.current,
				armed: null,
				canceled: false,
				frame: null,
				pendingX: null,
				deferred: e.pointerType === "touch" || e.pointerType === "pen",
				downAt: performance.now(),
				// Esc cancels the drag ONLY — installed at drag start, removed at
				// drag end, so it can't collide with overlay/CodeMirror Esc users.
				onWindowKeyDown: (ke: KeyboardEvent) => {
					if (ke.key !== "Escape") return
					const d = dragRef.current
					if (!d) return
					ke.preventDefault()
					ke.stopPropagation()
					d.canceled = true
					try {
						handleRef.current?.releasePointerCapture(d.pointerId)
					} catch {
						/* capture already gone */
					}
					endDrag(false)
				},
				// Belt for the capture backbone: a hidden document mid-drag
				// (Cmd-Tab, tab switch) force-ends at the last applied ratio.
				onVisibilityChange: () => {
					if (!document.hidden || !dragRef.current) return
					try {
						handleRef.current?.releasePointerCapture(dragRef.current.pointerId)
					} catch {
						/* capture already gone */
					}
					endDrag(true)
				},
			}
			dragRef.current = drag
			try {
				e.currentTarget.setPointerCapture(e.pointerId)
			} catch {
				/* jsdom / detached node */
			}
			window.addEventListener("keydown", drag.onWindowKeyDown, true)
			document.addEventListener("visibilitychange", drag.onVisibilityChange)
			setDragging(true)
		},
		[endDrag],
	)

	// rAF-coalesced: at most one CSS-var write per frame, straight onto the
	// container element — zero React state updates mid-drag (arming included:
	// data-split-arming is written imperatively and cleared in endDrag).
	const onHandlePointerMove = React.useCallback((e: React.PointerEvent<HTMLDivElement>) => {
		const drag = dragRef.current
		if (!drag || e.pointerId !== drag.pointerId) return
		drag.pendingX = e.clientX
		if (drag.frame !== null) return
		drag.frame = requestAnimationFrame(() => {
			drag.frame = null
			if (dragRef.current !== drag || drag.pendingX === null) return
			const dx = drag.pendingX - drag.startX
			const rawA = drag.startRatio * drag.pairWidth + dx
			const rawB = drag.pairWidth - rawA
			const [minA, minB] = optsRef.current.min
			// Armed = the pointer traveled ≥48px past a pane's minimum; release
			// there collapses that side, dragging back disarms.
			const armed: SplitSide | null =
				rawA <= minA - ARM_DISTANCE ? "a" : rawB <= minB - ARM_DISTANCE ? "b" : null
			drag.lastRatio = roundRatio(clampRatio(rawA / drag.pairWidth))
			const el = containerRef.current
			if (!el) return
			if (drag.deferred) {
				// Ghost mode (touch/pen): slide the divider LINE itself — a paint-only
				// transform, clamped to the band the tracks would allow — and commit
				// the tracks once at end-of-drag.
				const ghostDx = (drag.lastRatio - drag.startRatio) * drag.pairWidth
				if (handleRef.current) handleRef.current.style.transform = `translateX(${ghostDx}px)`
			} else {
				writeVars(el, drag.lastRatio)
			}
			if (armed !== drag.armed) {
				drag.armed = armed
				if (armed) el.setAttribute("data-split-arming", armed)
				else el.removeAttribute("data-split-arming")
			}
		})
	}, [])

	// lostpointercapture is the single authoritative end-of-drag: it fires for
	// pointerup AND pointercancel (mid-drag Cmd-Tab, iPad system gestures), so
	// the dragging attr / cursor / dim state can never leak.
	const onHandleLostPointerCapture = React.useCallback(
		(e: React.PointerEvent<HTMLDivElement>) => {
			const drag = dragRef.current
			if (!drag || e.pointerId !== drag.pointerId) return
			endDrag(true)
		},
		[endDrag],
	)

	const onHandleKeyDown = React.useCallback(
		(e: React.KeyboardEvent<HTMLDivElement>) => {
			// No keyboard mutations mid-drag (Esc is the drag's own window-level
			// canceler): Enter here would otherwise collapse under a captured pointer.
			if (dragRef.current) return
			if (e.key === "Enter") {
				// Deterministic: Enter always collapses the editor (side 'a'), or
				// restores whichever side is collapsed — a screen-reader user never
				// has to perceive which pane is nearer its minimum.
				e.preventDefault()
				const c = collapsedRef.current
				if (c) expand(c)
				else collapse("a")
				return
			}
			if (collapsedRef.current || dragRef.current) return
			const step = e.shiftKey ? STEP_LARGE : STEP
			let next: number | null = null
			if (e.key === "ArrowLeft") next = ratioRef.current - step
			else if (e.key === "ArrowRight") next = ratioRef.current + step
			else if (e.key === "Home") next = RATIO_MIN
			else if (e.key === "End") next = RATIO_MAX
			if (next === null) return
			e.preventDefault()
			commitRatio(next, true)
		},
		[collapse, expand, commitRatio],
	)

	const onHandleDoubleClick = React.useCallback(() => {
		reset()
	}, [reset])

	// Deactivation (rotate into tabs) mid-drag must tear the drag down; unmount too.
	React.useEffect(() => {
		if (!active) endDrag(false)
	}, [active, endDrag])
	React.useEffect(() => () => endDrag(false), [endDrag])

	const paneIds = options.paneIds ?? [`${storageKey}-a`, `${storageKey}-b`]

	const gridVars = React.useMemo(() => {
		if (!restored) {
			// Pre-restore (SSR + hydration): no inline vars — the pre-paint
			// seed's var() fallback carries the first paint at the saved ratio.
			return {} as React.CSSProperties
		}
		const [a, b] = splitFlexPair(ratio)
		return { "--split-a": a, "--split-b": b } as React.CSSProperties
	}, [ratio, restored])

	const containerProps: SplitContainerBind = {
		ref: setContainerEl,
		...(active && dragging ? { "data-split-dragging": "" } : {}),
	}

	const handleProps: SplitHandleBind = {
		ref: setHandleEl,
		role: "separator",
		tabIndex: active && !collapsed ? 0 : -1,
		"aria-orientation": "vertical",
		"aria-label": "Resize editor and preview",
		"aria-valuenow": Math.round(ratio * 100),
		"aria-valuemin": Math.round(RATIO_MIN * 100),
		"aria-valuemax": Math.round(RATIO_MAX * 100),
		"aria-controls": `${paneIds[0]} ${paneIds[1]}`,
		...(active && dragging ? { "data-dragging": "" } : {}),
		...(active && collapsed ? { "data-collapsed": collapsed } : {}),
		// Inert when inactive: no listeners at all — the tabs own the layout.
		...(active
			? {
					onPointerDown: onHandlePointerDown,
					onPointerMove: onHandlePointerMove,
					onLostPointerCapture: onHandleLostPointerCapture,
					onKeyDown: onHandleKeyDown,
					onDoubleClick: onHandleDoubleClick,
				}
			: {}),
	}

	const railProps = React.useCallback(
		(side: SplitSide): SplitRailBind => {
			const visible = active && collapsed === side
			return {
				ref: side === "a" ? setRailAEl : setRailBEl,
				type: "button",
				tabIndex: visible ? 0 : -1,
				"aria-expanded": false,
				"data-side": side,
				...(visible ? { "data-visible": "" } : {}),
				...(active ? { onClick: () => expand(side) } : {}),
			}
		},
		[active, collapsed, expand, setRailAEl, setRailBEl],
	)

	return {
		ratio,
		collapsed: active ? collapsed : null,
		dragging: active && dragging,
		gridVars,
		containerProps,
		handleProps,
		railProps,
		expand,
		collapse,
		reset,
	}
}

/**
 * The separator. Spread `split.handleProps` onto it. At rest it is visually
 * just the 1px border line; hover / focus-visible reveal the grip dots; while
 * dragging the line turns accent. `children` replaces the default grip.
 */
function SplitHandle({ className, children, ...props }: React.ComponentProps<"div">) {
	return (
		<div
			data-slot="split-handle"
			className={cn(
				// z-10: the grab overlay must hit-test ABOVE pane content — the
				// Playground's preview iframe is z-index:1 and would otherwise swallow
				// every grab except on the editor side (found on the real surface:
				// elementFromPoint at the divider returned the IFRAME).
				"group/split-handle relative z-10 flex cursor-col-resize touch-none items-center justify-center border-l border-border outline-none select-none",
				"transition-colors duration-150",
				"hover:border-l-[color:color-mix(in_srgb,var(--accent)_45%,var(--border))]",
				"focus-visible:border-l-[color:var(--accent)]",
				"data-[dragging]:border-l-[color:var(--accent)]",
				// The 1px track IS the divider line; the grab target is an out-of-flow
				// overlay straddling it, biased toward the preview so a grab beside the
				// CodeMirror scrollbar can't start a drag. Wider on coarse pointers.
				"after:absolute after:inset-y-0 after:-left-1 after:-right-2 after:content-['']",
				"pointer-coarse:after:-left-3 pointer-coarse:after:-right-3",
				// While a pane is collapsed the handle's track is 0px — paint nothing,
				// catch nothing (the rail owns the edge until restore).
				"data-[collapsed]:invisible data-[collapsed]:pointer-events-none",
				className,
			)}
			{...props}
		>
			{children ?? (
				<span
					data-slot="split-grip"
					aria-hidden="true"
					className="pointer-events-none flex flex-col gap-[3px] opacity-0 transition-opacity duration-150 group-hover/split-handle:opacity-100 group-focus-visible/split-handle:opacity-100 group-data-[dragging]/split-handle:opacity-100 pointer-coarse:opacity-50"
				>
					<span className="size-[3px] rounded-full bg-muted-foreground" />
					<span className="size-[3px] rounded-full bg-muted-foreground" />
					<span className="size-[3px] rounded-full bg-muted-foreground" />
				</span>
			)}
		</div>
	)
}

/**
 * The collapsed-pane restore rail: ONE button — the whole rail is the target.
 * Spread `split.railProps(side)` onto it. Rails are ALWAYS rendered so the
 * grid's track count matches its children; visibility comes from the track
 * width plus the data-visible attr — min-w-0 + overflow-hidden guarantee a
 * 0px track paints nothing. `children` is the badge slot.
 */
function SplitRail({
	direction,
	label,
	labelExpand,
	className,
	children,
	...props
}: React.ComponentProps<"button"> & {
	/** Which way the restored pane slides back in — picks the chevron glyph. */
	direction: "left" | "right"
	/** Vertical mono uppercase label, e.g. "Markdown" / "Rendered slides". */
	label: string
	/** Accessible action name, e.g. "Expand editor". */
	labelExpand: string
}) {
	const Chevron = direction === "left" ? ChevronLeft : ChevronRight
	return (
		<button
			type="button"
			data-slot="split-rail"
			aria-label={labelExpand}
			title={labelExpand}
			className={cn(
				"flex min-w-0 cursor-pointer flex-col items-center gap-2 overflow-hidden border-border bg-muted/40 py-2 outline-none",
				// The 1px boundary line survives collapse on the PANE-facing edge —
				// rail-a (editor collapsed, viewport-left) borders right, rail-b
				// (preview collapsed, viewport-right) borders left. Without it the
				// rail floats against the expanded pane; the outer edge needs none.
				"data-[side=a]:border-r data-[side=b]:border-l",
				"transition-colors hover:bg-muted",
				"focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[color:var(--accent)]",
				// A rail whose track is 0px must paint nothing — borders would still
				// draw a sliver, so visibility (not display) gates it: the rail stays a
				// grid item, keeping track count == child count in every state.
				"invisible data-[visible]:visible",
				className,
			)}
			{...props}
		>
			<Chevron aria-hidden="true" className="size-4 shrink-0 text-muted-foreground" />
			<span className="shrink-0 font-mono text-[10px] tracking-widest text-muted-foreground uppercase [writing-mode:vertical-rl]">
				{label}
			</span>
			{children}
		</button>
	)
}

export { SplitHandle, SplitRail }
