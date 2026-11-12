/**
 * The bake-off's CORRECTNESS GATE: a contender that fails it is out, whatever its numbers.
 * Random chat sessions run on 2–4 replicas (tabs) at once, with random partial syncs between them (a delta from one
 * replica to another, possibly repeated, possibly stale), then a full sync. Afterwards every replica must hold the same
 * thread, every message that no replica deleted must be there, and every deleted message must stay gone.
 *
 * usage: node --experimental-strip-types property.ts [runs]   (fast-check comes from docs/node_modules)
 */
import { createRequire } from 'node:module';
import { RecordList } from './accordo.ts';
import { accordoDoc } from './accordo-adapter.ts';
import type { Contender } from './contender.ts';
import { seedIds } from './ids.ts';
import { yjsDoc } from './yjs-adapter.ts';

const SEED = Number(process.env.SEED ?? 42);
const require = createRequire(new URL('../../../../docs/', import.meta.url));
const fc = require('fast-check') as typeof import('fast-check');

type Op =
	| { k: 'send'; text: string }
	| { k: 'reply'; text: string; proposal: boolean }
	| { k: 'apply' | 'discard' | 'regenerate'; pick: number }
	| { k: 'answer'; pick: number; yes: boolean }
	| { k: 'compact'; keep: number }
	| { k: 'sync'; to: number; stale: boolean }
	| { k: 'resend'; to: number }
	/** A tab broadcasts what changed since its own state before its last action; `drop` loses it on the way. */
	| { k: 'broadcast'; to: number; drop: boolean }
	/** The tab reloads: a new replica opened from this one's stored state (how gaps in a version vector appear). */
	| { k: 'reload' };

const opArb: fc.Arbitrary<Op> = fc.oneof(
	{ weight: 4, arbitrary: fc.record({ k: fc.constant('send' as const), text: fc.string({ maxLength: 8 }) }) },
	{ weight: 4, arbitrary: fc.record({ k: fc.constant('reply' as const), text: fc.string({ maxLength: 8 }), proposal: fc.boolean() }) },
	{ weight: 2, arbitrary: fc.record({ k: fc.constantFrom('apply' as const, 'discard' as const, 'regenerate' as const), pick: fc.nat(50) }) },
	// Two tabs answering one action card differently: concurrent writes of DIFFERENT values to one field.
	{ weight: 2, arbitrary: fc.record({ k: fc.constant('answer' as const), pick: fc.nat(50), yes: fc.boolean() }) },
	{ weight: 1, arbitrary: fc.record({ k: fc.constant('compact' as const), keep: fc.integer({ min: 1, max: 6 }) }) },
	{ weight: 3, arbitrary: fc.record({ k: fc.constant('sync' as const), to: fc.nat(3), stale: fc.boolean() }) },
	{ weight: 1, arbitrary: fc.record({ k: fc.constant('resend' as const), to: fc.nat(3) }) },
	{ weight: 3, arbitrary: fc.record({ k: fc.constant('broadcast' as const), to: fc.nat(3), drop: fc.boolean() }) },
	{ weight: 1, arbitrary: fc.record({ k: fc.constant('reload' as const) }) },
);

type Ledger = { created: Set<string>; deleted: Set<string>; anchor: Map<string, string | null> };
/** A view as text with keys sorted, so two equal threads compare equal whatever order their fields came in. */
const canon = (rows: unknown): string => JSON.stringify(rows, (_k, v) => (v && typeof v === 'object' && !Array.isArray(v) ? Object.fromEntries(Object.entries(v).sort(([a], [b]) => (a < b ? -1 : 1))) : v));

