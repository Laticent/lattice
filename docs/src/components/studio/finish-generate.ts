// The Finish generator, typed for the Studio. The implementation is lib/finishes/finish-generate.js,
// the ONE generator the build also runs over every shipped recipe to write the preset rules in
// lib/base/base.finish.css (engineering/decisions/2026-09-23-portable-packages.md §3.6). The
// right-panel designer tunes a recipe; that module disposes it into CSS, the same
// model-proposes / code-disposes split the Theme and Component studios use.
//
// A fabricated finish emits BOTH faces: the RICH screen face under `section.finish.finish-<slug>`
// (full-bleed fades to `transparent`) and the OPAQUE export face under `@media print` and
// `.lattice-exporting` (fades end on the canvas; only the bottom full-bleed layer on the SOLID
// canvas). No mask-image, no url(), no hex, no margin; only clamped numbers and a sanitized glyph
// reach the CSS, so a crafted recipe can't close the selector (HARD RULE #22).

// DEFAULT imports: both modules are CommonJS leaves, and the docs dev server only interops a
// default import off one (docs/src/plugins/vite-cjs-lib-dev.mjs).
import generator from '../../../../lib/finishes/finish-generate.js';
import finishPresets from '../../../../lib/finishes/presets.generated.js';

const { FINISH_PRESETS } = finishPresets;

export type WashType = 'none' | 'corner-glow' | 'duotone' | 'spotlight' | 'bands' | 'mesh';
export type TextureType = 'none' | 'grid' | 'dots' | 'hatch' | 'contour' | 'rings' | 'ruled' | 'pinstripe' | 'lattice';
export type MarkType = 'none' | 'monogram' | 'tick' | 'bar' | 'rule' | 'numeral';
export type EdgeType = 'none' | 'vignette' | 'margin-rule' | 'fold' | 'frame';
export type Placement = 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right' | 'center' | 'left';

// The closed vocabulary, from the one module that emits it.
export const WASH_TYPES = generator.WASH_TYPES as readonly WashType[];
export const TEXTURE_TYPES = generator.TEXTURE_TYPES as readonly TextureType[];
export const MARK_TYPES = generator.MARK_TYPES as readonly MarkType[];
export const EDGE_TYPES = generator.EDGE_TYPES as readonly EdgeType[];
export const PLACEMENTS = generator.PLACEMENTS as readonly Placement[];

// A layer recipe: what the controls bind to and the AI returns. Intensity is an accent-into-canvas
// mix percentage, kept low so text on the canvas keeps AA without a scrim.
//
// TRANSFORM AXES (the joystick, drag-on-canvas and numeric controls write these). All optional,
// so every preset and AI literal stays valid; coerceRecipe fills them from the coarse fields.
//   • mark.x / mark.y  the glyph CENTER as % of the slide; absent → from `placement`.
//   • mark.scale       glyph size as % of the base ghost size (100 = default).
//   • mark.angle       glyph rotation in degrees.
//   • wash.x / wash.y  the hotspot of a single-source wash (corner-glow, spotlight).
//   • wash.spread      the hotspot reach as % of its default radius.
//
// DETAILS a shipped preset needs and the generator writes exactly (portable-packages §10):
//   • mark `rule`       a thin margin rule (atrium's 0.47cqi), beside the bold `bar`.
//   • wash.hairline     a solid accent strip across the top edge that bleeds out (strata's).
//   • mark.anchor       "corner" seats a glyph in its placement's corner by alignment, `inset`
//                       cqi in from the side, instead of centering it and translating to x/y.
//                       Moving the mark in the designer drops it (the mark becomes free).
//   • edge.rich         a hand-tuned screen face for the fold (ledger's 22% to 65%).
export type FinishRecipe = {
	wash: { type: WashType; intensity: number; x?: number; y?: number; spread?: number; hairline?: boolean };
	texture: { type: TextureType; intensity: number; scale: number };
	mark: { type: MarkType; placement: Placement; glyph?: string; x?: number; y?: number; scale?: number; angle?: number; anchor?: 'corner'; inset?: number };
	edge: { type: EdgeType; intensity: number; rich?: { intensity?: number; reach?: number } };
	// The BAKED backdrop layer, the finish's FIFTH (strength 0–1, clearance, or a spotlight
	// window), emitted as `--fin-backdrop-*` tokens. A deck overrides it, and any other layer,
	// through the `finish-override:` front-matter map (see `mergeFinishOverride`). Clearance and
	// spotlight are two shapes of the one `.backdrop-mask` overlay; spotlight wins if both are set.
	backdrop?: { strength?: number; clearance?: boolean; spotlight?: { x: number; y: number; radius: number } };
};

// A FACE decides the fade end of every full-bleed gradient: 'rich' (screen) fades to
// `transparent`; 'opaque' (export) ends on the canvas.
export type FinishFace = 'rich' | 'opaque';

type Range = { readonly min: number; readonly max: number; readonly default: number };
export const MARK_SCALE = generator.MARK_SCALE as Range;
export const MARK_ANGLE = generator.MARK_ANGLE as Range;
export const MARK_INSET = generator.MARK_INSET as Range;
export const WASH_SPREAD = generator.WASH_SPREAD as Range;
export const SPOT_RADIUS = generator.SPOT_RADIUS as Range;

export const DEFAULT_RECIPE = generator.DEFAULT_RECIPE as FinishRecipe;

// The shipped presets' recipes, read from their PACKAGES (lib/finishes/<name>/<name>.recipe.json)
// through the generated presets module. The build generates each preset's engine CSS from the
// same file, so "Start from preset" reproduces the shipped finish. `finish-generate.test.ts` pins
// every recipe as a fixed point of `coerceRecipe`.
export const PRESET_RECIPES: Record<string, FinishRecipe> = Object.fromEntries(FINISH_PRESETS.map((p) => [p.name, p.recipe as FinishRecipe]));

/** The author's glyph, safe inside `content:"…"`: quotes, backslashes and tags dropped, ≤3 chars. */
export const sanitizeGlyph = generator.sanitizeGlyph as (input: unknown) => string;
/** A coarse placement keyword → the glyph center (x%, y%) it stands for. */
export const placementXY = generator.placementXY as (p: Placement) => { x: number; y: number };
/** Only corner-glow and spotlight have one movable hotspot; the designer hides the joystick otherwise. */
export const washHasHotspot = generator.washHasHotspot as (type: WashType) => boolean;
/** Coerce an arbitrary object (an AI reply, partial state) into a full, in-vocabulary recipe. Never throws. */
export const coerceRecipe = generator.coerceRecipe as (input: unknown) => FinishRecipe;
/** The slot declarations (no selector) for a recipe in one face. */
export const recipeSlots = generator.recipeSlots as (r: FinishRecipe, face?: FinishFace) => string[];
/** Sanitize arbitrary text to a class slug fragment (`[a-z0-9-]`), or 'custom'. */
export const safeFinishSlug = generator.safeFinishSlug as (name: string) => string;
/** A fabricated finish's full CSS: the rich rule plus its print and `.lattice-exporting` faces. */
export const generateFinishCss = generator.generateFinishCss as (slug: string, recipe: FinishRecipe) => string;
/** Apply a deck's `finish-override:` partial recipe to a finish's recipe, then coerce. */
export const mergeFinishOverride = generator.mergeFinishOverride as (recipe: FinishRecipe, override: Record<string, Record<string, string>>) => FinishRecipe;
/** A small picker-chip background for a recipe (its most salient layer). */
export const generateSwatch = generator.generateSwatch as (recipe: FinishRecipe) => { background: string; backgroundSize?: string };
