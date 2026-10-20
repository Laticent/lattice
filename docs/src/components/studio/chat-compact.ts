import type { ChatMessage } from './studio-store';

// Conversation compaction: the older part of a thread, replaced by a short briefing the model
// reads in its place.
//
// What it buys is smaller than it sounds, and the numbers in the dropdown say so. The deck source and the
// fixed Lattice primer are re-sent every turn whatever the thread holds, and the primer is read from cache. A
// thread's own text is the part compaction can shrink, so it pays only once a thread is long. It also costs
// one model call (the older text in, ~400 tokens out) and rewrites the history, so the cached tail
// is written again once. Hence: manual, with a nudge when the numbers say it is worth it — never automatic.

/** Messages kept word for word at the end of the thread. */
export const KEEP_RECENT = 6;
/** Fewer older messages than this are not worth a model call. */
export const MIN_OLDER = 6;
/** The nudge: this many author turns, or this much of the window used. */
export const NUDGE_USER_TURNS = 20;
export const NUDGE_FILL = 0.7;
/** One message's share of the summary prompt. A reply that quotes slides at length does not need to travel whole. */
const MSG_CLIP = 1500;
/** The summary's own ceiling. */
export const SUMMARY_MAX_TOKENS = 500;

/** ~4 characters a token, the same rule as architect.ts `estTokens`. */
export const approxTokens = (s: string) => Math.ceil((s || '').length / 4);

/** What the model reads for a message: its text, led by the briefing when it is the first message after a compaction. */
export function modelText(m: ChatMessage): string {
	return m.compacted ? `(Summary of the earlier conversation, which was compacted to save cost: ${m.compacted.summary})\n\n${m.content}` : m.content;
}

export type Split = { older: ChatMessage[]; recent: ChatMessage[] };

/** Where to cut: the last KEEP_RECENT messages stay, moved forward so the kept part opens on an author turn. Null when too short to bother. */
export function splitForCompaction(messages: ChatMessage[]): Split | null {
	let cut = messages.length - KEEP_RECENT;
	while (cut < messages.length && messages[cut]?.role !== 'user') cut++;
	if (cut < MIN_OLDER || cut >= messages.length) return null;
	return { older: messages.slice(0, cut), recent: messages.slice(cut) };
}

/** The transcript the summarizer reads. A reply that was applied to the deck says so, because "what is already done" is the point. */
export function transcript(older: ChatMessage[]): string {
	return older
		.map((m) => {
			const who = m.role === 'user' ? 'Author' : 'Architect';
			const body = modelText(m).trim();
			const clipped = body.length > MSG_CLIP ? `${body.slice(0, MSG_CLIP)}…` : body;
			const tag = m.role === 'assistant' && m.proposed?.length ? (m.applied ? ' [edits applied]' : ' [edits proposed, not applied]') : '';
			return `${who}${tag}: ${clipped}`;
		})
		.join('\n\n');
}

export const SUMMARY_SYSTEM =
	'You compress a conversation between a person building a slide deck (the Author) and the Architect, their deck assistant, so the Architect can carry on without the full text.\n' +
	'Write a briefing of at most 250 words, in plain text, covering:\n' +
	'- what the Author wants: goals, audience, tone, constraints\n' +
	'- decisions made, and edits already applied or declined\n' +
	'- facts to keep EXACTLY as stated: names, numbers, dates, claims\n' +
	'- anything still open\n' +
	'Do not restate deck content: the current deck is re-sent every turn. Output only the briefing, with no preamble.';

export type Compaction = { messages: ChatMessage[]; removed: number; saved: number };

/** The thread after compaction: the kept messages, the first carrying the briefing. `saved` is the estimated tokens no longer sent each turn. */
export function applyCompaction(split: Split, summary: string): Compaction {
	const text = summary.trim();
	const was = split.older.reduce((n, m) => n + approxTokens(modelText(m)), 0);
	const saved = Math.max(0, was - approxTokens(text));
	const prior = split.older.reduce((n, m) => n + (m.compacted ? m.compacted.count : 0), 0);
	const [first, ...rest] = split.recent;
	const kept: ChatMessage[] = [{ ...first, compacted: { summary: text, count: split.older.length + prior, saved } }, ...rest];
	// The meter reads the newest reply's usage; until the next reply it would still show the full window. Lower it by what was cut, and say it is an estimate.
	for (let i = kept.length - 1; i >= 0; i--) {
		const u = kept[i].usage;
		if (kept[i].role === 'assistant' && u) {
			kept[i] = { ...kept[i], usage: { ...u, prompt: Math.max(0, u.prompt - saved), cached: 0, estimated: true } };
			break;
		}
	}
	return { messages: kept, removed: split.older.length, saved };
}

/** True when the dropdown should offer compaction unprompted: enough author turns, or the window is filling, and something to cut. */
export function shouldSuggestCompaction(messages: ChatMessage[], fill: number | null): boolean {
	if (!splitForCompaction(messages)) return false;
	const turns = messages.filter((m) => m.role === 'user').length;
	return turns >= NUDGE_USER_TURNS || (fill != null && fill >= NUDGE_FILL);
}
