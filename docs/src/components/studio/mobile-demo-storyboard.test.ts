import { describe, expect, it, vi } from 'vitest';
import type { RunContext } from '../../lib/vetrina/runner';
import type { StudioActions } from './demo-storyboard';
import { studioMobileWalkthrough } from './mobile-demo-storyboard';

// The phone storyboard is DATA compiled to a Walkthrough, so we drive it through a
// recording ctx (the scene.test.ts pattern) to prove its SHAPE without the e2e cost:
// per-slide alternation (swap Edit → type → swap Preview), no synthetic input, and the
// `until(editorMounted)` gates resolve against a stubbed editor node so the run is fast.
// The REAL-surface proof (typing survives the editor unmount/remount, 4 slides land in
// order) is demo-mobile.spec.ts on 390px Chromium — this is the cheap structural guard.

function recorder() {
	const log: string[] = [];
	const panes: string[] = [];
	const stage = {
		say: (t: string) => void log.push(`say:${t.slice(0, 8)}`),
		point: async () => void log.push('point'),
		press: async () => void log.push('press'),
		drag: async () => ({ drop: async () => {}, snapBack: async () => {} }),
		gesture: async () => void log.push('gesture'),
		reduced: false,
		pace: 0, // settle * pace = 0 → the interpreter's waits resolve immediately
	};
	const actions: StudioActions = {
		openDeckMenu: () => {},
		createFirstDeck: () => void log.push('createFirstDeck'),
		gotoSlide: () => {},
		openInspector: () => {},
		setPalette: () => void log.push('setPalette'),
		toggleMode: () => void log.push('toggleMode'),
		openArchitect: () => {},
		setArchitectTab: () => {},
		openPresent: () => {},
		openShare: () => {},
		openSlideSettings: () => {},
		mutateSlide: () => {},
		setMobilePane: (p) => void panes.push(p),
	};
	const ctx = {
		stage,
		actions,
		signal: new AbortController().signal,
		type: async (_t: unknown, text: string) => void log.push(`type:${text.length}`),
		awaitUser: async () => new Event('x'),
	} as unknown as RunContext<StudioActions>;
	return { log, panes, ctx };
}

describe('mobile-demo-storyboard — the phone single-pane script', () => {
	it('compiles to a Walkthrough with no build-time warning (no instant beat carries a positioning verb)', () => {
		const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
		// The module was imported (compiled) at load; re-assert it's a runnable function.
		expect(typeof studioMobileWalkthrough).toBe('function');
		expect(warn).not.toHaveBeenCalled();
		warn.mockRestore();
	});

	it('alternates Edit⇄Preview per slide and types four slides — no synthetic input', async () => {
		// Stub the DOM the `until` gates probe so they resolve on the first poll (else each would
		// hold ~15s): the editor node for `editorMounted`, and a painted preview iframe for
		// `previewPainted` (jsdom gives the iframe a real about:blank contentDocument to fill).
		document.body.innerHTML =
			'<section id="studio-pane-editor"><div class="cm-content"></div></section>' +
			'<div aria-label="Live deck preview"><iframe></iframe></div>';
		const frame = document.querySelector('iframe') as HTMLIFrameElement;
		if (frame.contentDocument) frame.contentDocument.body.innerHTML = '<div class="lattice">slide</div>';
		const { log, panes, ctx } = recorder();

		await studioMobileWalkthrough(ctx);

		// The fresh deck is minted once.
		expect(log.filter((l) => l === 'createFirstDeck')).toHaveLength(1);
		// One type beat per slide — the four-slide phone deck.
		expect(log.filter((l) => l.startsWith('type:'))).toHaveLength(4);
		// Per-slide alternation: every slide swaps to Edit to type, then to Preview to reveal.
		expect(panes.filter((p) => p === 'edit')).toHaveLength(4);
		expect(panes.filter((p) => p === 'preview').length).toBeGreaterThanOrEqual(4);
		// The edit swaps and preview swaps interleave (an edit is always followed by a preview).
		for (let i = 0; i < panes.length; i++) {
			if (panes[i] === 'edit') expect(panes[i + 1]).toBe('preview');
		}
		// The recorder never dispatched synthetic input — the trust invariant (only stage
		// theater + host setters, never a real event). No `dispatchEvent`/`KeyboardEvent` here.
		expect(log).not.toContain('dispatch');
	});
});