/** Run one replica's op on it, recording what it created and deleted. */
function step(me: Contender, peers: Contender[], self: number, op: Op, led: Ledger, sent: Map<number, unknown>, oldTokens: Map<number, unknown>, own: { token: unknown }) {
	const live = me.toArray();
	// A local action: remember this tab's state before it, which is what its next broadcast starts from.
	if (op.k !== 'sync' && op.k !== 'resend' && op.k !== 'broadcast' && op.k !== 'reload') own.token = me.since();
	const pick = (n: number, pred: (r: Record<string, unknown>) => boolean) => {
		const c = live.filter(pred);
		return c.length ? c[n % c.length] : undefined;
	};
	switch (op.k) {
		case 'send':
			led.created.add(me.push({ role: 'user', content: op.text }));
			break;
		case 'reply': {
			const q = pick(live.length, (r) => r.role === 'user');
			const rid = me.insertAfter(q ? q.id : null, { role: 'assistant', content: op.text, ...(op.proposal ? { proposed: ['edit'] } : {}) });
			led.created.add(rid);
			led.anchor.set(rid, q ? q.id : null);
			break;
		}
		case 'apply': {
			const r = pick(op.pick, (x) => !!x.proposed);
			if (r) me.set(r.id, 'applied', true);
			break;
		}
		case 'discard': {
			const r = pick(op.pick, (x) => !!x.proposed);
			if (r) me.set(r.id, 'proposed', undefined);
			break;
		}
		case 'answer': {
			const r = pick(op.pick, (x) => x.role === 'assistant');
			if (r) me.set(r.id, 'state', op.yes ? 'done' : 'declined');
			break;
		}
		case 'regenerate': {
			const r = pick(op.pick, (x) => x.role === 'assistant');
			if (!r) break;
			const i = live.findIndex((x) => x.id === r.id);
			me.delete(r.id);
			led.deleted.add(r.id);
			const nid = me.insertAfter(i > 0 ? live[i - 1].id : null, { role: 'assistant', content: `${r.content}'` });
			led.created.add(nid);
			led.anchor.set(nid, i > 0 ? live[i - 1].id : null);
			break;
		}
		case 'compact': {
			const drop = Math.max(0, live.length - op.keep);
			for (const r of live.slice(0, drop)) led.deleted.add(r.id);
			me.deleteRange(0, drop);
			const first = me.toArray()[0];
			if (first) me.set(first.id, 'compacted', { count: drop });
			break;
		}
		case 'sync': {
			const peer = peers[op.to % peers.length];
			if (peer === me) break;
			// A stale token makes the delta bigger than needed; the merge must not care.
			const token = op.stale && oldTokens.has(op.to) ? oldTokens.get(op.to) : peer.since();
			const delta = me.encodeSince(token);
			peer.apply(delta);
			sent.set(op.to, delta);
			oldTokens.set(op.to, peer.since());
			break;
		}
		case 'broadcast': {
			const peer = peers[op.to % peers.length];
			if (peer === me || own.token === undefined) break;
			const delta = me.encodeSince(own.token);
			if (!op.drop) peer.apply(delta);
			break;
		}
		case 'resend': {
			const peer = peers[op.to % peers.length];
			const delta = sent.get(op.to);
			if (peer !== me && delta !== undefined) peer.apply(delta); // a duplicate delivery
			break;
		}
	}
	void self;
}

function check(make: () => Contender, runs: number): { ok: boolean; detail: string } {
	const stats = { runs: 0, misplaced: 0, calls: 0 };
	try {
		fc.assert(
			fc.property(fc.integer({ min: 2, max: 4 }), fc.array(fc.tuple(fc.nat(3), opArb), { maxLength: 60 }), (n, script) => {
				seedIds(SEED * 1_000_003 + stats.calls++);
				const reps = Array.from({ length: n }, make);
				const led: Ledger = { created: new Set(), deleted: new Set(), anchor: new Map() };
				const own = reps.map(() => ({ token: undefined as unknown }));
				const sent = reps.map(() => new Map<number, unknown>());
				const old = reps.map(() => new Map<number, unknown>());
				for (const [who, op] of script) {
					const i = who % n;
					if (op.k === 'reload') {
						reps[i] = reps[i].load(reps[i].encode());
						own[i].token = undefined;
						continue;
					}
					step(reps[i], reps, i, op, led, sent[i], old[i], own[i]);
				}
				// Full sync, twice round, in a fixed order: every replica sees everything.
				for (let round = 0; round < 2; round++) for (const a of reps) for (const b of reps) if (a !== b) b.apply(a.encodeSince(b.since()));
				const views = reps.map((r) => canon(r.toArray()));
				if (new Set(views).size !== 1) throw new Error(`replicas differ:\n${views.join('\n')}`);
				const ids = new Set(reps[0].toArray().map((r) => r.id));
				for (const id of led.created) if (!led.deleted.has(id) && !ids.has(id)) throw new Error(`a message no replica deleted is missing: ${id}`);
				for (const id of led.deleted) if (ids.has(id)) throw new Error(`a deleted message came back: ${id}`);
				// Placement (MEASURED, not fatal): everything between a live anchor and a record inserted after it was itself
				// inserted, directly or through others, after that anchor. A concurrent turn landing in between is a misplaced
				// reply in the chat; it is counted per contender, because a flat sequence CRDT allows it unless told otherwise.
				const order = reps[0].toArray().map((r) => r.id);
				const descends = (id: string, root: string) => {
					for (let a = led.anchor.get(id); a !== undefined && a !== null; a = led.anchor.get(a)) if (a === root) return true;
					return false;
				};
				let misplaced = false;
				for (const [id, anchor] of led.anchor) {
					if (anchor === null) continue;
					const ia = order.indexOf(anchor);
					const ir = order.indexOf(id);
					if (ia < 0 || ir < 0) continue;
					if (ir < ia) throw new Error(`a reply sits before its question: ${id} before ${anchor}`);
					for (let j = ia + 1; j < ir; j++) if (!descends(order[j], anchor)) misplaced = true;
				}
				if (misplaced) stats.misplaced++;
				stats.runs++;
				// After a full sync nobody owes anybody anything: a pull between two synced replicas is as small as a
				// replica's pull from itself. A version vector that stalls below a gap fails this (the round-2 audit's finding 1).
				for (const a of reps) {
					const empty = a.bytes(a.encodeSince(a.since()));
					for (const b of reps) if (a !== b && a.bytes(a.encodeSince(b.since())) !== empty) throw new Error('a synced replica still owes a peer changes: its version vector stalled');
				}
				// Reloading from the stored state gives the same thread.
				if (canon(reps[0].load(reps[0].encode()).toArray()) !== views[0]) throw new Error('reload differs');
			}),
			{ numRuns: runs, seed: Number(process.env.SEED ?? 42) },
		);
		return { ok: true, detail: `${runs} runs, seed ${process.env.SEED ?? 42}; a reply misplaced by a concurrent turn in ${stats.misplaced} of ${stats.runs} sessions (${((100 * stats.misplaced) / Math.max(1, stats.runs)).toFixed(1)}%)` };
	} catch (e) {
		const m = String((e as Error).message);
		return { ok: false, detail: `${m.slice(0, 600)} … ${m.slice(-700)}` };
	}
}

