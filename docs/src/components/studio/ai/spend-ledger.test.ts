import { beforeEach, describe, expect, it, vi } from 'vitest';
import { adjustSpend, dayKey, LEDGER_NO_DECK, readLedger, readSpend, recordSpend, SPEND_LEDGER_KEY, setSpendDeck } from './spend.js';

// The spend ledger answers "this deck" and "today". It books the SAME charges as the session
// and all-time tally, so the three can never disagree about what a call cost.
describe('spend ledger', () => {
	beforeEach(() => {
		localStorage.clear();
		sessionStorage.clear();
		setSpendDeck(null);
		vi.useRealTimers();
	});

	it('books a charge under the open deck and counts it in today', () => {
		setSpendDeck('deck-a');
		recordSpend(0.25, 1000);
		setSpendDeck('deck-b');
		recordSpend(0.1, 500);
		expect(readLedger('deck-a')).toMatchObject({ deck: 0.25, today: 0.35, deckTokens: 1000, todayTokens: 1500 });
		expect(readLedger('deck-b').deck).toBeCloseTo(0.1);
	});

	it('agrees with the session tally', () => {
		setSpendDeck('d');
		recordSpend(0.5, 10);
		recordSpend(0.25, 10);
		expect(readSpend().session).toBeCloseTo(readLedger('d').today);
	});

	it('books a charge made with no deck set under the placeholder, not under a real deck', () => {
		recordSpend(0.2, 1);
		expect(readLedger('d').deck).toBe(0);
		expect(readLedger(LEDGER_NO_DECK).deck).toBeCloseTo(0.2);
	});

	it('follows a signed correction down, and never below zero', () => {
		setSpendDeck('d');
		recordSpend(0.3, 0);
		adjustSpend(-0.1);
		expect(readLedger('d').deck).toBeCloseTo(0.2);
		adjustSpend(-5);
		expect(readLedger('d').deck).toBe(0);
	});

	it('splits days by the LOCAL calendar and drops days past the keep window', () => {
		vi.useFakeTimers();
		vi.setSystemTime(new Date(2026, 0, 1, 23, 30));
		setSpendDeck('d');
		recordSpend(1, 0);
		vi.setSystemTime(new Date(2026, 0, 2, 0, 30));
		recordSpend(2, 0);
		expect(readLedger('d', new Date(2026, 0, 2, 9)).today).toBe(2);
		expect(readLedger('d', new Date(2026, 0, 2, 9)).deck).toBe(3);
		// 200 days on, the January charges are gone.
		vi.setSystemTime(new Date(2026, 6, 20));
		recordSpend(4, 0);
		expect(Object.keys(JSON.parse(localStorage.getItem(SPEND_LEDGER_KEY) ?? '{}'))).toEqual([dayKey(new Date(2026, 6, 20))]);
	});

	it('survives a corrupt ledger instead of throwing mid-turn', () => {
		localStorage.setItem(SPEND_LEDGER_KEY, '{not json');
		setSpendDeck('d');
		expect(() => recordSpend(0.1, 1)).not.toThrow();
		expect(readLedger('d').deck).toBeCloseTo(0.1);
	});
});
