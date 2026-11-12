// Prove the correctness gate (property.ts) can fail: each mutant removes one of Accordo's safeguards, runs the gate,
// and must be caught. The mutant is written over accordo.ts for the run and the original is restored afterwards,
// even on failure. usage: node mutants.mjs [runs]   (from this folder)
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';

const FILE = new URL('./accordo.ts', import.meta.url);
const runs = process.argv[2] ?? '500';
const MUTANTS = [
	{ name: 'no gap detection (the vector jumps over a missing change)', from: 'if (from > h.upTo + 1) for (let s = from; s <= to; s++) h.above.add(s);\n\t\telse {', to: 'if (false) {} else {', caught: /accordo: FAIL/ },
	{ name: 'no superseded ranges (the vector stalls below an overwritten change)', from: 'for (const [ri, from, to] of w.d ?? []) this.holdSeq(w.r[ri], from, to);', to: '', caught: /accordo: FAIL/ },
	{ name: 'no sequence resume (reopening under its own id reuses ids)', from: 'if (r === this.replica && to > this.seq) this.seq = to;', to: '', caught: /reopened under its own id: FAIL/ },
	{ name: 'no append yield (measured: replies misplaced, not a failure)', from: 'return this.insert(all.length ? all[all.length - 1].id : null, fields, true);', to: 'return this.insert(all.length ? all[all.length - 1].id : null, fields, false);', caught: null },
];
const original = readFileSync(FILE, 'utf8');
let bad = 0;
try {
	for (const m of MUTANTS) {
		if (original.split(m.from).length !== 2) throw new Error(`mutant "${m.name}": its target line is not in accordo.ts exactly once`);
		writeFileSync(FILE, original.replace(m.from, m.to));
		let out;
		try {
			out = execFileSync(process.execPath, ['--experimental-strip-types', '--no-warnings', 'property.ts', runs], { cwd: new URL('.', import.meta.url), encoding: 'utf8', env: { ...process.env, ONLY: 'accordo' } });
		} catch (e) {
			out = `${e.stdout ?? ''}${e.stderr ?? ''}`;
		}
		const line = out.split('\n').filter((l) => l.startsWith('accordo')).map((l) => l.slice(0, 160)).join('\n    ');
		const ok = m.caught ? m.caught.test(out) : true;
		if (!ok) bad++;
		console.log(`${ok ? (m.caught ? 'CAUGHT' : 'MEASURED') : 'MISSED'}  ${m.name}\n    ${line}`);
	}
} finally {
	writeFileSync(FILE, original);
}
process.exit(bad ? 1 : 0);
