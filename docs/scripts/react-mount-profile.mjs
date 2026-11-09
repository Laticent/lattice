// What React renders before the Studio's first slide, by subtree, on the phone profile.
//
// It answers "which part of the shell's hydration costs what" (followup 2868-p1, the React-hydration item in
// engineering/decisions/2026-11-08-studio-phone-editor-after-pause.md §6). A CPU profile cannot: the time sits in React's
// reconciler, not in any one component. React DOM's PROFILING build stamps every fiber with the time its own render took
// (`selfBaseDuration`), so this script builds the site against it and reads the fibers back.
//
//   LATTICE_REACT_PROFILE=1 npm run build:e2e      # astro.config.mjs swaps react-dom/client for react-dom/profiling
//   npm run preview:e2e &                           # or any static server over dist/
//   RUNS=5 node scripts/react-mount-profile.mjs     # Studio on :4321, phone profile (390 px, 4x CPU, 80 ms, 6 Mbit/s)
//
// How it reads the fibers: an init script installs a minimal `__REACT_DEVTOOLS_GLOBAL_HOOK__` before any page script runs.
// React calls its `onCommitFiberRoot` after every commit; the hook walks the committed tree (not below a fiber whose child
// pointer is unchanged: React skipped that subtree) and, for each fiber that did work in that commit (a mount, or a
// component with React's PerformedWork flag, or a host node whose props changed), adds
// the fiber's `selfBaseDuration` to every named-component ancestor on its path. That gives an INCLUSIVE render cost per
// subtree path ("StudioShell > PhoneDock > SlideStrip"). Commits are split at the first slide: the moment the preview frame
// holds a `.lattice` document, the same signal startup-bench.mjs uses.
//
// What it measures, and what it does not:
//   - The RENDER phase only (calling components, diffing, creating host nodes). The commit phase (DOM insertion, layout
//     effects, useEffect bodies) is not per-fiber in React's profiler; the report prints main-thread busy time beside the
//     render total so the gap is visible.
//   - The profiling build is a little slower than production; compare subtrees with each other, not with Lighthouse ms.
//   - Times are at 4x CPU throttling, as Lighthouse's mobile profile.
//
// Env: URL (default http://localhost:4321/studio/), RUNS (5), FRAME (the preview iframe selector), DEPTH (tree depth, 6),
// MIN_MS (hide subtrees under this median, 5), JSON=1 (one JSON line with every run).
import { chromium } from '@playwright/test';

const URL = process.env.URL || 'http://localhost:4321/studio/';
const RUNS = Number(process.env.RUNS || 5);
const FRAME = process.env.FRAME || '[aria-label="Live deck preview"] iframe.live';
const DEPTH = Number(process.env.DEPTH || 6);
const MIN_MS = Number(process.env.MIN_MS || 5);
const GIVE_UP = Number(process.env.GIVE_UP || 60_000);
// CPU=1 also records a CDP CPU profile up to the slide and splits it by React phase (see cpuSplit below).
const CPU = process.env.CPU === '1' || !!process.env.DRILL;
// DRILL=<text> (implies CPU=1): what the frame whose label contains <text> spends its time calling.
const DRILL = process.env.DRILL || '';

