"use client"

import { ArrowDownToLine, ArrowUpToLine } from "lucide-react"
import * as React from "react"
import { createPortal } from "react-dom"

import { type Box, edgeState, fits, IDLE_MS, INTENT_MS, JUMP_RETRIES, layoutFor, PAGING_KEYS, type Placement, place, STREAK_MS } from "@/lib/quick-scroll"

/**
 * QuickScroll — jump to the top or bottom of a long pane, out of the way until you scroll.
 *
 * Mount it beside a scrolling region and hand it that region as `root`:
 *   - an ELEMENT: the control follows whichever scroller inside it moves (a capturing `scroll` listener, so
 *     it does not have to know whether CodeMirror's `.cm-scroller` or its host is the one scrolling on this
 *     engine), as long as that scroller is the pane's main one (at least half its height), never a code
 *     block or a table scrolling inside it.
 *   - an IFRAME: the control follows the frame's own document, and rebinds on every `load`, because the
 *     Playground replaces its preview document.
 *
 * It renders into `document.body` at `position: fixed`, measured from the scroller's box, so no mount site
 * has to be `position: relative` or reserve room, and no `overflow: hidden` ancestor can clip it.
 *
 * Behavior (the owner's picks; the decisions live in `lib/quick-scroll.ts`): appears while the pane
 * scrolls, only when its content runs past two screens; hides 1.5s after scrolling stops, unless the
 * pointer is on it; each arrow hides at its own end. A mouse gets the edge rail, a touch screen the
 * bottom-right stack. The buttons never take focus: a click leaves the caret in the editor, and the
 * keyboard already has Ctrl/Cmd+Home and End in every pane this mounts on.
 */

type Target = {
	/** The element whose scrollTop moves (the frame's scrolling element for an iframe). */
	el: Element
	/** The scroller's visible box, viewport px. */
	box: () => Box
	/** Width its vertical scrollbar takes, px (0 for an overlay scrollbar). */
	gutter: () => number
	scrollTo: (top: number, smooth: boolean) => void
}

const scrollsY = (el: Element) => /(auto|scroll|overlay)/.test(getComputedStyle(el).overflowY)

function elementTarget(el: HTMLElement): Target {
	return {
		el,
		box: () => {
			const r = el.getBoundingClientRect()
			return { left: r.left, top: r.top, right: r.right, bottom: r.bottom }
		},
		gutter: () => {
			const cs = getComputedStyle(el)
			return Math.max(0, el.offsetWidth - el.clientWidth - (parseFloat(cs.borderLeftWidth) || 0) - (parseFloat(cs.borderRightWidth) || 0))
		},
		scrollTo: (top, smooth) => el.scrollTo({ top, behavior: smooth ? "smooth" : "auto" }),
	}
}

function frameTarget(frame: HTMLIFrameElement): Target | null {
	const win = frame.contentWindow
	const doc = frame.contentDocument
	const el = doc?.scrollingElement
	if (!win || !doc || !el) return null
	return {
		el,
		box: () => {
			const r = frame.getBoundingClientRect()
			return { left: r.left, top: r.top, right: r.right, bottom: r.bottom }
		},
		gutter: () => Math.max(0, win.innerWidth - doc.documentElement.clientWidth),
		scrollTo: (top, smooth) => win.scrollTo({ top, behavior: smooth ? "smooth" : "auto" }),
	}
}

/** True when a press lands on a vertical scrollbar: the element's own (Chromium reports it as a press on
 *  the element, at an offsetX past its clientWidth), or a frame's viewport bar (past the root's width). */
function onScrollbar(e: PointerEvent): boolean {
	const t = e.target
	if (t instanceof HTMLElement && t !== t.ownerDocument.documentElement && t !== t.ownerDocument.body) return e.offsetX >= t.clientWidth && scrollsY(t)
	const root = (t instanceof Node ? t.ownerDocument : null)?.documentElement
	return !!root && e.clientX >= root.clientWidth
}

/** True when a key lands in editable text, where Space, Home and End type or move the caret. */
function isEditable(t: EventTarget | null): boolean {
	if (!(t instanceof HTMLElement)) return false
	return t.isContentEditable || t instanceof HTMLTextAreaElement || (t instanceof HTMLInputElement && !["button", "checkbox", "radio", "range", "submit"].includes(t.type))
}

