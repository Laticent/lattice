/* The page side of the player chart probe (player-charts.mjs, PROBE=player-charts): helpers that run inside an
 * exported HTML player, in Mobile Safari through safaridriver (run.mjs) or in Playwright's WebKit (probe.selftest.mjs).
 * The taps themselves come from outside, as a real touch: these only find where to tap and read what happened.
 * Every wait here is a signal with a deadline (a box that holds still, a card that appears), never a fixed sleep.
 * The driver evaluates this file, then calls an entry point on `latticePlayerProbe` (the end of the file). */

/* The chart card and the funnel on stage, as docs/e2e/player-chart-reveal.spec.ts names them. */
const LP_CARD = '.cenno.lattice-chart-card';
const LP_FUNNEL = '.lp-frame.lp-active .funnel-svg';

const latticePlayerIndex = () => [...document.querySelectorAll('.lp-frame')].findIndex((f) => f.classList.contains('lp-active'));

/* Wait until `test()` returns a truthy value, polling once a frame, for at most `ms`. Resolves to its last value. */
const latticePlayerUntil = (test, ms) =>
	new Promise((resolve) => {
		const t0 = performance.now();
		const look = () => {
			const v = test();
			if (v || performance.now() - t0 > ms) resolve(v);
			else requestAnimationFrame(look);
		};
		look();
	});

const latticePlayerPage = (extra) => ({ ua: navigator.userAgent, width: innerWidth, ...extra });

/* Step the player to its first funnel slide with its own Next button (turning slides is not what this probe tests),
 * and record every touch from here on: where it landed and which mark it hit, so a failed tap names its point. */
async function latticePlayerToFunnel() {
	const ready = await latticePlayerUntil(() => latticePlayerIndex() >= 0, 30000);
	if (!ready) return latticePlayerPage({ ok: false, error: 'the player never showed a slide' });
	if (!window.__lpTouchLog) {
		window.__lpTouchLog = [];
		document.addEventListener(
			'touchstart',
			(e) => {
				const t = e.touches[0];
				const mark = e.target?.closest?.('[data-mark]');
				window.__lpTouchLog.push({ x: Math.round(t.clientX), y: Math.round(t.clientY), mark: mark ? mark.getAttribute('data-mark') : null, at: e.target?.tagName || '?' });
			},
			{ capture: true, passive: true },
		);
		// The EVENT TRAIL around each tap, so a card that never showed names why: the pointer events the reveal
		// listens to (their type, primary flag and point), what could close a card at once (focus leaving, a resize,
		// the visual viewport changing), and the moments a card element was added or removed. Cleared with the touch log.
		window.__lpEvents = [];
		const t0 = performance.now();
		const note = (e) => {
			if (window.__lpEvents.length > 60) return;
			const at = e.target?.closest?.('[data-mark]')?.getAttribute('data-mark');
			window.__lpEvents.push(
				[Math.round(performance.now() - t0), e.type, e.pointerType || '', e.isPrimary === false ? 'secondary' : '', 'clientX' in e ? `${Math.round(e.clientX)},${Math.round(e.clientY)}` : '', at != null ? `mark ${at}` : e.target?.tagName || '']
					.filter(Boolean)
					.join(' '),
			);
		};
		for (const type of ['pointerdown', 'pointerup', 'pointercancel', 'click', 'focusout']) document.addEventListener(type, note, { capture: true, passive: true });
		window.addEventListener('resize', note, { passive: true });
		window.visualViewport?.addEventListener('resize', () => note({ type: `vv-resize scale ${window.visualViewport.scale}` }), { passive: true });
		new MutationObserver((records) => {
			for (const r of records) {
				for (const n of r.addedNodes) if (n.matches?.(LP_CARD)) note({ type: 'card added' });
				for (const n of r.removedNodes) if (n.matches?.(LP_CARD)) note({ type: 'card removed' });
			}
		}).observe(document.documentElement, { childList: true, subtree: true });
	}
	for (let i = 0; i < 12 && !document.querySelector(`${LP_FUNNEL} [data-mark="0"]`); i++) {
		const before = latticePlayerIndex();
		const next = document.querySelector('#lp-app > #lp-nav > #lp-next');
		if (!next) return latticePlayerPage({ ok: false, error: 'the player has no Next button' });
		next.click();
		await latticePlayerUntil(() => latticePlayerIndex() !== before, 5000);
	}
	const band = document.querySelector(`${LP_FUNNEL} [data-mark="0"]`);
	return latticePlayerPage({ ok: !!band, index: latticePlayerIndex(), error: band ? undefined : 'no funnel slide within twelve slides' });
}

