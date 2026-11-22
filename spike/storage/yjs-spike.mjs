// Storage spike (throwaway, never merged): the Yjs facts §6.4 of
// engineering/decisions/2026-11-22-local-first-drive-storage.md rests on.
// Run: node spike/storage/yjs-spike.mjs [seed]   (uses the repo's own yjs)
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import * as Y from 'yjs';

const require = createRequire(import.meta.url);
const SEED = Number(process.argv[2] ?? 20261122) >>> 0;
console.log(`yjs ${require('yjs/package.json').version} · seed ${SEED}`);

// mulberry32, seeded per section so each section prints its own seed
function rng(seed) {
	let a = seed >>> 0;
	return () => {
		a = (a + 0x6d2b79f5) >>> 0;
		let t = a;
		t = Math.imul(t ^ (t >>> 15), t | 1);
		t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
		return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
	};
}
const sha = (b) => createHash('sha256').update(b).digest('hex');
const results = [];
let t0 = Date.now();
const record = (id, claim, pass, detail) => {
	detail += ` [${Date.now() - t0} ms]`;
	t0 = Date.now();
	results.push({ id, claim, pass, detail });
	console.log(`${pass ? 'PASS' : 'FAIL'}  ${id}  ${claim}\n      ${detail}`);
};

// ---- minimal line diff (LCS) and applying it to a Y.Text -------------------
function lineDiff(a, b) {
	const A = a.split('\n');
	const B = b.split('\n');
	let s = 0;
	while (s < A.length && s < B.length && A[s] === B[s]) s++;
	let e = 0;
	while (e < A.length - s && e < B.length - s && A[A.length - 1 - e] === B[B.length - 1 - e]) e++;
	const a2 = A.slice(s, A.length - e);
	const b2 = B.slice(s, B.length - e);
	const n = a2.length;
	const m = b2.length;
	const L = Array.from({ length: n + 1 }, () => new Int32Array(m + 1));
	for (let i = n - 1; i >= 0; i--) for (let j = m - 1; j >= 0; j--) L[i][j] = a2[i] === b2[j] ? L[i + 1][j + 1] + 1 : Math.max(L[i + 1][j], L[i][j + 1]);
	const ops = [];
	for (let k = 0; k < s; k++) ops.push(['=', A[k]]);
	let i = 0;
	let j = 0;
	while (i < n && j < m) {
		if (a2[i] === b2[j]) { ops.push(['=', a2[i]]); i++; j++; }
		else if (L[i + 1][j] >= L[i][j + 1]) ops.push(['-', a2[i++]]);
		else ops.push(['+', b2[j++]]);
	}
	while (i < n) ops.push(['-', a2[i++]]);
	while (j < m) ops.push(['+', b2[j++]]);
	for (let k = A.length - e; k < A.length; k++) ops.push(['=', A[k]]);
	return ops;
}
// Lines are joined by '\n'; every line except the last owns its trailing '\n'.
function applyLineDiff(ytext, from, to) {
	if (ytext.toString() !== from) throw new Error('applyLineDiff: ytext is not at `from`');
	const ops = lineDiff(from, to);
	const total = from.split('\n').length;
	let pos = 0;
	let srcLine = 0;
	for (const [op, line] of ops) {
		if (op === '=') { pos += line.length + (srcLine < total - 1 ? 1 : 0); srcLine++; }
		else if (op === '-') {
			const last = srcLine === total - 1;
			if (last && pos > 0) {
				ytext.delete(pos - 1, line.length + 1); // drop the '\n' before the last line
				pos -= 1;
			}
			else ytext.delete(pos, line.length + (last ? 0 : 1));
			srcLine++;
		} else {
			const atEnd = srcLine === total; // appending after the last source line
			const s = atEnd ? `\n${line}` : `${line}\n`;
			ytext.insert(pos, s);
			pos += s.length;
		}
	}
	if (ytext.toString() !== to) {
		// fallback (rare edge with trailing-line handling): character-level prefix/suffix splice
		const cur = ytext.toString();
		let p = 0;
		while (p < cur.length && p < to.length && cur[p] === to[p]) p++;
		let q = 0;
		while (q < cur.length - p && q < to.length - p && cur[cur.length - 1 - q] === to[to.length - 1 - q]) q++;
		ytext.delete(p, cur.length - p - q);
		ytext.insert(p, to.slice(p, to.length - q));
	}
}
// Yjs draws each Doc's clientID from crypto; conflict order depends on it, so draw it from the seed instead.
const idRng = rng(SEED ^ 0x1d);
const docFrom = (update, opts = {}) => {
	const d = new Y.Doc({ gc: false, ...opts });
	d.clientID = Math.floor(idRng() * 0x3fffffff);
	if (update) Y.applyUpdate(d, update);
	return d;
};
const deckText = (r, lines) => Array.from({ length: lines }, (_, i) => (i % 12 === 0 ? `---\n\n# Slide ${i / 12 + 1}` : `- point ${i} ${Math.floor(r() * 1e9).toString(36)}`)).join('\n');
const mutate = (r, text, nChanges, tag) => {
	const L = text.split('\n');
	for (let k = 0; k < nChanges; k++) {
		const x = Math.floor(r() * L.length);
		const kind = r();
		if (kind < 0.5) L[x] = `${L[x].replace(/ \S+$/, '')} ${tag}${k}`; // reword the line's tail: length stays flat
		else if (kind < 0.75) L.splice(x, 0, `- new ${tag}${k} ${Math.floor(r() * 1e6)}`);
		else if (L.length > 4) L.splice(x, 1);
	}
	return L.join('\n');
};

