// The chat agent's eyes: render a DRAFT deck the way export does — off-screen, every slide
// laid out — and read back which slides overflow, clip or fall under the legibility floor.
// Its own module, imported on demand by StudioShell's `checkDraft`, so the render path is
// never startup JavaScript. See engineering/decisions/2026-10-05-studio-chat-agent.md.

import type { SingleSlideOptions } from '@/lib/single-slide-render';
import { measureDeckFit } from './export/deck-export.js';
import { buildDeckRender, type ExtraTheme } from './share-export';

export type SlideFit = { slide: number; overflows: boolean; clipped: boolean; illegible: boolean };

/** How long a fit check may take before the checker reports fit as not measured. Measured on
 *  the built Studio, a session's FIRST check takes ~0.4 s, and 7.8 s at worst: a slow link, a 4×
 *  slower CPU and a message sent before the page finished loading. The live preview has already
 *  fetched the runtime and fonts the check needs (decision note §11). */
export const DRAFT_FIT_TIMEOUT_MS = 15000;

/** Per-slide fit for `draft`, or undefined when it could not be measured in time — never a
 *  guess, the same contract as the Mermaid check beside it. */
export async function measureDraftFit(options: SingleSlideOptions, draft: string, palette: string, mode: 'light' | 'dark', extra?: ExtraTheme, extraCss?: string): Promise<SlideFit[] | undefined> {
	let timer: ReturnType<typeof setTimeout> | undefined;
	const late = new Promise<undefined>((res) => {
		timer = setTimeout(() => res(undefined), DRAFT_FIT_TIMEOUT_MS);
	});
	try {
		const run = buildDeckRender(options, draft, palette, mode, extra, extraCss).then((r) => measureDeckFit(r) as Promise<SlideFit[] | null>);
		const out = await Promise.race([run, late]);
		return out ?? undefined;
	} catch {
		return undefined;
	} finally {
		clearTimeout(timer);
	}
}
