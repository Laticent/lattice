// Every type Squadra's core exchanges (engineering/decisions/2026-10-26-squadra-lint-library/design.md §4.1).
//
// The core reads text a host hands it and returns findings and new text. It never reads a file and
// never touches the DOM, so these types carry no handle to either.

export type Severity = 'error' | 'warning' | 'suggestion' | 'info';
export type Safety = 'safe' | 'suggested' | 'unsafe';
export type Trust = 'trusted' | 'untrusted';

/** A half-open range of a source's text, in UTF-16 offsets: the unit Segno uses. */
export interface Span {
	readonly from: number;
	readonly to: number;
}

/** One file's text after the host's ingest boundary: no BOM, LF line endings (design §5.7). */
export interface Source {
	readonly path: string;
	readonly text: string;
	readonly language: string;
}

/** Segno's node shape, plus optional values (`attrs`) and the span of each named part (`parts`). */
export interface Node {
	readonly kind: string;
	readonly from: number;
	readonly to: number;
	readonly kids: readonly Node[];
	readonly attrs?: Readonly<Record<string, string | number | boolean | readonly string[]>>;
	readonly parts?: Readonly<Record<string, Span>>;
}

// ── Languages (design §5.1) ─────────────────────────────────────────────────

export interface ParseOutput<Tree = Node> {
	readonly tree: Tree;
	/** Reported as `squadra/parse-error` findings. Rules still run over the partial tree. */
	readonly errors: readonly { readonly span: Span; readonly message: string }[];
}

/** What a safe fix must not change (design §7.4 step 5). */
export interface Shape {
	/** Top-level units: slides in a deck, rules in a stylesheet, keys in a JSON object. */
	readonly units: number;
	/** The front matter or its equivalent, if the source has one. */
	readonly header?: Span | null;
	/** The text of every inert range, in order. */
	readonly inert: readonly string[];
}

export interface Language<Tree = Node> {
	readonly id: string;
	/** Part of every verified stamp, so a new parser re-checks every rule that reads it. */
	readonly version: string;
	/** Every node kind a selector may name. */
	readonly kinds: readonly string[];
	/** For inline suppressions (built by M4, design §9.2). Omit to have none. */
	readonly comment?: { readonly line?: string; readonly block?: readonly [string, string] };
	parse(source: Source): ParseOutput<Tree>;
	/** Needed when `Tree` is not already a `Node` (a flat tree, a foreign AST). */
	root?(tree: Tree): Node;
	/** Ranges rules do not see unless they opt in: code fences, comments, strings. Sorted, disjoint. */
	inert?(tree: Tree, source: Source): readonly Span[];
	shape(tree: Tree, source: Source): Shape;
	facts?: Readonly<Record<string, (tree: Tree, source: Source, node?: Node) => unknown>>;
	/** Extra location fields for a finding, such as `{ slide: 3 }`. */
	locate?(tree: Tree, span: Span): Readonly<Record<string, unknown>>;
	/** The language this one builds on (design §5.5): its facts are inherited. */
	readonly extends?: Language<Tree>;
}

// ── Fixes (design §7) ───────────────────────────────────────────────────────

export interface Edit {
	readonly from: number;
	readonly to: number;
	readonly text: string;
}

/** One atomic fix's edits, applied together or not at all, in array order at a shared offset. */
export interface EditGroup {
	readonly id: string;
	readonly edits: readonly Edit[];
}

export interface Plan {
	readonly accepted: readonly EditGroup[];
	readonly rejected: readonly { readonly id: string; readonly reason: string }[];
}

export interface Fix<Payload = unknown> {
	readonly engine: string;
	readonly safety: Safety;
	readonly description: string;
	readonly payload: Payload;
}

export interface EngineContext {
	/** The current parse. */
	readonly tree: Node;
	readonly finding: { readonly rule: string; readonly span: Span; readonly message: string };
	readonly vocab: Readonly<Record<string, readonly string[]>>;
	/** The language's header span (front matter), so a line delete can take an emptied header with it. */
	readonly header: Span | null;
	text(span: Span): string;
}

/** An engine's answer when a fix cannot apply for a reason worth naming, such as `not-alone`. */
export interface EngineSkip {
	readonly skip: SkipReason;
	readonly detail?: string;
}

export interface FixEngine<Payload = unknown> {
	readonly id: string;
	/** Rewrites the whole file: its fix runs in a pass of its own. */
	readonly exclusive?: boolean;
	/** `null` means the fix no longer applies to this text (`stale`). */
	toEdits(source: Source, fix: Fix<Payload>, ctx: EngineContext): readonly Edit[] | EngineSkip | null;
}

/** A fix as a finding carries it: already lowered to edits against the text the finding was made on. */
export interface LoweredFix {
	readonly engine: string;
	readonly safety: Safety;
	readonly description: string;
	/** `null` when the engine could not lower it; `skip` says why. */
	readonly edits: readonly Edit[] | null;
	readonly skip?: SkipReason;
	readonly detail?: string;
}