// Runs in the page before any of its scripts. Kept dependency-free: it is serialized into the page.
function installHook(frameSel) {
	const PerformedWork = 1;
	const name = (f) => {
		const t = f.type;
		if (t == null || typeof t === 'string') return null;
		if (typeof t === 'function') return t.displayName || t.name || 'Anonymous';
		if (typeof t === 'object') {
			if (t.displayName) return t.displayName;
			const inner = t.render || t.type; // forwardRef / memo
			if (inner) return `${inner.displayName || inner.name || 'Anonymous'}${t.render ? '' : ' (memo)'}`;
			if (t._context || t.Provider || t.$$typeof) return null; // context providers and consumers: not a subtree anyone names
		}
		return null;
	};
	const did = (f) => {
		const a = f.alternate;
		if (a == null) return true;
		if (typeof f.type === 'function' || (f.type && typeof f.type === 'object')) return (f.flags & PerformedWork) === PerformedWork;
		return f.memoizedProps !== a.memoizedProps || f.memoizedState !== a.memoizedState;
	};
	// React 19.2's profiling build also writes every component to Chrome's Performance panel ("Components" track) through
	// console.timeStamp, and that logging cost about 290 ms of the passive-effect phase per load here, work a production
	// build never does. React decides once, when its module loads, from whether console.timeStamp is a function; hiding it
	// first turns the track off and leaves the fiber timings intact.
	console.timeStamp = undefined;
	const S = { commits: [], slideAt: null, roots: 0, rootList: [], visible: null };
	window.__reactMount = S;
	const rootIds = new WeakMap();
	window.__REACT_DEVTOOLS_GLOBAL_HOOK__ = {
		supportsFiber: true,
		renderers: new Map(),
		inject(r) {
			const id = this.renderers.size + 1;
			this.renderers.set(id, r);
			return id;
		},
		checkDCE() {},
		onScheduleFiberRoot() {},
		onCommitFiberUnmount() {},
		onPostCommitFiberRoot() {},
		onCommitFiberRoot(_id, root) {
			const t = performance.now();
			if (!rootIds.has(root)) {
				rootIds.set(root, ++S.roots);
				S.rootList.push(root);
			}
			const bySub = {};
			const selfSub = {};
			const byName = {};
			let total = 0;
			let fibers = 0;
			// Iterative walk; the stack carries the named-component path down to each fiber.
			const stack = [[root.current, []]];
			while (stack.length) {
				const [f, path] = stack.pop();
				const n = name(f);
				const here = n ? [...path, n] : path;
				if (did(f) && f.selfBaseDuration > 0) {
					const d = f.selfBaseDuration;
					total += d;
					fibers++;
					let key = '';
					for (const seg of here) {
						key = key ? `${key} > ${seg}` : seg;
						bySub[key] = (bySub[key] || 0) + d;
					}
					if (!here.length) bySub['(no component)'] = (bySub['(no component)'] || 0) + d;
					// SELF: the fiber's time goes to its nearest named component only (host nodes count for the component
					// that renders them). BY NAME: the same, summed over every instance of that component.
					const own = key || '(no component)';
					selfSub[own] = (selfSub[own] || 0) + d;
					const nm = here.length ? here[here.length - 1] : '(no component)';
					byName[nm] = (byName[nm] || 0) + d;
				}
				// A subtree React skipped keeps the previous commit's fiber objects, flags and all, so
				// counting them would bill an old render again. React DevTools reads the same signal: if the
				// fiber's child pointer is the one its alternate had, nothing below it rendered this commit.
				if (f.alternate && f.child === f.alternate.child) continue;
				for (let c = f.child; c; c = c.sibling) stack.push([c, here]);
			}
			S.commits.push({ t, root: rootIds.get(root), total, fibers, bySub, selfSub, byName, beforeSlide: S.slideAt == null });
		},
	};
	// At the slide: which subtree paths own at least one host element a reader can see (a box with size, inside the
	// phone viewport, not visibility:hidden, not under opacity 0). A subtree with none rendered work the phone does not show.
	const shown = (el) => {
		const r = el.getBoundingClientRect();
		if (r.width <= 0 || r.height <= 0 || r.bottom <= 0 || r.right <= 0 || r.top >= innerHeight || r.left >= innerWidth) return false;
		if (getComputedStyle(el).visibility === 'hidden') return false;
		for (let e = el; e; e = e.parentElement) if (getComputedStyle(e).opacity === '0') return false;
		return true;
	};
	const visibility = () => {
		const vis = {};
		for (const root of S.rootList) {
			const stack = [[root.current, []]];
			while (stack.length) {
				const [f, path] = stack.pop();
				const n = name(f);
				const here = n ? [...path, n] : path;
				let key = '';
				const keys = here.map((seg) => (key = key ? `${key} > ${seg}` : seg));
				for (const k of keys) if (!(k in vis)) vis[k] = false;
				if (typeof f.type === 'string' && f.stateNode instanceof Element && keys.some((k) => !vis[k]) && shown(f.stateNode)) for (const k of keys) vis[k] = true;
				for (let c = f.child; c; c = c.sibling) stack.push([c, here]);
			}
		}
		return vis;
	};
	// The first slide: the preview frame holds a .lattice document. Polled per frame, recorded once.
	const poll = () => {
		const d = document.querySelector(frameSel)?.contentDocument;
		if (d?.querySelector('.lattice')) {
			S.slideAt = performance.now();
			S.visible = visibility();
		} else requestAnimationFrame(poll);
	};
	requestAnimationFrame(poll);
}

const median = (xs) => {
	const s = [...xs].sort((a, b) => a - b);
	const m = s.length >> 1;
	return s.length ? (s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2) : 0;
};

