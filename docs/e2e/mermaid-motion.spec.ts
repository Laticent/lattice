import { expect, test } from './studio-fixture';

// ── Mermaid diagram motion, on the REAL Playground ────────────────────────────────────
//
// `motion: on` animates a Mermaid diagram the way it animates a chart
// (engineering/mermaid.md § 5.5). The unit tier covers each piece on its own — the roles
// `tagMermaidMotion` writes, the build order `chartToScene` derives, the host mounting a
// diagram when the runtime announces it — but none of them runs the real Mermaid, the real
// runtime and the real host together, and the one defect this feature had on the way in
// (the still diagram flashing for ~250 ms before the build) only existed in that join. So
// this drives the Playground itself, with the REAL Mermaid from the CDN the preview names —
// a stub would draw nothing to animate.
//
// Three claims, each with an oracle that can fail:
//   1. It BUILDS: every part is seen below full opacity, then settles at 1.
//   2. In ORDER: the subgraph box, then the nodes, then the arrows between them — although
//      Mermaid paints the arrows first.
//   3. With NO STILL FLASH: from the moment the fence flips to `rendered`, the drawn diagram is
//      never on screen un-hidden and un-mounted.

const SOURCE_KEY = 'lattice-docs-pg-source';
const SEEDED = 'e2e-mermaid-motion-seeded';

const DECK = `---
marp: true
theme: indaco
motion: on
---

<!-- _class: diagram -->

## A subgraph frames the boxes before the arrows arrive.

\`\`\`mermaid
flowchart LR
  subgraph Intake
    A[Request] --> B[Triage]
  end
  B --> C{Approve?}
  C --> D[Build]
\`\`\`
`;

test.beforeEach(async ({ context, page }) => {
	await context.route(/katex.*\.css($|\?)/, (route) => route.fulfill({ contentType: 'text/css', body: '' }));
	await context.route(/fonts\.googleapis|fonts\.gstatic/, (route) => route.fulfill({ contentType: 'text/css', body: '' }));
	// One-shot seed — the Playground navigates during startup, and an unguarded write re-seeds
	// mid-run (the trap playground-state.spec.ts documents).
	await page.addInitScript(
		([k, md, seeded]) => {
			if (localStorage.getItem(seeded)) return;
			localStorage.setItem(seeded, '1');
			localStorage.setItem(k, md);
		},
		[SOURCE_KEY, DECK, SEEDED] as const,
	);
});

interface Sample {
	drawn: boolean;
	/** The drawn diagram is on screen: rendered, not pre-hidden, not yet replaced by the live copy. */
	stillShowing: boolean;
	/** Opacity the painter wrote on each live part (null before its first frame), keyed by kind. */
	parts: { kind: 'cluster' | 'node' | 'edge'; opacity: number | null }[];
}

/** Sample the preview once per animation frame until the build settles (or `maxFrames`). */
function sampleBuild(page: import('@playwright/test').Page, maxFrames: number): Promise<Sample[]> {
	return page.evaluate(
		(max) =>
			new Promise<Sample[]>((resolve) => {
				const rows: Sample[] = [];
				let settledFor = 0;
				const tick = () => {
					const d = (document.querySelector('#preview') as HTMLIFrameElement | null)?.contentDocument;
					const pre = d?.querySelector('pre[data-mermaid-state]');
					const fig = d?.querySelector('.mermaid');
					const live = fig?.querySelector('.scene-live');
					const drawn = pre?.getAttribute('data-mermaid-state') === 'rendered';
					const hidden = !!fig && (fig.classList.contains('anima-prehide') || getComputedStyle(fig).visibility === 'hidden');
					const parts = live
						? Array.from(live.querySelectorAll('[data-anima-role]:not([data-anima-role="label"])')).map((el) => ({
								kind: (el.matches('g.cluster') ? 'cluster' : el.matches('g.node') ? 'node' : 'edge') as 'cluster' | 'node' | 'edge',
								opacity: el.getAttribute('opacity') === null ? null : Number(el.getAttribute('opacity')),
							}))
						: [];
					rows.push({ drawn, stillShowing: drawn && !hidden && !live, parts });
					settledFor = parts.length > 0 && parts.every((p) => p.opacity !== null && p.opacity >= 1) ? settledFor + 1 : 0;
					if (rows.length < max && settledFor < 10) requestAnimationFrame(tick);
					else resolve(rows);
				};
				requestAnimationFrame(tick);
			}),
		maxFrames,
	);
}

test('a Mermaid diagram builds in — box, then nodes, then arrows — with no still flash', async ({ page }) => {
	await page.goto('/playground/?view=edit', { waitUntil: 'domcontentloaded' });
	// Start sampling BEFORE the diagram draws, so the flash window is inside the record.
	await page.waitForFunction(() => !!(document.querySelector('#preview') as HTMLIFrameElement | null)?.contentDocument?.querySelector('.lattice'), null, {
		timeout: 45_000,
	});
	const rows = await sampleBuild(page, 1200);

	// Anti-vacuity: the real Mermaid drew, and the host mounted a live copy with every kind of part.
	expect(rows.some((r) => r.drawn), 'the real Mermaid drew the diagram').toBe(true);
	// A row counts once the painter has written every part. The one row before that is the mount's
	// own rendering step: the painter's first requestAnimationFrame writes opacity 0 in that same
	// step, before anything paints, so it is not a visible frame (the chart spec skips it the same way).
	const mounted = rows.filter((r) => r.parts.length > 0 && r.parts.every((p) => p.opacity !== null)) as {
		parts: { kind: 'cluster' | 'node' | 'edge'; opacity: number }[];
	}[];
	expect(mounted.length, 'the host mounted a live copy of the diagram').toBeGreaterThan(0);
	const kinds = new Set(mounted[0].parts.map((p) => p.kind));
	expect([...kinds].sort(), 'the live copy carries the subgraph, the nodes and the arrows').toEqual(['cluster', 'edge', 'node']);

	// 3. No still flash.
	expect(rows.filter((r) => r.stillShowing).length, 'frames showing the un-animated diagram').toBe(0);

	// 1. It builds, then settles.
	const n = mounted[0].parts.length;
	for (let i = 0; i < n; i++) {
		expect(mounted.some((r) => r.parts[i].opacity < 1), `part ${i} was seen mid-reveal`).toBe(true);
	}
	expect(mounted[mounted.length - 1].parts.every((p) => p.opacity >= 1), 'the build settles fully opaque').toBe(true);

	// 2. In order: the frame at which each KIND first reaches full opacity.
	const doneAt = (kind: 'cluster' | 'node' | 'edge'): number =>
		mounted.findIndex((r) => r.parts.filter((p) => p.kind === kind).every((p) => p.opacity >= 1));
	expect(doneAt('cluster'), 'the subgraph box completes before the nodes').toBeLessThan(doneAt('node'));
	expect(doneAt('node'), 'the nodes complete before the arrows').toBeLessThan(doneAt('edge'));
});