// ── Rules (design §6) ───────────────────────────────────────────────────────

export interface Budget {
	/** Every `ctx` call counts one op; a selector counts one per node it visits. */
	readonly ops: number;
	/** Findings per rule per file before `squadra/findings-capped`. Default 1000. */
	readonly findings?: number;
}

export interface ShapeChange {
	readonly kind: 'slide-count' | 'front-matter' | 'inert';
	readonly reason: string;
}

export interface ReportInput {
	readonly span: Span;
	readonly message: string;
	readonly hint?: string;
	readonly severity?: Severity;
	readonly fixes?: readonly Fix[];
	readonly data?: Readonly<Record<string, unknown>>;
}

export interface RuleContext {
	/** The source text of `span`, inert ranges masked with spaces (newlines kept). */
	text(span: Span): string;
	/** The unmasked text. */
	raw(span: Span): string;
	/** Nodes under `from` that match `selector` (the subset in select.ts), in document order. */
	select(from: Node, selector: string): readonly Node[];
	fact<T = unknown>(name: string, node?: Node): T | undefined;
	vocab(name: string): readonly string[];
	/** A host-supplied value (`LintOptions.measurements`), such as a renderer's measured fit. */
	measurement<T = unknown>(name: string, node?: Node): T | undefined;
	report(finding: ReportInput): void;
}

export interface CodeRule {
	readonly id: string;
	readonly language: string;
	readonly severity: Severity;
	readonly summary: string;
	readonly reads?: { readonly facts?: readonly string[]; readonly vocab?: readonly string[] };
	readonly budget?: Budget;
	/** The fixtures file's path in `RulesetInput.examples` (design §6.7). */
	readonly examples: string;
	/** `include` lets the rule see inert ranges, and its fixes edit them. */
	readonly inert?: 'skip' | 'include';
	readonly suppressible?: 'inline' | 'waiver' | 'none';
	/** The rule offers fixes. A fix from a rule without it is dropped and reported
	 *  (`squadra/undeclared-fix`), and a rule with it must have a `fixed` example for every `bad`. */
	readonly fixable?: boolean;
	/** Shape changes this rule's fixes may make, each with a reason (design §7.4). */
	readonly changes?: readonly ShapeChange[];
	/** The id this rule replaces in a system it migrates from. */
	readonly legacy?: string;
	/** Selector → handler. The driver walks each tree once and dispatches (design §6.5). */
	readonly visit?: Readonly<Record<string, (node: Node, ctx: RuleContext) => void>>;
	/** For a rule that needs the whole file at once: one call per file. */
	readonly check?: (root: Node, ctx: RuleContext) => void;
}

/** A declarative manifest (design §6.2). The selector language that runs one lands by M4 (design §2.3). */
export interface RuleManifest {
	readonly format: 1;
	readonly id: string;
	readonly [key: string]: unknown;
}

/** A language or engine over any tree or payload type: a ruleset holds several, and their type
 *  parameters appear in both argument and return positions, so no narrower type admits them all. */
// biome-ignore lint/suspicious/noExplicitAny: see above
export type AnyLanguage = Language<any>;
// biome-ignore lint/suspicious/noExplicitAny: see above
export type AnyEngine = FixEngine<any>;

export interface RulesetInput {
	/** The id prefix: every rule id is `<name>/<rule>`. */
	readonly name: string;
	readonly version: string;
	readonly languages: readonly AnyLanguage[];
	readonly rules: readonly (CodeRule | RuleManifest)[];
	/** Fixtures path → file text. */
	readonly examples?: Readonly<Record<string, string>>;
	readonly vocab?: Readonly<Record<string, readonly string[]>>;
	/** The `edits` engine is always present. */
	readonly engines?: readonly AnyEngine[];
	/** Rule ids whose fixes go first in a pass. */
	readonly order?: readonly string[];
	readonly defaults?: { readonly budget?: Budget; readonly severity?: Severity; readonly safety?: Safety };
	/** An untrusted ruleset's fixes are capped at `suggested` (design §16). */
	readonly trust?: Trust;
	/** `strict` throws on any refusal; `lenient` drops the refused rule and reports it. */
	readonly mode?: 'strict' | 'lenient';
	/** Rule id → stamp; a rule whose stamp matches skips its example run (design §8.2). */
	readonly verified?: VerifiedStamp;
}

export interface VerifiedStamp {
	readonly [ruleId: string]: string;
}

export interface Problem {
	readonly rule?: string;
	readonly code: string;
	readonly message: string;
	/** Where in the rule or its fixtures: `examples#bad-2`, `visit['x y']`. */
	readonly at?: string;
}

