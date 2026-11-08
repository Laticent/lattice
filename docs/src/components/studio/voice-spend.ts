// VOICE SPEND (engineering/decisions/2026-11-08-studio-ai-routes-ux.md, Spend). Neither OpenRouter's
// speech endpoint nor Gemini's returns a cost, so a cloud clip is booked at its model's per-character
// price from OpenRouter's public catalog (a Gemini model by its `google/` id there), and Workspace › AI
// marks it as an estimate. A model with no published price books nothing rather than a guess.
// Loaded by read-aloud.ts on the first paid clip, so none of this sits on the Studio's boot path.

import { recordSpend } from '@/components/studio/ai/spend.js';
import { ttsCostPerMChars } from '@/playground/tts-cost.js';
import { listOpenRouterVoiceModels } from '@/playground/voice-model.js';

type Priced = { id: string; promptPerM?: number | null; completionPerM?: number | null };
let prices: Promise<Priced[]> | null = null;

export async function bookVoiceSpend(route: string, model: string, chars: number): Promise<void> {
	try {
		prices ??= listOpenRouterVoiceModels() as Promise<Priced[]>;
		const list = await prices;
		if (!list.length) prices = null; // unreachable: ask again next clip
		const id = route === 'gemini' ? `google/${model}` : model;
		const m = list.find((x) => x.id === id);
		const perM = m ? ttsCostPerMChars(m) : null;
		if (perM == null || !(chars > 0)) return;
		recordSpend((perM * chars) / 1e6, 0, undefined, { kind: 'voice', route });
	} catch {
		/* spend is a readout; a failure to price a clip never stops the voice */
	}
}
