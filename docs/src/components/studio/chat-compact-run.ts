import { getSpendDeck, recordSpend } from '@/components/studio/ai/spend.js';
import { architectModel, cloudBudgetBlock, estTokens, withStudioVoice } from './architect';
import { SUMMARY_MAX_TOKENS, SUMMARY_SYSTEM } from './chat-compact';

// The one model call behind "Compact conversation". Its own module, loaded when the button is
// pressed, so the prompt text and this code stay out of the Studio's startup bundle.
//
// Cloud tier only: a tiny on-device model summarizing a deck conversation would drop the numbers
// and decisions the briefing exists to keep. Honest like the other bridges: `offline` with no
// cloud model, `blocked` at the budget cap (the same gate every call passes), `nochange` for an
// unusable reply. The call's real cost is recorded in the spend tally like any other and handed
// back so the author sees what the compaction itself cost.
export type CompactOutcome = { status: 'ok'; summary: string; cost: number } | { status: 'offline' } | { status: 'blocked'; note: string } | { status: 'nochange' };

export async function summarizeChat(transcript: string, deckLang?: string): Promise<CompactOutcome> {
	if (!transcript.trim()) return { status: 'nochange' };
	const model = await architectModel();
	if (!model || model.availability().generation !== 'openrouter') return { status: 'offline' };
	const blk = await cloudBudgetBlock(model, transcript, estTokens(SUMMARY_SYSTEM), SUMMARY_MAX_TOKENS);
	if (blk) return { status: 'blocked', note: blk };
	const deck = getSpendDeck();
	let cost = 0;
	let out = '';
	let finish: string | null = null;
	try {
		out = await model.complete({
			messages: withStudioVoice([{ role: 'system', content: SUMMARY_SYSTEM }, { role: 'user', content: `Conversation to compress:\n\n${transcript}` }], 'openrouter', deckLang),
			fallback: '',
			maxTokens: SUMMARY_MAX_TOKENS,
			onFinishReason: (r) => {
				finish = r;
			},
			onUsage: (u) => {
				cost += Number(u?.cost) || 0;
				recordSpend(u?.cost ?? 0, u?.total_tokens ?? (u?.prompt_tokens || 0) + (u?.completion_tokens || 0), deck);
			},
		});
	} catch {
		return { status: 'offline' };
	}
	const summary = String(out).trim();
	// A briefing cut off at the token ceiling (a thinking model spends it on thinking) would replace real messages with half a sentence.
	if (finish === 'length') return { status: 'nochange' };
	return summary ? { status: 'ok', summary, cost } : { status: 'nochange' };
}
