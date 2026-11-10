/**
 * The marp-cli the Export-to-Marp integration tests render with, from a pinned, locked install.
 *
 * The four Marp files used to run `npx -y @marp-team/marp-cli@<range>`, which reached the npm
 * registry inside the test. On CI that fetch stalled often enough to turn 22 integration runs red in
 * 30 days ("did not finish before its parent and was cancelled"), and a 3-try retry with a sleep only
 * stretched the stall. A test that needs the network is flaky by shape (F6 in
 * engineering/decisions/2026-11-06-flaky-tests.md).
 *
 * Now `test/fixtures/marp-cli/` holds an exact pin with a lockfile. CI installs it in its own step,
 * before any test runs (`.github/workflows/ci.yml`, "Install the pinned marp-cli"), so a registry
 * outage is a red install step with its own name, never a test timing out. A test only reads the
 * installed binary.
 *
 * marp-cli is still not a dependency of this project (Marp is an export TARGET, HARD RULE #1): the
 * pin lives in its own folder and only these tests use it. The pin must EQUAL `MARP_CLI_VERSION`,
 * the exact version the export bundle and the copy-and-go kit tell recipients to run; `marpCli()`
 * checks that, so moving one without the other fails here instead of testing a version nobody runs.
 *
 * `LATTICE_MARP_CLI=range` runs the newest release compatible with that version (`^MARP_CLI_VERSION`),
 * fetched with npx: the canary for the next bump, which the integration nightly runs every night. It
 * needs the network and belongs off the per-PR path.
 */
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const ROOT = path.join(__dirname, '..', '..');
const PIN_DIR = path.join(ROOT, 'test', 'fixtures', 'marp-cli');
const { MARP_CLI_VERSION } = require(path.join(ROOT, 'lib', 'export', 'marp-bundle.js'));

/** The exact version `test/fixtures/marp-cli/package.json` pins. */
function pinnedVersion() {
	return JSON.parse(fs.readFileSync(path.join(PIN_DIR, 'package.json'), 'utf8')).dependencies['@marp-team/marp-cli'];
}

/**
 * Where the marp-cli these tests run comes from.
 * @returns {{ ok: true, label: string, run: (args: string[], opts: object) => import('node:child_process').SpawnSyncReturns<string> } | { ok: false, reason: string }}
 */
function marpCli() {
	if (process.env.LATTICE_MARP_CLI === 'range') {
		const { npxSync } = require('./npx-lock');
		const pkg = `@marp-team/marp-cli@^${MARP_CLI_VERSION}`;
		// It runs registry content, so with install scripts off, whatever env the caller passed.
		const run = (args, opts = {}) => npxSync(['-y', pkg, ...args], { ...opts, env: { ...(opts.env ?? process.env), npm_config_ignore_scripts: 'true' } });
		return { ok: true, label: `${pkg} (npx, network)`, run };
	}
	const pin = pinnedVersion();
	if (pin !== MARP_CLI_VERSION) {
		// Not a skip on any machine: the pin and the shipped version disagree in the tree itself.
		throw new Error(`test/fixtures/marp-cli pins @marp-team/marp-cli ${pin}, but recipients are told to run MARP_CLI_VERSION ${MARP_CLI_VERSION} (lib/export/marp-bundle.js). Move both together and refresh the pin's lockfile.`);
	}
	const entry = path.join(PIN_DIR, 'node_modules', '@marp-team', 'marp-cli', 'marp-cli.js');
	let installed = null;
	try {
		installed = JSON.parse(fs.readFileSync(path.join(PIN_DIR, 'node_modules', '@marp-team', 'marp-cli', 'package.json'), 'utf8')).version;
	} catch {
		/* not installed */
	}
	if (installed !== pin) {
		const why = installed ? `installed ${installed}, pinned ${pin}` : 'not installed';
		return { ok: false, reason: `the pinned marp-cli is ${why}. Run: npm ci --prefix test/fixtures/marp-cli --ignore-scripts` };
	}
	return { ok: true, label: `@marp-team/marp-cli ${pin} (pinned)`, run: (args, opts) => spawnSync(process.execPath, [entry, ...args], opts) };
}

module.exports = { marpCli, pinnedVersion, PIN_DIR };
