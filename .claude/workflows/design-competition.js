export const meta = {
	name: 'design-competition',
	description:
		'N design tracks iterate internally, one fresh critic each, one shared fact-checker, comparative judging — then present for the human pick',
	whenToUse:
		'A design fork with a genuinely WIDE solution space and real cost of getting it wrong — an architecture, a core UX model, a schema — where independent parallel attempts beat one iterated attempt. NOT for a bounded tweak ("rethink the footer padding"): that is a solo edit, not a 17-agent competition. Presents candidates for the human pick; the adversarial trio then hardens ONLY the winner, outside this workflow (HARD RULE #25, engineering/orchestration.md).',
	phases: [
		{ title: 'Design', detail: 'one agent per track, iterating internally' },
		{ title: 'Critique', detail: 'one fresh-eyes critic per track, folded back at low effort' },
		{ title: 'Fact-check', detail: 'one shared pass over every load-bearing claim' },
		{ title: 'Judge', detail: 'comparative scoring, all candidates in one context' },
	],
}

// args: { brief: string, tracks?: number, iterations?: number, judges?: number,
//         angles?: string[] }  — see engineering/orchestration.md §Design competition.
const brief = args?.brief
if (!brief) throw new Error('design-competition needs args.brief — the design question, with grounding pointers (files/docs to read).')

const MAX_TRACKS = 8
const MAX_JUDGES = 3
// Hard agent cap the >10-agent gate exemption reads off this committed file
// (orchestration.md cost-control #1). Ceiling = MAX_TRACKS*3 (design+critique+fold)
// + 1 fact-checker + MAX_JUDGES judges. The mandatory winner-only trio (3) runs
// downstream, outside this workflow. Defaults land at ~17 in-workflow (+3 downstream).
// Literal so a static gate can read it; the guard below fails loudly if the clamp
// ceilings are ever bumped without updating it.
const maxAgents = 28
if (maxAgents !== MAX_TRACKS * 3 + 1 + MAX_JUDGES) {
	throw new Error(`design-competition maxAgents (${maxAgents}) is stale vs the clamp ceilings — update it`)
}

const tracks = Math.max(2, Math.min(args?.tracks ?? 5, MAX_TRACKS))
const iterations = Math.max(1, Math.min(args?.iterations ?? 3, 5))
const judges = Math.max(1, Math.min(args?.judges ?? 1, MAX_JUDGES))

// Default perspective per track — override with args.angles for a domain-specific split.
const DEFAULT_ANGLES = [
	'simplest-thing-that-works: minimize moving parts and new concepts',
	'risk-first: design outward from the worst failure mode',
	'user-first: design outward from the reader/author experience',
	'leverage-existing: maximum reuse of what the repo already ships',
	'clean-slate: ignore current structure, design the ideal, then map back',
	'operational: design for cheap maintenance, observability, and rollback',
	'incremental: the smallest shippable slice that compounds',
	'contrarian: invert the brief’s own assumptions and design from there',
]
// Pad caller-supplied angles from the defaults so angle count always equals track
// count — a short args.angles must not silently shrink the field while the cost
// estimate and prompts still claim `tracks`.
const requested = args?.angles ?? []
const angles = requested.concat(DEFAULT_ANGLES.filter((a) => !requested.includes(a))).slice(0, tracks)
const effectiveTracks = angles.length // === tracks after padding; guards a tracks > DEFAULT_ANGLES.length ask

const agentCount = effectiveTracks * 3 + 1 + judges
log(
	`design-competition: ${effectiveTracks} tracks x ${iterations} internal rounds + 1 critic + 1 fold each, ` +
		`1 shared fact-checker, ${judges} judge(s) = ~${agentCount} agents (cap ${maxAgents}; ` +
		`+3 downstream for the mandatory winner-only trio)` +
		(budget.total ? ` (budget ${Math.round(budget.total / 1000)}k tokens)` : ' (no token target set)'),
)

const DESIGN_SCHEMA = {
	type: 'object',
	required: ['title', 'design', 'claims'],
	properties: {
		title: { type: 'string', description: 'Short name for this design' },
		design: { type: 'string', description: 'The full design document, markdown' },
		claims: {
			type: 'array',
			items: { type: 'string' },
			description: 'Every load-bearing factual claim the design rests on (file paths, field names, mechanisms, numbers)',
		},
	},
}

