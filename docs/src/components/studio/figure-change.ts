// Numeric provenance for a proposed edit: which figures it removes and adds. Its own module so the chat's change
// card (ChangeCard.tsx) can warn on a changed figure without importing the whole chat panel.

// Numeric provenance — Munger's content-truth point. A rewrite that changes a figure is
// the highest-risk edit in a numbers deck, so surface it explicitly for review regardless
// of the "facts locked" mode. A money/metric token: optional SIGN, optional currency,
// grouped-thousands OR a plain number, optional decimal, optional magnitude (K/M/B/T; `bn` `Bn` `BN` land on the `b` and read as B),
// optional percent. The leading `[-−+]?` is load-bearing — without it a loss↔profit flip
// (`-5%` → `5%`) tokenizes identically and the change is invisible (trio: the highest-risk
// numeric edit). NOT `[\d,]*` — that swallowed list commas ("10, 20" → "10,").
const NUM_RE = /[-−+]?[$€£]?\d{1,3}(?:,\d{3})+(?:\.\d+)?[KkMmBbT]?%?|[-−+]?[$€£]?\d+(?:\.\d+)?[KkMmBbT]?%?/g;
function numericTokens(s: string): string[] {
	return (String(s).match(NUM_RE) || []).filter((x) => /\d/.test(x));
}
// Normalize a token to a comparable numeric VALUE: apply sign, strip currency/commas,
// fold magnitude (K/M/B/T) and percent (÷100). So a pure REFORMAT of the same value
// (`4,200`↔`4200`, `$4.2M`↔`$4,200,000`) compares EQUAL and does not flag — only a real
// value change (or a sign flip) does. NaN for an unparseable token (compared as literal).
function tokenValue(tok: string): number {
	let t = tok.replace(/[$€£,\s]/g, '');
	let sign = 1;
	if (/^[-−]/.test(t)) { sign = -1; t = t.slice(1); } else if (t.startsWith('+')) t = t.slice(1);
	let pct = false;
	if (t.endsWith('%')) { pct = true; t = t.slice(0, -1); }
	let mult = 1;
	const mag = /[KkMmBbT]$/.exec(t);
	if (mag) { mult = mag[0] === 'T' ? 1e12 : { k: 1e3, m: 1e6, b: 1e9 }[mag[0].toLowerCase() as 'k' | 'm' | 'b']; t = t.slice(0, -1); }
	const n = Number(t);
	if (!Number.isFinite(n)) return Number.NaN;
	return (sign * n * mult) / (pct ? 100 : 1);
}
// KNOWN LIMITS (documented, not bugs): compares as a MULTISET, so a value TRANSPOSITION
// between two labeled figures ("$5M/$3M" → "$3M/$5M") is not flagged; and `\d` is ASCII,
// so non-Latin numerals (Arabic-Indic / full-width) aren't tokenized. The full textual
// diff above the chip still shows every change — this cue is an advisory highlight, not a gate.
export function figureChange(before: string, after: string): { removed: string[]; added: string[] } | null {
	// Bucket display tokens by normalized value-key, so a reformat matches but a real change
	// (or a sign flip) leaves an unmatched token on each side.
	const bucket = (toks: string[]) => {
		const m = new Map<string, string[]>();
		for (const t of toks) {
			const v = tokenValue(t);
			const k = Number.isFinite(v) ? `v:${v}` : `s:${t}`;
			(m.get(k) ?? m.set(k, []).get(k))?.push(t);
		}
		return m;
	};
	const b = bucket(numericTokens(before));
	const a = bucket(numericTokens(after));
	const removed: string[] = [];
	const added: string[] = [];
	for (const [k, toks] of b) for (let i = a.get(k)?.length ?? 0; i < toks.length; i++) removed.push(toks[i]);
	for (const [k, toks] of a) for (let i = b.get(k)?.length ?? 0; i < toks.length; i++) added.push(toks[i]);
	return removed.length || added.length ? { removed, added } : null;
}