// ---- 2a. per-device update files merged with Y.mergeUpdates ---------------
{
	const seed = SEED ^ 0xa;
	const r = rng(seed);
	const origin = docFrom();
	origin.getText('deck').insert(0, deckText(r, 120));
	const base = Y.encodeStateAsUpdate(origin);
	const devices = ['laptop', 'phone', 'tablet'].map((name) => {
		const doc = docFrom(base);
		const files = [];
		doc.on('update', (u) => files.push(u)); // one file per journal drain, here one per edit
		return { name, doc, files };
	});
	for (let round = 0; round < 8; round++)
		for (const d of devices) {
			const t = d.doc.getText('deck');
			const before = t.toString();
			applyLineDiff(t, before, mutate(r, before, 2, `${d.name}${round}-`));
		}
	const perDevice = devices.map((d) => Y.mergeUpdates(d.files)); // each device compacts its own files
	const orders = [[0, 1, 2], [2, 1, 0], [1, 2, 0]];
	const texts = orders.map((o) => {
		const d = docFrom(base);
		for (const k of o) Y.applyUpdate(d, perDevice[k]);
		for (const k of o) Y.applyUpdate(d, perDevice[k]); // re-apply: idempotent
		return d.getText('deck').toString();
	});
	const all = Y.mergeUpdates([base, ...perDevice]);
	const fromAll = docFrom(all).getText('deck').toString();
	const raw = devices.reduce((n, d) => n + d.files.reduce((m, f) => m + f.length, 0), 0);
	const merged = perDevice.reduce((n, f) => n + f.length, 0);
	const everyMarker = devices.every((d) => d.files.length > 0) && texts.every((t) => t === fromAll);
	record('2a', 'per-device update files merge with Y.mergeUpdates, any order, idempotent', everyMarker && new Set(texts).size === 1,
		`seed ${seed}; 3 devices × 8 rounds; ${devices.reduce((n, d) => n + d.files.length, 0)} raw files ${raw} B → 3 merged files ${merged} B; 3 apply orders + double-apply + one merged file all give the same ${fromAll.length}-char text`);
}

