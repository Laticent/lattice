// Test stub for react-resizable-panels (aliased in vitest.config.ts).
//
// WHY: the real library attaches a document-level, capture-phase `pointerdown`
// listener and hit-tests each pointer against every Separator's bounding rect.
// In jsdom every getBoundingClientRect() is 0×0 at (0,0) and userEvent clicks
// land at (0,0), so EVERY click "hits" a separator — the library preventDefaults
// it as a divider grab, which blocks Radix menu/select opens and breaks the
// StudioShell interaction tests. Resize behavior is only meaningfully verifiable
// in a real browser (the Playwright e2e), so unit tests render plain divs here.
//
// The stub renders one div per Panel (id + className on the same element, unlike
// the library's outer/inner pair — tests query by id/attribute, not layout) and
// no-op hooks, so state that depends on real geometry (collapse-to-rail) simply
// stays inert in jsdom, exactly as the old useSplit-based tests expected.

import * as React from "react"

function stripReserved(props: Record<string, unknown>, keys: string[]): Record<string, unknown> {
	const out: Record<string, unknown> = {}
	for (const k of Object.keys(props)) if (!keys.includes(k)) out[k] = props[k]
	return out
}

export function Group({ children, ...props }: Record<string, unknown> & { children?: React.ReactNode }) {
	const dom = stripReserved(props, [
		"orientation",
		"defaultLayout",
		"onLayoutChange",
		"onLayoutChanged",
		"disableCursor",
		"disabled",
		"groupRef",
		"resizeTargetMinimumSize",
		"elementRef",
	])
	return React.createElement("div", dom, children)
}

export function Panel({ children, ...props }: Record<string, unknown> & { children?: React.ReactNode }) {
	const dom = stripReserved(props, [
		"minSize",
		"maxSize",
		"defaultSize",
		"collapsible",
		"collapsedSize",
		"panelRef",
		"onResize",
		"groupResizeBehavior",
		"elementRef",
		"disabled",
	])
	return React.createElement("div", { "data-panel": true, ...dom }, children)
}

export function Separator({ children, ...props }: Record<string, unknown> & { children?: React.ReactNode }) {
	const dom = stripReserved(props, ["disableDoubleClick", "elementRef", "disabled"])
	return React.createElement("div", { "data-separator": true, role: "separator", ...dom }, children)
}

export function usePanelRef() {
	return React.useRef(null)
}
export function useGroupRef() {
	return React.useRef(null)
}
export function usePanelCallbackRef() {
	return React.useState<unknown>(null)
}
export function useGroupCallbackRef() {
	return React.useState<unknown>(null)
}
export function useDefaultLayout() {
	return { defaultLayout: undefined, onLayoutChange: () => {}, onLayoutChanged: () => {} }
}
export function isCoarsePointer() {
	return false
}
