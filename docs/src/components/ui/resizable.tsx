"use client"

import { Group, type GroupProps, Panel, type PanelProps, Separator, type SeparatorProps } from "react-resizable-panels"

import { cn } from "@/lib/utils"

// Resizable panel primitive — the shadcn "resizable" component, wired to
// react-resizable-panels v4. This REPLACES the hand-rolled ui/split.tsx +
// studio/use-panel-width.ts pair (2026-07-19 decision doc). One proven library
// now serves every resizable seam on both authoring surfaces: the Playground's
// editor|preview split AND the Studio's Settings / Assistant (Coach·Library·Chat)
// / editor / preview workspace columns.
//
// Why v4 fits where v2 was rejected (PR #717): v4's min/max/collapsedSize accept
// PIXELS natively (a bare number is px, a unitless string is a percentage), so
// the px pane minimums (editor 240, preview 280, panel mins) are expressed
// directly — retiring the fr-pair "void" math (#721) that made the CSS-Grid
// approach fragile. `collapsible` + `collapsedSize` + the panelRef imperative
// `collapse()`/`expand()` give the collapse-to-rail affordance. The library owns
// pointer capture, keyboard/ARIA (role="separator" + arrow keys), and the
// coarse-pointer hit target — the parts the custom primitive hand-rolled and the
// field kept finding bugs in. Layout PERSISTENCE is hand-rolled in
// use-resizable-split.ts (v4.12's useDefaultLayout keys its save and restore paths
// differently and never round-trips a two-panel layout).
//
// The consumer still owns the two things no splitter library solves: the srcdoc
// preview-iframe pointer shield and the __latticeFit re-fit choreography. Both
// ride on the group's onLayoutChange (fires per pointer-move → suspend) /
// onLayoutChanged (fires on release → one authoritative re-fit) callbacks.

/**
 * The panel group — spread orientation + persistence callbacks here. Renders the
 * flex container react-resizable-panels lays its Panels/Separators into.
 */
function ResizablePanelGroup({ className, ...props }: GroupProps) {
	return (
		<Group
			data-slot="resizable-panel-group"
			className={cn("flex h-full w-full data-[orientation=vertical]:flex-col", className)}
			{...props}
		/>
	)
}

/**
 * A resizable region. `minSize`/`maxSize`/`defaultSize`/`collapsedSize` take a
 * bare number for pixels (e.g. `minSize={240}`) or a unitless string for a
 * percentage (`minSize="20"`). Pass `panelRef` (from `usePanelRef`) to drive
 * `collapse()`/`expand()` imperatively.
 */
function ResizablePanel({ className, ...props }: PanelProps) {
	return <Panel data-slot="resizable-panel" className={cn("flex min-h-0 min-w-0 flex-col", className)} {...props} />
}

/**
 * The divider. Boardroom-quiet at rest — it IS a 1px `var(--border)` line;
 * hover / focus-visible / active reveal three grip dots and warm the line to
 * accent. The grab hit area is an out-of-flow overlay straddling the line
 * (wider on coarse pointers); the library extends the effective target via the
 * group's `resizeTargetMinimumSize`. `withHandle` (default) shows the "Rail" grip
 * — three quiet dots on the seam (always visible so the divider reads as a handle
 * at rest, incl. on touch where there is no hover) that snap to accent on hover /
 * focus / drag. `withHandle={false}` is a plain hairline seam.
 */
function ResizableHandle({
	className,
	withHandle = true,
	...props
}: SeparatorProps & { withHandle?: boolean }) {
	return (
		<Separator
			data-slot="resizable-handle"
			className={cn(
				// z-10: the grab overlay must hit-test ABOVE pane content — the preview
				// iframe is z-index:1 and would otherwise swallow grabs on that side
				// (elementFromPoint at the divider returned the iframe on the real page).
				"group/resize-handle relative z-10 flex w-px shrink-0 items-center justify-center bg-border outline-none",
				"transition-colors duration-150",
				"hover:bg-[color:color-mix(in_srgb,var(--accent)_45%,var(--border))]",
				"focus-visible:bg-[color:var(--accent)]",
				"data-[separator]:active:bg-[color:var(--accent)]",
				// The 1px element IS the seam; the grab target is an out-of-flow overlay
				// straddling it, biased toward the right pane so a grab beside a
				// CodeMirror scrollbar can't start a drag. Wider on coarse pointers.
				"after:absolute after:inset-y-0 after:-left-1 after:-right-2 after:content-['']",
				"pointer-coarse:after:-left-3 pointer-coarse:after:-right-3",
				className,
			)}
			{...props}
		>
			{withHandle ? (
				// "Rail" grip — three quiet dots on the seam. Always visible (~34%) so the
				// divider reads as a handle at rest, incl. on touch (no hover there); the
				// dots go solid accent + full opacity on hover / focus / active drag.
				<span
					data-slot="resize-grip"
					aria-hidden="true"
					className={cn(
						"pointer-events-none z-10 flex flex-col items-center gap-[3px] opacity-[0.34] transition-opacity duration-150",
						"group-hover/resize-handle:opacity-100 group-focus-visible/resize-handle:opacity-100 group-active/resize-handle:opacity-100 pointer-coarse:opacity-50",
					)}
				>
					{[0, 1, 2].map((i) => (
						<span
							key={i}
							className="size-[3px] rounded-full bg-muted-foreground transition-colors duration-150 group-hover/resize-handle:bg-[color:var(--accent)] group-focus-visible/resize-handle:bg-[color:var(--accent)] group-active/resize-handle:bg-[color:var(--accent)]"
						/>
					))}
				</span>
			) : null}
		</Separator>
	)
}

export { ResizableHandle, ResizablePanel, ResizablePanelGroup }
