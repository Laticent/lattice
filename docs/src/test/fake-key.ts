// A throwaway API key for a test, built at run time from its prefix and its body.
//
// Test fixtures never embed a key-shaped literal (`engineering/testing.md` §Test data): a secret
// scanner reads source, not intent, and flags `'<provider prefix><long run of key characters>'`
// whether or not the key is real. Passing the prefix and the body as two strings keeps the value
// the code under test sees byte for byte, while no single literal in the file has the key's shape.
// `build:check` (`checkKeyShapedLiterals` in `tools/check-ownership.js`) fails on one that does.

/** `prefix + body`: e.g. `fakeKey('sk-or-v1-', 'e2e-mock-key-0a0a')`. */
export function fakeKey(prefix: string, body: string): string {
	return prefix + body;
}
