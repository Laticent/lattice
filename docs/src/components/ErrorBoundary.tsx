import { RotateCcw } from 'lucide-react';
import * as React from 'react';
import { chunkLoadMessage, isChunkLoadError } from '@/lib/chunk-load';

// The docs-site's ONE React error boundary. Astro mounts the Studio + Playground as
// `client:only` islands wrapped only in `<StrictMode>` (which is NOT a boundary), so
// before this a single throw in render / a lifecycle / an effect (setup OR cleanup)
// unwound the whole island → white screen. Added alongside #1186's investigation into a
// blank-screen report; the CONFIRMED trigger for that report turned out to be an
// infinite DOM-churn loop in the shared engine runtime (lib/runtime/index.js's
// `drawFixMeTags`, fixed separately — no throw involved, so this boundary alone would
// not have caught it). This boundary is independent hardening: a throw anywhere in the
// preview/anima path, from any future cause, degrades to a recoverable card instead of
// a dead surface, rather than the docs-site continuing to have zero backstop for one.
//
// It is DELIBERATELY dependency-light — no shadcn Card/Button, no engine imports — so the
// fallback itself can't be the thing that fails to render. Reused by BOTH islands (HARD
// RULE #15) and, tightly, around the Studio's live preview so a preview fault leaves the
// editor + toolbar standing.
//
// SCOPE (what a boundary does NOT catch — the guards elsewhere cover these): errors in
// event handlers and in async code (setTimeout / rAF / promises) never reach a boundary.
// The anima runtime's rebind() runs from an async frame scheduler + an iframe `load`
// listener, so its throws are guarded at the source (anima-scenes.ts try/catch). This
// boundary catches the SYNCHRONOUS commit-phase path — a throw in a React effect or its
// cleanup (DeckPreview's anima `destroy()` teardown) — which is what actually unmounts the
// tree.

type Props = {
	children: React.ReactNode;
	/**
	 * Rendered on error. Receives the caught error + a `reset()` that clears the error
	 * and re-renders `children`. Omit for the default full-surface fallback card.
	 */
	fallback?: (error: Error, reset: () => void) => React.ReactNode;
	/**
	 * When any entry changes (shallow, by-index), the boundary clears its error and retries.
	 * Pass a value that changes on navigation (e.g. deck id + slide no) so moving off the
	 * faulty slide recovers the surface automatically — no reload needed.
	 */
	resetKeys?: readonly unknown[];
	/** Short human label for the default fallback's copy ("The preview", "Lattice Studio"). */
	label?: string;
	/** Side-effect on catch (telemetry / console). The default already logs. */
	onError?: (error: Error, info: React.ErrorInfo) => void;
};

type State = { error: Error | null };

function keysChanged(a: readonly unknown[] | undefined, b: readonly unknown[] | undefined): boolean {
	if (a === b) return false;
	if (!a || !b || a.length !== b.length) return true;
	for (let i = 0; i < a.length; i++) if (!Object.is(a[i], b[i])) return true;
	return false;
}

export class ErrorBoundary extends React.Component<Props, State> {
	state: State = { error: null };

	static getDerivedStateFromError(error: Error): State {
		return { error };
	}

	componentDidCatch(error: Error, info: React.ErrorInfo): void {
		// Surface it — a swallowed boundary is its own debugging black hole.
		console.error('[ErrorBoundary] caught', this.props.label ?? '', error, info.componentStack);
		this.props.onError?.(error, info);
	}

	componentDidUpdate(prev: Props): void {
		// Auto-recover when the caller's reset keys change (e.g. the user navigated to a
		// different slide/deck), so a transient per-slide fault doesn't strand the surface.
		if (this.state.error && keysChanged(prev.resetKeys, this.props.resetKeys)) {
			this.setState({ error: null });
		}
	}

	reset = (): void => this.setState({ error: null });

	render(): React.ReactNode {
		const { error } = this.state;
		if (!error) return this.props.children;
		if (this.props.fallback) return this.props.fallback(error, this.reset);
		return <DefaultFallback error={error} reset={this.reset} label={this.props.label} />;
	}
}

