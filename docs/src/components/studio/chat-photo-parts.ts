// The PURE half of chat photos: what a photo adds to a message, and what the budget gate counts.
// Its own module, importing nothing heavy, because the chat agent (lazy) and `architect.ts` (startup)
// both need it and neither may drag the media store in. The IO half is `chat-photos.ts`.

import type { ContentPart, MsgContent } from './reference-doc';

// The Library's asset-name grammar (media-store.ts `isMediaName`). Copied, not imported: that module
// is the IndexedDB store, and this one is read by startup code. `chat-photo-parts.test.ts` holds the
// two equal over a table of names, so the copy cannot drift.
const MEDIA_NAME = /^[a-z0-9][a-z0-9_-]*$/;
const isMediaName = (name: string): boolean => MEDIA_NAME.test(name);

/** A turn carries at most this many photos: each one is billed as input on the turn it is sent. */
export const MAX_CHAT_PHOTOS = 4;
/** Long edge of the copy sent to the model. */
export const VISION_EDGE = 1568;
/** Tokens one photo is priced at by the budget gate. A flat figure on purpose: the gate must not read
 *  a base64 string as text (a 1 MB photo is ~250,000 "tokens" of characters and would block every turn). */
export const PHOTO_TOKENS = 1500;

/** The sentence that tells the model what the author attached and how to use it. A name is a Library
 *  asset name — `[a-z0-9_-]` by `mediaNameFromFile` — and is checked again here, because a thread
 *  persists in storage and a name that is not one never reaches a prompt. */
export function photoNote(rawNames: string[], shown = true): string {
	const names = rawNames.filter(isMediaName);
	if (!names.length) return '';
	const list = names.map((n) => `asset:${n}`).join(', ');
	const what = names.length === 1 ? 'a photo' : `${names.length} photos`;
	// An EARLIER turn's photos are not re-sent (each image is billed every time it travels), so that
	// note must not say they are shown: a model told so invents a description.
	if (!shown) return `\n\n(The author attached ${what} to this message, saved in the deck's media as ${list}. ${names.length === 1 ? 'It is' : 'They are'} not shown again. To put one on a slide, write ![](asset:NAME).)`;
	return `\n\n(The author attached ${what} to this message, saved in the deck's media as ${list}. ${names.length === 1 ? 'It is' : 'They are'} shown to you below. To put one on a slide, write ![](asset:NAME).)`;
}

/**
 * The messages with this turn's photos added to the LAST user message as image parts. Pure: returns
 * a new array and leaves the input alone. With no photos it returns the input as it was.
 */
export function withPhotos<M extends { role: string; content: MsgContent | null }>(messages: M[], photos: { name: string; dataUrl: string }[]): M[] {
	if (!photos.length) return messages;
	let idx = -1;
	for (let i = messages.length - 1; i >= 0; i--) {
		if (messages[i].role === 'user') {
			idx = i;
			break;
		}
	}
	if (idx < 0) return messages;
	const cur = messages[idx].content;
	const parts: ContentPart[] = typeof cur === 'string' ? [{ type: 'text', text: cur }] : Array.isArray(cur) ? cur.map((p) => ({ ...p })) : [];
	const t = parts.findIndex((p) => p.type === 'text');
	const note = photoNote(photos.map((p) => p.name));
	if (t >= 0) parts[t] = { type: 'text', text: `${(parts[t] as { text: string }).text}${note}` };
	else if (note.trim()) parts.unshift({ type: 'text', text: note.trim() });
	for (const p of photos) parts.push({ type: 'image_url', image_url: { url: p.dataUrl } });
	return messages.map((m, i) => (i === idx ? { ...m, content: parts } : m));
}

/** A message's content as text for the budget gate: images (and their base64) count as nothing here
 *  because the gate prices them as `PHOTO_TOKENS` each, separately. */
export function contentForBudget(content: MsgContent | null | undefined): string {
	if (content == null) return '';
	if (typeof content === 'string') return content;
	return content.map((p) => (p.type === 'image_url' ? '' : JSON.stringify(p))).join('');
}