const CRITIQUE_SCHEMA = {
	type: 'object',
	required: ['findings', 'verdict'],
	properties: {
		findings: {
			type: 'array',
			items: {
				type: 'object',
				required: ['severity', 'issue', 'suggestion'],
				properties: {
					severity: { type: 'string', enum: ['blocking', 'major', 'minor'] },
					issue: { type: 'string' },
					suggestion: { type: 'string' },
				},
			},
		},
		verdict: { type: 'string', description: 'One-paragraph overall assessment' },
	},
}

const FACTCHECK_SCHEMA = {
	type: 'object',
	required: ['verdicts'],
	properties: {
		verdicts: {
			type: 'array',
			items: {
				type: 'object',
				required: ['track', 'claim', 'verdict', 'evidence'],
				properties: {
					track: { type: 'integer' },
					claim: { type: 'string' },
					// 'refuted' = misstates CURRENT reality (a real strike). 'forward-proposal' =
					// a new mechanism the design proposes, not yet in the repo — NOT a strike, or a
					// divergent design is penalized for being divergent. 'unverifiable' = can't tell.
					verdict: { type: 'string', enum: ['confirmed', 'refuted', 'forward-proposal', 'unverifiable'] },
					evidence: { type: 'string', description: 'File/line or command output that decided it' },
				},
			},
		},
	},
}

const JUDGE_SCHEMA = {
	type: 'object',
	required: ['ranking', 'recommendation'],
	properties: {
		ranking: {
			type: 'array',
			items: {
				type: 'object',
				required: ['track', 'score', 'rationale'],
				properties: {
					track: { type: 'integer' },
					score: { type: 'number', description: '0-10 against the brief' },
					rationale: { type: 'string' },
				},
			},
		},
		recommendation: {
			type: 'string',
			description: 'Which track should win and what to graft from the runners-up',
		},
	},
}

// One chain per track, no barrier between tracks: design -> fresh critique -> cheap fold.
const candidates = await pipeline(
	angles,
	(angle, _item, i) =>
		agent(
			`You are design track ${i + 1} of ${tracks} in a design competition. Brief:\n\n${brief}\n\n` +
				`Your assigned perspective: ${angle}.\n\n` +
				`Ground yourself in the repo FIRST (read the files/docs the brief points at), then draft a design. ` +
				`Iterate INTERNALLY ${iterations} times: after each draft, critique it yourself against the brief and revise. ` +
				`Stop early if a round changes nothing material. Return your best version. ` +
				`List every load-bearing factual claim (paths, names, mechanisms) — they will be verified against the repo.`,
			{ label: `design:${i + 1}`, phase: 'Design', schema: DESIGN_SCHEMA },
		),
	(design, _angle, i) => {
		if (!design) return null // designer died (agent() can return null) — drop the track cleanly
		return agent(
			`Fresh-eyes critique of a design (you did not write it; judge it cold against the brief).\n\n` +
				`Brief:\n${brief}\n\nDesign "${design.title}":\n${design.design}\n\n` +
				`Find what the author cannot: blind spots, unstated assumptions, missing failure modes, ` +
				`simpler alternatives. Severity-tag each finding.`,
			{ label: `critique:${i + 1}`, phase: 'Critique', schema: CRITIQUE_SCHEMA },
		).then((critique) => ({ design, critique }))
	},
	(prev, _angle, i) => {
		if (!prev) return null
		const { design, critique } = prev
		const candidate = (d, verdict) => ({ track: i + 1, angle: angles[i], ...d, critiqueVerdict: verdict })
		if (!critique) {
			// A dead critic must not discard a completed, valid design — keep it unfolded.
			log(`track ${i + 1}: critic failed; keeping the uncritiqued design`)
			return candidate(design, 'critique unavailable')
		}
		return agent(
			`Fold a critique into a design. Mechanical editing pass — apply the blocking and major findings ` +
				`(and minor ones that are free), keep the design's voice and structure, do not re-design.\n\n` +
				`Design "${design.title}":\n${design.design}\n\nClaims:\n${design.claims.join('\n')}\n\n` +
				`Critique:\n${JSON.stringify(critique.findings, null, 2)}\n\n` +
				`Return the revised design and the updated claims list.`,
			{ label: `fold:${i + 1}`, phase: 'Critique', schema: DESIGN_SCHEMA, effort: 'low' },
		).then((revised) => {
			// A null/failed fold falls back to the unfolded design — never a malformed
			// {track, angle} that survives filter(Boolean) and crashes claims.map() later.
			if (!revised) log(`track ${i + 1}: fold failed; keeping the unfolded design`)
			return candidate(revised ?? design, critique.verdict)
		})
	},
)

