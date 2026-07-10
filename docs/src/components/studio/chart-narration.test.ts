import { describe, expect, it } from 'vitest';
import { narrateChart, narrateFunnel, narrateJourneyWeighted, narrateQuadrant, narrateRadar, narrateStateChart, narrateStateChartInference } from './chart-narration';

// narrateFunnel speaks the funnel's stage values AND the stage-to-stage conversion
// rate — the number funnel.transform.js computes at render time and burns into SVG
// text, which never exists in the raw slide Markdown slideToSpeech reads.
describe('narrateFunnel', () => {
	const skeleton = [
		'<!-- _class: funnel -->',
		'',
		'## Where the flow drops off.',
		'',
		'- Visitors `12,000`',
		'- Signups `4,800`',
		'- Activated `2,160`',
	].join('\n');

	it('returns null for a non-funnel slide', () => {
		expect(narrateFunnel('<!-- _class: kpi -->\n\n## Revenue\n\n- A `1`\n- B `2`')).toBeNull();
	});

	it('returns null with fewer than two stages (mirrors the transform bailout)', () => {
		expect(narrateFunnel('<!-- _class: funnel -->\n\n## One stage\n\n- Visitors `12,000`')).toBeNull();
	});

	it('speaks the heading, each stage value, and the computed conversion %', () => {
		const out = narrateFunnel(skeleton);
		expect(out).toContain('Where the flow drops off.');
		expect(out).toContain('Visitors: twelve thousand.');
		// 4,800 / 12,000 = 40% — computed here, never authored on the slide.
		expect(out).toContain('Signups: four thousand eight hundred, forty percent of the prior stage.');
		// 2,160 / 4,800 = 45%
		expect(out).toContain('Activated: two thousand one hundred sixty, forty-five percent of the prior stage.');
	});

	it('does not treat an indented detail sublist line as a stage, but still speaks it (not dropped)', () => {
		// funnel.gallery.md's own default sample authors exactly this pattern — an
		// adversarial review found it was being silently dropped, worse than the
		// pre-narrator baseline where slideToSpeech read everything.
		const md = [
			'<!-- _class: funnel -->',
			'',
			'## Stages.',
			'',
			'- Visitors `12,000`',
			'  - Two-thirds arrive from inbound',
			'- Signups `4,800`',
		].join('\n');
		const out = narrateFunnel(md);
		// Not ingested as a phantom THIRD stage — the conversion % is still
		// computed from exactly two real stages.
		expect(out).toContain('Signups: four thousand eight hundred, forty percent of the prior stage.');
		// But the detail text itself is still spoken, just appended rather than
		// dropped.
		expect(out).toContain('Two-thirds arrive from inbound.');
	});

	it('skips a fenced code block that happens to contain stage-like syntax', () => {
		const md = [
			'<!-- _class: funnel -->',
			'',
			'## Stages.',
			'',
			'```',
			'- Fake `999`',
			'```',
			'',
			'- Visitors `12,000`',
			'- Signups `4,800`',
		].join('\n');
		const out = narrateFunnel(md);
		expect(out).not.toContain('Fake');
	});

	it('recognizes a funnel slide combined with a base modifier', () => {
		// lib/base/base.docs.md — `funnel dark` / `funnel compact` / `funnel accent`
		// are real, shipping combinations (funnel.gallery.md); a bare `funnel`
		// string match misses all three.
		for (const cls of ['funnel dark', 'funnel compact', 'funnel accent']) {
			const md = `<!-- _class: ${cls} -->\n\n## Stages.\n\n- A \`100\`\n- B \`50\``;
			expect(narrateFunnel(md), cls).toContain('fifty percent');
		}
	});

	it('does not mistake a substring class for funnel', () => {
		expect(narrateFunnel('<!-- _class: funnel-detail -->\n\n## Stages.\n\n- A `100`\n- B `50`')).toBeNull();
	});

	it('ignores a heading inside a fenced code block', () => {
		const md = [
			'<!-- _class: funnel -->',
			'',
			'```',
			'## Not the real heading',
			'```',
			'',
			'## The real heading.',
			'',
			'- Visitors `100`',
			'- Signups `50`',
		].join('\n');
		const out = narrateFunnel(md);
		expect(out).toContain('The real heading.');
		expect(out).not.toContain('Not the real heading');
	});

	it('ignores a fenced _class: funnel directive shown as a doc example', () => {
		const md = [
			'<!-- _class: kpi -->',
			'',
			'## How to author a funnel',
			'',
			'```',
			'<!-- _class: funnel -->',
			'- A `100`',
			'- B `50`',
			'```',
			'',
			'- Not `1`',
			'- Stages `2`',
		].join('\n');
		expect(narrateFunnel(md)).toBeNull();
	});

	it('strips a Markdown link label from a stage name', () => {
		const md = '<!-- _class: funnel -->\n\n## Stages.\n\n- [Visitors](https://x.example/report) `100`\n- Signups `50`';
		const out = narrateFunnel(md);
		expect(out).toContain('Visitors: one hundred');
		expect(out).not.toContain('https://x.example');
		expect(out).not.toContain('[');
	});

	it('recovers the FIRST numeric run from a range-style stage value instead of dropping the stage entirely (red-team/checker finding)', () => {
		// funnel.transform.js's own parseFunnel does the same: a comma-stripped
		// pill's first numeric run wins via parseFloat, defaulting to 0 rather
		// than dropping the stage — the old strip-to-allowlist-then-Number()
		// approach let "1,200-1,500" survive as "1200-1500" and fail Number()
		// entirely (NaN), silently vanishing the stage.
		const md = ['<!-- _class: funnel -->', '', '## Stages.', '', '- Estimated `1,200-1,500`', '- Signups `600`'].join('\n');
		const out = narrateFunnel(md);
		expect(out).not.toBeNull();
		expect(out).toContain('Signups: six hundred, fifty percent of the prior stage.');
	});

	it('does not splice the chain across a broken middle stage — the middle stage is recovered, not vanished', () => {
		const md = ['<!-- _class: funnel -->', '', '## Stages.', '', '- Visitors `10,000`', '- Mid-funnel `2,000-2,500`', '- Purchases `1,000`'].join('\n');
		const out = narrateFunnel(md);
		// Mid-funnel is NOT dropped from the chain (its computed conversion is
		// correct: 2000/10000 = 20%), and Purchases converts off the REAL prior
		// stage (1000/2000 = 50%), not a fabricated splice straight from Visitors.
		expect(out).toContain('Mid-funnel:');
		expect(out).toContain('twenty percent of the prior stage');
		expect(out).toContain('Purchases: one thousand, fifty percent of the prior stage.');
		// NOT the fabricated 10% (1000/10000) that skipping Mid-funnel entirely
		// (splicing Visitors directly to Purchases) would have produced.
		expect(out).not.toContain('ten percent of the prior stage');
	});
});