/**
 * The tie-break, pinned: replicas start from one synced thread, then each answers the SAME card with its own value
 * before any sync, so their writes are concurrent (equal logical time). After syncing in a random order, all agree.
 */
function checkConflict(make: () => Contender, runs: number): { ok: boolean; detail: string } {
	let calls = 0;
	try {
		fc.assert(
			fc.property(fc.integer({ min: 2, max: 4 }), fc.array(fc.boolean(), { minLength: 4, maxLength: 4 }), fc.array(fc.tuple(fc.nat(3), fc.nat(3)), { maxLength: 12 }), (n, answers, order) => {
				seedIds(SEED * 1_000_003 + calls++);
				const base = make();
				base.push({ role: 'user', content: 'q' });
				const card = base.push({ role: 'assistant', content: 'a card' });
				const reps = Array.from({ length: n }, () => base.load(base.encode()));
				for (const [i, r] of reps.entries()) r.set(card, 'state', answers[i] ? 'done' : 'declined');
				for (const [a, b] of order) if (a % n !== b % n) reps[b % n].apply(reps[a % n].encodeSince(reps[b % n].since()));
				for (let round = 0; round < 2; round++) for (const a of reps) for (const b of reps) if (a !== b) b.apply(a.encodeSince(b.since()));
				const views = new Set(reps.map((r) => canon(r.toArray())));
				if (views.size !== 1) throw new Error(`replicas disagree on a concurrently answered card:\n${[...views].join('\n')}`);
			}),
			{ numRuns: runs, seed: Number(process.env.SEED ?? 42) },
		);
		return { ok: true, detail: `${runs} runs` };
	} catch (e) {
		const m = String((e as Error).message);
		return { ok: false, detail: `${m.slice(0, 300)} … ${m.slice(-400)}` };
	}
}

/** Accordo only: reopening a stored list under the SAME replica id, then editing, must not reuse an id (finding 2). */
function checkReopen(runs: number): { ok: boolean; detail: string } {
	try {
		fc.assert(
			fc.property(fc.array(fc.constantFrom('push', 'insert', 'set', 'delete', 'reopen'), { maxLength: 40 }), (script) => {
				let a = new RecordList('tab1');
				const b = new RecordList('tab2');
				for (const k of script) {
					const live = a.toArray();
					if (k === 'push') a.push({ m: 1 });
					else if (k === 'insert') a.insertAfter(live[0]?.id ?? null, { m: 2 });
					else if (k === 'set' && live.length) a.set(live[live.length - 1].id, 'm', 3);
					else if (k === 'delete' && live.length) a.delete(live[0].id);
					else if (k === 'reopen') {
						b.apply(a.encode(b.versionVector()));
						a = RecordList.decode(a.encode(), 'tab1');
					}
				}
				b.apply(a.encode(b.versionVector()));
				a.apply(b.encode(a.versionVector()));
				if (canon(a.toArray()) !== canon(b.toArray())) throw new Error('a reopened replica diverged');
				if (new Set(a.toArray().map((r) => r.id)).size !== a.toArray().length) throw new Error('an id was reused');
			}),
			{ numRuns: runs, seed: Number(process.env.SEED ?? 42) },
		);
		return { ok: true, detail: `${runs} runs` };
	} catch (e) {
		const m = String((e as Error).message);
		return { ok: false, detail: `${m.slice(0, 300)} … ${m.slice(-300)}` };
	}
}

const runs = Number(process.argv[2] ?? 500);
{
	const r = checkReopen(runs);
	console.log(`accordo reopened under its own id: ${r.ok ? 'PASS' : 'FAIL'} — ${r.detail}`);
}
for (const [name, make] of [
	['accordo', () => accordoDoc()],
	['yjs', () => yjsDoc()],
] as const) {
	if (process.env.ONLY && process.env.ONLY !== name) continue;
	const r = check(make, runs);
	console.log(`${name}: ${r.ok ? 'PASS' : 'FAIL'} — ${r.detail}`);
	const c = checkConflict(make, runs);
	console.log(`${name} concurrent writes to one field: ${c.ok ? 'PASS' : 'FAIL'} — ${c.detail}`);
}
