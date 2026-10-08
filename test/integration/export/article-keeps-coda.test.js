/**
 * Integration: the reading article keeps each slide's CODA — its Key Insight and below-note
 * (lib/transformers/prose-projection.mjs `withCoda`).
 *
 * `lib/core/coda.js` lifts a slide's trailing `> …` panel and trailing note into a `.cell-coda` cell
 * BESIDE `.cell-stage`, and the article read only the stage, so every such slide lost its closing
 * "so what" in Read · Article while the narration spoke it. Pinned on the engine's own render: the
 * `--read` export is the article every host projects, from the same kernel. A layout that CLAIMS its
 * trailing block (contact) keeps it inside the stage, and it must still print exactly once.
 *
 * Slow tier: one CLI export. See engineering/pipeline.md.
 */
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const fs = require('fs');
const os = require('os');
const { spawnSync } = require('child_process');
const { JSDOM } = require('jsdom');

describe('export: the reading article keeps each slide\'s Key Insight and below-note', () => {
	const ROOT = path.join(__dirname, '..', '..', '..');
	const EMULATOR = path.join(ROOT, 'lattice.js');
	const TIMEOUT = 180000;
	const DECK = [
		'---\ntheme: indaco\n---',
		'## A plain slide\n\n- EMEA leads\n- APAC holds\n\n> Plain insight line.\n\nA plain below-note.\n',
		'## A panes slide\n\n<!-- panes: 50/50 -->\n<!-- pane: list -->\n\n- Left item\n\n<!-- pane: table -->\n\n| A | B |\n|---|---|\n| 1 | 2 |\n\n> Panes insight line.\n',
		'<!-- _class: contact -->\n\n## A claiming layout\n\n- Ada\n  - ada@example.com\n\n> Claimed insight line.\n',
	].join('\n\n---\n\n');

	test('each coda block reaches the article once, after its slide\'s body', { timeout: TIMEOUT }, () => {
		const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lattice-article-coda-'));
		fs.writeFileSync(path.join(dir, 'deck.md'), DECK);
		const out = path.join(dir, 'deck.html');
		const r = spawnSync(process.execPath, [EMULATOR, path.join(dir, 'deck.md'), out, '--quiet', '--read'], {
			cwd: ROOT, encoding: 'utf8', env: { ...process.env }, timeout: TIMEOUT,
		});
		assert.equal(r.status, 0, `emulator failed: ${r.stderr}`);
		const text = new JSDOM(fs.readFileSync(out, 'utf8')).window.document.body.textContent.replace(/\s+/g, ' ');
		const count = (t) => text.split(t).length - 1;
		for (const t of ['Plain insight line.', 'A plain below-note.', 'Panes insight line.', 'Claimed insight line.']) {
			assert.equal(count(t), 1, `"${t}" appears ${count(t)} times in the article`);
		}
		assert.ok(text.indexOf('Plain insight line.') > text.indexOf('APAC holds'), 'the insight follows its slide\'s body');
		assert.ok(text.indexOf('Panes insight line.') > text.indexOf('Left item'), 'the panes host\'s insight follows its panes');
	});
});
