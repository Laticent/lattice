// The route-budget gate's own tests. A gate is only worth its noise if it fails in BOTH
// directions, so both are asserted here against a real built dist/ — over budget (growth
// that must be reviewed) and far under it (a budget that has gone stale and must ratchet).
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const LEDGER = path.join(HERE, '..', 'route-budget.json');
const GATE = path.join(HERE, 'check-route-budget.mjs');
const DIST = path.join(HERE, '..', 'dist', 'studio', 'index.html');

/** Run the gate against a temporarily-perturbed ledger; returns { code, stderr }. */
function runWith(mutate) {
	const original = fs.readFileSync(LEDGER, 'utf8');
	try {
		const led = JSON.parse(original);
		mutate(led);
		fs.writeFileSync(LEDGER, JSON.stringify(led, null, 2));
		try {
			execFileSync('node', [GATE], { encoding: 'utf8', stdio: 'pipe' });
			return { code: 0, stderr: '' };
		} catch (e) {
			return { code: e.status, stderr: String(e.stderr || '') };
		}
	} finally {
		fs.writeFileSync(LEDGER, original);
	}
}

// The gate reads a built artifact; without one there is nothing to assert.
const built = fs.existsSync(DIST);

test('passes on the committed ledger', { skip: !built && 'needs a built dist/' }, () => {
	assert.equal(runWith(() => {}).code, 0);
});

test('FAILS when a route exceeds its budget', { skip: !built && 'needs a built dist/' }, () => {
	const r = runWith((led) => {
		led.routes.studio.eagerJsGz = 1000;
	});
	assert.equal(r.code, 1, 'growth past the budget must be a non-zero exit');
	assert.match(r.stderr, /EXCEEDS its budget/);
});

test('FAILS when a budget has gone stale-loose', { skip: !built && 'needs a built dist/' }, () => {
	const r = runWith((led) => {
		led.routes.studio.eagerJsGz = 99_000_000;
	});
	assert.equal(r.code, 1, 'a budget nobody has to respect must be a non-zero exit');
	assert.match(r.stderr, /STALE/);
});
