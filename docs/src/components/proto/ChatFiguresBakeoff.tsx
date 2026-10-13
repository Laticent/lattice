import * as React from 'react';
import type { SingleSlideOptions } from '@/lib/single-slide-render';
import DeckPreview from '../DeckPreview';
import { projectDeckArticle } from '../studio/article-projection';
import { PooledThumbFace, PreviewPool } from '../studio/preview-pool';

// ISOLATED PROTOTYPE — the chat-figures bake-off (engineering/decisions/2026-10-12-chat-figures-bakeoff.md).
//
// One question: when a chat reply carries a ```mermaid / ```math / ```functionplot fence or a whole
// slide, how should the bubble draw it? Four strategies are mounted here against the SAME sources so
// `tools/chat-figures-bakeoff.mjs` can measure them in a real browser:
//
//   eager     one <DeckPreview> (one iframe + document) per figure, all mounted — the naive baseline
//   pool      the Studio's own PreviewPool: a small set of re-pointed frames, one pool per scroller
//   bake      projectDeckArticle (Read · Article's path): render, bake, sanitize → inline SVG in the DOM
//   bake-img  the baked SVG as a data-URL <img>: no live nodes at all (a blob: URL would be the
//             same measurement but a new createObjectURL site for download.test.ts's census)
//
// Route: /proto/chat-figures/?strategy=eager|pool|bake|bake-img&kind=mermaid|math|plot|slide&n=10
// Delete this file, its page and the tool to revert; nothing else imports it.

type Kind = 'mermaid' | 'math' | 'plot' | 'slide';
type Strategy = 'eager' | 'pool' | 'bake' | 'bake-img';

const FM = '---\ntheme: indaco\n---\n\n';

const BODY: Record<Kind, (i: number) => string> = {
	mermaid: (i) => `<!-- _class: diagram -->\n\n## Figure ${i}\n\n\`\`\`mermaid\nflowchart LR\n  A["Raw ${i}"] --> B["Classify"]\n  B --> C["Score"]\n  C --> D["Decision"]\n  D -.->|retro| B\n  B --> E["Archive"]\n  E --> F["Report"]\n\`\`\`\n`,
	math: (i) => `<!-- _class: content -->\n\n## Figure ${i}\n\n$$\n\\int_0^\\infty e^{-x^2}\\,dx = \\frac{\\sqrt{\\pi}}{2} + ${i}\n$$\n\nAnd inline $\\sum_{k=1}^{n} k = \\frac{n(n+1)}{2}$.\n`,
	plot: (i) => `<!-- _class: content -->\n\n## Figure ${i}\n\n\`\`\`functionplot\n{ "data": [{ "fn": "x^2 + ${i}" }, { "fn": "sin(x) * ${i}" }] }\n\`\`\`\n`,
	slide: (i) => `<!-- _class: cards-grid -->\n\n## Four moves to the boardroom ${i}\n\n- Write\n  - Plain Markdown, headings, lists.\n- Choose\n  - A layout per slide.\n- Check\n  - The engine lints and fits.\n- Ship\n  - One PDF, one link.\n`,
};
const source = (kind: Kind, i: number) => FM + BODY[kind](i);
const drawnFor = (kind: Kind) => kind === 'mermaid' || kind === 'plot';

const settled = (el: Element, kind: Kind, strategy: Strategy): boolean => {
	if (strategy === 'bake-img') {
		const i = el.querySelector('img');
		return !!i && i.complete && i.naturalWidth > 0;
	}
	if (el instanceof HTMLIFrameElement) {
		const d = el.contentDocument;
		if (!d) return false;
		if (kind === 'math') return !!d.querySelector('.katex');
		if (kind === 'slide') return !!d.querySelector('section');
		return !!d.querySelector('section svg');
	}
	if (kind === 'math') return !!el.querySelector('.katex');
	if (kind === 'slide') return !!el.querySelector('section, .lp-slide, h2');
	return !!el.querySelector('svg') || (el instanceof HTMLImageElement && el.complete && el.naturalWidth > 0);
};

type Baked = { html: string; css: string; img?: string };