// narrateJourneyWeighted speaks each task's share of the slide's TOTAL volume —
// a % journey.transform.js computes only under the `weighted` variant and burns
// into a CSS custom property (chip width), never into text.
describe('narrateJourneyWeighted', () => {
	// journey.manifest.json's own `weighted` variantDocs sample — total volume
	// 45+18+12+10+8+7 = 100, so the percentages are exact round numbers.
	const weightedSample = [
		'<!-- _class: journey weighted -->',
		'',
		'## weighted sizes the stages by importance.',
		'',
		'- Discover',
		'  - Search `@prospect` `:4` `+45`',
		'  - Referral `@prospect` `:5` `+18`',
		'- Convert',
		'  - Pricing page `@prospect` `:3` `+12`',
		'  - Checkout `@prospect` `:2` `+10`',
		'- Support',
		'  - Settings `@user` `:3` `+8`',
		'  - Help docs `@user` `:4` `+7`',
	].join('\n');

	it('returns null for a non-journey slide', () => {
		expect(narrateJourneyWeighted('<!-- _class: kpi -->\n\n## X\n\n- A\n  - B `+1`')).toBeNull();
	});

	it('returns null for journey without the weighted modifier', () => {
		// The other four variants parse `+N` but never render it (journey.manifest.json antiPatterns).
		expect(narrateJourneyWeighted(weightedSample.replace('journey weighted', 'journey heatmap'))).toBeNull();
	});

	it("speaks each task's share of the total volume — a % only the weighted render computes", () => {
		const out = narrateJourneyWeighted(weightedSample);
		expect(out).toContain('weighted sizes the stages by importance.');
		expect(out).toContain('Discover: Search, forty-five percent; Referral, eighteen percent.');
		expect(out).toContain('Convert: Pricing page, twelve percent; Checkout, ten percent.');
		expect(out).toContain('Support: Settings, eight percent; Help docs, seven percent.');
	});

	it('defaults an unweighted task to volume 1 (mirrors `t.volume ?? 1`)', () => {
		const md = ['<!-- _class: journey weighted -->', '', '## Mixed.', '', '- Stage', '  - Weighted `@me` `:3` `+9`', '  - Unweighted `@me` `:3`'].join('\n');
		// total = 9 + 1 = 10 → 90% / 10%.
		const out = narrateJourneyWeighted(md);
		expect(out).toContain('Weighted, ninety percent');
		expect(out).toContain('Unweighted, ten percent');
	});

	it('does not treat a per-task detail sublist line as a task, but still speaks it (not dropped)', () => {
		// A depth-blind parser mistook a detail line one level deeper than the
		// task level for a phantom task (default volume 1), diluting every real
		// percentage — found by adversarial review.
		const md = [
			'<!-- _class: journey weighted -->',
			'',
			'## Weighted flow.',
			'',
			'- Stage',
			'  - Task A `@me` `:3` `+50`',
			'    - Escalated after `3` retries',
			'  - Task B `@me` `:3` `+50`',
		].join('\n');
		const out = narrateJourneyWeighted(md);
		// Not ingested as a phantom third task — the split stays an even 50/50.
		expect(out).toContain('Stage: Task A, fifty percent; Task B, fifty percent.');
		// But the detail text itself is still spoken, just appended.
		expect(out).toContain('Escalated after 3 retries.');
	});

	it("keeps a qualifying phrase authored AFTER a task's tokens, not just before (was truncated at the first backtick)", () => {
		const md = [
			'<!-- _class: journey weighted -->',
			'',
			'## Flow.',
			'',
			'- Stage',
			'  - Escalate `@support` `:2` to tier two `+40`',
			'  - Resolve `@support` `:2` `+60`',
		].join('\n');
		const out = narrateJourneyWeighted(md);
		expect(out).toContain('Stage: Escalate to tier two, forty percent; Resolve, sixty percent.');
	});

	it('accepts a `+.5`-style fractional volume with no leading digit (mirrors `parseFloat("+.5")`)', () => {
		const md = ['<!-- _class: journey weighted -->', '', '## Flow.', '', '- Stage', '  - A `@me` `:2` `+.5`', '  - B `@me` `:2` `+.5`'].join('\n');
		const out = narrateJourneyWeighted(md);
		expect(out).toContain('Stage: A, fifty percent; B, fifty percent.');
	});

	it('tolerates ordinary indentation variance between sibling task lines (2 vs 3 spaces) instead of treating the shallower one as detail (red-team finding)', () => {
		const md = [
			'<!-- _class: journey weighted -->',
			'',
			'## X.',
			'',
			'- Stage',
			'  - Search `@me` `:3` `+50`',
			'   - Referral `@me` `:3` `+50`',
		].join('\n');
		const out = narrateJourneyWeighted(md);
		expect(out).toBe('X. Stage: Search, fifty percent; Referral, fifty percent.');
	});

	it('accepts a trailing non-numeric suffix on a volume token (`+45%`) instead of falling back to the default volume of 1 (red-team finding)', () => {
		// journey.transform.js's parseTask does `parseFloat(tok.slice(1))` —
		// tolerant of trailing garbage. An author who's seen the rendered
		// percentage and tries to author it directly (`+45%`) is a realistic
		// mistake given the whole point of `weighted` is to DISPLAY a percent.
		const md = ['<!-- _class: journey weighted -->', '', '## X.', '', '- Stage', '  - Task `@me` `:3` `+45%`', '  - Filler `@me` `:3` `+1`'].join('\n');
		const out = narrateJourneyWeighted(md);
		expect(out).toBe('X. Stage: Task, ninety-eight percent; Filler, two percent.');
	});

	it('recognizes an h1 heading, not just h2 — journey.manifest.json documents both as valid (independent-checker finding)', () => {
		// Every narrator fully REPLACES slideToSpeech, which itself speaks any
		// heading level — a `##`-only match silently dropped an h1 title.
		const md = ['<!-- _class: journey weighted -->', '', '# Flow', '', '- Stage', '  - A `@me` `:3` `+9`', '  - B `@me` `:3` `+1`'].join('\n');
		const out = narrateJourneyWeighted(md);
		expect(out).toBe('Flow. Stage: A, ninety percent; B, ten percent.');
	});
});