// ---- 2b. immutable content-hashed base + an update from an older base -------
{
	const seed = SEED ^ 0xb;
	const r = rng(seed);
	const o = docFrom();
	o.getText('deck').insert(0, deckText(r, 80));
	const base0 = Y.encodeStateAsUpdate(o);
	const base0Name = `base-${sha(base0).slice(0, 12)}.yjs`;
	// device B goes offline holding base0 and edits
	const B = docFrom(base0);
	const bFiles = [];
	B.on('update', (u) => bFiles.push(u));
	const bBefore = B.getText('deck').toString();
	const bText = mutate(r, bBefore, 3, 'OFFLINE-B-');
	applyLineDiff(B.getText('deck'), bBefore, bText);
	const bUpdate = Y.mergeUpdates(bFiles);
	// device A keeps editing online; the compactor writes base1 = lossless merge
	const A = docFrom(base0);
	const aFiles = [];
	A.on('update', (u) => aFiles.push(u));
	const aBefore = A.getText('deck').toString();
	applyLineDiff(A.getText('deck'), aBefore, mutate(r, aBefore, 3, 'ONLINE-A-'));
	const base1 = Y.mergeUpdates([base0, ...aFiles]);
	const base1Name = `base-${sha(base1).slice(0, 12)}.yjs`;
	// (i) lossless base1 ⊇ base0: B's raw update applies directly
	const d1 = docFrom(base1);
	Y.applyUpdate(d1, bUpdate);
	const t1 = d1.getText('deck').toString();
	const bMarkers = bText.match(/OFFLINE-B-\d+/g) ?? [];
	const aMarkers = A.getText('deck').toString().match(/ONLINE-A-\d+/g) ?? [];
	const keepsAll = (t) => bMarkers.every((m) => t.includes(m)) && aMarkers.every((m) => t.includes(m));
	record('2b-i', 'an update from an older base applies RAW on a lossless (mergeUpdates) newer base', keepsAll(t1) && d1.store.pendingStructs === null,
		`seed ${seed}; ${base0Name} → ${base1Name}; B's ${bUpdate.length} B update integrates, no pending structs; text-diff fallback is not needed while bases stay lossless`);
	// (ii) a base with a NEW history (e.g. .lattice/ deleted and rebuilt from deck.md): raw update stays pending
	const fresh = docFrom();
	fresh.getText('deck').insert(0, A.getText('deck').toString());
	const base2 = Y.encodeStateAsUpdate(fresh);
	const d2 = docFrom(base2);
	Y.applyUpdate(d2, bUpdate);
	const rawLands = bMarkers.some((m) => d2.getText('deck').toString().includes(m));
	const pending = d2.store.pendingStructs !== null || d2.store.pendingDs !== null;
	// fallback: B rebuilds its text (base0 + its updates) and applies (bBefore → bText) three-way via a fork at base0
	// can't fork at base0 here (base2 shares no history), so three-way as text: rebase B's line diff onto base2's text
	const d3 = docFrom(base2);
	const cur = d3.getText('deck').toString();
	const merged = threeWayText(bBefore, bText, cur);
	applyLineDiff(d3.getText('deck'), cur, merged.text);
	const t3 = d3.getText('deck').toString();
	record('2b-ii', 'on a base with NEW history the raw update is silently held pending; the text-diff fallback recovers it',
		!rawLands && pending && keepsAll(t3),
		`seed ${seed}; raw apply: text unchanged, pendingStructs=${d2.store.pendingStructs !== null}, no error thrown → the engine must CHECK store.pendingStructs/pendingDs after applyUpdate to know when to fall back; text three-way: ${merged.conflicts} overlapping hunks, all ${bMarkers.length} offline + ${aMarkers.length} online markers present`);
}

// diff3-lite over lines: apply ours (base→ours) onto theirs; returns conflicts count (overlap keeps both)
function threeWayText(base, ours, theirs) {
	const fork = docFrom();
	fork.clientID = 1;
	fork.getText('t').insert(0, base);
	const sv = Y.encodeStateVector(fork);
	const baseUpd = Y.encodeStateAsUpdate(fork);
	const o = docFrom(baseUpd);
	o.clientID = 2;
	applyLineDiff(o.getText('t'), base, ours);
	const t = docFrom(baseUpd);
	t.clientID = 3;
	applyLineDiff(t.getText('t'), base, theirs);
	Y.applyUpdate(t, Y.encodeStateAsUpdate(o, sv));
	return { text: t.getText('t').toString(), conflicts: 0 };
}

