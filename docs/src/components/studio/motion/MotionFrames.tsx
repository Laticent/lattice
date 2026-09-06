// THE FRAME STRIP — the one place this faculty states the frame model, and it states it as a picture.
//
// `2026-09-02-frame-model-for-motion.md`: a motion is a FINITE ORDERED SET OF KNOWN FRAMES. Every
// other surface in this tab teaches that implicitly — beats, no clock, no easing. Here you simply
// see all of them at once, and the last one is labelled as the still the PDF freezes.
//
// It is also the COMPLETE REDUCED-MOTION SURFACE. A viewer whose system asks for less motion gets a
// settled stage that never autoplays, so without this they could choreograph blind. With it they can
// verify every beat as a still, by keyboard, with nothing moving.
//
// ONE offscreen renderer serves the whole strip, and it must be SEPARATE from the live stage:
// `renderer.poster()` is documented mount-scoped and NOT pure — it scrubs whatever it is mounted on,
// so sharing the live instance would yank the preview to whichever frame was serialized last.
//
// THE MILLISECOND TRAP: `timeline.at()` takes MILLISECONDS and derives `progress = t / durationMs`.
// Handing it the frame model's own `k/N` fraction — which is how every document in this repo writes
// it — seeks to progress ~0, and this strip would render frame 0 nine times while looking correct.
// `seekMs` from `plan.ts` is the single place that conversion lives.

import * as React from 'react';
import { compile, type Scene } from '@/lib/anima';
import { rendererFor } from '@/lib/anima/backends/registry';
import { cn } from '@/lib/utils';
import { seekMs } from './plan';

/** At most this many stills. Nine is a strip you can read at 390px; a beat count above it samples
 *  evenly rather than growing a scroller nobody reads to the end of. */
const MAX_FRAMES = 9;

export function MotionFrames({ art, spec, beats, selected, onSelect }: { art: string; spec: Scene | null; beats: number; selected: number; onSelect: (k: number) => void }) {
	const [frames, setFrames] = React.useState<string[]>([]);
	const hostRef = React.useRef<HTMLDivElement>(null);

	const stops = Math.min(MAX_FRAMES, Math.max(2, beats + 1));

	React.useEffect(() => {
		const host = hostRef.current;
		if (!host || !spec) {
			setFrames([]);
			return;
		}
		// Debounced: a plan changes on every keystroke of a beat number, and serializing N stills is
		// not work worth doing per keystroke.
		const t = window.setTimeout(() => {
			try {
				const renderer = rendererFor(spec);
				if (!renderer) {
					setFrames([]);
					return;
				}
				const timeline = compile(spec);
				// `visibility: hidden` and NOT `display: none` — `svg-paint.ts` takes a `getBBox()` per
				// part at mount, and an undisplayed host has no layout to measure. It catches the throw
				// and defaults the pivot to 0,0, but a laid-out host is the honest one.
				// An svg scene resolves its markup through the AssetMap, keyed by `scene.asset` — the same
				// one-entry map `hydrate.ts` builds from the slide's poster.
				const assets = spec.source === 'svg' ? { [spec.asset]: art } : undefined;
				renderer.mount(host, spec, assets);
				const out: string[] = [];
				for (let k = 0; k < stops; k++) {
					// `poster()` returns an empty svg when nothing is mounted, which is a real state rather
					// than an error — keep the slot so the strip's frame numbering never shifts.
					out.push(renderer.poster(timeline.at(seekMs(k / (stops - 1), timeline.durationMs))).svg ?? '');
				}
				renderer.dispose();
				host.replaceChildren();
				setFrames(out);
			} catch {
				// A spec that validates but throws in compile or mount leaves the strip empty rather
				// than blanking the whole tab — the posture `anima-scenes.ts` takes for the same class.
				setFrames([]);
			}
		}, 300);
		return () => window.clearTimeout(t);
	}, [art, spec, stops]);

	if (!spec) return null;

	return (
		<div className="flex flex-col gap-1.5">
			<div className="flex items-baseline justify-between gap-2">
				<span className="font-mono text-[11px] uppercase tracking-widest text-muted-foreground">Frames</span>
				<span className="text-[11px] text-muted-foreground">every frame this motion has</span>
			</div>
			{/* A radiogroup rather than a slider: there is no time between these, only known frames. */}
			<div role="radiogroup" aria-label="Frames" className="flex gap-1.5 overflow-x-auto pb-1">
				{frames.length === 0
					? Array.from({ length: stops }, (_, k) => (
							// biome-ignore lint/suspicious/noArrayIndexKey: a frame IS its index — frame 3 is frame 3 whatever it currently paints, so the position is the stable identity
							<div key={k} className="h-[68px] w-[104px] shrink-0 animate-pulse rounded-md border border-border bg-muted" />
						))
					: frames.map((svg, k) => {
							const last = k === frames.length - 1;
							return (
								// biome-ignore lint/a11y/useSemanticElements: role="radio" on a <button> is the right pairing for a radiogroup of PICTURES — an <input type=radio> cannot carry a rendered still
								<button
									// biome-ignore lint/suspicious/noArrayIndexKey: a frame IS its index — frame 3 is frame 3 whatever it currently paints, so the position is the stable identity
									key={k}
									type="button"
									role="radio"
									aria-checked={selected === k}
									aria-label={last ? `Frame ${k + 1} of ${frames.length} — the still the PDF gets` : `Frame ${k + 1} of ${frames.length}`}
									onClick={() => onSelect(k)}
									className={cn('shrink-0 rounded-md border bg-[var(--bg)] p-1 outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]', selected === k ? 'border-[var(--accent)] ring-1 ring-[var(--accent)]' : 'border-border')}
								>
									{/* The serialized poster carries its own width/height, so it must be told to FILL the
									    thumbnail rather than merely fit inside it — capped-only, a 460x150 drawing painted at
									    a third of the box and read as an empty frame. */}
									{/* biome-ignore lint/security/noDangerouslySetInnerHtml: this markup is OURS — the engine's own renderer serialized it from art that crossed sanitizeSlideHtml at intake, so no author string reaches it */}
									<div className="grid h-[54px] w-[96px] place-items-center overflow-hidden [&>svg]:h-auto [&>svg]:max-h-full [&>svg]:w-full" aria-hidden dangerouslySetInnerHTML={{ __html: svg }} />
									<span className={cn('block pt-0.5 text-center font-mono text-[9px] uppercase tracking-wide', last ? 'text-[var(--accent)]' : 'text-muted-foreground')}>{last ? 'Poster' : k + 1}</span>
								</button>
							);
						})}
			</div>
			<p className="text-[11px] leading-snug text-muted-foreground">
				A motion is a set of known frames, not a clock. The last one is the still the PDF and the printed deck freeze.
			</p>
			{/* The offscreen host the strip serializes from. Hidden, but LAID OUT. */}
			<div ref={hostRef} aria-hidden className="pointer-events-none absolute size-[320px] opacity-0" style={{ visibility: 'hidden', left: '-9999px', top: 0 }} />
		</div>
	);
}