// narrateRadar speaks the auto-fit scale (niceCeil of the data) ONLY when the
// slide's eyebrow doesn't already declare one — otherwise slideToSpeech's plain
// prose reading of the eyebrow already says it.
describe('narrateRadar', () => {
	it('returns null for a non-radar slide', () => {
		expect(narrateRadar('<!-- _class: kpi -->\n\n## X\n\n- A\n  - B `9`')).toBeNull();
	});

	it('returns null when the eyebrow already declares an explicit, parseable scale', () => {
		// radar.manifest.json's own skeleton.
		const md = [
			'<!-- _class: radar -->',
			'',
			'`Scale · 0–10`',
			'',
			'## How we stack up across the buying criteria.',
			'',
			'- Lattice',
			'  - Performance `9`',
			'  - Pricing `7`',
			'- Rival North',
			'  - Performance `7`',
			'  - Pricing `8`',
		].join('\n');
		expect(narrateRadar(md)).toBeNull();
	});

	it('narrates the auto-fit scale and every series when no eyebrow is authored', () => {
		const md = ['<!-- _class: radar -->', '', '## How we stack up.', '', '- Lattice', '  - Performance `9`', '  - Pricing `7`', '- Rival North', '  - Performance `7`', '  - Pricing `8`'].join(
			'\n',
		);
		const out = narrateRadar(md);
		// max value 9 → niceCeil(9) = 10.
		expect(out).toContain('On a scale of zero to ten.');
		expect(out).toContain('Lattice: Performance, nine; Pricing, seven.');
		expect(out).toContain('Rival North: Performance, seven; Pricing, eight.');
	});

	it('still auto-computes the scale when the eyebrow is present but not a parseable number', () => {
		const md = ['<!-- _class: radar -->', '', '`Buying criteria`', '', '## X.', '', '- Lattice', '  - Performance `9`'].join('\n');
		expect(narrateRadar(md)).toContain('On a scale of zero to ten.');
	});

	it('recognizes a radar slide combined with a base modifier', () => {
		const md = ['<!-- _class: radar dark -->', '', '## X.', '', '- Lattice', '  - Performance `9`'].join('\n');
		expect(narrateRadar(md)).toContain('scale of zero to ten');
	});

	it('returns null with no axis data', () => {
		expect(narrateRadar('<!-- _class: radar -->\n\n## X.\n\n- Lattice')).toBeNull();
	});

	it('defers to slideToSpeech on the `quadrant` variant (a THREE-level structure this parser does not model)', () => {
		// radar.manifest.json's own `quadrant` variantDocs shape — group > sub-group >
		// axis-value — WITHOUT its usual eyebrow, so this actually exercises the
		// variant-token guard rather than the (separate) explicit-scale bailout.
		const md = [
			'<!-- _class: radar quadrant -->',
			'',
			'## quadrant shades the compass quarters.',
			'',
			'- Our capability',
			'  - People',
			'    - Hiring `4`',
			'    - Retention `3`',
			'  - Process',
			'    - Cadence `5`',
		].join('\n');
		expect(narrateRadar(md)).toBeNull();
	});

	it('does not treat a per-axis detail sublist line as an axis, but still speaks it (not dropped)', () => {
		// radar.manifest.json's `detail` slot documents a real optional reveal
		// sublist under an axis; a depth-blind parser mistook a detail line
		// ending in a number for a phantom axis, corrupting the auto-fit scale
		// too — found by adversarial review.
		const md = [
			'<!-- _class: radar -->',
			'',
			'## How we stack up.',
			'',
			'- Lattice',
			'  - Performance `9`',
			'    - Verified in cycle `2024`',
			'  - Pricing `7`',
		].join('\n');
		const out = narrateRadar(md);
		// Scale stays zero to ten — NOT corrupted by the detail line's `2024`.
		expect(out).toContain('On a scale of zero to ten.');
		expect(out).toContain('Lattice: Performance, nine; Pricing, seven.');
		// But the detail text itself is still spoken, just appended.
		expect(out).toContain('Verified in cycle 2024.');
	});

	it('tolerates ordinary indentation variance between sibling axis lines (2 vs 3 spaces) instead of treating the shallower one as detail (red-team finding)', () => {
		// CommonMark/markdown-it treats an ordinarily-indented sibling as the
		// SAME list level regardless of exact character count — an earlier,
		// exact-match depth fix wrongly excluded this from both the spoken list
		// AND the auto-fit scale, reintroducing the very "confidently wrong
		// number" bug the depth fix exists to prevent.
		const md = ['<!-- _class: radar -->', '', '## How we stack up.', '', '- Lattice', '  - Performance `9`', '   - Pricing `95`'].join('\n');
		const out = narrateRadar(md);
		expect(out).toBe('How we stack up. On a scale of zero to one hundred. Lattice: Performance, nine; Pricing, ninety-five.');
	});

	it('tolerates trailing non-numeric text on an axis value pill instead of excluding the whole axis line (independent-checker finding)', () => {
		// radar.transform.js's parseAxisItem extracts via parseFloat on whatever
		// the trailing pill holds — tolerant of a unit or typo, never excluding
		// the line outright the way an anchored bare-number regex did.
		const md = ['<!-- _class: radar -->', '', '## X.', '', '- Lattice', '  - Performance `9 pts`'].join('\n');
		const out = narrateRadar(md);
		expect(out).toBe('X. On a scale of zero to ten. Lattice: Performance, nine.');
	});

	it('speaks a leading eyebrow FIRST, in its authored position, properly punctuated — not a dangling fragment after the data (Munger-inversion finding)', () => {
		const md = ['<!-- _class: radar -->', '', '`Buying criteria`', '', '## X.', '', '- Lattice', '  - Performance `9`'].join('\n');
		const out = narrateRadar(md);
		expect(out).toBe('Buying criteria. X. On a scale of zero to ten. Lattice: Performance, nine.');
	});
});