// The fiber timings cover React's render phase only. A CPU profile covers the rest: each sample is billed to the INNERMOST
// React phase on its stack (render, commit, or passive effects; anything else is "outside React"), and inside a phase to
// the first frame that is not React DOM's (the component or effect doing the work). A function the bundler renamed on a
// collision (`commitRoot$1`) still matches.
const PHASES = [
	['effects', /^(flushPassiveEffects|flushPassiveEffectsImpl)(\$\d+)?$/],
	['commit', /^(commitRoot|commitRootImpl|flushMutationEffects|flushLayoutEffects|flushSpawnedWork)(\$\d+)?$/],
	['render', /^(workLoopSync|workLoopConcurrent|workLoopConcurrentByScheduler|renderRootSync|renderRootConcurrent)(\$\d+)?$/],
];
function cpuSplit(profile, untilUs) {
	const byId = new Map(profile.nodes.map((n) => [n.id, n]));
	const parent = new Map();
	for (const n of profile.nodes) for (const c of n.children || []) parent.set(c, n.id);
	const label = (cf) => `${cf.functionName || '(anonymous)'} ${cf.url.split('/').pop()}:${cf.lineNumber + 1}:${cf.columnNumber + 1}`;
	const phase = { render: 0, commit: 0, effects: 0, outside: 0, program: 0, idle: 0 };
	const reactLeaf = { render: {}, commit: {}, effects: {} };
	const inPhase = { render: {}, commit: {}, effects: {} };
	const shellCallees = {};
	const drill = {};
	let shellMs = 0;
	let t = profile.startTime;
	for (let i = 0; i < profile.samples.length; i++) {
		t += profile.timeDeltas[i];
		if (t > untilUs) break;
		const dt = (profile.timeDeltas[i + 1] ?? 0) / 1000;
		const stack = []; // leaf first
		for (let id = profile.samples[i]; id != null; id = parent.get(id)) stack.push(byId.get(id).callFrame);
		const leaf = stack[0].functionName;
		if (leaf === '(idle)' || leaf === '(program)' || leaf === '(garbage collector)') {
			phase[leaf === '(garbage collector)' ? 'outside' : leaf === '(program)' ? 'program' : 'idle'] += dt;
			continue;
		}
		let hit = null;
		for (let k = 0; k < stack.length && !hit; k++) for (const [ph, re] of PHASES) if (re.test(stack[k].functionName)) { hit = [ph, k]; break; }
		if (!hit) { phase.outside += dt; continue; }
		const [ph, k] = hit;
		phase[ph] += dt;
		const reactUrl = stack[k].url;
		let who = '(React DOM itself)';
		for (let j = k - 1; j >= 0; j--) if (stack[j].url !== reactUrl) { who = label(stack[j]); break; }
		inPhase[ph][who] = (inPhase[ph][who] || 0) + dt;
		if (who === '(React DOM itself)') reactLeaf[ph][label(stack[0])] = (reactLeaf[ph][label(stack[0])] || 0) + dt;
		// DRILL=<text>: for samples with a frame whose label contains the text, the two frames leafward of it.
		if (DRILL) {
			const di = stack.findIndex((f) => label(f).includes(DRILL));
			if (di > 0) {
				const chain = stack.slice(Math.max(0, di - 2), di).reverse().map(label).join(' → ');
				drill[chain] = (drill[chain] || 0) + dt;
			} else if (di === 0) drill['(itself)'] = (drill['(itself)'] || 0) + dt;
		}
		// What StudioShell's own body spends its time calling: the frame just leafward of StudioShell.
		const si = stack.findIndex((f) => f.functionName === 'StudioShell');
		if (si >= 0) {
			shellMs += dt;
			// A hook wrapper (exports.useMemo in React's chunk, then React DOM) is not the work: walk on to the first frame
			// outside both, the memo factory or state initializer, and name it with the hook that ran it.
			let callee = si > 0 ? label(stack[si - 1]) : '(StudioShell itself)';
			if (si > 0 && /^exports\.use/.test(stack[si - 1].functionName)) {
				const hook = stack[si - 1].functionName.replace('exports.', '');
				const lib = new Set([stack[si - 1].url, reactUrl]);
				let j = si - 2;
				while (j >= 0 && lib.has(stack[j].url)) j--;
				callee = j >= 0 ? `${hook} → ${label(stack[j])}` : `${hook} (React itself)`;
			}
			shellCallees[callee] = (shellCallees[callee] || 0) + dt;
		}
	}
	return { phase, inPhase, reactLeaf, shellMs, shellCallees, drill };
}