// ── Findings and results (design §12.1) ─────────────────────────────────────

export interface Position {
	readonly line: number;
	readonly column: number;
}

export interface Finding {
	readonly rule: string;
	readonly legacy?: string;
	readonly severity: Severity;
	readonly path: string;
	readonly span: Span;
	readonly start: Position;
	readonly end: Position;
	readonly location?: Readonly<Record<string, unknown>>;
	readonly message: string;
	readonly hint?: string;
	readonly fixes: readonly LoweredFix[];
	readonly data: Readonly<Record<string, unknown>>;
}

export interface Waiver {
	readonly rule: string;
	/** One file. Globs belong to ratchets (design §9.1). */
	readonly target: string;
	/** Substring of the finding's span text. */
	readonly match?: string;
	/** Default 1. */
	readonly count?: number;
	readonly reason: string;
	readonly since?: string;
	readonly expires?: string | null;
}

export interface Ratchet {
	readonly rule: string;
	/** A path or a glob; a glob is one budget per matching file. */
	readonly target: string;
	readonly budget: number;
	readonly reason: string;
}

export interface WaiverSet {
	readonly waivers: readonly Waiver[];
	readonly ratchets: readonly Ratchet[];
}

// ── Producers (design §15.4) ────────────────────────────────────────────────

/** A finding from outside the ruleset: the linter a migration is moving rules out of. */
export interface ProducedFinding extends ReportInput {
	readonly rule: string;
	readonly legacy?: string;
	readonly severity: Severity;
	/** The fix may edit inside inert ranges (a rule's `inert: 'include'`). */
	readonly inert?: boolean;
	/** Shape changes the fix may make (a rule's `changes`). */
	readonly changes?: readonly ShapeChange['kind'][];
}

/**
 * A producer of findings that are not rules: the bridge a strangler migration needs while some
 * rules still live in the old linter (design §15.4). Its findings go through the same lowering
 * and the same fix driver as a rule's, so every fix gets the driver's checks. The registration
 * refusals of §8 do NOT apply to them, because nothing registers them; a migration gains those
 * one rule at a time, as each rule moves into a ruleset.
 */
export interface Producer {
	readonly id: string;
	produce(source: Source): readonly ProducedFinding[];
}

export interface LintOptions {
	/** Findings from outside the ruleset (design §15.4). */
	readonly producers?: readonly Producer[];
	/** Rule ids or globs (`deck/*`). */
	readonly only?: readonly string[];
	readonly minSeverity?: Severity;
	readonly waivers?: WaiverSet;
	readonly measurements?: Readonly<Record<string, unknown>>;
	/** Staleness and ratchet-down run only on `full` (design §9.1). Default `full`. */
	readonly coverage?: 'full' | 'partial';
	/** ISO date for waiver expiry. Without it no waiver expires, so output stays deterministic. */
	readonly now?: string;
}

export interface RuleStats {
	readonly ms: number;
	readonly ops: number;
}

export interface Stats {
	readonly files: number;
	readonly perRule: Readonly<Record<string, RuleStats>>;
}

export interface LintResult {
	readonly findings: readonly Finding[];
	readonly stats: Stats;
}

export type SkipReason =
	| 'safety'
	| 'stale'
	| 'conflict'
	| 'no-candidate'
	| 'inert'
	| 'not-alone'
	| 'broke-structure'
	| 'did-not-resolve'
	| 'cycle'
	| 'engine-missing'
	| 'engine-threw'
	| 'invalid-edit'
	| 'max-passes';

export interface FixOptions {
	/** Findings from outside the ruleset, fixed through the same driver (design §15.4). */
	readonly producers?: readonly Producer[];
	/** The highest grade to apply. Default `safe`. */
	readonly safety?: Safety;
	/** Rule ids. Required when `safety` is `unsafe`. */
	readonly only?: readonly string[];
	/** Default 10. */
	readonly maxPasses?: number;
	/** Plan and verify everything, return the input text unchanged. */
	readonly dryRun?: boolean;
	readonly measurements?: Readonly<Record<string, unknown>>;
}

export interface AppliedFix {
	readonly rule: string;
	readonly span: Span;
	readonly edits: readonly Edit[];
	readonly pass: number;
	readonly description: string;
	/** The finding's `data`, so a host can say where the fix was in its own terms (a slide). */
	readonly data?: Readonly<Record<string, unknown>>;
}

export interface SkippedFix {
	readonly rule: string;
	readonly span: Span;
	readonly reason: SkipReason;
	readonly detail?: string;
	/** The finding's `data`, as on `AppliedFix`. */
	readonly data?: Readonly<Record<string, unknown>>;
}

export interface FixResult {
	readonly text: string;
	readonly applied: readonly AppliedFix[];
	readonly skipped: readonly SkippedFix[];
	readonly passes: number;
	readonly remaining: readonly Finding[];
}