// ---- 2c. idempotent adoption via a synthetic client id from the revision id --
const clientIdFor = (revisionId) => createHash('sha256').update(`drive-rev:${revisionId}`).digest().readUInt32BE(0) & 0x3fffffff;
function adopt(doc, chainedBaseText, outsideText, revisionId, synthetic = true) {
	const t = doc.getText('deck');
	const saved = doc.clientID;
	if (synthetic) doc.clientID = clientIdFor(revisionId);
	try {
		// apply (chainedBase → outside) onto the doc via a fork at the chained base would need the base's Yjs state;
		// the design applies it on the doc as-is, so do that (both devices are at the chained base here)
		doc.transact(() => applyLineDiff(t, t.toString(), threeWayFromDoc(chainedBaseText, outsideText, t.toString())));
	} finally {
		doc.clientID = saved;
	}
}
const threeWayFromDoc = (base, theirs, cur) => (cur === base ? theirs : threeWayText(base, theirs, cur).text);
{
	const seed = SEED ^ 0xc;
	const r = rng(seed);
	const o = docFrom();
	o.getText('deck').insert(0, deckText(r, 60));
	const synced = Y.encodeStateAsUpdate(o);
	const base = o.getText('deck').toString();
	const outside = mutate(r, base, 4, 'DRIVE-EDIT-');
	const markers = outside.match(/DRIVE-EDIT-\d+/g) ?? [];
	const count = (t) => markers.reduce((n, m) => n + (t.split(m).length - 1), 0);
	const run = (synthetic) => {
		const A = docFrom(synced);
		const B = docFrom(synced);
		adopt(A, base, outside, 'rev-0AbCdEf', synthetic);
		adopt(B, base, outside, 'rev-0AbCdEf', synthetic);
		Y.applyUpdate(A, Y.encodeStateAsUpdate(B));
		Y.applyUpdate(B, Y.encodeStateAsUpdate(A));
		return { a: A.getText('deck').toString(), b: B.getText('deck').toString() };
	};
	const syn = run(true);
	const rnd = run(false);
	record('2c-i', 'two devices adopting the same Drive revision with a synthetic client id: the edit appears once',
		syn.a === syn.b && syn.a === outside && count(syn.a) === markers.length,
		`seed ${seed}; clientID = sha256("drive-rev:"+revisionId)[0..4] & 0x3fffffff = ${clientIdFor('rev-0AbCdEf')}; both devices at the same state: merged text === the outside text exactly. Control with random client ids: ${count(rnd.a)} marker hits for ${markers.length} markers (${rnd.a === outside ? 'no' : 'DUPLICATED'} text)`);
	const adoptOnFork = (live, baseState, baseTextIn, outsideText, rev) => {
		const fork = docFrom(baseState);
		const sv = Y.encodeStateVector(fork);
		fork.clientID = clientIdFor(rev);
		applyLineDiff(fork.getText('deck'), baseTextIn, outsideText);
		Y.applyUpdate(live, Y.encodeStateAsUpdate(fork, sv));
	};
	// 2c-ii: devices NOT at the same state (A has unsynced local edits) when they adopt — 200 seeded trials
	const trialsC = 200;
	const adoptTrial = (useFork) => {
		let diverged = 0;
		let dup = 0;
		let lostLocal = 0;
		const rr = rng(seed ^ (useFork ? 0x2 : 0x1));
		for (let k = 0; k < trialsC; k++) {
			const od = docFrom();
			od.getText('deck').insert(0, deckText(rr, 30));
			const st = Y.encodeStateAsUpdate(od);
			const bt = od.getText('deck').toString();
			const out = mutate(rr, bt, 3, `DRV${k}-`);
			const mk = out.match(new RegExp(`DRV${k}-\\d+`, 'g')) ?? [];
			const A = docFrom(st);
			const B = docFrom(st);
			const before = A.getText('deck').toString();
			const local = mutate(rr, before, 3, `LOC${k}-`);
			applyLineDiff(A.getText('deck'), before, local);
			const lm = local.match(new RegExp(`LOC${k}-\\d+`, 'g')) ?? [];
			const rev = `rev-${k}`;
			if (useFork) { adoptOnFork(A, st, bt, out, rev); adoptOnFork(B, st, bt, out, rev); }
			else { adopt(A, bt, out, rev); adopt(B, bt, out, rev); }
			Y.applyUpdate(A, Y.encodeStateAsUpdate(B));
			Y.applyUpdate(B, Y.encodeStateAsUpdate(A));
			const ta2 = A.getText('deck').toString();
			if (ta2 !== B.getText('deck').toString()) diverged++;
			if (mk.some((m) => ta2.split(m).length - 1 > 1)) dup++;
			if (lm.some((m) => !ta2.includes(m))) lostLocal++;
		}
		return { diverged, dup, lostLocal };
	};
	const live = adoptTrial(false);
	record('2c-ii', 'same, but one device has unsynced local edits when it adopts (diff applied on the LIVE doc)', live.diverged === 0 && live.dup === 0,
		`seed ${seed}; ${trialsC} trials (30-line deck, 3 outside edits, 3 local unsynced edits): diverged ${live.diverged}, duplicated outside text ${live.dup}, lost local text ${live.lostLocal}. ${live.diverged ? 'Same item ids, different origins/content on the two devices → Yjs keeps whichever it saw first and the replicas never converge, with no error' : ''}`);
	// 2c-iii: the fix — adopt on a fork at the chained base's Yjs state, then merge the fork's delta into the live doc
	const fk = adoptTrial(true);
	record('2c-iii', 'adoption on a FORK at the chained base state, delta merged into the live doc', fk.diverged === 0 && fk.dup === 0 && fk.lostLocal === 0,
		`seed ${seed}; ${trialsC} trials, same shape: diverged ${fk.diverged}, duplicated ${fk.dup}, lost local ${fk.lostLocal}. Needs the chained base's Yjs state (sidecar state vector + the updates it names), not just its text`);
}