async function run(browser) {
	const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, serviceWorkers: 'block' });
	const page = await ctx.newPage();
	const cdp = await ctx.newCDPSession(page);
	await cdp.send('Network.enable');
	await cdp.send('Network.emulateNetworkConditions', { offline: false, latency: 80, downloadThroughput: (6 * 1024 * 1024) / 8, uploadThroughput: (6 * 1024 * 1024) / 8 });
	await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
	await cdp.send('Performance.enable');
	await page.addInitScript(installHook, FRAME);
	if (CPU) {
		await cdp.send('Profiler.enable');
		await cdp.send('Profiler.setSamplingInterval', { interval: 200 });
		await cdp.send('Profiler.start');
	}
	await page.goto(URL, { waitUntil: 'commit' });
	await page.waitForFunction(() => window.__reactMount?.slideAt != null, null, { timeout: GIVE_UP, polling: 50 });
	const busy = (await cdp.send('Performance.getMetrics')).metrics.find((x) => x.name === 'TaskDuration')?.value ?? null;
	// rootList holds live fibers, which do not serialize; leave it in the page.
	const S = await page.evaluate(() => ({ ...window.__reactMount, rootList: undefined }));
	let cpu = null;
	if (CPU) {
		const { profile } = await cdp.send('Profiler.stop');
		// The profile clock is microseconds since an arbitrary origin; the slide time is page ms. Line them up through
		// the profile's start, which is within a few ms of navigation start here (Profiler.start ran before goto).
		cpu = cpuSplit(profile, profile.startTime + S.slideAt * 1000);
	}
	const profiled = await page.evaluate(() => [...(window.__REACT_DEVTOOLS_GLOBAL_HOOK__?.renderers.values() || [])].map((r) => r.version + (r.bundleType === 0 ? '' : ' dev')));
	await ctx.close();
	const before = S.commits.filter((c) => c.beforeSlide);
	const sum = (field) => {
		const out = {};
		for (const c of before) for (const [k, v] of Object.entries(c[field])) out[k] = (out[k] || 0) + v;
		return out;
	};
	const bySub = sum('bySub');
	const selfSub = sum('selfSub');
	const byName = sum('byName');
	return {
		slideAt: Math.round(S.slideAt),
		busyAtSlideMs: busy == null ? null : Math.round(busy * 1000),
		renderBeforeSlideMs: Math.round(before.reduce((a, c) => a + c.total, 0)),
		commitsBeforeSlide: before.length,
		commitsAfterSlide: S.commits.length - before.length,
		roots: S.roots,
		renderers: profiled,
		// Each commit before the slide: when, how long its render phase took, and its three costliest components (SELF).
		commits: before.map((c) => ({
			t: Math.round(c.t),
			root: c.root,
			ms: Math.round(c.total * 10) / 10,
			fibers: c.fibers,
			top: Object.entries(c.byName)
				.sort((x, y) => y[1] - x[1])
				.slice(0, 3)
				.map(([k, v]) => `${k} ${v.toFixed(1)}`),
		})),
		bySub,
		selfSub,
		byName,
		visible: S.visible,
		cpu,
	};
}

const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || undefined });
const runs = [];
for (let i = 0; i < RUNS; i++) {
	runs.push(await run(browser));
	const r = runs.at(-1);
	console.error(`run ${i + 1}/${RUNS}: slide ${r.slideAt} ms, render before slide ${r.renderBeforeSlideMs} ms in ${r.commitsBeforeSlide} commits, busy ${r.busyAtSlideMs} ms`);
}
await browser.close();
if (!runs[0].renderers.length) console.error('react-mount-profile: React registered no renderer; is this a LATTICE_REACT_PROFILE=1 build?');

