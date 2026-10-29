// The compiled ruleset: what `compileRuleset` returns and `lint`/`fix` run. Internal shapes live
// here, so the compiler (which runs the linter on each rule's examples) and the linter do not
// import each other.

import type { Complex } from './select.js';
import type { AnyEngine, AnyLanguage, Budget, CodeRule, Node, Problem, RuleContext, Severity, Source, Trust } from './types.js';

export interface Dispatch {
	readonly list: readonly Complex[];
	readonly handler: (node: Node, ctx: RuleContext) => void;
}

export interface CompiledRule {
	readonly id: string;
	readonly rule: CodeRule;
	readonly severity: Severity;
	readonly budget: Required<Budget>;
	readonly visits: readonly Dispatch[];
	readonly facts: ReadonlySet<string>;
	readonly vocab: ReadonlySet<string>;
	readonly inert: boolean;
	readonly changes: ReadonlySet<string>;
}

const BRAND: unique symbol = Symbol.for('@laticent/squadra/ruleset');

export interface Ruleset {
	readonly [BRAND]: true;
	readonly name: string;
	readonly version: string;
	readonly rules: readonly CompiledRule[];
	readonly languages: ReadonlyMap<string, AnyLanguage>;
	readonly engines: ReadonlyMap<string, AnyEngine>;
	readonly vocab: Readonly<Record<string, readonly string[]>>;
	readonly order: readonly string[];
	readonly trust: Trust;
	/** Rules lenient compile dropped; each is reported as `squadra/rule-refused`. */
	readonly refused: readonly Problem[];
}

export function makeRuleset(r: Omit<Ruleset, typeof BRAND>): Ruleset {
	return Object.freeze({ ...r, [BRAND]: true as const });
}

export function isRuleset(x: unknown): x is Ruleset {
	return typeof x === 'object' && x !== null && (x as Record<symbol, unknown>)[BRAND] === true;
}

export const SEVERITY_RANK: Readonly<Record<Severity, number>> = { error: 0, warning: 1, suggestion: 2, info: 3 };
export const SAFETY_RANK = { safe: 0, suggested: 1, unsafe: 2 } as const;

/** `*` matches any run of characters except `/`; `**` matches any run including `/`. */
export function globToRegExp(glob: string): RegExp {
	let re = '';
	for (let i = 0; i < glob.length; i++) {
		const c = glob[i];
		if (c === '*') {
			if (glob[i + 1] === '*') {
				i++;
				// `**/` is zero or more whole directories; a bare `**` is anything.
				if (glob[i + 1] === '/') {
					re += '(?:.*/)?';
					i++;
				} else re += '.*';
			} else re += '[^/]*';
		} else if (c === '?') re += '[^/]';
		else re += c.replace(/[.+^${}()|[\]\\]/g, '\\$&');
	}
	return new RegExp(`^${re}$`);
}

/** The language and its `extends` chain, nearest first. */
export function languageChain(lang: AnyLanguage): AnyLanguage[] {
	const out: AnyLanguage[] = [];
	for (let l: AnyLanguage | undefined = lang; l && !out.includes(l); l = l.extends) out.push(l);
	return out;
}

export function factOf(lang: AnyLanguage, name: string): ((tree: unknown, source: Source, node?: Node) => unknown) | undefined {
	for (const l of languageChain(lang)) {
		const f = l.facts?.[name];
		if (f) return f;
	}
	return undefined;
}
