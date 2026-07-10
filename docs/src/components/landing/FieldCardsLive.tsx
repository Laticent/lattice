import * as React from 'react';
import { seedPlaygroundSource } from '@/lib/landing-handoff';
import { createSingleSlideRenderer } from '@/lib/single-slide-render';

// Invisible controller island for the "speaks your field" section. The cards
// themselves are static (server-rendered in <FieldCards>); this fills each
// card's `data-live-card` host with a real, palette-reactive slide via the
// shared engine bridge, lazily as the section nears the viewport. It also wires
// the "Edit this deck" handoff (seed the playground source key before nav).
//
// Kept as a zero-DOM island (renders null) so the static card markup stays
// server-rendered and only the live-render machinery ships JS — same boundary
// the playground uses (React orchestrates; the engine renders).

export type FieldCardsData = {
	cards: Record<string, { sample: string; mermaid: boolean }>;
	themeBase: string;
	runtimeUrl: string;
	engineUrl: string;
};

export default function FieldCardsLive({ data }: { data: FieldCardsData }) {
	const engineRef = React.useRef(
		createSingleSlideRenderer({ themeBase: data.themeBase, runtimeUrl: data.runtimeUrl, engineUrl: data.engineUrl }),
	);
	const renderedRef = React.useRef<HTMLElement[]>([]);

	React.useEffect(() => {
		const engine = engineRef.current;
		const hosts = Array.from(document.querySelectorAll<HTMLElement>('[data-live-card]'));
		let cancelled = false;

		const renderCard = (host: HTMLElement) => {
			const name = host.getAttribute('data-live-card') || '';
			const c = data.cards[name];
			if (!c) return;
			engine.renderInto(host, c.sample, c.mermaid).then((r) => {
				if (r.ok && !renderedRef.current.includes(host)) renderedRef.current.push(host);
			});
		};

		const renderAll = () => {
			// Kick the theme CSS fetch off in PARALLEL with the engine-bundle load
			// (not behind it) — same fix as DeckPreview.tsx's paint().
			engine.prefetchTheme?.();
			engine.whenReady().then(() => {
				if (!cancelled) hosts.forEach(renderCard);
			});
		};

		// Lazy: render as the field section nears the viewport (rootMargin 300px).
		const section = hosts[0]?.closest('section') ?? null;
		let io: IntersectionObserver | null = null;
		if ('IntersectionObserver' in window && section) {
			io = new IntersectionObserver(
				(entries) => {
					if (entries.some((e) => e.isIntersecting)) {
						io?.disconnect();
						renderAll();
					}
				},
				{ rootMargin: '300px' },
			);
			io.observe(section);
		} else {
			renderAll();
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
			cancelled = true;
			io?.disconnect();
			mo.disconnect();
			clearTimeout(t);
			document.removeEventListener('click', onClick);
		};
	}, [data]);

	return null;
}
