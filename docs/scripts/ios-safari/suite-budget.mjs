/**
 * THE NEXT DEVICE'S BUDGET, for run.sh: before it starts a device after the first, does that device still fit the job?
 *
 * run.sh runs its simulators one after another inside one 30-minute job. Main's nightly on 2026-11-15 (run 43712612297)
 * spent 1031 s on the iPad (two session attempts that failed, then a probe), started the iPhone at 1064 s anyway, and the
 * job was cancelled at its timeout with the iPhone's session just made: no result for either device, and a cancel that
 * read like a hung runner. So before each later device run.sh asks this file, with what the device before it cost.
 *
 * The estimate is that device's cost LESS the time its failed session starts wasted (run.sh measures both): a fresh device
 * pays a boot, a session and a probe, not the previous device's retries. Counted whole, the retries would have refused the
 * iPhone on 2026-11-10 (run 42819824102: 897 s gone plus a 773 s iPad), a run whose iPhone passed at 1315 s.
 *
 * A device refused here is NOT a pass. This file writes `not run: out of time: …` to stdout and to
 * `platform-suite-artifacts/out-of-time`, and run.sh then exits 1: tools/platform-suites-triage.js reads that mark as the
 * `out-of-time` finding, which is alerted at once and never held for the supervisor's re-run (HARD RULE #33).
 *
 *   node docs/scripts/ios-safari/suite-budget.mjs --device iPhone --gone 1064 --cost 600 --deadline 1560 [--mark <file>]
 *
 * Exits 0 when the device fits, 10 when it does not (the line is printed and appended to --mark), 2 on bad arguments.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/** The exit code that means "out of time": distinct from a crash (1) and bad arguments (2), so run.sh never mistakes one. */
export const OUT_OF_TIME = 10;

/**
 * @param {{ device: string, gone: number, cost: number, deadline: number }} input seconds of the script so far, the
 *   estimated cost of this device, and the deadline in seconds of the script
 * @returns {{ run: boolean, line: string }}
 */
export function nextDevice({ device, gone, cost, deadline }) {
	for (const [k, v] of Object.entries({ gone, cost, deadline })) {
		if (!Number.isFinite(v) || v < 0) throw new Error(`suite-budget: --${k} must be a number of seconds, got ${v}`);
	}
	if (gone + cost <= deadline) return { run: true, line: `${device}: starting at ${gone} s; about ${cost} s ends by ${gone + cost} s, inside ${deadline} s` };
	return { run: false, line: `not run: out of time: ${device} (${gone} s gone, needs about ${cost} s, budget ${deadline} s)` };
}

// Run as a script (through a symlinked path too: Node resolves the module's own URL to the real file) or imported by a test.
if (process.argv[1] && fs.realpathSync(path.resolve(process.argv[1])) === fileURLToPath(import.meta.url)) {
	const argv = process.argv.slice(2);
	const arg = (name) => {
		const i = argv.indexOf(`--${name}`);
		return i === -1 ? undefined : argv[i + 1];
	};
	try {
		const device = arg('device');
		if (!device) throw new Error('suite-budget: --device is required');
		const verdict = nextDevice({ device, gone: Number(arg('gone')), cost: Number(arg('cost')), deadline: Number(arg('deadline')) });
		console.log(verdict.line);
		if (!verdict.run) {
			const mark = arg('mark');
			if (mark) fs.appendFileSync(mark, `${verdict.line}\n`);
			process.exit(OUT_OF_TIME);
		}
	} catch (e) {
		console.error(String(e.message));
		process.exit(2);
	}
}
