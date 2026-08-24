import * as React from 'react';
import type { Active, CaptionTrack } from '@/lib/cadenza';

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
//
// TWO HOSTS, ONE LOOK (2026-08-24-stage-console-split.md). Captions are an accessibility
// feature FOR THE ROOM, so they live on whatever surface the room is watching: normally the
// Stage window, whose document is assembled as a string and therefore has no Tailwind — and
// the console's own dock when no Stage is open. That is why every class here is a scoped name
// out of `present/stage-chrome.js` rather than a utility: the sheet is injected into both
// documents, so there is one implementation instead of a utility version and a hand-written
// twin that drift.
export function PresentCaption({ track, active, className, announce = true }: { track: CaptionTrack; active: Active | null; className?: string; announce?: boolean }) {
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
	// The RESIZE that matters is the HOST window's, and when this is portalled into the Stage
	// that is not the window this module's `window` refers to. `ownerDocument.defaultView` is
	// the one the band is actually laid out in — bound after mount, so it is right in both hosts.
	React.useEffect(() => {
		const view = winRef.current?.ownerDocument.defaultView;
		if (!view) return;
		const onResize = () => recenter();
		view.addEventListener('resize', onResize);
		return () => view.removeEventListener('resize', onResize);
	}, [recenter]);

	if (!cueCount) return null;
	const activeText = track.cues[activeCue].words.map((w) => w.display).join(' ');
	return (
		// Film-subtitle, NOT a pill (2026-07-12 redesign): transparent, full-width, docked
		// below the slide — no card/border/shadow to read as a box. The vertical mask alone
		// fades read/upcoming lines so the active line reads clean.
		<div className={`latt-cc${className ? ` ${className}` : ''}`}>
			{/* Scoped live status region — announces only the sentence being read (not the whole
			    narration). role=status makes the read-along queryable as the live prompter. Skipped
			    when Voice (TTS) is speaking, so a screen-reader user doesn't hear each line twice. */}
			{announce ? (
				<span className="latt-sr" role="status" aria-live="polite" aria-atomic="true">
					{activeText}
				</span>
			) : null}
			<div ref={winRef} aria-hidden="true" className="latt-cc-win">
				<div ref={trackRef} className="latt-cc-track">
					{track.cues.map((cue, ci) => (
						// biome-ignore lint/suspicious/noArrayIndexKey: a static caption track never reorders; the cue index is its stable identity
						<div key={ci} data-cue={ci} data-state={ci < activeCue ? 'read' : ci > activeCue ? 'up' : 'now'} className="latt-cc-line">
							{cue.words.map((w, wi) => (
								<span
									// biome-ignore lint/suspicious/noArrayIndexKey: (cueIndex, wordIndex) IS the word's stable identity on a static track
									key={`${ci}:${wi}`}
									data-cw={`${ci}-${wi}`}
									data-spoken={ci === activeCue ? (wi <= activeWord ? '1' : '0') : undefined}
									className="latt-cc-w"
								>
									{w.display}{' '}
								</span>
							))}
						</div>
					))}
				</div>
			</div>
		</div>
	);
}