// Median per subtree path across runs (a path missing from a run counts as 0 there).
const medOf = (field) => {
	const keys = new Set(runs.flatMap((r) => Object.keys(r[field])));
	return Object.fromEntries([...keys].map((k) => [k, median(runs.map((r) => r[field][k] || 0))]));
};
const med = medOf('bySub');
const medSelf = medOf('selfSub');
const medName = medOf('byName');
const summary = {
	url: URL,
	runs: RUNS,
	renderers: runs[0].renderers,
	slideMedianMs: median(runs.map((r) => r.slideAt)),
	busyAtSlideMedianMs: median(runs.map((r) => r.busyAtSlideMs ?? 0)),
	renderBeforeSlideMedianMs: median(runs.map((r) => r.renderBeforeSlideMs)),
	commitsBeforeSlideMedian: median(runs.map((r) => r.commitsBeforeSlide)),
	subtrees: med,
	self: medSelf,
	byComponent: medName,
};
if (process.env.JSON === '1') {
	console.log(JSON.stringify({ ...summary, every: runs }));
} else {
	console.log(`${URL}  ${RUNS} runs  React ${summary.renderers.join(', ') || 'NOT PROFILED'}`);
	console.log(`first slide ${summary.slideMedianMs} ms · main thread busy before it ${summary.busyAtSlideMedianMs} ms · React render phase before it ${summary.renderBeforeSlideMedianMs} ms in ${summary.commitsBeforeSlideMedian} commits (medians)`);
	console.log('\nrender ms before the first slide, median. INCL = the subtree, SELF = the component and the host nodes it renders:');
	console.log('ON SCREEN = at the slide, the subtree owns a host element a reader can see (run 1).');
	console.log('   INCL     SELF  ON SCREEN  subtree');
	// Print as a tree: children sorted by cost, pruned by depth and MIN_MS.
	const kids = (p) =>
		Object.keys(med)
			.filter((k) => (p ? k.startsWith(`${p} > `) && !k.slice(p.length + 3).includes(' > ') : !k.includes(' > ')))
			.sort((a, b) => med[b] - med[a]);
	const print = (p, depth) => {
		for (const k of kids(p)) {
			if (med[k] < MIN_MS) continue;
			const seg = p ? k.slice(p.length + 3) : k;
			const on = runs[0].visible?.[k];
			console.log(`${med[k].toFixed(1).padStart(7)}  ${(medSelf[k] || 0).toFixed(1).padStart(7)}  ${(on === undefined ? 'unmounted' : on ? 'yes' : 'no').padStart(9)}  ${'  '.repeat(depth)}${seg}`);
			if (depth + 1 < DEPTH) print(k, depth + 1);
		}
	};
	print('', 0);
	console.log(`\ncommits before the slide, run 1 (t = ms since navigation start, render ms, fibers that worked, costliest SELF):`);
	for (const c of runs[0].commits) console.log(`${String(c.t).padStart(7)}  ${c.ms.toFixed(1).padStart(6)}  ${String(c.fibers).padStart(5)}  ${c.top.join(' · ')}`);
	if (CPU) {
		const mm = (f) => median(runs.map(f));
		const ph = runs[0].cpu.phase;
		console.log('\nCPU profile to the slide, ms (median): ' + Object.keys(ph).map((k) => `${k} ${mm((r) => r.cpu.phase[k]).toFixed(0)}`).join(' · '));
		console.log(`StudioShell's body on the stack: ${mm((r) => r.cpu.shellMs).toFixed(0)} ms`);
		const top = (get, n) => {
			const keys = new Set(runs.flatMap((r) => Object.keys(get(r))));
			return [...keys].map((k) => [k, mm((r) => get(r)[k] || 0)]).sort((x, y) => y[1] - x[1]).slice(0, n);
		};
		for (const p of ['render', 'commit', 'effects']) {
			console.log(`\n  ${p}: the first non-React frame, top 10`);
			for (const [k, v] of top((r) => r.cpu.inPhase[p], 10)) console.log(`${v.toFixed(1).padStart(9)}  ${k}`);
			console.log(`  ${p}: inside React DOM itself, by leaf function, top 5`);
			for (const [k, v] of top((r) => r.cpu.reactLeaf[p], 5)) console.log(`${v.toFixed(1).padStart(13)}  ${k}`);
		}
		console.log("\n  StudioShell's body: what it calls, top 20");
		for (const [k, v] of top((r) => r.cpu.shellCallees, 20)) console.log(`${v.toFixed(1).padStart(9)}  ${k}`);
		if (DRILL) {
			console.log(`\n  DRILL ${DRILL}: the two frames leafward of it, top 15`);
			for (const [k, v] of top((r) => r.cpu.drill, 15)) console.log(`${v.toFixed(1).padStart(9)}  ${k}`);
		}
	}
	console.log('\nby component, every instance summed (SELF ms, median), top 25:');
	for (const [k, v] of Object.entries(medName).sort((a, b) => b[1] - a[1]).slice(0, 25)) console.log(`${v.toFixed(1).padStart(7)}  ${k}`);
}
