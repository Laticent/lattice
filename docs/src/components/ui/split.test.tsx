import { fireEvent, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"
import { SplitHandle, SplitRail, sanitizeSplitRatio, useSplit, type UseSplitOptions } from "./split"

// jsdom has no layout, so these tests exercise the split's LOGIC — keyboard,
// collapse/expand, focus handoff, persistence, sanitize-on-read, inertness —
// never real pointer capture or grid geometry (those are e2e territory).

const KEY = "test-split"
const COLLAPSED_KEY = `${KEY}-collapsed`

afterEach(() => {
	localStorage.clear()
	sessionStorage.clear()
})

function Harness(props: Partial<UseSplitOptions>) {
	const split = useSplit({
		storageKey: KEY,
		defaultRatio: 0.45,
		min: [280, 320],
		railWidth: 28,
		...props,
	})
	return (
		<div data-testid="container" {...split.containerProps} style={split.gridVars}>
			<div id={`${KEY}-a`} />
			<SplitHandle {...split.handleProps} />
			<div id={`${KEY}-b`} />
			<SplitRail {...split.railProps("a")} direction="right" label="Markdown" labelExpand="Expand editor" />
			<SplitRail {...split.railProps("b")} direction="left" label="Preview" labelExpand="Expand preview" />
			<span data-testid="collapsed">{String(split.collapsed)}</span>
		</div>
	)
}

const separator = () => screen.getByRole("separator")
const railA = () => screen.getByRole("button", { name: "Expand editor" })
const railB = () => screen.getByRole("button", { name: "Expand preview" })

describe("sanitizeSplitRatio", () => {
	it("passes a valid stored ratio through and leaves storage untouched", () => {
		localStorage.setItem(KEY, '{"v":1,"a":0.6}')
		expect(sanitizeSplitRatio(KEY, 0.45)).toBe(0.6)
		expect(localStorage.getItem(KEY)).toBe('{"v":1,"a":0.6}')
	})

	it("returns the default without writing when no value is stored", () => {
		expect(sanitizeSplitRatio(KEY, 0.45)).toBe(0.45)
		expect(localStorage.getItem(KEY)).toBeNull()
	})

	it("heals a parse failure: default returned AND storage rewritten", () => {
		localStorage.setItem(KEY, "{not json")
		expect(sanitizeSplitRatio(KEY, 0.45)).toBe(0.45)
		expect(localStorage.getItem(KEY)).toBe('{"v":1,"a":0.45}')
	})

	it("heals a wrong version", () => {
		localStorage.setItem(KEY, '{"v":2,"a":0.6}')
		expect(sanitizeSplitRatio(KEY, 0.45)).toBe(0.45)
		expect(localStorage.getItem(KEY)).toBe('{"v":1,"a":0.45}')
	})

	it("heals a non-numeric ratio", () => {
		localStorage.setItem(KEY, '{"v":1,"a":"wide"}')
		expect(sanitizeSplitRatio(KEY, 0.45)).toBe(0.45)
		expect(localStorage.getItem(KEY)).toBe('{"v":1,"a":0.45}')
	})

	it("heals an out-of-band ratio (both ends)", () => {
		localStorage.setItem(KEY, '{"v":1,"a":0.05}')
		expect(sanitizeSplitRatio(KEY, 0.45)).toBe(0.45)
		expect(localStorage.getItem(KEY)).toBe('{"v":1,"a":0.45}')
		localStorage.setItem(KEY, '{"v":1,"a":0.95}')
		expect(sanitizeSplitRatio(KEY, 0.45)).toBe(0.45)
		expect(localStorage.getItem(KEY)).toBe('{"v":1,"a":0.45}')
	})
})

describe("keyboard on the separator", () => {
	it("arrows step 2% (Shift 10%) and clamp to the band, updating aria-valuenow", () => {
		render(<Harness />)
		const sep = separator()
		expect(sep).toHaveAttribute("aria-valuenow", "45")
		expect(sep).toHaveAttribute("aria-valuemin", "20")
		expect(sep).toHaveAttribute("aria-valuemax", "80")
		fireEvent.keyDown(sep, { key: "ArrowRight" })
		expect(sep).toHaveAttribute("aria-valuenow", "47")
		fireEvent.keyDown(sep, { key: "ArrowLeft", shiftKey: true })
		expect(sep).toHaveAttribute("aria-valuenow", "37")
		for (let i = 0; i < 5; i++) fireEvent.keyDown(sep, { key: "ArrowLeft", shiftKey: true })
		expect(sep).toHaveAttribute("aria-valuenow", "20")
		for (let i = 0; i < 12; i++) fireEvent.keyDown(sep, { key: "ArrowRight", shiftKey: true })
		expect(sep).toHaveAttribute("aria-valuenow", "80")
	})

	it("Home/End jump to min/max and never collapse", () => {
		render(<Harness />)
		const sep = separator()
		fireEvent.keyDown(sep, { key: "Home" })
		expect(sep).toHaveAttribute("aria-valuenow", "20")
		expect(screen.getByTestId("collapsed").textContent).toBe("null")
		fireEvent.keyDown(sep, { key: "End" })
		expect(sep).toHaveAttribute("aria-valuenow", "80")
		expect(screen.getByTestId("collapsed").textContent).toBe("null")
	})

	it("Enter collapses the editor (side a) deterministically, Enter again restores", () => {
		render(<Harness />)
		const sep = separator()
		fireEvent.keyDown(sep, { key: "Enter" })
		expect(screen.getByTestId("collapsed").textContent).toBe("a")
		fireEvent.keyDown(sep, { key: "Enter" })
		expect(screen.getByTestId("collapsed").textContent).toBe("null")
	})

	it("arrows are inert while collapsed", () => {
		render(<Harness />)
		const sep = separator()
		fireEvent.keyDown(sep, { key: "Enter" })
		fireEvent.keyDown(sep, { key: "ArrowRight" })
		expect(sep).toHaveAttribute("aria-valuenow", "45")
	})
})

describe("collapse / expand", () => {
	it("rails carry aria-expanded=false and data-visible only for the collapsed side", () => {
		render(<Harness />)
		expect(railA()).toHaveAttribute("aria-expanded", "false")
		expect(railA()).not.toHaveAttribute("data-visible")
		expect(railB()).not.toHaveAttribute("data-visible")
		fireEvent.keyDown(separator(), { key: "Enter" })
		expect(railA()).toHaveAttribute("data-visible")
		expect(railA()).toHaveAttribute("tabindex", "0")
		expect(railB()).not.toHaveAttribute("data-visible")
		expect(railB()).toHaveAttribute("tabindex", "-1")
	})

	it("clicking the rail expands and fires onExpand after layout settles", async () => {
		const onExpand = vi.fn()
		render(<Harness onExpand={onExpand} />)
		fireEvent.keyDown(separator(), { key: "Enter" })
		fireEvent.click(railA())
		expect(screen.getByTestId("collapsed").textContent).toBe("null")
		await vi.waitFor(() => expect(onExpand).toHaveBeenCalledWith("a"))
	})

	it("collapse fires onCollapse after layout settles", async () => {
		const onCollapse = vi.fn()
		render(<Harness onCollapse={onCollapse} />)
		fireEvent.keyDown(separator(), { key: "Enter" })
		await vi.waitFor(() => expect(onCollapse).toHaveBeenCalledWith("a"))
	})

	it("Enter-collapse hands focus from the separator to the rail; expand returns it", () => {
		render(<Harness />)
		const sep = separator()
		sep.focus()
		fireEvent.keyDown(sep, { key: "Enter" })
		expect(document.activeElement).toBe(railA())
		fireEvent.keyDown(railA(), { key: "Enter" }) // native button: Enter clicks…
		fireEvent.click(railA()) // …which jsdom doesn't synthesize, so click explicitly
		expect(document.activeElement).toBe(sep)
	})

	it("hydrates a collapsed side from sessionStorage and drops garbage", () => {
		sessionStorage.setItem(COLLAPSED_KEY, "b")
		const { unmount } = render(<Harness />)
		expect(screen.getByTestId("collapsed").textContent).toBe("b")
		unmount()
		sessionStorage.setItem(COLLAPSED_KEY, "sideways")
		render(<Harness />)
		expect(screen.getByTestId("collapsed").textContent).toBe("null")
		expect(sessionStorage.getItem(COLLAPSED_KEY)).toBeNull()
	})
})

describe("persistence", () => {
	it("hydrates the ratio from localStorage", () => {
		localStorage.setItem(KEY, '{"v":1,"a":0.6}')
		render(<Harness />)
		expect(separator()).toHaveAttribute("aria-valuenow", "60")
	})

	it("writes the versioned ratio on a keyboard commit", () => {
		render(<Harness />)
		fireEvent.keyDown(separator(), { key: "ArrowRight" })
		expect(localStorage.getItem(KEY)).toBe('{"v":1,"a":0.47}')
	})

	it("writes the collapsed side to sessionStorage and clears it on expand", () => {
		render(<Harness />)
		fireEvent.keyDown(separator(), { key: "Enter" })
		expect(sessionStorage.getItem(COLLAPSED_KEY)).toBe("a")
		fireEvent.click(railA())
		expect(sessionStorage.getItem(COLLAPSED_KEY)).toBeNull()
	})

	it("double-click on the handle resets: both stores cleared, back to the default", () => {
		render(<Harness />)
		const sep = separator()
		fireEvent.keyDown(sep, { key: "ArrowRight" })
		fireEvent.keyDown(sep, { key: "Enter" })
		expect(localStorage.getItem(KEY)).not.toBeNull()
		expect(sessionStorage.getItem(COLLAPSED_KEY)).toBe("a")
		fireEvent.doubleClick(sep)
		expect(localStorage.getItem(KEY)).toBeNull()
		expect(sessionStorage.getItem(COLLAPSED_KEY)).toBeNull()
		expect(sep).toHaveAttribute("aria-valuenow", "45")
		expect(screen.getByTestId("collapsed").textContent).toBe("null")
	})
})

describe("drag lifecycle (logic only — no real capture/layout in jsdom)", () => {
	it("pointerdown marks dragging; lostpointercapture settles, persists, cleans up", () => {
		const onSettle = vi.fn()
		// A no-movement release inside 300ms is a TAP (the synthesized double-tap
		// reset path), not a drag — advance the clock so this reads as a real
		// (held) drag and the release commits + settles.
		const now = vi.spyOn(performance, "now")
		let t = 1000
		now.mockImplementation(() => (t += 400))
		render(<Harness onSettle={onSettle} />)
		const sep = separator()
		fireEvent.pointerDown(sep, { pointerId: 1, clientX: 500, button: 0 })
		expect(screen.getByTestId("container")).toHaveAttribute("data-split-dragging")
		expect(sep).toHaveAttribute("data-dragging")
		fireEvent.lostPointerCapture(sep, { pointerId: 1 })
		expect(screen.getByTestId("container")).not.toHaveAttribute("data-split-dragging")
		expect(onSettle).toHaveBeenCalledTimes(1)
		expect(onSettle).toHaveBeenCalledWith(0.45)
		expect(localStorage.getItem(KEY)).toBe('{"v":1,"a":0.45}')
		now.mockRestore()
	})

	it("two quick no-movement taps on the handle reset the split (touch's double-tap)", () => {
		render(<Harness />)
		const sep = separator()
		// Move off the default first so the reset is observable.
		fireEvent.keyDown(sep, { key: "ArrowRight" })
		expect(localStorage.getItem(KEY)).not.toBeNull()
		// Tap 1 + tap 2, no movement, well within the 350ms window.
		fireEvent.pointerDown(sep, { pointerId: 2, clientX: 500, button: 0 })
		fireEvent.lostPointerCapture(sep, { pointerId: 2 })
		fireEvent.pointerDown(sep, { pointerId: 3, clientX: 500, button: 0 })
		fireEvent.lostPointerCapture(sep, { pointerId: 3 })
		expect(localStorage.getItem(KEY)).toBeNull()
		expect(sep).toHaveAttribute("aria-valuenow", "45")
	})

	it("Esc cancels an active drag without committing anything", () => {
		const onSettle = vi.fn()
		render(<Harness onSettle={onSettle} />)
		const sep = separator()
		fireEvent.pointerDown(sep, { pointerId: 1, clientX: 500, button: 0 })
		fireEvent.keyDown(window, { key: "Escape" })
		expect(screen.getByTestId("container")).not.toHaveAttribute("data-split-dragging")
		expect(onSettle).not.toHaveBeenCalled()
		expect(localStorage.getItem(KEY)).toBeNull()
	})
})

describe("active: false (mobile tabs own layout)", () => {
	it("renders inert props and never writes storage on interaction attempts", () => {
		render(<Harness active={false} />)
		const sep = separator()
		fireEvent.keyDown(sep, { key: "ArrowRight" })
		fireEvent.keyDown(sep, { key: "Enter" })
		fireEvent.doubleClick(sep)
		fireEvent.pointerDown(sep, { pointerId: 1, clientX: 500, button: 0 })
		fireEvent.click(railA())
		fireEvent.click(railB())
		expect(localStorage.getItem(KEY)).toBeNull()
		expect(sessionStorage.getItem(COLLAPSED_KEY)).toBeNull()
		expect(sep).toHaveAttribute("aria-valuenow", "45")
		expect(sep).toHaveAttribute("tabindex", "-1")
		expect(screen.getByTestId("collapsed").textContent).toBe("null")
		expect(screen.getByTestId("container")).not.toHaveAttribute("data-split-dragging")
	})

	it("still exposes the sanitized stored ratio via gridVars for seamless re-activation", () => {
		localStorage.setItem(KEY, '{"v":1,"a":0.6}')
		render(<Harness active={false} />)
		const container = screen.getByTestId("container")
		expect(container.style.getPropertyValue("--split-a")).toBe("0.6fr")
		expect(container.style.getPropertyValue("--split-b")).toBe("0.4fr")
		// Inactive reads must not heal (no writes): garbage stays put.
		localStorage.setItem(KEY, "garbage")
		render(<Harness active={false} storageKey="other-split" />)
		expect(localStorage.getItem(KEY)).toBe("garbage")
	})
})