const survivors = candidates.filter(Boolean)
if (!survivors.length) throw new Error('every design track failed or was skipped — nothing to judge')
if (survivors.length < candidates.length) log(`dropped ${candidates.length - survivors.length} failed track(s); judging ${survivors.length}`)
// A 1-horse race is not a competition — the independence/coverage the shape buys has
// evaporated. Flag it loudly so the human pick isn't mistaken for "best of N" (6c).
const degraded = survivors.length < 2
if (degraded) log(`⚠️ only ${survivors.length} design survived of ${effectiveTracks} requested — NOT a real competition; treat the result as a single draft, not a winner`)

// Reserve headroom for the two remaining high-effort phases; if the target is nearly
// spent, hand back the designs un-fact-checked-and-unjudged rather than throw on the
// next agent() call (cost-control #2 — guard the expensive tail on budget.remaining()).
const TAIL_RESERVE = 40_000
if (budget.total && budget.remaining() < TAIL_RESERVE) {
	log(`budget nearly spent (${Math.round(budget.remaining() / 1000)}k left) — returning designs without fact-check/judge`)
	return { candidates: survivors, factCheck: null, verdicts: [], truncated: 'budget' }
}

// Barrier is correct here: the fact-checker needs every candidate's claims at once.
const factCheck = await agent(
	`Fact-check the load-bearing claims of ${survivors.length} competing designs against this repo. ` +
		`For each claim, read the actual source (files, read-only commands) and classify:\n` +
		`- "confirmed" — a claim about CURRENT reality that checks out.\n` +
		`- "refuted" — a claim about CURRENT reality that is FALSE (a cited file/field/mechanism that ` +
		`does not exist or does not behave as stated). This is the only real strike.\n` +
		`- "forward-proposal" — the design's OWN proposed new mechanism, not yet in the repo. ` +
		`Not-yet-true is EXPECTED for a proposal; do NOT mark it refuted for being new — that would ` +
		`punish the divergent designs this competition exists to surface. Note only whether it's ` +
		`internally coherent and compatible with what exists.\n` +
		`- "unverifiable" — genuinely can't tell.\n` +
		`Reserve "refuted" for fabrications about existing reality; never use it as the default.\n\n` +
		survivors.map((c) => `Track ${c.track} — "${c.title}":\n${c.claims.map((cl) => `- ${cl}`).join('\n')}`).join('\n\n'),
	{ label: 'fact-check', phase: 'Fact-check', schema: FACTCHECK_SCHEMA, effort: 'high' },
)

// Surface unaddressed-critique risk to the judge (6b): a design whose critique or fold
// failed carries findings no one folded in, and must not be judged as if it were clean.
const critiqueNote = (c) =>
	c.critiqueVerdict === 'critique unavailable'
		? ' ⚠️ critique/fold failed for this track — may carry UNADDRESSED findings; judge accordingly.'
		: ''

const judgeBrief =
	`Judge a design competition COMPARATIVELY — all candidates side by side, scored 0-10 against the brief.\n\n` +
	`Brief:\n${brief}\n\n` +
	survivors.map((c) => `## Track ${c.track} — "${c.title}" (angle: ${c.angle})${critiqueNote(c)}\n${c.design}`).join('\n\n') +
	`\n\nFact-check verdicts: a "refuted" claim (fabrication about current reality) is a serious ` +
	`strike; a "forward-proposal" is a design's own new idea and is NOT a strike — judge it on merit, ` +
	`not on not-yet-existing. Weigh accordingly:\n${JSON.stringify(factCheck?.verdicts ?? [], null, 2)}\n\n` +
	`Recommend a winner and name anything worth grafting from the runners-up.`

const verdicts = (
	await parallel(
		Array.from({ length: judges }, (_, j) => () =>
			agent(judgeBrief, { label: `judge:${j + 1}`, phase: 'Judge', schema: JUDGE_SCHEMA, effort: 'high' }),
		),
	)
).filter(Boolean)

// The workflow ends at the human gate: present candidates + verdicts, the human picks,
// and the adversarial trio hardens ONLY the winner (run separately, per HARD RULE #25).
// `degraded` warns the caller when fewer than 2 designs survived — not a real competition.
return { candidates: survivors, factCheck, verdicts, degraded }