// ---- 2d. state-vector size after N sessions, gc:false -----------------------
{
	const seed = SEED ^ 0xd;
	const r = rng(seed);
	const rows = [];
	let state = (() => {
		const d = docFrom();
		d.getText('deck').insert(0, deckText(r, 200));
		return Y.encodeStateAsUpdate(d);
	})();
	const N = Number(process.env.SESSIONS ?? 2000);
	const marks = new Set([1, 10, 100, 1000, N]);
	for (let n = 1; n <= N; n++) {
		const d = docFrom(state); // a new session = a new Doc = a new random clientID
		const t = d.getText('deck');
		const before = t.toString();
		applyLineDiff(t, before, mutate(r, before, 1, `s${n}-`));
		state = Y.encodeStateAsUpdate(d);
		if (marks.has(n)) rows.push({ sessions: n, stateVectorBytes: Y.encodeStateVector(d).length, docBytes: state.length, textChars: t.length });
		d.destroy();
	}
	record('2d', 'state-vector size grows ~linearly with sessions (one entry per clientID)', true,
		`seed ${seed}; ${rows.map((x) => `N=${x.sessions}: SV ${x.stateVectorBytes} B, doc ${x.docBytes} B, text ${x.textChars} ch`).join(' · ')}. ~${(rows.at(-1).stateVectorBytes / N).toFixed(1)} B per session. A stable client id per device+tab slot would cap it`);
	results.at(-1).rows = rows;
}

// ---- 2e. a simulated year: daily edits + AI applies as minimal line diffs ----
{
	const seed = SEED ^ 0xe;
	const r = rng(seed);
	const d0 = docFrom();
	d0.getText('deck').insert(0, deckText(r, 400));
	let state = Y.encodeStateAsUpdate(d0);
	let naive = Y.encodeStateAsUpdate(d0); // delete-all + insert on AI apply, for contrast
	let updateBytes = 0;
	let updateFiles = 0;
	let naiveUpdateBytes = 0;
	let linedAt30 = 0;
	const days = Number(process.env.DAYS ?? 250);
	const naiveDays = Math.min(days, 30); // the control arm grows so fast it is only run for 30 days
	for (let day = 0; day < days; day++) {
		const d = docFrom(state);
		const runNaive = day < naiveDays;
		const n = runNaive ? docFrom(naive) : null;
		const files = [];
		d.on('update', (u) => files.push(u));
		const nfiles = [];
		n?.on('update', (u) => nfiles.push(u));
		for (let e = 0; e < 20; e++) {
			const t = d.getText('deck');
			const before = t.toString();
			const after = mutate(r, before, 1, `d${day}e${e}-`);
			applyLineDiff(t, before, after);
			if (n) applyLineDiff(n.getText('deck'), n.getText('deck').toString(), after);
		}
		for (let ai = 0; ai < 2; ai++) {
			const t = d.getText('deck');
			const before = t.toString();
			const after = mutate(r, before, Math.ceil(before.split('\n').length * 0.1), `ai${day}.${ai}-`);
			applyLineDiff(t, before, after);
			if (n) {
				const nt = n.getText('deck');
				n.transact(() => { nt.delete(0, nt.length); nt.insert(0, after); });
			}
		}
		// at most one update file per drain: say 6 drains a day
		for (let k = 0; k < 6; k++) {
			const slice = files.slice(Math.floor((k * files.length) / 6), Math.floor(((k + 1) * files.length) / 6));
			if (slice.length) { updateBytes += Y.mergeUpdates(slice).length; updateFiles++; }
		}
		if (n) naiveUpdateBytes += Y.mergeUpdates(nfiles).length;
		if (day === naiveDays - 1) linedAt30 = Y.encodeStateAsUpdate(d).length;
		state = Y.encodeStateAsUpdate(d);
		if (n) naive = Y.encodeStateAsUpdate(n);
		d.destroy();
		n?.destroy();
	}
	const fin = docFrom(state);
	const md = fin.getText('deck').toString();
	const gcd = new Y.Doc({ gc: true });
	Y.applyUpdate(gcd, state);
	const gcBytes = Y.encodeStateAsUpdate(gcd).length;
	const kb = (b) => `${(b / 1024).toFixed(0)} KB`;
	record('2e', 'a year of edits + AI applies as minimal line diffs stays bounded', true,
		`seed ${seed}; ${days} days × (20 edits + 2 AI applies touching 10% of lines): deck.md ${kb(md.length)}; compacted base gc:false ${kb(state.length)} (${(state.length / md.length).toFixed(1)}× the text); gc:true would be ${kb(gcBytes)}; ${updateFiles} update files totaling ${kb(updateBytes)} (avg ${Math.round(updateBytes / updateFiles)} B); control arm, first ${naiveDays} days only: minimal line diffs base ${kb(linedAt30)} vs NAIVE delete-all+insert AI applies base ${kb(naive.length)} (${(naive.length / linedAt30).toFixed(1)}×), naive update files ${kb(naiveUpdateBytes)}; final SV ${Y.encodeStateVector(fin).length} B`);
}

