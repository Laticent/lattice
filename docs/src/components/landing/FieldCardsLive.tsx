import * as React from 'react';
import { seedPlaygroundSource } from '@/lib/landing-handoff';
import { createSingleSlideRenderer } from '@/lib/single-slide-render';

// Invisible controller island for the home page's live slide cards: the
// say-more before/after slide and the six audience rooms. The cards themselves
// are static (server-rendered in <SayMoreSection> and <RoomCards>); this fills
// each `data-live-card` host with a real, palette-reactive slide via the shared
// engine bridge, each one lazily as it nears the viewport. It also wires
// the "Edit this deck" handoff (seed the playground source key before nav).
//
// Kept as a zero-DOM island (renders null) so the static card markup stays
// server-rendered and only the live-render machinery ships JS — same boundary
// the playground uses (React orchestrates; the engine renders).

export type FieldCardsData = {
	cards: Record<string, { sample: string; drawn: boolean }>;
	themeBase: string;
	runtimeUrl: string;
	engineUrl: string;
	dagreUrl: string;
	katexUrl: string;
};

export default function FieldCardsLive({ data }: { data: FieldCardsData }) {
	const engineRef = React.useRef(
		createSingleSlideRenderer({
			themeBase: data.themeBase,
			runtimeUrl: data.runtimeUrl,
			engineUrl: data.engineUrl,
			dagreUrl: data.dagreUrl,
			katexUrl: data.katexUrl,
		}),
	);
	const renderedRef = React.useRef<HTMLElement[]>([]);

	React.useEffect(() => {
		const engine = engineRef.current;
		const hosts = Array.from(document.querySelectorAll<HTMLElement>('[data-live-card]'));
		let canceled = false;

		const renderCard = (host: HTMLElement) => {
			const name = host.getAttribute('data-live-card') || '';
			const c = data.cards[name];
			if (!c) return;
			engine.renderInto(host, c.sample, c.drawn).then((r) => {
				if (r.ok && !renderedRef.current.includes(host)) renderedRef.current.push(host);
			});
		};

		const renderSome = (some: HTMLElement[]) => {
			// Kick the theme CSS fetch off in PARALLEL with the engine-bundle load
			// (not behind it) — same fix as DeckPreview.tsx's paint().
			engine.prefetchTheme?.();
			engine.whenReady().then(() => {
				if (!canceled) some.forEach(renderCard);
			});
		};

		// Lazy PER HOST: each card renders as IT nears the viewport (rootMargin 300px).
		// The say-more slide sits directly under the hero, so one observer on the
		// first host's section started all seven slide frames at page load — seven
		// font sets and runtimes at once, which kept the landing from ever reaching
		// network idle on a loaded CI runner (studio-smoke `reader-alarms` on #2956).
		let io: IntersectionObserver | null = null;
		if ('IntersectionObserver' in window) {
			io = new IntersectionObserver(
				(entries) => {
					const near = entries.filter((e) => e.isIntersecting).map((e) => e.target as HTMLElement);
					for (const h of near) io?.unobserve(h);
					if (near.length) renderSome(near);
				},
				{ rootMargin: '300px' },
			);
			for (const h of hosts) io.observe(h);
		} else {
			renderSome(hosts);
		}

		// Re-render the already-shown cards on palette / mode change.
		const root = document.documentElement;
		let t: ReturnType<typeof setTimeout>;
		const mo = new MutationObserver(() => {
			clearTimeout(t);
			t = setTimeout(() => renderedRef.current.forEach(renderCard), 80);
		});
		mo.observe(root, { attributes: true, attributeFilter: ['data-palette', 'data-mode'] });

		// "Edit this deck": seed the playground source before the <a> navigates.
		const onClick = (e: MouseEvent) => {
			const a = (e.target as HTMLElement)?.closest<HTMLElement>('[data-open-deck]');
			if (!a) return;
			const c = data.cards[a.getAttribute('data-open-deck') || ''];
			if (c) seedPlaygroundSource(c.sample);
		};
		document.addEventListener('click', onClick);

		return () => {
			canceled = true;
			io?.disconnect();
			mo.disconnect();
			clearTimeout(t);
			document.removeEventListener('click', onClick);
		};
	}, [data]);

	// Release the renderer's per-host ResizeObservers + scaleTargets entries on
	// unmount (mount-once, so it never runs on a data change mid-life). This host
	// is page-lifetime so it doesn't churn, but leaving its renderer undisposed
	// would still root every card iframe until page unload. Matches DeckPreview.
	React.useEffect(() => () => engineRef.current.dispose(), []);

	return null;
}
