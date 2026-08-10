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

export type AuditResult = { role: string; ratio: number | null; status: string };
export type AuditRow = { role: string; ratio: number | null; status: string };

/** The default number of rows the panel shows. */
export const AUDIT_METER_ROWS = 6;

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
			// Worst ratio wins the row: a role that passes in one mode and fails in the
			// other must read as the failure.
			if (!prev || (r.ratio ?? 99) < (prev.ratio ?? 99)) byRole.set(r.role, { role: r.role, ratio: r.ratio, status: r.status });
		}
	}
	const rows = [...byRole.values()].filter((r) => r.status === 'pass' || r.status === 'fail');
	return [...rows.filter((r) => r.status === 'fail'), ...rows.filter((r) => r.status !== 'fail')].slice(0, limit);
}
