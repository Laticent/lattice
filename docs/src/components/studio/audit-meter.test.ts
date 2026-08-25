/**
 * Unit: the Fabricate WCAG meter's row reduction.
 *
 * BITE-TEST, not a smoke test. The defect this exists for is silent by construction:
 * the panel caps at 6 rows, so growing the audit contract pushed a FAILING row off
 * the end and the user saw a red "review" badge above six green checks. Every test
 * below constructs that situation.
 */

import { describe, expect, test } from 'vitest';
import { AUDIT_METER_ROWS, auditMeterRows } from './audit-meter';

const pass = (role: string, ratio = 8) => ({ role, ratio, status: 'pass' });
const fail = (role: string, ratio = 4.18) => ({ role, ratio, status: 'fail' });

describe('auditMeterRows', () => {
	test('BITES: a failing role is never evicted by the cap, however many roles precede it', () => {
		// The exact shape of #1457: `categorical-ink` inserted at position 4, pushing
		// `secondary` (a real failure) past the sixth slot in pure audit order.
		const results = [
			pass('categorical-pale', 8.52), pass('categorical-deep', 7.42),
			pass('categorical-edge', 6.47), pass('categorical-ink', 5.15),
			pass('heading', 13.2), pass('body', 6.18), fail('secondary', 4.18),
		];
		const rows = auditMeterRows({ light: { results } });
		expect(rows).toHaveLength(AUDIT_METER_ROWS);
		expect(rows[0]).toMatchObject({ role: 'secondary', status: 'fail' });
		// And prove the ordering is what saves it: audit order alone would drop it.
		expect(results.slice(0, AUDIT_METER_ROWS).some((r) => r.status === 'fail')).toBe(false);
	});

	test('a role that passes in one mode and fails in the other reads as the failure', () => {
		const rows = auditMeterRows({
			light: { results: [pass('heading', 13.2)] },
			dark: { results: [fail('heading', 2.1)] },
		});
		expect(rows).toEqual([{ role: 'heading', ratio: 2.1, status: 'fail' }]);
	});

	// NAMED FOR WHAT IT PROVES. It used to be called "every failing role survives, even
	// when failures alone exceed the cap", which is not what it asserts and not what the
	// code does: with nine failures and a cap of six, three failing roles ARE dropped.
	// What survives is the guarantee that matters — every row the panel shows is a real
	// failure, so the #1457 shape (a red badge over six green checks) cannot recur.
	test('when failures exceed the cap, every row shown is still a failure', () => {
		const results = Array.from({ length: 9 }, (_, i) => fail(`role-${i}`, 1 + i / 10));
		const rows = auditMeterRows({ light: { results } });
		expect(rows).toHaveLength(AUDIT_METER_ROWS);
		expect(rows.every((r) => r.status === 'fail')).toBe(true);
		// …and be explicit that three are not shown, so nobody reads the line above as
		// "all nine are visible".
		expect(rows.map((r) => r.role)).toEqual(['role-0', 'role-1', 'role-2', 'role-3', 'role-4', 'role-5']);
	});

	test('passing rows keep their audit order behind the failures', () => {
		const results = [pass('a', 9), fail('b', 3), pass('c', 8)];
		expect(auditMeterRows({ light: { results } }).map((r) => r.role)).toEqual(['b', 'a', 'c']);
	});

	// ── UNCHECKED rows (#1841) ────────────────────────────────────────────────
	//
	// These used to be filtered out, which was safe only while `auditVars`'s `ok`
	// ignored them too. It does not any more — a palette of `oklch()` values was
	// measuring nothing and reporting AA — so a hidden unchecked row would put a red
	// `review` badge over six green checks with nothing to act on: the #1457 symptom
	// arriving through the other door.
	test('an unchecked row IS shown, and sorts between failures and passes', () => {
		const results = [pass('a'), { role: 'b', ratio: null, status: 'missing' }, { role: 'c', ratio: null, status: 'skipped', unreadable: ['bg'] }, fail('d')];
		const rows = auditMeterRows({ light: { results } });
		expect(rows.map((r) => r.role)).toEqual(['d', 'b', 'c', 'a']);
		expect(rows.find((r) => r.role === 'c')?.unreadable).toEqual(['bg']);
	});

	test('a role unreadable in ONE mode and passing in the other reads as unchecked', () => {
		// Otherwise a theme readable on the light canvas and not on the dark would
		// render green while `ok` said review.
		const rows = auditMeterRows({
			light: { results: [pass('heading', 13.2)] },
			dark: { results: [{ role: 'heading', ratio: null, status: 'skipped', unreadable: ['text-heading'] }] },
		});
		expect(rows).toEqual([{ role: 'heading', ratio: null, status: 'skipped', unreadable: ['text-heading'] }]);
	});

	test('a KNOWN failure still outranks an unchecked row — it is the more actionable one', () => {
		const rows = auditMeterRows({
			light: { results: [{ role: 'heading', ratio: null, status: 'skipped' }] },
			dark: { results: [fail('heading', 2.1)] },
		});
		expect(rows[0]).toMatchObject({ role: 'heading', status: 'fail' });
	});

	test('an absent mode, absent results and an empty audit are all handled', () => {
		expect(auditMeterRows({})).toEqual([]);
		expect(auditMeterRows({ light: {} })).toEqual([]);
		expect(auditMeterRows({ light: { results: [] }, dark: { results: [] } })).toEqual([]);
	});
	// ── The separation row kind ───────────────────────────────────────────────
	//
	// `lib/theme/contrast.js` now emits a second row kind whose `ratio` is ALWAYS
	// null and whose magnitude lives in `distance`. The cap-of-6 above is safe for a
	// new PASSING row because failures sort first — but the worst-wins reduction was
	// not: it compared `(r.ratio ?? 99)`, so both modes of a separation row scored 99,
	// `99 < 99` is false, and the LIGHT reading won by insertion order. A muted tier
	// that collapses only on the dark canvas would have rendered green.
	describe('separation rows (null ratio, magnitude in `distance`)', () => {
		const sep = (role: string, distance: number, status: string) => ({ role, ratio: null, status, kind: 'separation', distance });

		test('BITES: a separation row failing only in DARK reads as the failure', () => {
			const rows = auditMeterRows({
				light: { results: [sep('muted-separation', 0.19, 'pass')] },
				dark: { results: [sep('muted-separation', 0.004, 'fail')] },
			});
			expect(rows).toEqual([{ role: 'muted-separation', ratio: null, status: 'fail', kind: 'separation', distance: 0.004 }]);
		});

		test('…and failing only in LIGHT, so the fix is not just an ordering accident', () => {
			const rows = auditMeterRows({
				light: { results: [sep('muted-separation', 0.004, 'fail')] },
				dark: { results: [sep('muted-separation', 0.19, 'pass')] },
			});
			expect(rows[0]).toMatchObject({ status: 'fail', distance: 0.004 });
		});

		test('two passing separation rows: the worse DISTANCE wins, not the first seen', () => {
			const rows = auditMeterRows({
				light: { results: [sep('muted-separation', 0.19, 'pass')] },
				dark: { results: [sep('muted-separation', 0.05, 'pass')] },
			});
			expect(rows[0].distance).toBe(0.05);
		});

		test('a failing separation row outranks every passing contrast row', () => {
			const results = [
				pass('categorical-pale', 8.52), pass('categorical-deep', 7.42),
				pass('categorical-edge', 6.47), pass('categorical-ink', 5.15),
				pass('heading', 13.2), pass('body', 6.18),
				sep('muted-separation', 0.004, 'fail'),
			];
			const rows = auditMeterRows({ light: { results } });
			expect(rows).toHaveLength(AUDIT_METER_ROWS);
			expect(rows[0]).toMatchObject({ role: 'muted-separation', status: 'fail' });
		});

		/**
		 * THE EDGE, pinned rather than glossed. `contrast.js` appends separation rows LAST,
		 * so among FAILURES they sort last, so they are the first dropped once more than
		 * `limit` roles fail. That is arithmetic — a cap of six cannot show seven failures —
		 * but it is worth a test because the honest claim ("a failure is never evicted by a
		 * PASSING row") is one word away from the false one this file used to make.
		 *
		 * Reachable from the Studio's own pickers, not a contrivance: the essentials that
		 * produce seven failing roles are in the module header's sibling note.
		 */
		test('once failures exceed the cap, a separation row is the first dropped', () => {
			const results = [
				fail('heading', 1.9), fail('label', 2.1), fail('accent-soft-body', 2.4),
				fail('accent-text', 2.6), fail('code-chip', 3.1), fail('secondary', 4.2),
				sep('muted-separation', 0.004, 'fail'), sep('secondary-separation', 0.0, 'fail'),
			];
			const rows = auditMeterRows({ light: { results } });
			expect(rows).toHaveLength(AUDIT_METER_ROWS);
			expect(rows.every((r) => r.status === 'fail')).toBe(true);
			expect(rows.map((r) => r.role)).not.toContain('muted-separation');
			// The badge still reads `review` (the caller drives that off `audit.ok`, not off
			// these rows), and six actionable failures are on screen — so the author is not
			// left with nothing, which is the property #1457 was actually about.
		});

		test('skipped / missing separation rows are shown as unchecked, exactly like contrast ones', () => {
			const results = [
				pass('heading'),
				{ role: 'muted-separation', ratio: null, status: 'skipped', kind: 'separation', distance: null },
				{ role: 'secondary-separation', ratio: null, status: 'missing', kind: 'separation', distance: null },
			];
			expect(auditMeterRows({ light: { results } }).map((r) => r.role)).toEqual(['muted-separation', 'secondary-separation', 'heading']);
		});

		test('the two scales never meet: a contrast row is not out-ranked by a distance', () => {
			// 0.004 (a dE) is numerically far below 4.18 (a ratio). If the reduction ever
			// compared them, a PASSING separation row (0.19) would look worse than a
			// passing contrast row (8.0) and sort ahead of it. Rows are keyed by ROLE, so
			// the two kinds are only ever compared against themselves — pinned here so a
			// future change to that key is caught.
			const rows = auditMeterRows({
				light: { results: [pass('body', 8.0), sep('muted-separation', 0.19, 'pass'), fail('secondary', 4.18)] },
			});
			expect(rows.map((r) => r.role)).toEqual(['secondary', 'body', 'muted-separation']);
		});

		test('a contrast row still keeps its ratio-based worst-wins behavior', () => {
			const rows = auditMeterRows({
				light: { results: [pass('heading', 13.2)] },
				dark: { results: [pass('heading', 5.1)] },
			});
			expect(rows).toEqual([{ role: 'heading', ratio: 5.1, status: 'pass' }]);
		});
	});
});
