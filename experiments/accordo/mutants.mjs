// Prove the correctness gate (property.ts) can fail: each mutant removes one of Accordo's safeguards, runs the gate,
// and must be caught. Mutants run on a COPY of this folder in a temporary directory, so the tracked accordo.ts never
// changes on disk (a concurrent commit, hook or benchmark could otherwise pick a mutant up: audit of round 4, #4).
// usage: node mutants.mjs [runs]   (from this folder)
import { execFileSync } from 'node:child_process';
import { cpSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HERE, '../..');
const runs = process.argv[2] ?? '500';
const MUTANTS = [
	{ name: 'no gap detection (the vector jumps over a missing change)', from: 'if (from > h.upTo + 1) for (let s = from; s <= to; s++) h.above.add(s);\n\t\telse {', to: 'if (false) {} else {', caught: /accordo: FAIL/ },
	{ name: 'no superseded ranges (the vector stalls below an overwritten change)', from: 'for (const [ri, from, to] of w.d ?? []) this.holdSeq(w.r[ri], from, to);', to: '', caught: /accordo: FAIL/ },
	{ name: 'no sequence resume (reopening under its own id reuses ids)', from: 'if (r === this.replica && to > this.seq) this.seq = to;', to: '', caught: /reopened under its own id: FAIL/ },
	{ name: 'the first delete to arrive wins (a deleted reply comes back on a third tab)', from: 'if (wdel && (!n.del || later(st(wdel), n.del))) {', to: 'if (wdel && !n.del) {', caught: /accordo two tabs delete one reply: FAIL/ },
	{ name: 'no append yield (measured: replies misplaced, not a failure)', from: 'return this.insert(all.length ? all[all.length - 1].id : null, fields, true);', to: 'return this.insert(all.length ? all[all.length - 1].id : null, fields, false);', caught: null },
];
const original = readFileSync(path.join(HERE, 'accordo.ts'), 'utf8');
const work = mkdtempSync(path.join(tmpdir(), 'accordo-mutant-'));
let bad = 0;
try {
	cpSync(HERE, work, { recursive: true, filter: (src) => !src.includes(`${path.sep}results`) });
	symlinkSync(path.join(REPO, 'node_modules'), path.join(work, 'node_modules'), 'dir');
	for (const m of MUTANTS) {
		if (original.split(m.from).length !== 2) throw new Error(`mutant "${m.name}": its target line is not in accordo.ts exactly once`);
		writeFileSync(path.join(work, 'accordo.ts'), original.replace(m.from, m.to));
		let out;
		try {
			out = execFileSync(process.execPath, ['--experimental-strip-types', '--no-warnings', 'property.ts', runs], { cwd: work, encoding: 'utf8', env: { ...process.env, ONLY: 'accordo', ACCORDO_DOCS: path.join(REPO, 'docs') } });
		} catch (e) {
			out = `${e.stdout ?? ''}${e.stderr ?? ''}`;
		}
		const line = out.split('\n').filter((l) => l.startsWith('accordo')).map((l) => l.slice(0, 160)).join('\n    ');
		const ok = m.caught ? m.caught.test(out) : true;
		if (!ok) bad++;
		console.log(`${ok ? (m.caught ? 'CAUGHT' : 'MEASURED') : 'MISSED'}  ${m.name}\n    ${line}`);
	}
} finally {
	rmSync(work, { recursive: true, force: true });
}
process.exit(bad ? 1 : 0);
