import * as React from 'react';
import type { Active, CaptionTrack } from '@/lib/cadenza';
import { cn } from '@/lib/utils';

// The read-aloud caption as a TELEPROMPTER CRAWL (2026-07-12-studio-present-redesign.md, S2)
// — a "Star Wars intro without the warp": the word being read sits CENTERED, read lines lift
// up and out, upcoming lines rise from the bottom, words highlight as spoken. Only a ~3-line
// masked focus band is visible, so it can NEVER bury the slide the way the old box (which
// printed the whole slide's narration) did. Fed by the existing reader's word-timed `track`
// + live `active` cursor — no new engine work.
//
// Trio-hardened (S2 review):
//  • The reader emits active=null at every punctuation/sentence gap (~360ms). We HOLD the last
//    real position across gaps (heldRef) so the crawl doesn't lurch back to line 1 each sentence.
//  • Centering follows the active WORD (not the cue centroid), so on a multi-line sentence the
//    spoken word stays in the opaque band instead of scrolling into the fade.
//  • The visual crawl is aria-hidden; a scoped polite live region announces only the ACTIVE
//    sentence (not the whole narration).
const MASK = 'linear-gradient(180deg, transparent 0%, #000 22%, #000 78%, transparent 100%)';

export function PresentCaption({ track, active, className }: { track: CaptionTrack; active: Active | null; className?: string }) {
	const winRef = React.useRef<HTMLDivElement>(null);
	const trackRef = React.useRef<HTMLDivElement>(null);
	// Latch the last non-null cursor so a punctuation/sentence GAP (active===null) holds position.
	const heldRef = React.useRef({ cueIndex: 0, wordIndex: 0 });
	if (active) heldRef.current = { cueIndex: active.cueIndex, wordIndex: active.wordIndex };
	const cueCount = track.cues.length;
	const activeCue = cueCount ? Math.min(cueCount - 1, Math.max(0, heldRef.current.cueIndex)) : 0;
	const activeWord = heldRef.current.wordIndex;

	// Center the ACTIVE WORD's line in the band (fall back to the cue if the word ref is missing).
	const recenter = React.useCallback(() => {
		const win = winRef.current;
		const tr = trackRef.current;
		if (!win || !tr) return;
		const target = (tr.querySelector(`[data-cw="${activeCue}-${activeWord}"]`) ?? tr.querySelector(`[data-cue="${activeCue}"]`)) as HTMLElement | null;
		if (!target) return;
		const y = win.clientHeight / 2 - (target.offsetTop + target.offsetHeight / 2);
		tr.style.transform = `translateY(${y}px)`;
	}, [activeCue, activeWord]);

	// biome-ignore lint/correctness/useExhaustiveDependencies: re-center on cursor/track change (recenter closes over activeCue/activeWord); useLayoutEffect so there's no flash.
	React.useLayoutEffect(() => {
		recenter();
	}, [recenter, track]);
	React.useEffect(() => {
		const onResize = () => recenter();
		window.addEventListener('resize', onResize);
		return () => window.removeEventListener('resize', onResize);
	}, [recenter]);

	if (!cueCount) return null;
	const activeText = track.cues[activeCue].words.map((w) => w.display).join(' ');
	return (
		<div className={cn('block h-[80px] w-[min(88vw,640px)] overflow-hidden rounded-2xl border border-border bg-[color-mix(in_srgb,var(--bg)_90%,transparent)] px-4 py-1.5 shadow-[0_8px_24px_rgba(10,22,40,.14)] backdrop-blur-sm', className)}>
			{/* Scoped live region — announces only the sentence being read (not the whole narration). */}
			<span className="sr-only" aria-live="polite" aria-atomic="true">
				{activeText}
			</span>
			<div ref={winRef} aria-hidden="true" className="relative h-full" style={{ WebkitMaskImage: MASK, maskImage: MASK }}>
				<div ref={trackRef} className="absolute inset-x-0 will-change-transform [transition:transform_.5s_cubic-bezier(.22,.61,.36,1)] motion-reduce:transition-none">
					{track.cues.map((cue, ci) => {
						const read = ci < activeCue;
						const up = ci > activeCue;
						return (
							// biome-ignore lint/suspicious/noArrayIndexKey: a static caption track never reorders; the cue index is its stable identity
							<div key={ci} data-cue={ci} className={cn('px-2 py-0.5 text-center text-[15px] font-semibold leading-snug transition-colors duration-300 sm:text-[17px]', read ? 'text-muted-foreground/50' : up ? 'text-muted-foreground/60' : 'text-[var(--text-heading)]')}>
								{cue.words.map((w, wi) => (
									<span
										// biome-ignore lint/suspicious/noArrayIndexKey: (cueIndex, wordIndex) IS the word's stable identity on a static track
										key={`${ci}:${wi}`}
										data-cw={`${ci}-${wi}`}
										className={cn('transition-colors', ci === activeCue ? (wi <= activeWord ? 'text-[var(--accent)]' : 'text-muted-foreground') : '')}
									>
										{w.display}{' '}
									</span>
								))}
							</div>
						);
					})}
				</div>
			</div>
		</div>
	);
}