// narrateQuadrant speaks the auto-fit scale per axis (independently) ONLY for
// whichever axis the eyebrow doesn't already give a range for.
describe('narrateQuadrant', () => {
	it('returns null for a non-quadrant slide', () => {
		expect(narrateQuadrant('<!-- _class: kpi -->\n\n## X\n\n- A\n  - B `1, 2`')).toBeNull();
	});

	it('returns null when the eyebrow already ranges BOTH axes', () => {
		// quadrant.manifest.json's own skeleton eyebrow.
		const md = [
			'<!-- _class: quadrant -->',
			'',
			'`Effort 0–10 → Reach 0–100`',
			'',
			'## Where to put the next dollar.',
			'',
			'- Strategic Bets',
			'  - Scoring model v2 `3, 70`',
			'- Quick Wins',
			'  - Weekly signal brief `8, 80`',
		].join('\n');
		expect(narrateQuadrant(md)).toBeNull();
	});

	it('narrates both axis scales and every item when no eyebrow is authored', () => {
		const md = ['<!-- _class: quadrant -->', '', '## Where to invest.', '', '- Strategic Bets', '  - Scoring model v2 `3, 70`', '  - Per-team calibration `5, 85`', '- Quick Wins', '  - Weekly signal brief `8, 80`'].join(
			'\n',
		);
		const out = narrateQuadrant(md);
		// xMax 8 → niceCeil 10; yMax 85 → niceCeil 100.
		expect(out).toContain('The horizontal axis runs zero to ten.');
		expect(out).toContain('The vertical axis runs zero to one hundred.');
		expect(out).toContain('Strategic Bets: Scoring model v2 at three, seventy; Per-team calibration at five, eighty-five.');
		expect(out).toContain('Quick Wins: Weekly signal brief at eight, eighty.');
	});

	it('narrates only the axis the eyebrow leaves unranged', () => {
		const md = ['<!-- _class: quadrant -->', '', '`Effort 0–10`', '', '## X.', '', '- Group', '  - Item `5, 85`'].join('\n');
		const out = narrateQuadrant(md);
		expect(out).not.toContain('horizontal axis');
		expect(out).toContain('The vertical axis runs zero to one hundred.');
	});

	it('correctly parses the `trail` variant\'s two-pill (before → after) item instead of garbling the label', () => {
		// quadrant.manifest.json's own `trail` variantDocs sample, minus the eyebrow
		// (so the trail parse itself is exercised, not the explicit-scale bailout).
		const md = [
			'<!-- _class: quadrant trail -->',
			'',
			'## trail shows where each point moved from.',
			'',
			'- Strategic Bets',
			'  - Scoring model v2 `5, 60` `3, 78`',
			'  - Per-team calibration `7, 70` `5, 88`',
			'- Quick Wins',
			'  - Snapshot exports `9, 45` `8, 62`',
		].join('\n');
		const out = narrateQuadrant(md);
		expect(out).toContain('Strategic Bets: Scoring model v2 at three, seventy-eight; Per-team calibration at five, eighty-eight.');
		expect(out).toContain('Quick Wins: Snapshot exports at eight, sixty-two.');
		expect(out).not.toContain('5, 60');
		expect(out).not.toContain('7, 70');
	});

	it("handles a negative-extreme axis (mirrors resolveScale's min<0 handling — the min is not always zero)", () => {
		const md = ['<!-- _class: quadrant -->', '', '## X.', '', '- Group', '  - A `-20, 5`', '  - B `8, 3`'].join('\n');
		const out = narrateQuadrant(md);
		// xMin -20 (negative) → min stays -20, max = niceCeil(max(8, 20)) = 20.
		expect(out).toContain('The horizontal axis runs negative twenty to twenty.');
		// yMin 3 (non-negative) → min 0, max = niceCeil(5) = 5.
		expect(out).toContain('The vertical axis runs zero to five.');
	});

	it('bails when the `radar` token is also present (a radar-variant slide, not this component)', () => {
		const md = ['<!-- _class: radar quadrant -->', '', '## X.', '', '- Group', '  - Sub', '    - Item `4`'].join('\n');
		expect(narrateQuadrant(md)).toBeNull();
	});

	it('does not treat a per-item detail sublist line as an item, but still speaks it (not dropped)', () => {
		// quadrant.manifest.json's `detail` slot documents a real optional reveal
		// sublist under an item; a depth-blind parser mistook a detail line
		// ending in a comma-separated pair for a phantom item, corrupting the
		// auto-fit scale too — found by adversarial review.
		const md = [
			'<!-- _class: quadrant -->',
			'',
			'## Where to invest.',
			'',
			'- Strategic Bets',
			'  - Scoring model v2 `3, 70`',
			'    - Confidence range `40, 95`',
			'  - Per-team calibration `5, 85`',
		].join('\n');
		const out = narrateQuadrant(md);
		// Scale stays 0–5 / 0–100 — NOT corrupted by the detail line's `40, 95`.
		expect(out).toContain('The horizontal axis runs zero to five.');
		expect(out).toContain('The vertical axis runs zero to one hundred.');
		expect(out).toContain('Strategic Bets: Scoring model v2 at three, seventy; Per-team calibration at five, eighty-five.');
		// But the detail text itself is still spoken, just appended.
		expect(out).toContain('Confidence range 40, 95.');
	});

	it('speaks an intro paragraph between the heading and the groups (not dropped)', () => {
		const md = [
			'<!-- _class: quadrant -->',
			'',
			'## Where to invest.',
			'',
			'Bubble size reflects team size.',
			'',
			'- Strategic Bets',
			'  - Scoring model v2 `3, 70`',
			'- Quick Wins',
			'  - Weekly signal brief `8, 80`',
		].join('\n');
		const out = narrateQuadrant(md);
		expect(out).toContain('Bubble size reflects team size.');
		expect(out).toContain('Strategic Bets: Scoring model v2 at three, seventy.');
	});

	it('does not silently strip an unparseable eyebrow "targets" suffix — the broken trailing range falls back to auto-fit', () => {
		// splitQuadrantEyebrow only strips a trailing `targets …` phrase when it's
		// itself parseable (hasParseableTargets) — an unparseable one (a typo, a
		// placeholder) must stay embedded, exactly like production leaves it, so
		// it breaks the SAME end-anchored range parse production's own eyebrow
		// reading would fail on too. Silently stripping it regardless would hand
		// this slide a clean-looking but unearned "0–100" the real render can't
		// resolve either.
		const md = [
			'<!-- _class: quadrant -->',
			'',
			'`Effort 0–10 → Reach 0–100 · targets tbd`',
			'',
			'## Where to invest.',
			'',
			'- Strategic Bets',
			'  - Scoring model v2 `3, 45`',
			'- Quick Wins',
			'  - Weekly signal brief `8, 30`',
		].join('\n');
		const out = narrateQuadrant(md);
		// Auto-fit from the data (max y = 45 → niceCeil 50), not the unreachable
		// eyebrow-declared 100.
		expect(out).toContain('The vertical axis runs zero to fifty.');
		expect(out).not.toContain('one hundred');
	});

	it('tolerates ordinary indentation variance between sibling item lines (2 vs 3 spaces) — same fix as radar', () => {
		const md = [
			'<!-- _class: quadrant -->',
			'',
			'## Where to invest.',
			'',
			'- Strategic Bets',
			'  - Scoring model v2 `3, 70`',
			'   - Per-team calibration `7, 85`',
		].join('\n');
		const out = narrateQuadrant(md);
		expect(out).toBe(
			'Where to invest. The horizontal axis runs zero to ten. The vertical axis runs zero to one hundred. Strategic Bets: Scoring model v2 at three, seventy; Per-team calibration at seven, eighty-five.',
		);
	});

	it('speaks a leading eyebrow FIRST, in its authored position, properly punctuated — not a dangling fragment after the data (Munger-inversion finding)', () => {
		const md = ['<!-- _class: quadrant -->', '', '`Effort 0–10`', '', '## X.', '', '- Group', '  - Item `5, 85`'].join('\n');
		const out = narrateQuadrant(md);
		expect(out).toBe('Effort 0–10. X. The vertical axis runs zero to one hundred. Group: Item at five, eighty-five.');
	});

	it("mirrors parseCoordPill's leading-digit quirk: a leading-dot decimal (`.5`) does not count as a coordinate (independent-checker finding)", () => {
		// quadrant.transform.js's parseCoordPill requires a coordinate part's
		// first character (after an optional sign) to be a DIGIT — `.5` (no
		// leading zero) fails that test even though parseFloat(".5") succeeds,
		// so it's dropped rather than counted, shifting `80` into the x slot and
		// leaving y at its 0 default. A real, if confusing, production quirk —
		// mirrored here rather than "fixed", since diverging would itself be a
		// narration-vs-render mismatch.
		const md = ['<!-- _class: quadrant -->', '', '## X.', '', '- Group', '  - Item `.5, 80`'].join('\n');
		const out = narrateQuadrant(md);
		expect(out).toContain('Group: Item at eighty, zero.');
	});
});

