// How closely the model looks at a photo when it describes one: the "Look closer" setting in Workspace → Model.
// Pure data and no imports, so the settings panel, the Library's Suggest and the tests share one table.
//
// `maxTokens` is a ceiling, not a spend: it leaves room for a model that reasons by default (those count their thinking against it).
// Two real levers, both measured by cost rather than promised as quality:
//   - `edge`: the longest side of the picture the model is sent. More pixels, more of the picture's fine detail (a printed label,
//     a small sign), and more input tokens (a picture costs about edge² / 750 tokens, the figure vision models publish).
//   - `effort`: how hard a reasoning-capable model is asked to think first. Models that cannot reason ignore it.
export type ImageLook = 'quick' | 'careful' | 'thorough';

export const IMAGE_LOOKS: Record<ImageLook, { label: string; edge: number; effort?: 'low' | 'medium' | 'high'; maxTokens: number; means: string }> = {
	quick: { label: 'Quick', edge: 512, maxTokens: 600, means: 'A small copy of the photo. Cheapest, and right for most photos.' },
	careful: { label: 'Careful', edge: 1024, maxTokens: 800, means: 'A larger copy, so small text and fine detail can be read.' },
	thorough: { label: 'Thorough', edge: 1568, effort: 'medium', maxTokens: 3000, means: 'The largest copy, and the model thinks before it answers. Costs the most.' },
};
export const DEFAULT_IMAGE_LOOK: ImageLook = 'careful';
/** The model that looks at photos until the author picks another: the rot-proof alias of the newest Claude Sonnet. */
export const DEFAULT_IMAGE_MODEL = '~anthropic/claude-sonnet-latest';

export const asImageLook = (v: unknown): ImageLook => (v === 'quick' || v === 'careful' || v === 'thorough' ? v : DEFAULT_IMAGE_LOOK);
/** Input tokens one picture of this look costs, for the budget gate. */
export const lookTokens = (look: ImageLook): number => Math.round((IMAGE_LOOKS[look].edge ** 2) / 750);
