/**
 * The Fabricate WCAG meter's row reduction — one row per audit ROLE, worst ratio
 * across both canvas modes, capped to a curated few.
 *
 * WHY IT LIVES HERE RATHER THAN INLINE IN `Fabricate.tsx`. It used to be a `useMemo`
 * in the component, in pure audit order, capped at 6 — and a cap over an unordered
 * list is a trapdoor. When #1457 added a `categorical-ink` row per slot to
 * `lib/theme/contrast.js`'s contract, the new role landed at position 4 and pushed
 * `secondary` — which fails on roughly 22% of sampled essential sets — off the end.
 * The panel then showed a red "review" badge above six green checks with nothing to
 * act on: the aggregate verdict said something was wrong and the rows all said it was
 * fine.
 *
 * FAILURES COME FIRST, so the cap can only ever hide a PASSING row. That makes the
 * eviction harmless whatever the contract grows to next, which is the point — the
 * contract is computed now (`checkNoSafeDefaultTokens`) and will grow again.
 *
 * Extracted so this is provable without driving the Studio: the surface it renders
 * on is reachable only through the Library with a saved theme, and a reduction rule
 * is better pinned by a test than by a screenshot.
 */

/**
 * One row out of `lib/theme/contrast.js`. Two KINDS reach here (see that module's
 * header): a `contrast` row carries a WCAG `ratio`, a `separation` row carries an
 * OKLab `distance` and holds `ratio` at null. Both are optional so a caller passing
 * pre-#1715-shaped rows still type-checks.
 */
export type AuditResult = {
	role: string;
	ratio: number | null;
	status: string;
	kind?: string;
	distance?: number | null;
};
export type AuditRow = AuditResult;

/** The default number of rows the panel shows. */
export const AUDIT_METER_ROWS = 6;

/** Lower is worse. `skipped` / `missing` rank last; they are filtered out below. */
const statusRank = (r: AuditResult) => (r.status === 'fail' ? 0 : r.status === 'pass' ? 1 : 2);

/**
 * The row's own magnitude, whichever kind it is — a contrast ratio or an OKLab
 * distance. Only ever compared against the SAME role in the other mode, so the two
 * scales never meet.
 */
const magnitude = (r: AuditResult) => r.distance ?? r.ratio ?? Number.POSITIVE_INFINITY;

const worseThan = (a: AuditResult, b: AuditResult) =>
	statusRank(a) !== statusRank(b) ? statusRank(a) < statusRank(b) : magnitude(a) < magnitude(b);

/** Copy just the fields the panel reads, omitting the ones a plain contrast row lacks. */
function rowOf(r: AuditResult): AuditRow {
	const row: AuditRow = { role: r.role, ratio: r.ratio, status: r.status };
	if (r.kind !== undefined) row.kind = r.kind;
	if (r.distance !== undefined) row.distance = r.distance;
	return row;
}

/**
 * Reduce a two-mode audit to the meter's rows.
 * @param byMode  `{ light, dark }`, each with the audit's `results` (either may be absent)
 * @param limit   how many rows the panel has room for
 */
export function auditMeterRows(
	byMode: { light?: { results?: AuditResult[] }; dark?: { results?: AuditResult[] } },
	limit: number = AUDIT_METER_ROWS,
): AuditRow[] {
	const byRole = new Map<string, AuditRow>();
	for (const mode of ['light', 'dark'] as const) {
		for (const r of byMode[mode]?.results ?? []) {
			const prev = byRole.get(r.role);
			// Worst reading wins the row: a role that passes in one mode and fails in the
			// other must read as the failure. STATUS FIRST, then the row's own number.
			//
			// It used to compare `(r.ratio ?? 99)` alone, and that quietly stopped working
			// the moment a row kind arrived whose ratio is ALWAYS null (separation): every
			// such row scored 99 in both modes, `99 < 99` is false, and the LIGHT reading
			// won by insertion order — so a muted tier that collapses only on the dark
			// canvas would have rendered green. Ranking on status first is also scale-safe:
			// it never compares a 4.5:1 ratio against a 0.03 OKLab distance.
			if (!prev || worseThan(r, prev)) byRole.set(r.role, rowOf(r));
		}
	}
	const rows = [...byRole.values()].filter((r) => r.status === 'pass' || r.status === 'fail');
	return [...rows.filter((r) => r.status === 'fail'), ...rows.filter((r) => r.status !== 'fail')].slice(0, limit);
}
