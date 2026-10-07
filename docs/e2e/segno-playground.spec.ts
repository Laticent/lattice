import { expect, type Page, test } from '@playwright/test';

// The /segno grammar playground, driven through its hostile grammars in all three engines.
//
// WHAT IT PINS. The playground (src/pages/segno.astro) reads a grammar the visitor types, compiles
// it in a worker (src/lib/segno-playground-worker.ts) and parses with it. Four defenses keep a
// hostile grammar off the main thread, and each step below makes one of them answer:
//   · the READER's size cap (src/lib/segno-playground-grammar.ts, MAX_EXPANDED) refuses a grammar
//     that expands past 10,000 pieces before the compiler ever sees it — steps 4 and 5;
//   · the worker's REPLY caps send at most 50 problems and 256 KB of generated code, and withhold
//     a parse tree past 2,000 nodes or 100 levels — steps 7 to 10;
//   · every request gets a reply, so a crash says "does not build", not "too slow" — step 6;
//   · the page's 1.5 s TIME LIMIT (GRAMMAR_LIMIT_MS) terminates a runaway build, times only the
//     request in flight, and is not re-armed by typing — steps 11 and 13.
// Steps 1, 2, 3 and 12 are the controls: a preset still parses, a bad input still points at its
// character, a program is still a read error, and the page recovers after a stopped worker.
//
// WHY THREE ENGINES. The worker wiring is engine behavior: when `postMessage` overflows, whether
// a reply from a terminated worker is delivered, and how fast a structured clone of a deep tree
// runs all differ between Blink, Gecko and WebKit. PR #2573 drove these 13 steps on Chromium only.
//
// TAGGING. A title naming `@webkit-tablet` is excluded from `desktop` unless it also says
// `@crosswidth`, and `@crosswidth` would add the `mobile` project too: a second Chromium run of a
// test that sets its own viewport, so it would only repeat `desktop`. So each width is declared
// twice, the house pattern from code-packages.spec.ts: the ` @gecko` twin runs on `desktop`
// (Chromium) and `gecko` (Firefox); the ` @webkit-tablet` twin runs on `webkit-tablet` (WebKit).
// Each of the three engines runs each width exactly once.
//
// TIME BOUNDS ARE LOOSE ON PURPOSE. The steps assert WHICH defense answered — the reader before
// the timer (well under 1.4 s), the timer itself (between 1.4 s and 4 s after the edit: a 150 ms
// typing debounce plus the 1.5 s limit) — never an exact time. The measured times go in the
// per-step table this spec prints and attaches, which is the evidence a PR quotes.

type Row = { step: number; what: string; result: string; ms?: number };

const WIDTHS = [1440, 820, 390] as const;
const HEIGHT: Record<(typeof WIDTHS)[number], number> = { 1440: 900, 820: 1180, 390: 844 };

// ── The hostile grammars, each the case a checker pass on PR #2573 found ──

const forLoop = 'for (;;) {}';

// Under 1 KB of text, 2^28 pieces once each reused name is counted where it is used.
function doublingChain(levels = 28): string {
	const lines = ["const c0 = seq('a', 'b');"];
	for (let n = 1; n <= levels; n++) lines.push(`const c${n} = seq(c${n - 1}, c${n - 1});`);
	return `${lines.join('\n')}\nreturn { start: 's', rules: { s: c${levels} } };`;
}

// One 20,000-character literal used 2,501 times: before strings were charged by length, this
// generated 100 MB of code that the page put in the DOM.
const bigLiteral = `const s = lit('${'x'.repeat(20_000)}');\nreturn { start: 'r', rules: { r: seq(${'s, '.repeat(2_500)}s) } };`;

// `compile` accepts a numeric start (rules['1'] exists), then `parse` throws inside the worker.
const numericStart = "return { start: 1, rules: { '1': lit('a') } };";

// 300 alternatives that all start with "a": one problem per overlapping pair, 300 × 299 / 2 = 44,850.
const alt300 = `return { start: 'r', rules: { r: ref('k'), k: alt(${"seq('a', 'b'), ".repeat(299)}seq('a', 'b')) } };`;

