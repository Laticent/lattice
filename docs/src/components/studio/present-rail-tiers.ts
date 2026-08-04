// The Present rail's four tiers, as CSS values — ONE definition, imported by the rail that
// paints them and by the sweep that measures them (`docs/scripts/sweep-rail-contrast.mjs`).
//
// They live here rather than inline in `PresentRail.tsx` for one reason: this ladder has now
// been re-tuned three times, and each time the contrast sweep that justified the change was
// written from scratch against a hand-copied set of values. Twice it measured something the
// rail was not painting. A sweep that imports the shipped values cannot drift from them.

/**
 * The unplayed track. `here` lifts the CURRENT slide's segment so position reads at rest.
 *
 * The lift is 26%, down from 30%, and the four points matter (#1389). The buffered hatch is
 * drawn in full-strength `--accent` directly over this track, so the track's own weight sets
 * the hatch's contrast floor. Swept across all 36 palette/mode combinations:
 *
 *   lift  16%  18%  20%  22%  24%  26%  28%  30%
 *   worst 3.58 3.49 3.40 3.32 3.23 3.15 3.07 2.99   (ink vs track, `mustard light`)
 *
 * At 30% the hatch fell to 2.99:1 in one palette — under WCAG 1.4.11's 3:1, and on the one
 * segment a viewer is actually looking at. 26% clears it with headroom rather than by a hair.
 * The cost is a slightly quieter "you are here" tint, which is affordable because that cue is
 * no longer carried by tone at all: the playhead MARK (solid accent, 1px `--bg` halo, painted
 * last) is 4.35:1 against anything beneath it in the tightest palette. The tint reinforces; the
 * mark states.
 */
export const trackTier = (here: boolean): string => `color-mix(in srgb, var(--accent) ${here ? 26 : 16}%, var(--bg))`;

/** The played range, and the playhead mark: the token at full strength. */
export const progressTier = 'var(--accent)';

/**
 * The BUFFERED range — narration that has landed but has not been reached yet.
 *
 * A HATCH, not a tone, and that is the whole point (#1389). The three-tone ladder this
 * replaces was measured across all 36 palette/mode combinations and could not carry this
 * distinction: track-to-buffered was under WCAG 1.4.11's 3:1 in 15 of 36 (worst 1.87), and
 * buffered-to-played in 25 of 36 (worst 1.92). That is not a tuning failure — a brute-force
 * search over the entire (track%, buffered%) space tops out at 2.07:1 on the worst adjacent
 * pair, because `--accent` against `--bg` is only 4.35:1 in the tightest palette and that is
 * the total range there is to divide into three steps. The signal is load-bearing (a buffered
 * edge advancing while the played edge is frozen is the only honest way to say "still working,
 * not crashed"), so it cannot claim 1.4.11's decorative exemption either.
 *
 * So the buffered range is drawn in the SAME ink as the played range — full-strength
 * `--accent`, which is the one relationship already proven to pass 36/36 against the track —
 * and is told apart from it by CONTINUITY rather than by tone. Played is solid; buffered is
 * striped. A pattern is not a color relationship, so no palette can flatten it.
 *
 * The gaps are `transparent` on HARD stops, not a blend toward the track color: hard stops
 * mean no interpolation into transparent (which fringes on premultiplied compositors), and
 * letting the track show through means the stripes sit correctly over BOTH the resting track
 * and the lifted current-slide track without knowing which is beneath them.
 *
 * 2px ink / 2px gap at -45°: dense enough to read as a filled range at a glance on an 8px
 * bar, open enough that the difference from the solid played range is unmistakable.
 */
export const bufferedTier = 'repeating-linear-gradient(-45deg, var(--accent) 0 2px, transparent 2px 4px)';

/** The ink the buffered hatch is drawn in — what the sweep measures against the track. */
export const bufferedInk = 'var(--accent)';