/* Where a finger should land on a target, once the target's box has held still for five frames and it is the element
 * under that point (a slow simulator still settling the page put a tap beside its target: run.mjs composeTouchTap).
 * It clears the touch log, so the next entry is the coming tap's. */
async function latticePlayerPoint(find) {
	let last = '';
	let still = 0;
	let out = null;
	await latticePlayerUntil(() => {
		const el = find();
		if (!el) return false;
		const r = el.getBoundingClientRect();
		const x = Math.round(r.left + r.width / 2);
		const y = Math.round(r.top + r.height / 2);
		const key = `${x},${y}`;
		still = key === last ? still + 1 : 0;
		last = key;
		const under = document.elementFromPoint(x, y);
		const hit = !!under && (el === under || el.contains(under));
		out = { x, y, still, hit, under: under ? under.tagName + (under.id ? `#${under.id}` : '') : 'none' };
		return still >= 5 && hit;
	}, 10000);
	window.__lpTouchLog = [];
	window.__lpEvents = [];
	return out || { hit: false, still: 0, under: 'no target' };
}

const latticePlayerBandPoint = (i) => latticePlayerPoint(() => document.querySelector(`${LP_FUNNEL} [data-mark="${i}"]`));

/* A point on the slide that is no chart mark and no card: the slide's heading. */
const latticePlayerEmptyPoint = () => latticePlayerPoint(() => document.querySelector('.lp-frame.lp-active h2'));

/* The card's state once it reaches `wantOpen` (or 4 s pass): its title, whether it sits inside the visible viewport and
 * away from the finger, whether it is in the top layer and takes touches, the slide on stage, and where the last touch
 * landed. `finger` is the point that was tapped. */
async function latticePlayerCard(wantOpen, finger) {
	const settled = await latticePlayerUntil(() => {
		const c = document.querySelector(LP_CARD);
		return wantOpen ? !!c && c.getBoundingClientRect().width > 0 : !c;
	}, 4000);
	const c = document.querySelector(LP_CARD);
	const log = window.__lpTouchLog || [];
	const state = { open: !!c, index: latticePlayerIndex(), touches: log.length, touch: log.at(-1) || null, events: (window.__lpEvents || []).join(' | '), settled: !!settled };
	if (!c) return state;
	const r = c.getBoundingClientRect();
	const vv = window.visualViewport;
	const vx = vv ? vv.offsetLeft : 0;
	const vy = vv ? vv.offsetTop : 0;
	const vw = vv ? vv.width : innerWidth;
	const vh = vv ? vv.height : innerHeight;
	let popover = false;
	try {
		popover = c.matches(':popover-open');
	} catch {
		popover = false;
	}
	return {
		...state,
		title: c.querySelector('[data-cenno-part=title]')?.textContent.trim() || '',
		box: { x: Math.round(r.left), y: Math.round(r.top), w: Math.round(r.width), h: Math.round(r.height) },
		viewport: { x: Math.round(vx), y: Math.round(vy), w: Math.round(vw), h: Math.round(vh) },
		inView: r.left >= vx - 1 && r.top >= vy - 1 && r.right <= vx + vw + 1 && r.bottom <= vy + vh + 1,
		underFinger: !!finger && finger.x >= r.left && finger.x <= r.right && finger.y >= r.top && finger.y <= r.bottom,
		popover,
		pointerEvents: getComputedStyle(c).pointerEvents,
	};
}

/* The checker's repro (PR #3259): author styles in a detail must stay inside the card. Run with the card open. */
function latticePlayerHostile() {
	const at = (x, y) => {
		const el = document.elementFromPoint(x, y);
		return el ? el.id || el.tagName : null;
	};
	const hits = [at(4, 4), at(innerWidth / 2, innerHeight - 4), at(innerWidth - 4, innerHeight / 2)];
	const host = [...document.querySelectorAll('.lattice-chart-card [data-cenno-part=footer] *')].find((e) => e.shadowRoot);
	const a = host?.shadowRoot?.querySelector('#metax');
	return { hits, link: a ? { style: a.getAttribute('style'), position: getComputedStyle(a).position } : null };
}

/* The slide on stage once it differs from `from` (or 5 s pass). */
const latticePlayerSlideAfter = async (from) => ({ index: (await latticePlayerUntil(() => latticePlayerIndex() !== from, 5000)) ? latticePlayerIndex() : from });

/* The entry points player-charts.mjs calls, on one global: the driver evaluates this file, then calls them by name. */
globalThis.latticePlayerProbe = {
	toFunnel: latticePlayerToFunnel,
	bandPoint: latticePlayerBandPoint,
	emptyPoint: latticePlayerEmptyPoint,
	card: latticePlayerCard,
	hostile: latticePlayerHostile,
	slideAfter: latticePlayerSlideAfter,
};