// A cheap helper reused to just under the size cap: chars() of 61 characters, 4,801 times.
const charSet = Array.from({ length: 63 }, (_, i) => String.fromCharCode(0x21 + i))
	.join('')
	.replace(/['\\]/g, '');
const chars4800 = `const s = chars('${charSet}');\nreturn { start: 'r', rules: { r: seq(${'s, '.repeat(4_800)}s) } };`;

// Rules of node() nested 60 deep, each ending in the next rule: every character of text makes
// rules × 60 nodes in one chain. 8 rules × 200 characters is 96,000 nodes; 40 rules is 2,400 deep.
function nestedNodes(rules: number): string {
	const body = (i: number) => `${"node('a', ".repeat(60)}${i + 1 < rules ? `ref('r${i + 1}')` : "lit('x')"}${')'.repeat(60)}`;
	const ruleList = Array.from({ length: rules }, (_, i) => `r${i}: ${body(i)}`).join(',\n');
	return `return { start: 's', rules: { s: many1(ref('r0')),\n${ruleList} } };`;
}

// 3,000 literals sharing a first letter, about 27 KB: Segno's compiler takes many seconds on it
// (measured 22 s in Node), so only the page's time limit can answer it.
const alt3000 = `return { start: 'r', rules: { r: alt(${Array.from({ length: 3_000 }, (_, i) => `'w${String(i).padStart(4, '0')}'`).join(', ')}) } };`;

// ── Page helpers ──

const PARSES = 'Compiles, and this text parses.';
const STOPPED = /took longer than 1\.5 s to build this grammar, so it was stopped/;
const TOO_BIG = 'The tree has more than 2,000 nodes or is more than 100 levels deep, so it is not drawn here.';

// Arm a watch BEFORE the edit: it notes when the grammar box fires `input` and when the verdict
// first reads `pattern`. The verdict is replaced, never appended, so a stale match cannot fire it.
async function arm(page: Page, pattern: RegExp): Promise<void> {
	await page.evaluate(
		([source, flags]) => {
			const w = window as unknown as { __segno: { t0: number | null; t1: number | null; text: string } };
			const watch = { t0: null as number | null, t1: null as number | null, text: '' };
			w.__segno = watch;
			const re = new RegExp(source, flags);
			const code = document.querySelector('#gramCode') as HTMLTextAreaElement;
			const input = document.querySelector('#gramInput') as HTMLInputElement;
			const start = () => {
				if (watch.t0 === null) watch.t0 = performance.now();
			};
			code.addEventListener('input', start, { once: true, capture: true });
			input.addEventListener('input', start, { once: true, capture: true });
			const verdict = document.querySelector('#gramVerdict') as HTMLElement;
			const mo = new MutationObserver(() => {
				const text = verdict.textContent ?? '';
				if (watch.t1 === null && re.test(text)) {
					watch.t1 = performance.now();
					watch.text = text;
					mo.disconnect();
				}
			});
			mo.observe(verdict, { childList: true, subtree: true, characterData: true });
		},
		[pattern.source, pattern.flags] as const,
	);
}

// Wait for the armed verdict and return the milliseconds from the edit's `input` to it.
async function landed(page: Page, timeout = 15_000): Promise<{ ms: number; text: string }> {
	const handle = await page.waitForFunction(
		() => {
			const w = (window as unknown as { __segno?: { t0: number | null; t1: number | null; text: string } }).__segno;
			return w && w.t1 !== null ? { ms: w.t1 - (w.t0 ?? w.t1), text: w.text } : null;
		},
		undefined,
		{ timeout, polling: 20 },
	);
	return (await handle.jsonValue()) as { ms: number; text: string };
}

const fmtMs = (ms?: number) => (ms === undefined ? '' : `${(ms / 1000).toFixed(2)} s`);

function table(project: string, width: number, rows: Row[]): string {
	const head = `/segno playground — ${project} @ ${width}px`;
	const lines = rows.map((r) => `| ${String(r.step).padStart(2)} | ${r.what} | ${r.result} | ${fmtMs(r.ms)} |`);
	return [head, '| # | step | result | time |', '|---|---|---|---|', ...lines].join('\n');
}

for (const tag of [' @gecko', ' @webkit-tablet']) {
	for (const width of WIDTHS) {
		test(`the /segno playground answers every hostile grammar at ${width}px${tag}`, async ({ page }, testInfo) => {
			test.setTimeout(240_000);
			await page.setViewportSize({ width, height: HEIGHT[width] });
			const pageErrors: string[] = [];
			page.on('pageerror', (e) => pageErrors.push(e.message));

			const rows: Row[] = [];
			const record = (row: Row) => {
				rows.push(row);
				testInfo.annotations.push({ type: `step ${row.step}`, description: `${row.what}: ${row.result}${row.ms === undefined ? '' : ` (${fmtMs(row.ms)})`}` });
			};

			const code = page.locator('#gramCode');
			const input = page.locator('#gramInput');
			const verdict = page.locator('#gramVerdict');
			const tree = page.locator('#gramTree');
			const gen = page.locator('#gramGen');

			// Fill the grammar box and return how long the page took to reach `pattern`.
			const editGrammar = async (src: string, pattern: RegExp, timeout?: number) => {
				await arm(page, pattern);
				await code.fill(src);
				return landed(page, timeout);
			};

			try {
				await page.goto('/segno', { waitUntil: 'domcontentloaded' });

				// 1 — the first preset compiles on load and its first sample parses, tree drawn.
				await test.step('1 a preset parses', async () => {
					await expect(verdict).toHaveText(PARSES, { timeout: 30_000 });
					await expect(tree.locator('.k').first()).toHaveText('setting');
					record({ step: 1, what: 'a preset parses', result: `parses, ${await tree.locator('li').count()} tree nodes drawn` });
				});

				// 2 — the preset's second sample: after `width=12; ` a letter is expected, found `=`.
				await test.step('2 a bad input reports character 10', async () => {
					await page.locator('#gramSamples button', { hasText: 'width=12; =red' }).click();
					await expect(verdict).toContainText('this text stops at character 10');
					record({ step: 2, what: 'a bad input reports character 10', result: 'stops at character 10' });
				});

				// 3 — the box is read as data, so a program is a read error with a line and column.
				await test.step('3 `for (;;) {}` is a read error', async () => {
					await editGrammar(forLoop, /does not read/);
					await expect(verdict).toContainText('Your grammar does not read: line 1, column 1: expected `const` or `return`, found `for`');
					record({ step: 3, what: '`for (;;) {}` is a read error', result: 'does not read: line 1, column 1' });
				});

				// 4 — the doubling chain is refused by the reader, long before the time limit.
				await test.step('4 the 28-level doubling chain is refused fast', async () => {
					const src = doublingChain(28);
					expect(src.length).toBeLessThan(1024);
					const { ms } = await editGrammar(src, /expands to more than 10,000 pieces/);
					expect(ms).toBeLessThan(1_400);
					record({ step: 4, what: 'the 28-level doubling chain is refused by the size cap', result: 'expands to more than 10,000 pieces', ms });
				});

				// 5 — a 20,000-character literal is charged by its length.
				await test.step('5 the 20k-literal grammar is refused by the size cap', async () => {
					const { ms } = await editGrammar(bigLiteral, /expands to more than 10,000 pieces/);
					expect(ms).toBeLessThan(1_400);
					record({ step: 5, what: 'the 20k-literal grammar is refused by the size cap', result: 'expands to more than 10,000 pieces', ms });
				});

				// 6 — a parse that throws inside the worker is reported as a crash, at once.
				await test.step('6 a numeric start does not build', async () => {
					const { ms } = await editGrammar(numericStart, /does not build/);
					await expect(verdict).toHaveText('Your grammar does not build: segno: no rule "1"');
					expect(ms).toBeLessThan(1_400);
					record({ step: 6, what: 'a numeric `start` does not build', result: 'does not build: segno: no rule "1"', ms });
				});

				// 7 — 44,850 problems reach the page as 50 plus a count.
				await test.step('7 the 300-alternative refusal is capped at 50 problems', async () => {
					const { ms } = await editGrammar(alt300, /^Refused/);
					await expect(verdict).toContainText('… and 44,800 more');
					// The verdict is the heading, then one text node per problem shown, then the count.
					const shown = await verdict.evaluate((v) => v.childNodes.length - 2);
					expect(shown).toBe(50);
					record({ step: 7, what: 'the 300-alternative refusal', result: `${shown} problems + "… and 44,800 more"`, ms });
				});

				// 8 — generated code is cut at 256 KB with a note saying how much was left out.
				await test.step('8 chars() ×4,800 has its generated code capped', async () => {
					await editGrammar(chars4800, /^Compiles/);
					await expect(gen).toContainText('more characters not shown');
					const length = await gen.evaluate((g) => (g.textContent ?? '').length);
					expect(length).toBeGreaterThan(256 * 1024);
					expect(length).toBeLessThan(256 * 1024 + 100);
					record({ step: 8, what: 'chars() ×4,800 generated code', result: `capped at ${length.toLocaleString('en-US')} characters` });
				});

				// 9 — 200 characters make a 96,000-node tree: it parses, and is not drawn.
				await test.step('9 the 96,000-node tree parses and is not drawn', async () => {
					await input.fill('x'.repeat(200));
					const { ms } = await editGrammar(nestedNodes(8), /^Compiles, and this text parses\.$/);
					await expect(tree).toHaveText(TOO_BIG);
					expect(await tree.locator('li').count()).toBe(0);
					record({ step: 9, what: 'the 96,000-node tree', result: 'parses, not drawn', ms });
				});

				// 10 — one character makes a 2,400-deep tree, which overflowed postMessage before the cap.
				await test.step('10 the 2,400-deep tree parses and is not drawn', async () => {
					await input.fill('x');
					const { ms } = await editGrammar(nestedNodes(40), /^Compiles, and this text parses\.$/);
					await expect(tree).toHaveText(TOO_BIG);
					await expect(verdict).not.toContainText('does not build');
					record({ step: 10, what: 'the 2,400-deep tree', result: 'parses, not drawn', ms });
				});

				// 11 — a grammar Segno is slow to compile is stopped by the time limit.
				await test.step('11 an alt() of 3,000 literals is stopped by the timer', async () => {
					const { ms } = await editGrammar(alt3000, STOPPED, 20_000);
					await expect(tree).toContainText('only that worker was stopped; this page kept running');
					expect(ms).toBeGreaterThan(1_400);
					expect(ms).toBeLessThan(4_000);
					record({ step: 11, what: 'an alt() of 3,000 literals', result: 'stopped by the 1.5 s timer', ms });
				});

				// 12 — the page starts a fresh worker, and a preset works again.
				await test.step('12 a preset parses again afterwards', async () => {
					await arm(page, /^Compiles, and this text parses\.$/);
					await page.locator('#gramPresets button', { hasText: 'Date range' }).click();
					await landed(page);
					await expect(tree.locator('.k').first()).toHaveText('date');
					record({ step: 12, what: 'a preset parses again afterwards', result: 'parses, tree drawn' });
				});

				// 13 — typing in the text box every 250 ms does not re-arm the timer on a runaway build.
				await test.step('13 typing during a runaway still stops it', async () => {
					await arm(page, STOPPED);
					await code.fill(alt3000);
					let keys = 0;
					const deadline = Date.now() + 10_000;
					while (Date.now() < deadline && !STOPPED.test((await verdict.textContent()) ?? '')) {
						await input.press('a');
						keys += 1;
						await page.waitForTimeout(250);
					}
					const { ms } = await landed(page, 1_000);
					expect(keys).toBeGreaterThan(3);
					expect(ms).toBeGreaterThan(1_400);
					expect(ms).toBeLessThan(4_000);
					record({ step: 13, what: 'typing every 250 ms during a runaway', result: `stopped after ${keys} keystrokes`, ms });
				});

				expect(pageErrors, 'no page errors').toEqual([]);
			} finally {
				const out = table(testInfo.project.name, width, rows);
				console.log(`${out}\npage errors: ${pageErrors.length}`);
				await testInfo.attach(`segno-steps-${width}`, { body: out, contentType: 'text/markdown' });
			}
		});
	}
}
