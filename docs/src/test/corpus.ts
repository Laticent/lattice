import fs from 'node:fs';
import path from 'node:path';

/** The repository root, seen from docs/src/test/. */
export const REPO_ROOT = path.resolve(__dirname, '../../..');

function markdownIn(dir: string, out: string[] = []): string[] {
	for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
		if (e.name === 'node_modules' || e.name === '.git' || e.name === 'dist') continue;
		const full = path.join(dir, e.name);
		if (e.isDirectory()) markdownIn(full, out);
		else if (e.name.endsWith('.md')) out.push(full);
	}
	return out;
}

/**
 * Every deck the repository ships: the examples, the galleries and the baseline decks, as absolute paths, sorted so the
 * order never depends on how the file system lists a folder (HARD RULE #32, F8). Compose's round-trip tests run one test
 * per deck over this list, so a failure names its deck and no single test does the work of the whole corpus.
 */
export function shippedDecks(): string[] {
	return [
		...markdownIn(path.join(REPO_ROOT, 'examples')),
		...markdownIn(path.join(REPO_ROOT, 'lib')).filter((f) => f.endsWith('.gallery.md')),
		...markdownIn(path.join(REPO_ROOT, 'test/integration/baseline-decks')),
	].sort();
}

/** A deck's path from the repository root, for a test name. */
export function deckName(file: string): string {
	return path.relative(REPO_ROOT, file);
}
