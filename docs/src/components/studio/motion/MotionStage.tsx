// THE LIVE STAGE — the real host a deck uses, not a mock.
//
// It assembles the same `section.scene[data-scene-spec]` shape `scene.transform.js` produces and
// hands it to `hydrateScene`. That is not decoration: the retired Motion tab built a `.scene-figure`
// with NO CHILD, and `hydrate.ts`'s `resolveSpecSource` reads the poster `<svg>` out of that figure
// to build the painter's AssetMap — so `assetsFor` returned undefined, `mount()` hit
// `if (!doc || !markup) return false`, and that stage could never have previewed an svg scene at all.
//
// TWO THINGS THIS PASSES EXPLICITLY, both because the default is wrong here:
//
//  • `reducedMotion` + `startSettled`. `hydrate.ts`'s `effectiveTier` returns `legible` (not `still`)
//    under `prefers-reduced-motion` unless every verb is vestibular — and VESTIBULAR is
//    {spin, orbit}, neither of which this faculty emits. So the default would AUTOPLAY the full plan
//    at an author who asked for less motion, on a surface whose entire subject is motion.
//  • A remount key that changes with the plan. `createAnimaScenes` is not in play here, but the same
//    hazard is: a scene must re-run its intro when the choreography changes, or the most ordinary
//    edit gesture there is — toggle a role, undo it — leaves a settled, motionless preview.
//
// #22: this mounts sanitized markup into the HOST document rather than assembling a preview
// document, so it owns no `<style>` and needs no `SANCTIONED_PREVIEW_BUILDERS` entry. The markup it
// mounts crossed `sanitizeSlideHtml` at intake, and `hydrateScene` is passed the same sanitizer so
// it re-runs at the point of use. THE MOMENT THIS FILE ASSEMBLES A DOCUMENT WITH AN EMBEDDED
// `<style>`, it takes on `sanitizeStyleText` and a #22 sanction; today it deliberately does neither.

import * as React from 'react';
import type { Scene } from '@/lib/anima';
import { rendererFor } from '@/lib/anima/backends/registry';
import { hydrateScene } from '@/lib/anima/hydrate';
import { sanitizeSlideHtml } from '@/lib/sanitize-slide-html.js';
import { cn } from '@/lib/utils';
import { MOTION_PALETTE_FALLBACK } from './palette-fallback';

/** Base64 for the spec, because `hydrate.ts`'s `decodeSpec` runs `atob` on the attribute. Every id
 *  the intake mints is ASCII for the same reason — `atob` never UTF-8-decodes, so a non-ASCII
 *  codepoint would round-trip as mojibake. */
function encodeSpec(spec: Scene): string | null {
	try {
		return btoa(JSON.stringify(spec));
	} catch {
		return null;
	}
}

