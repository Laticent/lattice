import * as React from 'react';
import type { SlideJobsData } from './SlideJobs';
import type { VenueDemoData } from './VenueDemo';

// The thin, EAGER half of the two below-the-fold demos (the slide-jobs picker and the venue
// demo). The home page sits a few KB under its eager-JS ceiling (check-route-budget.mjs), and
// each demo's body (Radix tabs, two DeckPreviews, the lint verdicts) costs more than that. So
// this module is all the page loads up front: it waits until a demo is within a screen of the
// viewport, then imports the body with a dynamic import(), which the budget rightly does not
// count as eager. Both shells live in ONE module so the page references one small chunk.
//
// The islands mount `client:only` (index.astro): the bodies' server-rendered tab markup cost
// the page about 40KB of HTML, past the home route's htmlRaw ceiling, for content a visitor
// only sees after scrolling. Until a body paints, a sized placeholder holds its space, so the
// page below does not jump when it arrives.

const SlideJobs = React.lazy(() => import('./SlideJobs'));
const VenueDemo = React.lazy(() => import('./VenueDemo'));

/** True once `ref` comes within `margin` of the viewport (and stays true). */
function useNear(ref: React.RefObject<HTMLElement | null>, margin = '600px'): boolean {
	const [near, setNear] = React.useState(false);
	React.useEffect(() => {
		const el = ref.current;
		if (!el || near) return;
		if (typeof IntersectionObserver === 'undefined') {
			setNear(true);
			return;
		}
		const io = new IntersectionObserver(
			(entries) => {
				if (entries.some((e) => e.isIntersecting)) {
					setNear(true);
					io.disconnect();
				}
			},
			{ rootMargin: margin },
		);
		io.observe(el);
		return () => io.disconnect();
	}, [ref, near, margin]);
	return near;
}

/** The space a demo takes before it paints: its tab row and one 16:9 slide. */
export function DemoPlaceholder({ label }: { label: string }) {
	return (
		<div className="lx-ui min-w-0" aria-busy="true">
			<span className="sr-only">{label}</span>
			<div className="h-10 w-full rounded-lg bg-[var(--bg-alt)]" />
			<div className="mt-4 aspect-video w-full max-w-[720px] rounded-xl border border-border bg-card" />
		</div>
	);
}

function Deferred({ label, children }: { label: string; children: React.ReactNode }) {
	const ref = React.useRef<HTMLDivElement>(null);
	const near = useNear(ref);
	const placeholder = <DemoPlaceholder label={label} />;
	return (
		<div ref={ref} className="min-w-0">
			{near ? <React.Suspense fallback={placeholder}>{children}</React.Suspense> : placeholder}
		</div>
	);
}

export function SlideJobsLive({ data }: { data: SlideJobsData }) {
	return (
		<Deferred label="Loading the live slides">
			<SlideJobs data={data} />
		</Deferred>
	);
}

export function VenueDemoLive({ data }: { data: VenueDemoData }) {
	return (
		<Deferred label="Loading the venue demo">
			<VenueDemo data={data} />
		</Deferred>
	);
}