function DefaultFallback({ error, reset, label }: { error: Error; reset: () => void; label?: string }) {
	const what = label ?? 'This surface';
	// A chunk that never loaded is not a crash and must not be dressed as one (#1242). The
	// generic card leads with "Try again", which cannot work here for ANY cause: the module
	// map caches the rejection for the document's lifetime, so a retry issues zero requests
	// and re-throws the same error. Lead with the one action that can change the outcome.
	if (isChunkLoadError(error)) return <ChunkLoadFallback error={error} />;
	return (
		<div
			role="alert"
			// `pointer-events-auto` so the recovery buttons work even when the boundary sits
			// inside a `pointer-events-none` host (the Studio's swipe-through preview box).
			className="pointer-events-auto flex h-full min-h-0 w-full flex-col items-center justify-center gap-4 bg-background p-6 text-center"
		>
			<div className="flex size-11 items-center justify-center rounded-full border border-border bg-card text-[var(--accent)]">
				<RotateCcw className="size-5" aria-hidden="true" />
			</div>
			<div className="max-w-sm space-y-1.5">
				<p className="text-[15px] font-semibold text-[var(--text-heading)]">{what} hit an unexpected error</p>
				<p className="text-[13px] leading-relaxed text-muted-foreground">
					Your work is safe. Try again to re-render, or reload the page if it persists.
				</p>
			</div>
			<div className="flex items-center gap-2">
				<button
					type="button"
					onClick={reset}
					className="inline-flex items-center gap-1.5 rounded-lg bg-[var(--accent)] px-3.5 py-2 text-[13px] font-semibold text-[var(--on-accent)] hover:opacity-90"
				>
					<RotateCcw className="size-3.5" aria-hidden="true" />
					Try again
				</button>
				<button
					type="button"
					onClick={() => window.location.reload()}
					className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-card px-3.5 py-2 text-[13px] font-semibold text-[var(--text-heading)] hover:bg-[var(--accent-soft)]"
				>
					Reload
				</button>
			</div>
			{import.meta.env.DEV && <pre className="max-w-full overflow-auto rounded-md bg-card p-2 text-left text-[11px] text-muted-foreground">{String(error?.message || error)}</pre>}
		</div>
	);
}

/**
 * The failed-load card: one action, because only one can change anything — a retry is a
 * no-op against the module map, whatever the cause. The copy states only what is
 * observable. It does NOT claim a deploy happened: a 404, a 403, a 500 and being offline
 * are byte-identical at this layer (see lib/chunk-load.ts), and telling an offline user
 * "a newer version shipped" is a confident falsehood on a surface this PWA supports.
 *
 * Same dependency-light construction as the default fallback (no shadcn, no engine
 * imports), so the thing that reports the failure can't be part of it.
 */
function ChunkLoadFallback({ error }: { error: Error }) {
	return (
		<div
			role="alert"
			className="pointer-events-auto flex h-full min-h-0 w-full flex-col items-center justify-center gap-4 bg-background p-6 text-center"
		>
			<div className="flex size-11 items-center justify-center rounded-full border border-border bg-card text-[var(--accent)]">
				<RotateCcw className="size-5" aria-hidden="true" />
			</div>
			<div className="max-w-sm space-y-1.5">
				<p className="text-[15px] font-semibold text-[var(--text-heading)]">{chunkLoadMessage()}</p>
				<p className="text-[13px] leading-relaxed text-muted-foreground">
					This usually means the tab has been open since an update, or the connection dropped. Your saved decks are unaffected.
				</p>
			</div>
			<button
				type="button"
				onClick={() => window.location.reload()}
				className="inline-flex items-center gap-1.5 rounded-lg bg-[var(--accent)] px-3.5 py-2 text-[13px] font-semibold text-[var(--on-accent)] hover:opacity-90"
			>
				<RotateCcw className="size-3.5" aria-hidden="true" />
				Reload
			</button>
			{/* The default card shows this in dev; dropping it here hid the message exactly where
			    a developer needs it — `astro dev`'s own 504 "Outdated Optimize Dep" on the Studio's
			    lazy imports lands in this branch (playwright.config.ts documents that flake). */}
			{import.meta.env.DEV && <pre className="max-w-full overflow-auto rounded-md bg-card p-2 text-left text-[11px] text-muted-foreground">{String(error?.message || error)}</pre>}
		</div>
	);
}