// narrateStateChartInference speaks ONLY the start/terminal facts the transform
// infers when the author didn't tag them explicitly — never restates a state
// that's already tagged `start`/`end`.
describe('narrateStateChartInference', () => {
	it('returns null for a non-state-chart slide', () => {
		expect(narrateStateChartInference('<!-- _class: kpi -->\n\n## X\n\n1. A\n2. B')).toBeNull();
	});

	it('returns null when start AND end are both already explicit', () => {
		// state-chart.manifest.json's own skeleton — state 1 `start`, state 6 `end`.
		const md = [
			'<!-- _class: state-chart -->',
			'',
			'## Document approval flow.',
			'',
			'1. Draft `start`',
			'   - `submit => 2`',
			'   - `discard => 6`',
			'2. Submitted `on-track`',
			'   - `review => 3`',
			'3. In Review',
			'   - `approve => 4`',
			'   - `reject => 1`',
			'   - `revise => self`',
			'4. Approved `done`',
			'   - `publish => 5`',
			'5. Published `live`',
			'   - `archive => 6`',
			'6. Archived `end`',
		].join('\n');
		expect(narrateStateChartInference(md)).toBeNull();
	});

	it('infers only the terminal state when start is explicit but end is not', () => {
		// state-chart.manifest.json's own `sample` — state 1 `start`; no state `end`,
		// and state 5 (Published) has no outgoing transition.
		const md = [
			'<!-- _class: state-chart lr -->',
			'',
			'## States connect; the arrows carry the rules.',
			'',
			'1. Draft `start`',
			'   - `submit => 2`',
			'2. Submitted `on-track`',
			'   - `review => 3`',
			'3. In Review `at-risk`',
			'   - `approve => 4`',
			'   - `reject => 1`',
			'   - `revise => self`',
			'4. Approved',
			'   - `publish => 5`',
			'5. Published',
		].join('\n');
		const out = narrateStateChartInference(md);
		expect(out).toBe('It ends at Published.');
	});

	it('infers both start and terminal states when neither is tagged', () => {
		const md = ['<!-- _class: state-chart -->', '', '## Flow.', '', '1. Draft', '   - `submit => 2`', '2. Review', '   - `approve => 3`', '3. Done'].join('\n');
		expect(narrateStateChartInference(md)).toBe('This flow starts at Draft. It ends at Done.');
	});

	it('lists multiple inferred terminal states with "and"', () => {
		const md = ['<!-- _class: state-chart -->', '', '## Flow.', '', '1. Start `start`', '   - `go => 2`', '   - `go => 3`', '2. Branch A', '3. Branch B'].join('\n');
		expect(narrateStateChartInference(md)).toBe('It ends at Branch A and Branch B.');
	});

	it('does not let an out-of-range transition target suppress terminal inference', () => {
		// Draft's only transition targets state 9, which doesn't exist among 3
		// states — the real transform marks that "(unresolved)" and does NOT
		// count it as outgoing, so Draft is STILL inferred as terminal too.
		const md = ['<!-- _class: state-chart -->', '', '## Flow.', '', '1. Draft `start`', "   - `submit => 9`", '2. Review', '3. Done'].join('\n');
		expect(narrateStateChartInference(md)).toBe('It ends at Draft, Review, and Done.');
	});

	it("keeps an unrelated trailing annotation in an inferred state's spoken label", () => {
		// Neither `start` nor `end` is tagged anywhere → state 1 infers as start;
		// its unrelated `port 8080` pill must stay part of the spoken label, the
		// same way state-chart.transform.js re-appends an unknown pill into the
		// rendered label rather than silently discarding it.
		const md = ['<!-- _class: state-chart -->', '', '## Flow.', '', '1. Config `port 8080`', '   - `next => 2`', '2. Done'].join('\n');
		expect(narrateStateChartInference(md)).toBe('This flow starts at Config port 8080. It ends at Done.');
	});

	it('does not include a status keyword pill in the spoken label (matches the real status-badge split)', () => {
		const md = ['<!-- _class: state-chart -->', '', '## Flow.', '', '1. Submitted `on-track`', '   - `go => 2`', '2. Done'].join('\n');
		expect(narrateStateChartInference(md)).toBe('This flow starts at Submitted. It ends at Done.');
	});
});

