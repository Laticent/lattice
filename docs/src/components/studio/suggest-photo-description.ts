// Suggest a description for one Library photo: the call behind the **Suggest** button in a photo's detail view.
// Decision note: engineering/decisions/2026-10-12-library-media-assets.md § Suggest.
//
// A MODULE OF ITS OWN, not part of architect.ts, so the Studio's startup does not carry it. architect.ts loads with the
// shell; this loads only when a person presses Suggest (Library.tsx imports it on demand). It reuses the Architect's
// model, voice and budget helpers rather than reimplementing any of them.
import { recordSpend } from '@/components/studio/ai/spend.js';
import { THUMB_TOKENS } from './agent-assets';
import { architectModel, cloudBudgetBlock, withStudioVoice } from './architect';
import { cleanLine } from './media-edit';
import type { GroundMsg as Msg } from './reference-doc';

// ── A photo's description: "Suggest" in the Library's photo view ─────────────────────────────────────────────
// Drafts the one-line alt text for ONE Library photo from a small thumbnail, for the author to review in the
// field before saving (never saved by this call). The picture goes to the author's own OpenRouter model, on their
// own key, only when they press the button. Same honesty as the slide description above: no cloud model is
// `offline`, a model that cannot read images is `novision` (read from the catalog; unknown reads as no, so the
// button never promises a look it cannot take), the budget cap is `blocked`, and an unusable reply is `nochange`.
const PHOTO_DESCRIBE_SYSTEM =
	'You write alt text for ONE photo that will appear on a presentation slide, for a person who cannot see it.\n' +
	'Rules:\n' +
	'- Describe only what is visible. Never guess names, places, brands or text you cannot read.\n' +
	'- Plain language. One sentence, at most 20 words. No "image of" or "photo of" preamble.\n' +
	'- Output only the sentence, nothing else.';

export type PhotoSuggestOutcome =
	| { status: 'ok'; text: string }
	| { status: 'offline' }
	| { status: 'novision' }
	| { status: 'blocked'; note: string }
	| { status: 'nochange' };

/** The (pure) message list for a photo description. Exported for testing. */
export function buildPhotoDescriptionPrompt(thumbDataUrl: string): Msg[] {
	return [
		{ role: 'system', content: PHOTO_DESCRIBE_SYSTEM },
		{
			role: 'user',
			content: [
				{ type: 'text', text: 'Describe this photo.' },
				{ type: 'image_url', image_url: { url: thumbDataUrl } },
			],
		} as unknown as Msg,
	];
}

/** A model's reply made safe to put in the description field: one line, no wrapping quotes, no "Photo of" lead-in. */
export function cleanPhotoDescription(reply: string): string {
	const one = cleanLine(String(reply ?? ''), 400)
		.replace(/^["'“”‘’`]+|["'“”‘’`]+$/g, '')
		.replace(/^(?:an? )?(?:image|photo|picture|photograph) (?:of|showing)\s+/i, '')
		.trim();
	return cleanLine(one.charAt(0).toUpperCase() + one.slice(1), 140);
}

export async function suggestPhotoDescription(thumbDataUrl: string, deckLang?: string): Promise<PhotoSuggestOutcome> {
	if (!thumbDataUrl.startsWith('data:image/')) return { status: 'nochange' };
	const model = await architectModel();
	if (!model) return { status: 'offline' };
	const generation = model.availability().generation;
	// A description must be accurate, so the cloud tier only: the floor and the tiny on-device model do not look at pictures.
	if (generation !== 'openrouter') return { status: 'offline' };
	let sees = false;
	try {
		const id = model.openRouterModel();
		sees = !!(await model.listOpenRouterModels()).find((m) => m.id === id)?.vision;
	} catch {
		sees = false;
	}
	if (!sees) return { status: 'novision' };
	const blk = cloudBudgetBlock(model, PHOTO_DESCRIBE_SYSTEM, THUMB_TOKENS, 80);
	if (blk) return { status: 'blocked', note: blk };
	let out = '';
	try {
		out = await model.complete({
			messages: withStudioVoice(buildPhotoDescriptionPrompt(thumbDataUrl), generation, deckLang),
			fallback: '',
			maxTokens: 80,
			onUsage: (u) => recordSpend(u?.cost ?? 0, u?.total_tokens ?? (u?.prompt_tokens || 0) + (u?.completion_tokens || 0)),
		});
	} catch {
		return { status: 'offline' };
	}
	const text = cleanPhotoDescription(out);
	return text ? { status: 'ok', text } : { status: 'nochange' };
}
