// One author-facing sentence for a failed model request, shared by every Studio AI
// surface: the chat (`chat-agent.ts`), the theme faculty and the component faculty
// (`architect.ts`). It reads the transport's "OpenRouter error <status>: <detail>"
// message (`ai/architect-model.js`) and names the cause and the way out — a 402 says
// the account is out of credits, never "no model connected".
//
// This module imports nothing, so the eager `architect.ts` can import it without
// dragging the lazy chat agent into the Studio's startup chunk.

/** An author-facing sentence for a failed model request, from the transport's
 *  "OpenRouter error <status>: <detail>" message. */
export function describeModelError(message: string): string {
	const status = Number(/OpenRouter error (\d{3})/.exec(message)?.[1] ?? 0);
	const raw = /OpenRouter error \d{3}: ([\s\S]*)/.exec(message)?.[1] ?? '';
	// The body is usually JSON, `{"error":{"message":"…"}}`, sometimes cut short by the
	// transport; take the message when it parses, else the first quoted message, else the text.
	let detail = '';
	try {
		detail = String(JSON.parse(raw)?.error?.message ?? '');
	} catch {
		detail = /"message"\s*:\s*"([^"]*)/.exec(raw)?.[1] ?? raw;
	}
	detail = detail.replace(/\s+/g, ' ').trim().slice(0, 140);
	const tail = detail ? ` (OpenRouter said: ${detail})` : '';
	// OpenRouter also uses 403 for input a moderated model flagged — reconnecting does not help.
	if (status === 403 && /moderation|flagged/i.test(detail)) return `The selected model's moderation flagged this request — rephrase it, or pick another model in Workspace → AI.${tail}`;
	if (status === 401 || status === 403) return `OpenRouter rejected the connection — reconnect in Workspace → AI.${tail}`;
	if (status === 402) return `Your OpenRouter account is out of credits — add credits at openrouter.ai, or switch to On-device in Workspace → AI.${tail}`;
	if (status === 400 && /context length|maximum context|too many tokens/i.test(detail || raw)) return `The deck and its attachments are too long for this model — detach a reference document, or pick a model with a longer context in Workspace → AI.${tail}`;
	// A model that cannot read video refuses a request that carries a clip.
	if ((status === 400 || status === 404 || status === 422) && /video/i.test(detail || raw)) return `The selected model can't read video — pick one marked "video" in the model menu, or remove the clip and ask again.${tail}`;
	// A model that cannot read images refuses a request that carries one; say so, and say the way out.
	if ((status === 400 || status === 404 || status === 422) && /image|vision|multimodal|modalit/i.test(detail || raw)) return `The selected model can't read photos — pick one marked "vision" in the model menu, or remove the photo and ask again.${tail}`;
	if (status === 404 || status === 400) return `The selected model could not take this request — pick another model in Workspace → AI.${tail}`;
	if (status === 429) return `OpenRouter is rate-limiting this key — wait a moment and send again.${tail}`;
	if (status >= 500) return `OpenRouter or the model's provider had an error — send again in a moment.${tail}`;
	if (/fetch|network|load failed/i.test(message)) return 'The request never reached OpenRouter — check the connection and send again.';
	return `The model request failed — send again.${message ? ` (${message.slice(0, 140)})` : ''}`;
}
