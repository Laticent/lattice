/**
 * The bake-off's PERFORMANCE runs (../../2026-11-12-chat-threads-crdt.md §10). Every workload is seeded, so both
 * contenders do exactly the same chat work. Times are medians of repeated runs; sizes are exact.
 *
 * usage (Node): node --experimental-strip-types --expose-gc bench.ts
 * In a browser, browser-bench.mjs bundles this file and runs the same `runAll()` in Chromium, Firefox and WebKit.
 */
import { accordoDoc } from './accordo-adapter.ts';
import type { Contender } from './contender.ts';
import { yjsDoc } from './yjs-adapter.ts';

// ── Seeded chat content ─────────────────────────────────────────────────────────────────────────
function rng(seed: number) {
	let a = seed >>> 0;
	return () => {
		a = (a + 0x6d2b79f5) >>> 0;
		let t = a;
		t = Math.imul(t ^ (t >>> 15), t | 1);
		t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
		return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
	};
}
const text = (r: () => number, n: number) => {
	let s = '';
	while (s.length < n) s += `word${Math.floor(r() * 1000)} `;
	return s.slice(0, n);
};
const CAP = 60;

/** One chat turn: a question and a reply, every fourth reply carrying a proposed edit. */
function turn(d: Contender, r: () => number, k: number) {
	let id = '';
	d.transact(() => {
		const q = d.push({ role: 'user', content: text(r, 200) });
		id = d.insertAfter(q, {
		role: 'assistant',
		content: text(r, 600),
		...(k % 4 === 3 ? { proposed: [{ label: 'Slide 2', slide: 2, action: 'replace', body: text(r, 300) }] } : {}),
			usage: { cost: 0.002, prompt: 1800, completion: 240 },
		});
	});
	return id;
}
function thread(make: () => Contender, messages: number, seed = 1): Contender {
	const d = make();
	const r = rng(seed);
	for (let k = 0; k < messages / 2; k++) turn(d, r, k);
	return d;
}

/** A long life: `ops` chat actions with the 60-message cap and a compaction every so often. */
function longLife(make: () => Contender, ops: number, seed = 2): Contender {
	const d = make();
	const r = rng(seed);
	for (let i = 0; i < ops; i++) {
		const p = r();
		const live = d.toArray();
		if (p < 0.45 || live.length < 4) turn(d, r, i);
		else if (p < 0.75) {
			const withEdit = live.filter((m) => m.proposed && !m.applied);
			if (withEdit.length) d.set(withEdit[Math.floor(r() * withEdit.length)].id, 'applied', true);
		} else if (p < 0.9) {
			const replies = live.filter((m) => m.role === 'assistant');
			const reply = replies[replies.length - 1];
			const i2 = live.findIndex((m) => m.id === reply.id);
			d.delete(reply.id);
			d.insertAfter(live[i2 - 1]?.id ?? null, { role: 'assistant', content: text(r, 600) });
		} else if (p < 0.92 && live.length > 20) {
			d.deleteRange(0, live.length - 20);
			const first = d.toArray()[0];
			d.set(first.id, 'compacted', { summary: text(r, 900), count: live.length - 20, saved: 9000 });
		}
		const now = d.toArray().length;
		if (now > CAP) d.deleteRange(0, now - CAP);
	}
	return d;
}

// ── Timing ──────────────────────────────────────────────────────────────────────────────────────
const now = () => performance.now();
function median(xs: number[]) {
	const s = [...xs].sort((a, b) => a - b);
	return s[Math.floor(s.length / 2)];
}
/** Median time of one call. Each sample times a BATCH of calls and divides: Firefox and WebKit clamp
 *  performance.now() to about a millisecond, so timing one sub-millisecond call alone reads 0 or 1. */
function time(fn: () => void, samples: number, warm = 3): number {
	for (let i = 0; i < warm; i++) fn();
	let batch = 1;
	for (;;) {
		const t = now();
		for (let i = 0; i < batch; i++) fn();
		if (now() - t >= 20 || batch >= 4096) break;
		batch *= 2;
	}
	const xs: number[] = [];
	for (let i = 0; i < samples; i++) {
		const t = now();
		for (let j = 0; j < batch; j++) fn();
		xs.push((now() - t) / batch);
	}
	return median(xs);
}
const r3 = (x: number) => +x.toFixed(3);