export default function ChatFiguresBakeoff({ options }: { options: SingleSlideOptions }) {
	const q = React.useMemo(() => new URLSearchParams(location.search), []);
	// Query values are checked against fixed lists before they pick a function or a branch: an
	// arbitrary `?kind=` must never name a property to call.
	const pick = <T extends string>(v: string | null, allowed: readonly T[], fallback: T): T => allowed.find((a) => a === v) ?? fallback;
	const strategy = pick(q.get('strategy'), ['eager', 'pool', 'bake', 'bake-img'] as const, 'eager');
	const kind = pick(q.get('kind'), ['mermaid', 'math', 'plot', 'slide'] as const, 'mermaid');
	const n = Math.min(200, Math.max(0, Math.floor(Number(q.get('n') || 10)) || 0));
	const scrollRef = React.useRef<HTMLDivElement>(null);
	const [baked, setBaked] = React.useState<(Baked | null)[]>(() => Array.from({ length: n }, () => null));
	const t0 = React.useRef(performance.now());

	// The bake strategies: one projection per figure, run with a small concurrency (the capture
	// frame is a real iframe, so an unbounded fan-out would measure the thread pool, not the bake).
	React.useEffect(() => {
		if (strategy !== 'bake' && strategy !== 'bake-img') return;
		let live = true;
		const per: number[] = [];
		(async () => {
			let next = 0;
			const worker = async () => {
				for (;;) {
					const i = next++;
					if (i >= n || !live) return;
					const s = performance.now();
					const out = await projectDeckArticle(options, source(kind, i + 1));
					per[i] = performance.now() - s;
					let img: string | undefined;
					if (strategy === 'bake-img') {
						const svg = new DOMParser().parseFromString(`<div>${out.articleHtml}</div>`, 'text/html').querySelector('svg');
						if (svg) {
							if (!svg.getAttribute('xmlns')) svg.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
							img = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg.outerHTML)}`;
						}
					}
					if (live) setBaked((cur) => cur.map((b, k) => (k === i ? { html: out.articleHtml, css: out.css, img } : b)));
				}
			};
			await Promise.all([worker(), worker()]);
			(window as unknown as { __bakePer?: number[] }).__bakePer = per;
		})();
		return () => {
			live = false;
		};
	}, [strategy, kind, n, options]);

	// Settle detection — polled, because the drawn figures settle inside iframes the page cannot
	// subscribe to. `expected` is every figure for the all-mounted strategies, and the tiles in (or
	// within the pool's 150px band of) the viewport for the pool.
	React.useEffect(() => {
		const out = ((window as unknown as { __bake?: unknown }).__bake = { done: false, tFirst: 0, tSettled: 0, settled: 0, expected: 0, iframes: 0, per: [] as number[] } as Record<string, unknown>);
		const iv = setInterval(() => {
			const root = scrollRef.current;
			if (!root) return;
			const figs = [...root.querySelectorAll('[data-fig]')] as HTMLElement[];
			const rr = root.getBoundingClientRect();
			const expectedFigs = strategy === 'pool' ? figs.filter((f) => f.getBoundingClientRect().bottom > rr.top - 150 && f.getBoundingClientRect().top < rr.bottom + 150) : figs;
			const frames = strategy === 'pool' ? ([...root.querySelectorAll('iframe')] as Element[]) : [];
			let ok = 0;
			if (strategy === 'pool') ok = frames.filter((f) => settled(f, kind, strategy)).length;
			else for (const f of expectedFigs) if (settled(strategy === 'eager' ? (f.querySelector('iframe') ?? f) : f, kind, strategy)) ok++;
			const now = performance.now() - t0.current;
			if (ok > 0 && !out.tFirst) out.tFirst = now;
			out.settled = ok;
			out.expected = expectedFigs.length;
			out.iframes = document.querySelectorAll('iframe').length;
			if (ok >= expectedFigs.length && expectedFigs.length > 0 && !out.done) {
				out.tSettled = now;
				out.done = true;
			}
		}, 50);
		return () => clearInterval(iv);
	}, [strategy, kind]);

	const figure = (i: number) => {
		const cls = 'aspect-video w-full overflow-hidden';
		if (strategy === 'eager') return <DeckPreview options={options} sample={source(kind, i + 1)} drawn={drawnFor(kind)} frame="stage" className={`${cls} relative`} aria-label={`Figure ${i + 1}`} />;
		if (strategy === 'pool') return <PooledThumbFace options={options} sample={source(kind, i + 1)} drawn={drawnFor(kind)} className={cls} />;
		const b = baked[i];
		if (!b) return <div className={`${cls} grid place-items-center text-xs opacity-60`}>baking…</div>;
		if (strategy === 'bake-img') return b.img ? <img src={b.img} alt={`Figure ${i + 1}`} className="w-full" /> : <div className="text-xs">no svg</div>;
		// biome-ignore lint/security/noDangerouslySetInnerHtml: `projectDeckArticle` returns markup it has already sanitized (its header); this isolated harness measures that path as shipped.
		return <div className="st-read-article" dangerouslySetInnerHTML={{ __html: b.html }} />;
	};

	const css = baked.find((b) => b)?.css;
	const list = Array.from({ length: n }, (_, i) => (
		// biome-ignore lint/suspicious/noArrayIndexKey: fixed-length harness list.
		<div key={i} data-fig={i} className="w-[360px] shrink-0">
			{figure(i)}
		</div>
	));
	return (
		<div className="lx-ui p-3 font-sans text-sm">
			{css && strategy === 'bake' ? <style>{css}</style> : null}
			<div className="mb-2">
				{strategy} · {kind} · n={n}
			</div>
			<div ref={scrollRef} id="scroller" className="flex h-[560px] w-[400px] flex-col gap-3 overflow-y-auto border border-[var(--border)] p-2">
				{strategy === 'pool' ? <PreviewPool className="flex flex-col gap-3">{list}</PreviewPool> : list}
			</div>
		</div>
	);
}
