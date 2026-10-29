// The selector subset Squadra reads today: node kinds, `*`, the child (`>`) and descendant
// (space) combinators, and comma lists, such as `> item, > list > item`. Design §6.4's full
// language (attribute predicates, text operators) lands by M4 (design §2.3). This subset is
// already a strict prefix of it, so a selector written today keeps its meaning.
//
// A selector parses in one left-to-right scan. Matching climbs ancestors and memoizes each
// (node, step) answer across every candidate under one scope, so selecting over a whole tree costs
// O(nodes × steps) at any depth, and every new answer counts against the rule's op budget.

import type { Node } from './types.js';

/** One compound per step, right to left in matching order; `child` is the combinator to its left. */
interface Step {
	readonly kind: string; // '*' matches every kind
	readonly child: boolean;
}

/** A complex selector. `anchored` means a leading `>`: the first step must be a child of the scope. */
export interface Complex {
	readonly steps: readonly Step[];
	readonly anchored: boolean;
}

export class SelectorError extends Error {
	readonly position: number;
	constructor(message: string, position: number) {
		super(message);
		this.name = 'SelectorError';
		this.position = position;
	}
}

const KIND = /^[A-Za-z_][A-Za-z0-9_-]*/;

/** Parse a selector list. Throws `SelectorError` with the position of the first problem. */
export function parseSelector(selector: string): readonly Complex[] {
	const out: Complex[] = [];
	for (const [i, part] of splitTop(selector)) {
		const steps: Step[] = [];
		let pos = 0;
		let anchored = false;
		let child = false;
		const skip = () => {
			while (pos < part.length && /\s/.test(part[pos])) pos++;
		};
		skip();
		if (part[pos] === '>') {
			anchored = true;
			pos++;
			skip();
		}
		while (pos < part.length) {
			const m = part[pos] === '*' ? ['*'] : KIND.exec(part.slice(pos));
			if (!m) throw new SelectorError(`squadra: unexpected '${part[pos]}' in selector '${selector}' (only kinds, '*', '>' and ',' are read before M4)`, i + pos);
			steps.push({ kind: m[0], child });
			pos += m[0].length;
			const before = pos;
			skip();
			child = false;
			if (part[pos] === '>') {
				child = true;
				pos++;
				skip();
				if (pos >= part.length) throw new SelectorError(`squadra: selector '${selector}' ends in '>'`, i + pos);
			} else if (pos < part.length && pos === before) {
				throw new SelectorError(`squadra: unexpected '${part[pos]}' in selector '${selector}'`, i + pos);
			}
		}
		if (steps.length === 0) throw new SelectorError(`squadra: empty selector in '${selector}'`, i);
		out.push({ steps, anchored });
	}
	return out;
}

function splitTop(s: string): [number, string][] {
	const out: [number, string][] = [];
	let start = 0;
	for (let i = 0; i <= s.length; i++) {
		if (i === s.length || s[i] === ',') {
			out.push([start, s.slice(start, i)]);
			start = i + 1;
		}
	}
	return out;
}

/** Every kind a selector names, for the compile-time `unknown-kind` check. */
export function selectorKinds(list: readonly Complex[]): string[] {
	return [...new Set(list.flatMap((c) => c.steps.map((s) => s.kind).filter((k) => k !== '*')))];
}

/** The kind a node must have to match, for dispatch: the last step's, or null for `*`. */
export function subjectKind(c: Complex): string | null {
	const k = c.steps[c.steps.length - 1].kind;
	return k === '*' ? null : k;
}

/** Parent links for one tree, built once per parse. */
export function parents(root: Node): Map<Node, Node> {
	const map = new Map<Node, Node>();
	const stack: Node[] = [root];
	while (stack.length) {
		const n = stack.pop() as Node;
		for (const k of n.kids) {
			map.set(k, n);
			stack.push(k);
		}
	}
	return map;
}

/** Answers shared by every match against one scope: each (node, step) pair is decided once. */
export interface MatchMemo {
	/** `go`: the node matches step i and steps 0..i-1 hold above it. */
	readonly go: Map<Node, Map<number, boolean>>;
	/** `above`: some node from here up (excluding the scope) satisfies `go` at step i. */
	readonly above: Map<Node, Map<number, boolean>>;
}

export function matchMemo(): MatchMemo {
	return { go: new Map(), above: new Map() };
}

function memoGet(m: Map<Node, Map<number, boolean>>, n: Node, i: number): boolean | undefined {
	return m.get(n)?.get(i);
}
function memoSet(m: Map<Node, Map<number, boolean>>, n: Node, i: number, v: boolean): boolean {
	let row = m.get(n);
	if (!row) m.set(n, (row = new Map()));
	row.set(i, v);
	return v;
}

/** Does `node` match `c`, read relative to `scope`? Matching runs right to left up the
 *  ancestors and never climbs past `scope`. With a shared `memo`, matching every node of a tree
 *  costs O(nodes × steps) whatever the depth; `tick` counts one op per new answer. */
export function matches(node: Node, c: Complex, scope: Node, up: Map<Node, Node>, tick: () => void = () => {}, memo: MatchMemo = matchMemo()): boolean {
	const steps = c.steps;
	const fits = (n: Node, i: number) => steps[i].kind === '*' || n.kind === steps[i].kind;
	// go(n, i): n fits step i, and steps 0..i-1 hold above it.
	const go = (n: Node, i: number): boolean => {
		const hit = memoGet(memo.go, n, i);
		if (hit !== undefined) return hit;
		tick();
		let v: boolean;
		if (!fits(n, i)) v = false;
		else if (i === 0) v = !c.anchored || up.get(n) === scope;
		else {
			const p = up.get(n);
			if (!p || p === scope) v = false;
			else if (steps[i].child) v = go(p, i - 1);
			else v = above(p, i - 1);
		}
		return memoSet(memo.go, n, i, v);
	};
	// above(n, i): n or an ancestor of n below the scope satisfies go(·, i). Iterative, so depth
	// costs no stack; every node it passes is memoized on the way back down.
	const above = (start: Node, i: number): boolean => {
		const path: Node[] = [];
		let v = false;
		for (let n: Node | undefined = start; n && n !== scope; n = up.get(n)) {
			const hit = memoGet(memo.above, n, i);
			if (hit !== undefined) {
				v = hit;
				break;
			}
			path.push(n);
			if (go(n, i)) {
				v = true;
				break;
			}
		}
		for (const n of path) memoSet(memo.above, n, i, v);
		return v;
	};
	if (node === scope) return false;
	return go(node, steps.length - 1);
}

/** Every node under `scope` matching any selector in `list`, in document order. */
export function select(scope: Node, list: readonly Complex[], up: Map<Node, Node>, tick: () => void = () => {}): Node[] {
	const out: Node[] = [];
	const memos = list.map(() => matchMemo());
	const visit = (n: Node) => {
		for (const k of n.kids) {
			tick();
			if (list.some((c, i) => matches(k, c, scope, up, tick, memos[i]))) out.push(k);
			visit(k);
		}
	};
	visit(scope);
	return out;
}
