// A labeled group separator for the diagnostics readouts — an uppercase caption + a
// hairline rule. Shared by PerfOverlay and ReadAloudOverlay (both had an identical local
// copy). This is readout BODY content, not the draggable chassis (diagnostic-overlay.tsx) —
// kept a separate file so the chassis stays about drag/portal/gate only.
export function Sep({ label }: { label: string }) {
	return (
		<div className="mt-[7px] mb-1 flex items-center gap-2">
			<span className="text-[9px] font-semibold uppercase tracking-[0.1em] text-muted-foreground">{label}</span>
			<span className="h-px flex-1 bg-border" />
		</div>
	);
}
