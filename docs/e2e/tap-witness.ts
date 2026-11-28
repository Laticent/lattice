import type { Page } from '@playwright/test';

// TAP WITNESS: what happened to a tap that opened nothing. A diagnostic, not an assertion: it changes no wait and no
// outcome, and only adds a timeline to the error of an assertion that already failed.
//
// Why it exists: compose-avatar-icon-editor.spec.ts:122 failed once on mobile-touch in a 57-minute shard run with
// `--trace off` (the editor never showed after a tap on the avatar), then passed about 250 runs alone, cold, and under
// load. With no trace, the error could not say which of three shapes it was: the tap landed outside the control (it
// moved or shrank, flaky shape F10), the tap reached the control and the editor never mounted, or the editor mounted and
// a later transaction closed it. The timeline below tells them apart on the next failure, whatever the trace setting.
//
// What it records, from `start()` until `report()`: every touch, mouse and click event (its point, its target, and
// whether the target is inside `target`); the target's box on every frame it changes, and when its element is replaced;
// each mount and unmount of `panel`, with its box when it changes; and `.ProseMirror-selectednode` appearing or going,
// which is the editor's NodeSelection on an inline object. Before the tap, `aim()` records the target's center and what
// `elementFromPoint` finds there.

const MAX_LINES = 200;

export async function witnessTap(page: Page, { target, panel }: { target: string; panel: string }) {
	await page.evaluate(
		({ target, panel, max }) => {
			const t0 = performance.now();
			const lines: string[] = [];
			let frame = 0;
			const log = (s: string) => {
				if (lines.length < max) lines.push(`${Math.round(performance.now() - t0)}ms f${frame} ${s}`);
			};
			const describe = (el: Element | null) => {
				if (!el) return 'nothing';
				const name = el.getAttribute('aria-label') || el.getAttribute('data-slot') || (el.className && typeof el.className === 'string' ? `.${el.className.split(/\s+/)[0]}` : '');
				return `${el.tagName.toLowerCase()}${name ? `[${name}]` : ''} inTarget=${Boolean(el.closest(target))}`;
			};
			const box = (el: Element) => {
				const r = el.getBoundingClientRect();
				return `${Math.round(r.x)},${Math.round(r.y)} ${Math.round(r.width)}x${Math.round(r.height)}`;
			};
			for (const type of ['touchstart', 'touchend', 'touchcancel', 'pointerdown', 'mousedown', 'click']) {
				document.addEventListener(
					type,
					(e) => {
						const p = (e as TouchEvent).changedTouches?.[0] ?? (e as MouseEvent);
						log(`${type} @${Math.round(p.clientX)},${Math.round(p.clientY)} on ${describe(e.target as Element)}`);
					},
					true,
				);
			}
			let lastTarget: Element | null = null;
			let lastTargetBox = '';
			let lastPanels = -1;
			let lastPanelBox = '';
			let lastSelected = false;
			const tick = () => {
				frame++;
				const t = document.querySelector(target);
				if (t && lastTarget && t !== lastTarget) log('target REPLACED (a new element)');
				if (!t && lastTarget) log('target GONE');
				lastTarget = t;
				const tb = t ? box(t) : 'none';
				if (tb !== lastTargetBox) log(`target box ${tb}`);
				lastTargetBox = tb;
				const panels = document.querySelectorAll(panel);
				if (panels.length !== lastPanels) log(`panels ${panels.length}`);
				lastPanels = panels.length;
				const pb = panels.length ? box(panels[panels.length - 1]) : '';
				if (pb && pb !== lastPanelBox) log(`panel box ${pb}`);
				lastPanelBox = pb;
				const selected = Boolean(document.querySelector('.ProseMirror-selectednode'));
				if (selected !== lastSelected) log(selected ? 'node selected' : 'node selection gone');
				lastSelected = selected;
				requestAnimationFrame(tick);
			};
			requestAnimationFrame(tick);
			(window as unknown as { __tapWitness: unknown }).__tapWitness = {
				aim() {
					const t = document.querySelector(target);
					if (!t) return log('aim: no target');
					const r = t.getBoundingClientRect();
					const x = r.x + r.width / 2;
					const y = r.y + r.height / 2;
					log(`aim: target ${box(t)}, center ${Math.round(x)},${Math.round(y)} hits ${describe(document.elementFromPoint(x, y))}`);
				},
				lines,
			};
		},
		{ target, panel, max: MAX_LINES },
	);
	const call = <T>(fn: string) => page.evaluate((fn) => {
		const w = (window as unknown as { __tapWitness?: Record<string, unknown> }).__tapWitness;
		if (!w) return 'the witness is gone (the page navigated)';
		if (fn !== 'aim') return (w.lines as string[]).join('\n');
		(w.aim as () => void)();
		return '';
	}, fn) as Promise<T>;
	return {
		/** Record the target's center and what is under it. Call right before the tap. */
		aim: () => call<string>('aim'),
		/** The timeline so far. */
		report: () => call<string>('report'),
		/** Rethrow `error` with the timeline appended, so a run with `--trace off` still names the cause. */
		async explain(error: unknown): Promise<never> {
			const timeline = await call<string>('report').catch((e) => `the timeline could not be read: ${e}`);
			const e = error instanceof Error ? error : new Error(String(error));
			e.message = `${e.message}\n\nTap witness (e2e/tap-witness.ts):\n${timeline}`;
			throw e;
		},
	};
}
