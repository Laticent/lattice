// Squadra — a lint-and-fix library that refuses a rule it cannot prove works.
//
// *Squadra* is Italian for the set-square, and *squadrare* is to square up and to look something
// over. Framework-free, zero dependencies, no DOM and no `fs`: the core reads text a host hands it
// and returns findings and new text, so the same rules run in Node, a browser or a worker.
//
// This is milestone M1a of engineering/decisions/2026-10-26-squadra-lint-library.md: findings with
// spans, the edit kernel, the fix driver with its shape check, the `edits` engine, the
// registration refusals and waivers. The full design is that note's design.md.

export { checkRuleset, compileRuleset, RulesetError, stampRuleset } from './compile.js';
export { rulesetOf } from './driver.js';
export { apply, diff, EditError, editsConflict, mapOffset, plan } from './edits.js';
export { type EditOp, type EditsPayload, editsEngine, editsFix } from './engine.js';
export { fix, shapeChanges } from './fix.js';
export { type Example, type Fixtures, parseFixtures } from './fixtures.js';
export { lint } from './lint.js';
export { reportJson, reportText } from './report.js';
export type { Ruleset } from './ruleset.js';
export { isRuleset } from './ruleset.js';
export type {
	AppliedFix,
	Budget,
	CodeRule,
	Edit,
	EditGroup,
	EngineContext,
	EngineSkip,
	Finding,
	Fix,
	FixEngine,
	FixOptions,
	FixResult,
	Language,
	LintOptions,
	LintResult,
	LoweredFix,
	Node,
	ParseOutput,
	Plan,
	Position,
	Problem,
	ProducedFinding,
	Producer,
	Ratchet,
	ReportInput,
	RuleContext,
	RuleManifest,
	RuleStats,
	RulesetInput,
	Safety,
	Severity,
	Shape,
	ShapeChange,
	SkippedFix,
	SkipReason,
	Source,
	Span,
	Stats,
	Trust,
	VerifiedStamp,
	Waiver,
	WaiverSet,
} from './types.js';
export { applyWaivers, checkWaiverSet } from './waivers.js';

import type { CodeRule, FixEngine, Language } from './types.js';

/** Identity helpers: they exist to give a rule, language or engine its type. */
export function defineRule(rule: CodeRule): CodeRule {
	return rule;
}
export function defineLanguage<T>(lang: Language<T>): Language<T> {
	return lang;
}
export function defineEngine<P>(engine: FixEngine<P>): FixEngine<P> {
	return engine;
}
