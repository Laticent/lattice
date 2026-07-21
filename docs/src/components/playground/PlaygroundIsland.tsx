import { type ComponentProps, StrictMode } from 'react';
import PlaygroundApp from './PlaygroundApp.tsx';

// Astro mounts this wrapper — not PlaygroundApp directly — so StrictMode is an
// ANCESTOR of the app. StrictMode only double-invokes the components rendered
// INSIDE it, so wrapping here (rather than inside PlaygroundApp's own return)
// is what makes the app's own top-level effects double-mount in dev. That
// double-mount surfaces any effect that adds a listener / timer / subscription
// without a matching cleanup return — the "doesn't unmount cleanly" leak no
// lint rule catches. StrictMode renders nothing and is a no-op in production
// builds, so shipping it on the island costs nothing at runtime.
export default function PlaygroundIsland(props: ComponentProps<typeof PlaygroundApp>) {
	return (
		<StrictMode>
			<PlaygroundApp {...props} />
		</StrictMode>
	);
}