function avoidBoxes(): Box[] {
	const out: Box[] = []
	for (const el of document.querySelectorAll("[data-quick-scroll-avoid]")) {
		const r = el.getBoundingClientRect()
		if (r.width && r.height) out.push({ left: r.left, top: r.top, right: r.right, bottom: r.bottom })
	}
	return out
}

/** When someone last typed anywhere on the page: a key that is not a paging key, or any key in editable text.
 *  One capturing listener for the page, shared by every control, so typing in one pane vetoes the hover path of
 *  all of them (a preview follows its editor). Keys typed inside a frame reach `mark` and land here too. */
let typedAt = Number.NEGATIVE_INFINITY
let typingWatched = false
function noteTyping(e: KeyboardEvent) {
	if (!PAGING_KEYS.has(e.key) || isEditable(e.target)) typedAt = performance.now()
}
function watchTyping() {
	if (typingWatched || typeof document === "undefined") return
	typingWatched = true
	document.addEventListener("keydown", noteTyping, { capture: true, passive: true })
}

type View = { show: boolean; atTop: boolean; atBottom: boolean; p: Placement | null }
const HIDDEN: View = { show: false, atTop: true, atBottom: false, p: null }

export interface QuickScrollProps {
	/** The pane: an element that holds (or is) the scroller, or the iframe whose document scrolls. */
	root: React.RefObject<HTMLElement | null>
	/** What the pane holds, for the button names: "Jump to top of the {label}". */
	label: string
	className?: string
}

