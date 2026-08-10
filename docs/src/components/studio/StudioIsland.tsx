import { type ComponentProps, StrictMode } from 'react';
import { noteError } from '@/lib/crash-sentinel';
import { ErrorBoundary } from '../ErrorBoundary.tsx';
import StudioShell from './StudioShell.tsx';

// Astro mounts this wrapper — not StudioShell directly — so StrictMode is an
// ANCESTOR of the shell. That matters: StrictMode only double-invokes the
// components rendered INSIDE it, so wrapping here (rather than inside
// StudioShell's own return) is what makes the shell's own top-level effects
// double-mount in dev. That double-mount surfaces any effect that adds a
// listener / timer / subscription without a matching cleanup return — the
// "doesn't unmount cleanly" leak no lint rule catches. StrictMode renders
// nothing and is a no-op in production builds, so shipping it on the island
// costs nothing at runtime.
export default function StudioIsland(props: ComponentProps<typeof StudioShell>) {
	// The boundary is the ISLAND-LEVEL backstop: a throw anywhere in the shell (render,
	// a lifecycle, an effect / its cleanup) lands here as a recoverable card instead of
	// unmounting the whole client:only island to a white screen. A tighter boundary
	// around the live preview (StudioShell) keeps the editor + toolbar alive on the
	// common case — a preview fault — so this whole-shell fallback is the last resort.
	return (
		<StrictMode>
			{/* onError hands the fault to the crash sentinel. A boundary catch never
			    reaches `window.onerror`, so the recorder would otherwise have no idea
			    the whole shell had just come down — and this is the fault most likely
			    to precede the user reloading. */}
			<ErrorBoundary label="Lattice Studio" onError={(err) => noteError(err, 'studio boundary')}>
				<StudioShell {...props} />
			</ErrorBoundary>
		</StrictMode>
	);
}
