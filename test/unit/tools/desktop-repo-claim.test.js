const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const ROOT = path.join(__dirname, '..', '..', '..');

/**
 * The Laticent desktop app lives in THIS repository (not built yet). A May 2026 plan
 * gave it a repo of its own, `laticent/laticent`; that repo was never created, but six
 * notes repeated the plan as fact, and a session reading them told the owner the app
 * was out of reach. The owner ruled on 2026-10-06 that the record says otherwise.
 *
 * This test fails when a tracked Markdown file says the desktop app has its own repo.
 * The decision notes keep their history, so a line is exempt when it, or one of the
 * twelve lines above it or the line after it, carries the dated correction `2026-10-06`. A new mention of
 * the old plan should carry that correction too.
 */
const CLAIMS = [
	/laticent\/laticent\b/i,
	/separate (?:laticent |desktop |wrapper )?repo/i,
	/(?:its|their) own (?:laticent )?repo/i,
	/desktop app'?s repository/i,
	/wrapper repo/i,
];
const DESKTOP = /desktop|tauri|wrapper|laticent/i;
const MARKER = '2026-10-06';
const SELF = 'test/unit/tools/desktop-repo-claim.test.js';

test('no tracked doc says the desktop app has a repository of its own', () => {
	const files = execFileSync('git', ['ls-files', '*.md'], { cwd: ROOT, encoding: 'utf8' })
		.split('\n')
		.filter((f) => f && f !== SELF && !f.startsWith('changelog/'));
	const hits = [];
	for (const f of files) {
		const full = path.join(ROOT, f);
		if (!fs.existsSync(full)) continue;
		const lines = fs.readFileSync(full, 'utf8').split('\n');
		lines.forEach((line, i) => {
			if (!DESKTOP.test(line) || !CLAIMS.some((re) => re.test(line))) return;
			if (lines.slice(Math.max(0, i - 12), i + 2).some((l) => l.includes(MARKER))) return;
			hits.push(`${f}:${i + 1}: ${line.trim()}`);
		});
	}
	assert.deepEqual(
		hits,
		[],
		'The desktop app lives in this repository (2026-05-10-tauri-exploration.md §Repository structure). ' +
			`Fix these lines, or add a correction dated ${MARKER} next to a historical one:\n${hits.join('\n')}`,
	);
});
