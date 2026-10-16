/**
 * Integration: exporting the same deck as a `--player` file twice produces the same BYTES.
 *
 * Measured on 2026-10-16: two `--player` exports of the 120-slide gallery deck differed in
 * exactly one field, the envelope's `generatedAt`, because the CLI passed `Date.now()` while
 * the PDF path already pinned its clock to SOURCE_DATE_EPOCH
 * (engineering/decisions/2026-10-16-player-as-library-audit.md §3). The unit golden in
 * test/unit/export/html-player.test.js assembles at `now: 0`, so it could not see this.
 *
 * Spawns the CLI twice rather than going through `test/helpers/render.js`, which caches by
 * input hash and would hand back the same file twice (see pdf-reproducible.test.js).
 */

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const os = require('node:os');
const { spawnSync } = require('node:child_process');

describe('player-reproducible', () => {
	const ROOT = path.join(__dirname, '..', '..', '..');
	const EMULATOR = path.join(ROOT, 'lattice.js');
	// The 3-slide fixture the PDF reproducibility test uses: real embedded fonts, cheap twice.
	const FIXTURE = path.join(ROOT, 'test', 'fixtures', 'preview-deck.md');
	const TIMEOUT = 180000;
	const { parseEnvelope } = require(path.join(ROOT, 'lib', 'core', 'lattice-doc.js'));

	function exportPlayer(out, env = {}) {
		const r = spawnSync(process.execPath, [EMULATOR, FIXTURE, out, '--quiet', '--player'], {
			cwd: ROOT,
			encoding: 'utf8',
			env: { ...process.env, SOURCE_DATE_EPOCH: '', ...env },
			timeout: TIMEOUT,
		});
		assert.equal(r.status, 0, `emulator failed: ${r.stderr}`);
		return fs.readFileSync(out);
	}

	test('two exports of one deck are byte-identical', { timeout: TIMEOUT * 2 }, () => {
		const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lattice-player-repro-'));
		const a = exportPlayer(path.join(dir, 'a.html'));
		const b = exportPlayer(path.join(dir, 'b.html'));
		assert.equal(a.length, b.length, 'file length moved between exports');
		assert.ok(a.equals(b), 'identical input exported to different bytes');
		assert.equal(parseEnvelope(a.toString('utf8')).generatedAt, 0, 'an unset SOURCE_DATE_EPOCH pins the epoch');
	});

	test('SOURCE_DATE_EPOCH sets the stamped instant', { timeout: TIMEOUT }, () => {
		const out = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'lattice-player-sde-')), 'deck.html');
		const html = exportPlayer(out, { SOURCE_DATE_EPOCH: '1750000000' }).toString('utf8');
		assert.equal(parseEnvelope(html).generatedAt, 1750000000 * 1000);
	});
});
