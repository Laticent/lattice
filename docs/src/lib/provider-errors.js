// What a failed provider call MEANS, from its HTTP status and body: the one classifier the chat's
// error sentences (`components/studio/model-error.ts`) and the voice rungs (`playground/voice-model.js`)
// share, so the two never disagree about whether a key is bad, a model is gone or an account is out
// of money.
//
// Order matters. BILLING is checked first because providers report it under statuses that mean
// other things elsewhere: OpenRouter 402, OpenAI 429 `insufficient_quota`, Gemini 429
// `RESOURCE_EXHAUSTED` (quota) or 403 (billing not enabled), Anthropic 400 "credit balance is too
// low". A billing failure means the connection and the key WORK; it must never read as a rejected
// key or a retired model, and a live check must treat it as a pass for connectivity.
// engineering/decisions/2026-11-07-studio-model-spine.md §6.

const BILLING = /insufficient[_ ](?:credits?|quota|funds|balance)|credit balance is too low|exceeded your current quota|out of credits|add (?:more )?credits|payment required|billing|prepayment|spend(?:ing)? limit/i;
// A request this account or region may never make: not the model's fault, not the key's.
const REFUSED_HERE = /location is not supported|region is not supported|not available in your (?:country|region)|FAILED_PRECONDITION/i;
// OpenRouter answers a removed id 404 "no longer available" and an unknown one 400 "not a valid model
// ID" (live, 2026-11-09); the healer still checks the live list before calling either retired.
const GONE = /not found|not supported|is not available|no longer (?:available|supported)|deprecated|unsupported model|invalid model|not a valid model|no endpoints found/i;

/**
 * @param {number} status the HTTP status (0 = the request never got an answer)
 * @param {string} [detail] the response body, or its message
 * @returns {'billing' | 'key' | 'rate' | 'model-gone' | 'refused-here' | 'network' | 'other'}
 */
export function classifyProviderError(status, detail = '') {
	const d = String(detail || '');
	if (status === 402 || ((status === 400 || status === 403 || status === 429) && BILLING.test(d))) return 'billing';
	if (status === 401 || /API_KEY_INVALID|invalid[_ ]api[_ ]key|incorrect api key/i.test(d)) return 'key';
	if (status === 0) return 'network';
	if (status === 429) return 'rate';
	if ((status === 400 || status === 403) && REFUSED_HERE.test(d)) return 'refused-here';
	if (status === 403) return 'key';
	if (status === 404 || (status === 400 && GONE.test(d))) return 'model-gone';
	return 'other';
}
