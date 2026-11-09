import { describe, expect, it } from 'vitest';
import { classifyProviderError } from './provider-errors.js';

// What a failed provider call means. The bodies are each provider's documented shape for the case.
// A billing failure must never read as a bad key or a retired model: the connection works.
describe('classifyProviderError', () => {
	it('reads every provider\'s billing failure as billing, whatever status it chose', () => {
		expect(classifyProviderError(402, '{"error":{"message":"Insufficient credits","code":402}}')).toBe('billing'); // OpenRouter
		expect(classifyProviderError(429, '{"error":{"message":"You exceeded your current quota, please check your plan and billing details.","type":"insufficient_quota","code":"insufficient_quota"}}')).toBe('billing'); // OpenAI
		expect(classifyProviderError(429, '{"error":{"code":429,"message":"You exceeded your current quota, please check your plan and billing details.","status":"RESOURCE_EXHAUSTED"}}')).toBe('billing'); // Gemini
		expect(classifyProviderError(403, '{"error":{"code":403,"message":"This API method requires billing to be enabled.","status":"PERMISSION_DENIED"}}')).toBe('billing'); // Gemini, billing off
		expect(classifyProviderError(400, '{"type":"error","error":{"type":"invalid_request_error","message":"Your credit balance is too low to access the Anthropic API."}}')).toBe('billing'); // Anthropic
	});

	it('reads OpenRouter’s live answers for a removed and an unknown model id as gone (2026-11-09)', () => {
		expect(classifyProviderError(404, 'anthropic/claude-3.5-haiku is no longer available on OpenRouter: no provider serves this model anymore.')).toBe('model-gone');
		expect(classifyProviderError(404, 'Claude 3 Haiku was deprecated on Sep 10, 2026. We recommend migrating to Claude Haiku 4.5')).toBe('model-gone');
		expect(classifyProviderError(400, 'anthropic/claude-sonnet-3.5 is not a valid model ID')).toBe('model-gone');
	});
	it('tells a bad key, a rate limit, a region refusal and a retired model apart', () => {
		expect(classifyProviderError(401, 'Unauthorized')).toBe('key');
		expect(classifyProviderError(400, '{"error":{"message":"API key not valid.","details":[{"reason":"API_KEY_INVALID"}]}}')).toBe('key');
		expect(classifyProviderError(429, 'Rate limit reached for requests')).toBe('rate');
		expect(classifyProviderError(400, '{"error":{"message":"User location is not supported for the API use.","status":"FAILED_PRECONDITION"}}')).toBe('refused-here');
		expect(classifyProviderError(404, '{"error":{"message":"models/gemini-3.0-flash-tts is not found for API version v1beta"}}')).toBe('model-gone');
		expect(classifyProviderError(400, 'No endpoints found for hexgrad/kokoro-82m')).toBe('model-gone');
		expect(classifyProviderError(0, '')).toBe('network');
		expect(classifyProviderError(500, 'internal')).toBe('other');
	});
});