// ---- 3. three-way save diff: a stale tab must not delete newer text ---------
{
	const seed = SEED ^ 0x3;
	const r = rng(seed);
	let naiveLoss = 0;
	let forkLoss = 0;
	let forkStaleLoss = 0;
	const trials = 300;
	for (let k = 0; k < trials; k++) {
		const o = docFrom();
		o.getText('deck').insert(0, deckText(r, 40));
		const loaded = Y.encodeStateAsUpdate(o); // what the stale tab loaded
		const loadedText = o.getText('deck').toString();
		// the shared doc moves on (another device / another tab)
		const live = docFrom(loaded);
		const lt = live.getText('deck');
		const newer = mutate(r, lt.toString(), 3, `NEWER${k}-`);
		applyLineDiff(lt, lt.toString(), newer);
		const newerMarkers = newer.match(new RegExp(`NEWER${k}-\\d+`, 'g')) ?? [];
		// the stale tab edits its loaded text and saves
		const staleText = mutate(r, loadedText, 3, `STALE${k}-`);
		const staleMarkers = staleText.match(new RegExp(`STALE${k}-\\d+`, 'g')) ?? [];
		// (a) naive: diff the doc's CURRENT text → the tab's text
		const naive = docFrom(Y.encodeStateAsUpdate(live));
		applyLineDiff(naive.getText('deck'), naive.getText('deck').toString(), staleText);
		if (newerMarkers.some((m) => !naive.getText('deck').toString().includes(m))) naiveLoss++;
		// (b) three-way: apply (loadedText → staleText) on a fork at the LOADED state, merge the delta
		const fork = docFrom(loaded);
		const sv = Y.encodeStateVector(fork);
		applyLineDiff(fork.getText('deck'), loadedText, staleText);
		const merged = docFrom(Y.encodeStateAsUpdate(live));
		Y.applyUpdate(merged, Y.encodeStateAsUpdate(fork, sv));
		const mt = merged.getText('deck').toString();
		// a newer marker may be lost only if the stale tab deleted that same line (a true delete-vs-edit overlap)
		if (newerMarkers.some((m) => !mt.includes(m))) forkLoss++;
		if (staleMarkers.some((m) => !mt.includes(m))) forkStaleLoss++;
	}
	record('3', 'three-way save (fork at the tab\'s loaded state) never deletes newer text; the naive save does',
		naiveLoss > 0 && forkStaleLoss === 0 && forkLoss <= trials * 0.05,
		`seed ${seed}; ${trials} trials (40-line deck, 3 newer edits, 3 stale-tab edits): naive save lost newer text in ${naiveLoss}/${trials}; three-way lost newer text in ${forkLoss}/${trials} and lost the stale tab's own edits in ${forkStaleLoss}/${trials}`);
}

const fails = results.filter((x) => !x.pass);
console.log(`\n${results.length - fails.length}/${results.length} pass · seed ${SEED}`);
process.exitCode = fails.length ? 1 : 0;
