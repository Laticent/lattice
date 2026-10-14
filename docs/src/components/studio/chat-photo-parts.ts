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
/** A clip longer than this is refused: video is billed by the second (about 260 tokens each on the
 *  models that read it), and a long one is the expensive mistake. */
export const MAX_VIDEO_SECONDS = 15;
/** A clip shorter than this is refused: a video model reads about one frame a second, so a clip under a second shows
 *  it nothing and one under two shows it a frame or two, and it answers from guesses. Measured 2026-10-14 against
 *  Gemini 3.8 Flash on real footage of one scene, cut to length: 0.13 s added no tokens and the reply described a
 *  kitchen; 0.5 s and 1 s added one frame and the replies were invented (a player scoring); 1.5 s and 2 s added two
 *  frames and both were right; 3 s was right as H.264 and as 10-bit HEVC. 1.5 is the shortest length that was right
 *  twice. One model family, one scene. A real iPhone clip taken for the soccer-goal test was 0.13 s long. */
export const MIN_VIDEO_SECONDS = 1.5;
/** A clip larger than this is refused before it is read. It travels inline as base64 (a third larger), so 15 MB of
 *  video is a 20 MB request body, and the cap is there to keep a request in a size a provider will take (a limit
 *  some video-capable providers document for inline data; not checked against every model Lattice offers).
 *  It is NOT "what a 15-second clip weighs": a real iPhone clip measured 16.4 MB for 9 seconds (1080x1920), about
 *  1.8 MB a second, so a phone clip hits this cap at roughly 8 seconds, well before the seconds cap. One sample, on
 *  one phone; the number to move is this one, and only after a real model has accepted a larger body. */
export const MAX_VIDEO_BYTES = 15 * 1024 * 1024;
/** What one clip is priced at by the budget gate: 15 s at ~260 tokens a second, rounded up. A flat figure on
 *  purpose: the gate must not read a base64 string as text (a 15 MB clip is millions of "tokens" of characters
 *  and would block every turn). A photo is priced by the model instead (picture-tokens.ts). */
export const VIDEO_TOKENS = 4500;

/** Why a clip cannot be attached, in words, or null when it can. Pure: the caller measures. Each message says what is
 *  wrong, then what to do, with the number the author needs (how long to trim to) when the length is known. */
export function videoRefusal(seconds: number, bytes: number): string | null {
	const known = Number.isFinite(seconds) && seconds > 0;
	const limitMb = Math.floor(MAX_VIDEO_BYTES / 1_048_576);
	if (bytes > MAX_VIDEO_BYTES) {
		// The length that fits at THIS clip's own rate, with a tenth to spare. A phone clip is about 1.8 MB a second, so
		// "a few seconds" left a person guessing; with the length unknown it is all that can be said.
		// Never past the seconds cap: a 20 s, 16 MB clip told "about 16 seconds" was refused again at 16 (checker).
		const fits = known ? Math.min(MAX_VIDEO_SECONDS, Math.floor((seconds * MAX_VIDEO_BYTES * 0.9) / bytes)) : 0;
		return `This video is ${(bytes / 1_048_576).toFixed(1)} MB and the limit is ${limitMb} MB. ${fits >= MIN_VIDEO_SECONDS ? `Trim it to about ${fits} seconds or less` : 'Trim it to a few seconds'}, then add it again.`;
	}
	if (!known) return 'This video could not be read, so it was not attached. Try another file.';
	// Floored, not rounded: 1.46 s rounded to "1.5", a length this very check accepts (checker).
	if (seconds < MIN_VIDEO_SECONDS) return `This video is only ${seconds < 1 ? (Math.floor(seconds * 100) / 100).toFixed(2) : (Math.floor(seconds * 10) / 10).toFixed(1)} seconds long. A model looks at about one frame a second, so record at least 2 seconds.`;
	// Half a second of slack: a phone's "15 second" clip decodes at 15.0x, and refusing it with a message
	// that says "15 seconds" contradicts itself. The cap is a cost guard, not a stopwatch.
	if (seconds > MAX_VIDEO_SECONDS + 0.5) return `This video is ${seconds.toFixed(1)} seconds and the limit is ${MAX_VIDEO_SECONDS}. Trim it to ${MAX_VIDEO_SECONDS} seconds or less, then add it again.`;
	return null;
}

/** The media type a clip travels under. A phone's recording is QuickTime (`video/quicktime`), the name the browser and
 *  the Library give it; OpenRouter's video guide lists `video/mov` (with `mp4`, `mpeg` and `webm`), and Google names the
 *  same container `video/mov`. Gemini read a clip under either name (measured 2026-10-14), so this was not the cause of
 *  a model saying it could not see a clip (that was a clip 0.13 s long, see `MIN_VIDEO_SECONDS`); it is kept because the
 *  documented list names `mov`, and a provider that follows the list to the letter would otherwise be handed a type
 *  outside it. */
export function videoWireType(mime: string): string {
	return mime === 'video/quicktime' ? 'video/mov' : mime;
}

/** The sentence that tells the model a clip came with the message. A clip is kept in the Library's Videos
 *  shelf, but a slide cannot play a video yet, so unlike a photo it has no `asset:` name to offer. */
export function videoNote(count: number, shown = true): string {
	if (count < 1) return '';
	const what = count === 1 ? 'a short video' : `${count} short videos`;
	return `\n\n(The author attached ${what} to this message; ${count === 1 ? 'it is' : 'they are'} ${shown ? 'shown to you below' : 'not shown again'}. ${count === 1 ? 'It is' : 'They are'} kept in the author's Library as a video, and a slide cannot play a video yet, so do not offer to put it on one.)`;
}

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
export function withPhotos<M extends { role: string; content: MsgContent | null }>(messages: M[], photos: { name: string; dataUrl: string }[], videos: { dataUrl: string }[] = []): M[] {
	if (!photos.length && !videos.length) return messages;
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
	const note = photoNote(photos.map((p) => p.name)) + videoNote(videos.length);
	if (t >= 0) parts[t] = { type: 'text', text: `${(parts[t] as { text: string }).text}${note}` };
	else if (note.trim()) parts.unshift({ type: 'text', text: note.trim() });
	for (const p of photos) parts.push({ type: 'image_url', image_url: { url: p.dataUrl } });
	for (const v of videos) parts.push({ type: 'video_url', video_url: { url: v.dataUrl } });
	return messages.map((m, i) => (i === idx ? { ...m, content: parts } : m));
}

/** A message's content as text for the budget gate: images (and their base64) count as nothing here
 *  because the gate prices them per model (picture-tokens.ts), separately. */
export function contentForBudget(content: MsgContent | null | undefined): string {
	if (content == null) return '';
	if (typeof content === 'string') return content;
	return content.map((p) => (p.type === 'image_url' || p.type === 'video_url' ? '' : JSON.stringify(p))).join('');
}