describe('narrateStateChart', () => {
	it('leads with the heading, then the inferred facts, then the rest via slideToSpeech', () => {
		// Heading-first matches every other narrator (a Munger-inversion review
		// flagged the original heading-last order as a real inconsistency).
		const md = ['<!-- _class: state-chart -->', '', '## Flow.', '', '1. Draft', '   - `submit => 2`', '2. Review', '   - `approve => 3`', '3. Done'].join('\n');
		const out = narrateStateChart(md);
		expect(out?.startsWith('Flow. This flow starts at Draft. It ends at Done.')).toBe(true);
		// The heading isn't ALSO spoken again as part of the slideToSpeech "rest".
		expect(out?.match(/Flow\./g)?.length).toBe(1);
	});

	it('returns null when there is nothing inferred to add', () => {
		const md = ['<!-- _class: state-chart -->', '', '## Flow.', '', '1. Draft `start`', '   - `submit => 2`', '2. Done `end`'].join('\n');
		expect(narrateStateChart(md)).toBeNull();
	});

	it('does not speak a fenced doc-example heading as the title, and does not lose the real heading (Munger-inversion finding)', () => {
		// Every other narrator fence-strips before reading the heading; this one
		// didn't — a slide with a fenced doc-example above the real chart (the
		// exact pattern narrateFunnel's own tests guard against) spoke the FAKE
		// fenced heading as the title and silently dropped the real one, a
		// confidently wrong fact replacing one the plain slideToSpeech baseline
		// gets right.
		const md = [
			'<!-- _class: state-chart -->',
			'',
			'```',
			'## Not the real heading (doc example)',
			'```',
			'',
			'## The real heading.',
			'',
			'1. Draft',
			'   - `submit => 2`',
			'2. Review',
			'   - `approve => 3`',
			'3. Done',
		].join('\n');
		const out = narrateStateChart(md);
		expect(out?.startsWith('The real heading. This flow starts at Draft. It ends at Done.')).toBe(true);
		expect(out).not.toContain('Not the real heading');
	});
});

describe('narrateChart', () => {
	it('recognizes a funnel slide', () => {
		expect(narrateChart('<!-- _class: funnel -->\n\n## Stages.\n\n- A `100`\n- B `50`')).toContain('fifty percent');
	});

	it('recognizes a weighted journey slide', () => {
		const md = ['<!-- _class: journey weighted -->', '', '## X.', '', '- Stage', '  - A `@me` `:3` `+9`', '  - B `@me` `:3` `+1`'].join('\n');
		expect(narrateChart(md)).toContain('ninety percent');
	});

	it('recognizes a state-chart slide with an inference to add', () => {
		const md = ['<!-- _class: state-chart -->', '', '## Flow.', '', '1. Draft', '   - `submit => 2`', '2. Done'].join('\n');
		expect(narrateChart(md)).toContain('This flow starts at Draft.');
	});

	it('returns null for a slide no narrator recognizes', () => {
		expect(narrateChart('<!-- _class: kpi -->\n\n## Revenue\n\nWe grew.')).toBeNull();
	});
});
