import * as React from 'react';

// The one line that says a reply is still happening.
//
// It replaces two things that each failed alone: a row of bouncing dots that showed only
// while the reply was EMPTY (so only on the first turn of a thread, and never again once
// any prose had streamed), and a 2px pulsing bar after the text that read as a stuck
// cursor. A turn that streams "I'll read the slides…", runs a tool, then thinks for
// seconds before the next token had nothing moving at all.
//
// So it is present for the WHOLE turn, under the text where the eye already is, and it
// always names the phase. `label` is the agent's own ("Reading slides…", "Drafting the
// edit…"); with none, the panel passes "Thinking…" or "Writing…" from whether prose has
// arrived. `progress` changes whenever anything visibly moved, and resets the stall timer:
// a turn silent past STALL_MS says so instead of looking hung.

const STALL_MS = 15_000;

export function ChatLiveStatus({ label, progress }: { label: string; progress: unknown }) {
	const [stalled, setStalled] = React.useState(false);
	// biome-ignore lint/correctness/useExhaustiveDependencies: `progress` is the intentional reset trigger.
	React.useEffect(() => {
		setStalled(false);
		const t = setTimeout(() => setStalled(true), STALL_MS);
		return () => clearTimeout(t);
	}, [progress]);
	return (
		<div className="flex items-center gap-2 py-0.5 text-[12px] text-muted-foreground" role="status" aria-live="polite" data-testid="chat-live-status">
			<span className="flex shrink-0 gap-[3px]" aria-hidden>
				<span className="size-1.5 animate-bounce rounded-full bg-[var(--accent)] [animation-delay:-0.2s]" />
				<span className="size-1.5 animate-bounce rounded-full bg-[var(--accent)] [animation-delay:-0.1s]" />
				<span className="size-1.5 animate-bounce rounded-full bg-[var(--accent)]" />
			</span>
			<span>{stalled ? `${label.replace(/…$/, '')} — still working, long edits take a moment` : label}</span>
		</div>
	);
}