export function MotionStage({ art, spec, replayKey, className, reducedMotion }: { art: string; spec: Scene | null; replayKey: string; className?: string; reducedMotion?: boolean }) {
	const hostRef = React.useRef<HTMLDivElement>(null);
	const [failed, setFailed] = React.useState(false);

	// Read the viewer's own preference once, and honor it. `useSyncExternalStore` would be overkill:
	// a person does not flip this mid-session, and a stale read costs nothing but one settled mount.
	const prefersReduced = React.useMemo(() => {
		if (typeof reducedMotion === 'boolean') return reducedMotion;
		try {
			return window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
		} catch {
			return false;
		}
	}, [reducedMotion]);

	// `replayKey` is a DELIBERATE dependency the effect body never reads. It is what makes an edit
	// re-run the intro — without it, toggling a role out and back leaves a settled, motionless
	// preview on the most ordinary edit gesture there is, in a faculty whose whole subject is motion.
	// biome-ignore lint/correctness/useExhaustiveDependencies: see above — replayKey is the remount signal
	React.useEffect(() => {
		const host = hostRef.current;
		if (!host) return;

		// NO PLAYABLE PLAN STILL SHOWS THE DRAWING. This file's own contract is that a spec which
		// throws leaves the poster standing rather than blanking the panel; returning early on
		// `!spec` broke that for the other half of the same case — an invalid plan — and left an
		// empty box where the drawing should be, with not even the "could not be played" note.
		if (!spec) {
			host.replaceChildren();
			const figure = host.ownerDocument.createElement('div');
			figure.className = 'scene-figure';
			figure.innerHTML = sanitizeSlideHtml(art);
			host.appendChild(figure);
			setFailed(true);
			return () => host.replaceChildren();
		}

		const b64 = encodeSpec(spec);
		if (!b64) {
			setFailed(true);
			return;
		}
		setFailed(false);

		// The shape `scene.transform.js` produces, assembled by hand: a `section.scene` carrying the
		// spec, whose `.scene-figure` holds the drawing as the poster `<svg>`.
		const section = host.ownerDocument.createElement('section');
		section.className = 'scene';
		section.setAttribute('data-scene-spec', b64);
		const figure = host.ownerDocument.createElement('div');
		figure.className = 'scene-figure';
		figure.innerHTML = sanitizeSlideHtml(art);
		section.appendChild(figure);
		host.replaceChildren(section);

		let controller: { dispose(): void } | null = null;
		try {
			controller = hydrateScene(section, {
				rendererFor,
				eager: true,
				sanitize: sanitizeSlideHtml,
				reducedMotion: prefersReduced,
				startSettled: prefersReduced,
			});
		} catch {
			// A spec that validates but throws in compile or mount must leave the poster standing
			// rather than blanking the panel — the same posture `anima-scenes.ts` takes (#1186).
			controller = null;
		}
		if (!controller) setFailed(true);

		return () => {
			try {
				controller?.dispose();
			} catch {
				/* a disposed host is not an error worth surfacing */
			}
			host.replaceChildren();
		};
		// `replayKey` is in the deps ON PURPOSE: it is what makes an edit re-run the intro instead of
		// leaving a settled preview. See the header.
	}, [art, spec, replayKey, prefersReduced]);

	return (
		<div className={cn('relative', className)}>
			<figure ref={hostRef} className="motion-stage absolute inset-0 m-0" aria-label="Live preview of this motion" />
			{failed && (
				<p role="status" className="absolute inset-x-3 bottom-3 rounded-md border border-border bg-[var(--bg)] px-2 py-1 text-[11.5px] text-[var(--fail)]">
					This plan could not be played. The drawing below is what a reader would see.
				</p>
			)}
			{prefersReduced && !failed && (
				<p role="status" className="absolute inset-x-3 bottom-3 rounded-md border border-border bg-[var(--bg)] px-2 py-1 text-[11.5px] text-muted-foreground">
					Your system asks for reduced motion, so this shows the settled drawing. The frames below step through every beat.
				</p>
			)}
			{/* The stage borrows the host component's own rules: the engine stylesheet is not loaded in
			    the Studio's DOM (decks render in their iframe), and the deck's `cqi` units need a
			    `section.scene` container query this surface does not set up — so px here, deliberately. */}
			<style>{`
/* THE CATEGORICAL RAMP, DERIVED — because it is MISSING in the Studio's own document.
   Measured through the built site: --accent, --bg, --text-heading, --text-muted and --border all
   resolve at the Studio root; every --cat-N-mark resolves to the EMPTY STRING, because those live in
   the engine stylesheet the deck iframe loads and this document does not. A drawing that paints with
   the categorical ramp — which includes the repo's own worked example, and everything "Match the
   theme" produces — therefore rendered with two of its five shapes INVISIBLE in the live stage.
   These are declared on the stage only, so they fill the gap here and are overridden by the real
   ramp wherever a real ramp exists. Built by mixing tokens rather than by naming colors, so the
   preview stays in the deck's own family and the file keeps no hex literal (HARD RULE #3). */
.motion-stage{${MOTION_PALETTE_FALLBACK};--motion-shape-play:url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24'><path d='M7 4l12 8-12 8z' fill='black'/></svg>");--motion-shape-pause:url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24'><path d='M9 5v14M15 5v14' fill='none' stroke='black' stroke-width='3.2' stroke-linecap='round'/></svg>");--motion-shape-replay:url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24'><path d='M20 12a8 8 0 1 1-2.34-5.66' fill='none' stroke='black' stroke-width='2.2' stroke-linecap='round'/><path d='M20 3v5h-5' fill='none' stroke='black' stroke-width='2.2' stroke-linecap='round' stroke-linejoin='round'/></svg>")}
.motion-stage .scene-figure{position:relative;width:100%;height:100%}
.motion-stage .scene-live,.motion-stage .scene-figure>svg,.motion-stage .scene-live>svg{width:100%;height:100%;display:block}
.motion-stage .scene-control{position:absolute;right:10px;top:10px;z-index:3;height:28px;width:28px;display:inline-flex;align-items:center;justify-content:center;border:1px solid var(--border);border-radius:50%;background:color-mix(in oklab,var(--bg,#fff) 86%,transparent);color:var(--text-muted);cursor:pointer;opacity:0;transition:opacity .18s ease}
.motion-stage .scene-figure:hover .scene-control,.motion-stage .scene-figure:focus-within .scene-control,.motion-stage .scene-control[data-mode="optin"]{opacity:1}
@media (prefers-reduced-motion: reduce){.motion-stage .scene-control{transition:none}}
/* The shape is DRAWN, never typed (HARD RULE #29) — a character here would fall back to whatever
   font the machine has, or to a color emoji that stops taking the element's color.
   EACH MASK CARRIES AN INLINE FALLBACK, and that is not belt-and-braces: the --shape-* tokens live
   in lib/base/base.tokens.css, which the deck iframe loads and the STUDIO'S OWN DOCUMENT DOES NOT.
   Without the fallback the token resolves to nothing here and the playback control is invisible on
   the one surface this component is for. A var() with a fallback is the shape HARD RULE #3 exempts
   by name. */
.motion-stage .scene-control::before{content:"";width:12px;height:12px;background:currentColor;-webkit-mask:var(--shape-triangle-right,var(--motion-shape-play)) center/contain no-repeat;mask:var(--shape-triangle-right,var(--motion-shape-play)) center/contain no-repeat}
.motion-stage .scene-control[data-mode="pause"]::before{-webkit-mask:var(--shape-pause,var(--motion-shape-pause)) center/contain no-repeat;mask:var(--shape-pause,var(--motion-shape-pause)) center/contain no-repeat}
.motion-stage .scene-control[data-mode="replay"]::before{-webkit-mask:var(--shape-refresh,var(--motion-shape-replay)) center/contain no-repeat;mask:var(--shape-refresh,var(--motion-shape-replay)) center/contain no-repeat}
.motion-stage .scene-control-label{display:none}`}</style>
		</div>
	);
}