// ── Workloads ───────────────────────────────────────────────────────────────────────────────────
export function runAll(): Record<string, Record<string, number>> {
	const out: Record<string, Record<string, number>> = {};
	for (const [name, make] of [
		['accordo', () => accordoDoc()],
		['yjs', () => yjsDoc()],
	] as const) {
		const m: Record<string, number> = {};
		for (const size of [60, 600]) {
			const d = thread(make, size);
			const stored = d.encode();
			m[`size_${size}_bytes`] = d.bytes(stored);
		m[`size_${size}_gzip`] = d.sizes().gzip;
			// Opening a thread: decode the stored state and produce what the panel renders.
			m[`open_${size}_ms`] = r3(time(() => void d.load(stored).toArray(), 9));
		}
		// Per-action cost on a 60-message thread (each rep on a fresh copy, so the thread does not grow).
		const base = thread(make, 60);
		const stored = base.encode();
		const fresh = () => base.load(stored);
		// Each sample applies the action to a batch of fresh copies (made before the clock starts) and divides.
		const per = (label: string, act: (d: Contender) => void, samples = 9, batch = 200) => {
			const xs: number[] = [];
			for (let i = 0; i < samples + 1; i++) {
				const docs = Array.from({ length: batch }, fresh);
				const t = now();
				for (const d of docs) act(d);
				if (i >= 1) xs.push((now() - t) / batch);
			}
			m[label] = r3(median(xs));
		};
		let k = 0;
		per('op_turn_ms', (d) => void turn(d, rng(9 + k++), 1));
		per('op_apply_ms', (d) => {
			const e = d.toArray().find((x) => x.proposed);
			if (e) d.set(e.id, 'applied', true);
		});
		per('op_regenerate_ms', (d) => {
			const live = d.toArray();
			const last = live[live.length - 1];
			d.delete(last.id);
			d.insertAfter(live[live.length - 2].id, { role: 'assistant', content: 'again' });
		});
		per('op_compact_ms', (d) => {
			const n = d.toArray().length;
			d.deleteRange(0, n - 20);
			d.set(d.toArray()[0].id, 'compacted', { summary: 'x'.repeat(900), count: n - 20, saved: 9000 });
		});
		// What a tab broadcasts after one action, on a synced 60-message thread.
		const sync = (act: (d: Contender) => void) => {
			const d = fresh();
			const before = d.since();
			act(d);
			return d.bytes(d.encodeSince(before));
		};
		m.delta_turn_bytes = sync((d) => void turn(d, rng(77), 0));
		m.delta_apply_bytes = sync((d) => {
			const e = d.toArray().find((x) => x.proposed);
			if (e) d.set(e.id, 'applied', true);
		});
		// Long life: stored size and open time after months of use.
		for (const ops of [1000, 10000]) {
			const d = longLife(make, ops);
			const s = d.encode();
			m[`life_${ops}_bytes`] = d.bytes(s);
			m[`life_${ops}_gzip`] = d.sizes().gzip;
			m[`life_${ops}_live`] = d.toArray().length;
			m[`life_${ops}_open_ms`] = r3(time(() => void d.load(s).toArray(), 9));
		// On an aged thread: what one new turn broadcasts; what a pull costs when there is nothing new; and a sync, timed
		// directly: tabs opened from storage (made before the clock starts) each pull the one new turn and apply it.
		{
			const before = d.since();
			turn(d, rng(5), 0);
			m[`life_${ops}_delta_turn_bytes`] = d.bytes(d.encodeSince(before));
			const synced = d.load(d.encode());
			m[`life_${ops}_idle_pull_bytes`] = d.bytes(d.encodeSince(synced.since()));
			const xs: number[] = [];
			for (let i = 0; i < 8; i++) {
				const tabs = Array.from({ length: 20 }, () => d.load(s));
				const t = now();
				for (const p of tabs) p.apply(d.encodeSince(p.since()));
				if (i >= 1) xs.push((now() - t) / tabs.length);
			}
			m[`life_${ops}_sync_ms`] = r3(median(xs));
		}
		}
		// Four tabs on one synced thread, 50 actions each with no sync, then everyone syncs with everyone. Nine
		// independent rounds; the median.
		{
			const times: number[] = [];
			let bytes = 0;
			for (let round = 0; round < 9; round++) {
				const tabs = Array.from({ length: 4 }, () => fresh());
				tabs.forEach((t, i) => {
					const r = rng(100 + i);
					for (let j = 0; j < 50; j++) {
						if (r() < 0.5) turn(t, r, j);
						else {
							const live = t.toArray();
							const e = live[Math.floor(r() * live.length)];
							t.set(e.id, 'applied', r() < 0.5);
						}
					}
				});
				const t0 = now();
				bytes = 0;
				for (const a of tabs)
					for (const b of tabs)
						if (a !== b) {
							const delta = a.encodeSince(b.since());
							bytes += a.bytes(delta);
							b.apply(delta);
						}
				times.push(now() - t0);
			}
			m.merge_4tabs_ms = r3(median(times));
			m.merge_4tabs_bytes = bytes;
		}
		out[name] = m;
	}
	return out;
}

/** Heap per open thread (Node with --expose-gc only): 100 open 60-message threads, divided by 100. */
function heapPerThread(make: () => Contender): number {
	const g = (globalThis as { gc?: () => void }).gc;
	const mem = (globalThis as { process?: { memoryUsage(): { heapUsed: number } } }).process;
	if (!g || !mem) return Number.NaN;
	const stored = thread(make, 60).encode();
	g();
	const before = mem.memoryUsage().heapUsed;
	const keep = Array.from({ length: 100 }, () => {
		const d = thread(make, 1).load(stored);
		d.toArray();
		return d;
	});
	g();
	const after = mem.memoryUsage().heapUsed;
	void keep.length;
	return Math.round((after - before) / 100);
}

if (typeof process !== 'undefined' && process.argv[1]?.endsWith('bench.ts')) {
	const res = runAll();
	res.accordo.heap_per_thread_bytes = heapPerThread(() => accordoDoc());
	res.yjs.heap_per_thread_bytes = heapPerThread(() => yjsDoc());
	console.log(JSON.stringify(res, null, 1));
}
