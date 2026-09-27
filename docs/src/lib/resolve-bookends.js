// The deck's `greeting:` / `closing:` registers — what a narrated deck says before slide 1 and
// after the last slide. The kernel lives once in the engine at `lib/core/resolve-bookends.mjs`
// (HARD RULE #1), so the Studio's live reader, the export bake and the exported player's inlined
// clock read the keys and pick the period identically. This re-export gives the docs a clean
// `@/lib/resolve-bookends` import, for the reason `resolve-pace.js` gives.
export {
	BOOKEND_GAP_MS,
	DEFAULT_CLOSING,
	DEFAULT_GREETING,
	GREETING_VARIANTS,
	greetingPeriod,
	greetingText,
	greetingVariants,
	resolveBookends,
	SALUTATIONS,
} from '../../../lib/core/resolve-bookends.mjs';