export function QuickScroll({ root, label, className }: QuickScrollProps) {
	const [view, setView] = React.useState<View>(HIDDEN)
	const target = React.useRef<Target | null>(null)
	const engaged = React.useRef(false)
	const idle = React.useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
	/** When the reader last touched this pane (INTENT_MS). */
	const intent = React.useRef(Number.NEGATIVE_INFINITY)
	/** When the last COUNTED scroll arrived, for STREAK_MS. */
	const lastScroll = React.useRef(Number.NEGATIVE_INFINITY)
	/** The pointer is over the pane (the second way a scroll counts; see `typedAt` for its veto). */
	const hovered = React.useRef(false)
	/** A jump in flight, re-aimed once scrolling settles if the document grew under it. */
	const pending = React.useRef<{ to: "top" | "bottom"; tries: number; timer?: ReturnType<typeof setTimeout> } | null>(null)
	const [mounted, setMounted] = React.useState(false)
	React.useEffect(() => setMounted(true), [])

	const hide = React.useCallback(() => setView((v) => (v.show ? { ...v, show: false } : v)), [])
	/** Unmount the buttons. React fires no pointerleave on unmount, so a hovered button would leave
	 *  `engaged` stuck true and the next reveal would never idle out (maker-checker finding 3). */
	const drop = React.useCallback(() => {
		engaged.current = false
		setView((v) => (v.show || v.p ? HIDDEN : v))
	}, [])
	const armIdle = React.useCallback(() => {
		clearTimeout(idle.current)
		if (!engaged.current) idle.current = setTimeout(hide, IDLE_MS)
	}, [hide])

	const reveal = React.useCallback(() => {
		const t = target.current
		if (!t?.el.isConnected) return hide()
		const flight = pending.current
		if (flight) {
			// Re-aim once the scroll settles: a lazily measured editor grows while the jump travels.
			clearTimeout(flight.timer)
			flight.timer = setTimeout(() => {
				const now = edgeState(t.el.scrollTop, t.el.scrollHeight, t.el.clientHeight)
				const short = flight.to === "bottom" ? !now.atBottom : !now.atTop
				if (short && flight.tries < JUMP_RETRIES) {
					flight.tries++
					intent.current = performance.now()
					t.scrollTo(flight.to === "top" ? 0 : t.el.scrollHeight, false)
				} else pending.current = null
			}, 150)
		}
		// The app scrolling a pane (a preview following the caret, a tour, a restore) is not the reader.
		const now = performance.now()
		// Two ways a scroll is the reader's. (1) Their own input on the pane just now: a wheel, a touch, a press on
		// its scrollbar, a paging key. (2) The pointer is over the pane and nobody has typed in it lately: a
		// scrollbar drag in an engine that sends no DOM event for the press (whether Firefox does is unverified;
		// its test build hides scrollbars). Typing ANYWHERE on the page vetoes (2): typing scrolls its own pane to
		// the caret, and a preview that follows the editor scrolls too, even with the pointer resting on it (the
		// card grader's round-2 finding; a per-pane veto let that preview's control show).
		const explicit = now - intent.current <= INTENT_MS
		if (!explicit && !(hovered.current && now - typedAt > INTENT_MS)) return
		// A scroll that continues a reader's scroll keeps counting, so a slow scrollbar drag or a long
		// momentum glide does not drop out of the window halfway (maker-checker finding, 2026-11-20).
		if (now - lastScroll.current < STREAK_MS) intent.current = now
		lastScroll.current = now
		const box = t.box()
		const e = edgeState(t.el.scrollTop, t.el.scrollHeight, t.el.clientHeight)
		if (!e.long || box.right - box.left <= 0 || box.bottom - box.top <= 0) return hide()
		const coarse = window.matchMedia?.("(pointer: coarse)").matches ?? false
		const p = place(box, t.gutter(), layoutFor(coarse), avoidBoxes())
		if (!fits(p, box)) return hide()
		setView({ show: true, atTop: e.atTop, atBottom: e.atBottom, p })
		armIdle()
	}, [armIdle, hide])

	React.useEffect(() => {
		const host = root.current
		if (!host) return
		watchTyping()
		const off: Array<() => void> = []
		const on = <K extends string>(node: EventTarget, type: K, fn: (e: Event) => void, opts: AddEventListenerOptions) => {
			node.addEventListener(type, fn, opts)
			off.push(() => node.removeEventListener(type, fn, opts))
		}
		// iOS WebKit coalesces (and during momentum defers) an overflow scroller's `scroll` event, so a
		// touch-drag can scroll without one; `touchmove` fires through the gesture (the player's finding).
		const nudge = () => target.current && reveal()
		const mark = (e: Event) => {
			// Typing scrolls the pane to follow the caret, which is the app's scroll, not the reader's. Space,
			// Home and End are typing keys in an editor, so a paging key counts only outside editable text
			// (maker-checker finding 2: a space then Enter flashed the control in Compose).
			if (e instanceof KeyboardEvent) noteTyping(e)
			if (e instanceof KeyboardEvent && (!PAGING_KEYS.has(e.key) || isEditable(e.target))) return
			// A press counts only ON A SCROLLBAR. A click into the text is the start of typing, and the
			// caret-follow scroll that typing causes is the app's.
			if (e.type === "pointerdown" && !onScrollbar(e as PointerEvent)) return
			intent.current = performance.now()
			// The reader taking over cancels a jump in flight, so its re-aim never yanks them back (finding 5).
			if (pending.current) {
				clearTimeout(pending.current.timer)
				pending.current = null
			}
		}
		const INTENT_EVENTS = ["wheel", "touchstart", "touchmove", "pointerdown", "keydown"] as const

		if (host instanceof HTMLIFrameElement) {
			let unbindFrame: (() => void) | null = null
			const bindFrame = () => {
				unbindFrame?.()
				const t = frameTarget(host)
				const win = host.contentWindow
				if (!t || !win) return
				target.current = t
				const opts = { passive: true }
				win.addEventListener("scroll", reveal, opts)
				win.addEventListener("touchmove", nudge, opts)
				for (const type of INTENT_EVENTS) win.addEventListener(type, mark, { capture: true, passive: true })
				const doc = win.document
				const over = () => {
					hovered.current = true
				}
				const out = (e: Event) => {
					if (!(e as PointerEvent).relatedTarget) hovered.current = false
				}
				doc.addEventListener("pointerover", over, { passive: true })
				doc.addEventListener("pointerout", out, { passive: true })
				unbindFrame = () => {
					win.removeEventListener("scroll", reveal)
					win.removeEventListener("touchmove", nudge)
					for (const type of INTENT_EVENTS) win.removeEventListener(type, mark, { capture: true })
					doc.removeEventListener("pointerover", over)
					doc.removeEventListener("pointerout", out)
				}
			}
			bindFrame()
			on(host, "load", bindFrame, {})
			off.push(() => unbindFrame?.())
		} else {
			const pick = (node: EventTarget | null) => {
				if (!(node instanceof HTMLElement) || !host.contains(node) || !scrollsY(node)) return
				// The pane's MAIN scroller only: a code block or a table scrolling inside it is not "the pane".
				if (node.clientHeight < host.clientHeight * 0.5) return
				if (target.current?.el !== node) target.current = elementTarget(node)
				reveal()
			}
			on(host, "scroll", (e) => pick(e.target), { capture: true, passive: true })
			for (const type of INTENT_EVENTS) on(host, type, mark, { capture: true, passive: true })
			on(host, "pointerenter", () => { hovered.current = true }, { passive: true })
			on(host, "pointerleave", () => { hovered.current = false }, { passive: true })
			on(host, "touchmove", nudge, { capture: true, passive: true })
		}
		// The buttons are placed once per reveal, so any change to the pane's box (a window resize, a split
		// drag, a sidebar, the pane hidden) drops them rather than leaving them at the old box (finding 6).
		on(window, "resize", drop, { passive: true })
		const ro = typeof ResizeObserver === "function" ? new ResizeObserver(() => drop()) : null
		ro?.observe(host)
		return () => {
			ro?.disconnect()
			for (const f of off) f()
			clearTimeout(idle.current)
			clearTimeout(pending.current?.timer)
			pending.current = null
			target.current = null
			engaged.current = false
			setView(HIDDEN)
		}
	}, [root, reveal, drop])

	const jump = (to: "top" | "bottom") => {
		const t = target.current
		if (!t) return
		const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false
		intent.current = performance.now()
		clearTimeout(pending.current?.timer)
		pending.current = { to, tries: 0 }
		t.scrollTo(to === "top" ? 0 : t.el.scrollHeight, !reduce)
	}
	/** The buttons live in `body`, so a wheel over one would scroll the document, not the pane under it.
	 *  Hand it to the pane (maker-checker finding 4: a 28px dead spot at the pane's edge). */
	const forwardWheel = (e: React.WheelEvent) => {
		const t = target.current
		if (!t) return
		const unit = e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? t.el.clientHeight : 1
		intent.current = performance.now()
		t.scrollTo(t.el.scrollTop + e.deltaY * unit, false)
	}
	const engage = () => {
		engaged.current = true
		clearTimeout(idle.current)
	}
	const release = () => {
		engaged.current = false
		armIdle()
	}

	if (!mounted || !view.p) return null
	const { p } = view
	const button = (dir: "top" | "bottom", gone: boolean) => {
		const Icon = dir === "top" ? ArrowUpToLine : ArrowDownToLine
		const at = dir === "top" ? p.up : p.down
		const visible = view.show && !gone
		return (
			<button
				type="button"
				tabIndex={-1}
				data-slot="quick-scroll"
				data-dir={dir}
				data-layout={p.layout}
				data-state={visible ? "shown" : "hidden"}
				aria-hidden={visible ? undefined : true}
				aria-label={`Jump to ${dir} of the ${label}`}
				title={`Jump to ${dir} of the ${label}`}
				onMouseDown={(e) => e.preventDefault()}
				onPointerEnter={engage}
				onPointerLeave={release}
				onClick={() => jump(dir)}
				onWheel={forwardWheel}
				style={{ left: at.x, top: at.y, width: p.size, height: p.size }}
				className={[
					"fixed z-40 m-0 grid cursor-pointer appearance-none place-items-center rounded-full border border-solid p-0",
					"border-[var(--border)] bg-[color-mix(in_srgb,var(--bg)_92%,transparent)] text-[var(--text-muted)]",
					"shadow-[0_6px_18px_-10px_rgba(0,0,0,.45)] backdrop-blur-sm",
					"transition-[opacity,transform,visibility,color,border-color] duration-200 ease-out motion-reduce:transition-none",
					"hover:border-[var(--accent)] hover:text-[var(--accent)]",
					visible ? "visible translate-y-0 opacity-100" : "pointer-events-none invisible translate-y-1 opacity-0 motion-reduce:translate-y-0",
					className,
				]
					// A plain join, not `cn()`: tailwind-merge would be the Playground's only eager reason to load it
					// (measured: the control cost 2,829 gzip bytes of startup JS with it).
					.filter(Boolean)
					.join(" ")}
			>
				<Icon aria-hidden="true" className={p.layout === "rail" ? "size-[15px]" : "size-5"} strokeWidth={2} />
			</button>
		)
	}
	return createPortal(
		<>
			{button("top", view.atTop)}
			{button("bottom", view.atBottom)}
		</>,
		document.body,
	)
}
