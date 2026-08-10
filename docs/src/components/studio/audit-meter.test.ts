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

	test('every failing role survives, even when failures alone exceed the cap', () => {
		const results = Array.from({ length: 9 }, (_, i) => fail(`role-${i}`, 1 + i / 10));
		const rows = auditMeterRows({ light: { results } });
		expect(rows).toHaveLength(AUDIT_METER_ROWS);
		expect(rows.every((r) => r.status === 'fail')).toBe(true);
	});

	test('passing rows keep their audit order behind the failures', () => {
		const results = [pass('a', 9), fail('b', 3), pass('c', 8)];
		expect(auditMeterRows({ light: { results } }).map((r) => r.role)).toEqual(['b', 'a', 'c']);
	});

	test('`missing` and `skipped` rows are not shown as either', () => {
		const results = [pass('a'), { role: 'b', ratio: null, status: 'missing' }, { role: 'c', ratio: null, status: 'skipped' }];
		expect(auditMeterRows({ light: { results } }).map((r) => r.role)).toEqual(['a']);
	});

	test('an absent mode, absent results and an empty audit are all handled', () => {
		expect(auditMeterRows({})).toEqual([]);
		expect(auditMeterRows({ light: {} })).toEqual([]);
		expect(auditMeterRows({ light: { results: [] }, dark: { results: [] } })).toEqual([]);
	});
});
