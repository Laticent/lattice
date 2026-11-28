import { type ComponentProps, StrictMode, useMemo } from 'react';
import { unpackCatalog, type WireCatalogItem } from '@/lib/catalog-wire';
import { ErrorBoundary } from '../ErrorBoundary.tsx';
import PlaygroundApp from './PlaygroundApp.tsx';

// Astro mounts this wrapper — not PlaygroundApp directly — so StrictMode is an
// ANCESTOR of the app. StrictMode only double-invokes the components rendered
// INSIDE it, so wrapping here (rather than inside PlaygroundApp's own return)
// is what makes the app's own top-level effects double-mount in dev. That
// double-mount surfaces any effect that adds a listener / timer / subscription
// without a matching cleanup return — the "doesn't unmount cleanly" leak no
// lint rule catches. StrictMode renders nothing and is a no-op in production
// builds, so shipping it on the island costs nothing at runtime.
type AppData = ComponentProps<typeof PlaygroundApp>['data'];

// The page sends the catalog in its packed wire form (catalog-wire.ts: the island prop
// is written into the HTML, and two word lists as arrays pushed the page past its byte
// ceiling). Unpack once here, so PlaygroundApp only ever sees arrays.
export default function PlaygroundIsland({ data: wire }: { data: Omit<AppData, 'components'> & { components: WireCatalogItem[] } }) {
	const data = useMemo<AppData>(() => ({ ...wire, components: unpackCatalog(wire.components) }), [wire]);
	// Island-level backstop: a throw anywhere in the app degrades to a recoverable card
	// instead of unmounting the whole client:only island to a white screen.
	return (
		<StrictMode>
			<ErrorBoundary label="The Playground">
				<PlaygroundApp data={data} />
			</ErrorBoundary>
		</StrictMode>
	);
}
