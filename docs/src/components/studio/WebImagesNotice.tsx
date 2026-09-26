// The "load them?" switch for a deck's web images (portable-packages trio follow-up 11).
//
// A deck's images from the web stay blocked until the reader chooses to load them: each one
// tells its server who opened the deck and when. The preview shows a drawn placeholder in each
// one's place (lib/core/remote-ref.js `blockWebImages`); this strip says why, names the sites,
// and offers the choice. The choice is remembered for THIS deck and THESE sites only
// (`setDeckWebOrigins`), so an edit that adds a new site asks again, and it can be taken back.

import { Image as ImageIcon, ImageOff } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { WebImageSummary } from './web-images';

/** The origins in `summary` the reader has not allowed yet. */
function unallowedOrigins(summary: WebImageSummary, allowed: string[]): string[] {
	const ok = new Set(allowed);
	return summary.origins.filter((o) => !ok.has(o));
}

/** How many references come from `origins`. */
function countFrom(summary: WebImageSummary, origins: string[]): number {
	return origins.reduce((n, o) => n + (summary.byOrigin[o] ?? 0), 0);
}

/** A site list for a sentence: "a.com", "a.com and b.com", "a.com, b.com and 2 more". */
function siteList(origins: string[]): string {
	const hosts = origins.map((o) => o.replace(/^https?:\/\//, ''));
	if (hosts.length <= 2) return hosts.join(' and ');
	return `${hosts.slice(0, 2).join(', ')} and ${hosts.length - 2} more`;
}

// Helpers live here, not in web-images.ts, so the Studio's eager bundle carries this strip
// without the scanner and the kernel behind it (both load on the first deck that needs them).

export function WebImagesNotice({ summary, allowed, onLoad, onBlock }: { summary: WebImageSummary; allowed: string[]; onLoad: (origins: string[]) => void; onBlock: () => void }) {
	if (!summary.count) return null;
	const blocked = unallowedOrigins(summary, allowed);
	const loaded = summary.origins.filter((o) => allowed.includes(o));
	const row = 'flex items-center gap-2 border-b border-border px-3.5 py-1.5 text-[12px]';
	if (blocked.length) {
		const n = countFrom(summary, blocked);
		const what = `${n} image${n === 1 ? '' : 's'} from ${siteList(blocked)}`;
		// The reason is the second sentence, and in a narrow pane (a phone, a tablet's split) it
		// took the strip to four lines; there it rides as the strip's tooltip instead.
		const why = 'Blocked until you choose, since loading them tells those sites you opened it.';
		return (
			<div role="status" data-slot="web-images" data-state="blocked" title={why} className={`${row} bg-[var(--accent-soft)] text-[var(--text-heading)]`}>
				<ImageOff className="size-3.5 shrink-0 text-[var(--accent)]" aria-hidden />
				<span className="min-w-0 flex-1">
					<span className="font-semibold">This deck loads {what}.</span> <span className="sr-only text-muted-foreground @[36rem]:not-sr-only">{why}</span>
				</span>
				<Button size="xs" variant="outline" className="shrink-0" onClick={() => onLoad(blocked)} aria-label={`Load ${what}`}>
					Load them
				</Button>
				{/* Some sites loaded, a new one waiting: the earlier choice stays reversible. */}
				{loaded.length > 0 && (
					<Button size="xs" variant="ghost" className="shrink-0" onClick={onBlock} aria-label="Block this deck's web images again">
						Block again
					</Button>
				)}
			</div>
		);
	}
	return (
		<div role="status" data-slot="web-images" data-state="loaded" className={`${row} text-muted-foreground`}>
			<ImageIcon className="size-3.5 shrink-0" aria-hidden />
			<span className="min-w-0 flex-1 truncate">Showing images from {siteList(loaded)} for this deck.</span>
			<Button size="xs" variant="ghost" className="shrink-0" onClick={onBlock} aria-label="Block this deck's web images again">
				Block again
			</Button>
		</div>
	);
}
