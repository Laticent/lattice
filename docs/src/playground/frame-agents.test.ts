/**
 * The preview frames' agents as one same-origin file (frame-agents.mjs, engineering/decisions/2026-11-17-site-discovery.md §2).
 *
 * A preview frame inherits its page's Content-Security-Policy, which allows no inline script, so the
 * load-bearing property is the first cell: no document a preview builder writes carries an inline
 * script the browser would run. The rest pin the file's contract: one file, the agent chosen by its
 * tag, per-deck values read from the tag's data at run time.
 */

import { describe, expect, it } from 'vitest';
import { AGENT_NAMES, AGENTS_MARK, agentTag, FRAME_AGENTS_FILE, frameAgentsSource, frameAgentsUrl, inlineAgents } from '../../../lib/core/frame-agents.mjs';
import { buildStageDoc } from '../components/studio/present/stage-window.js';
import { buildSrcdoc } from './deck-preview.js';

/** Every script element the browser would RUN inline: no `src`, and not a JSON data block. */
function inlineScripts(doc: string): string[] {
	const parsed = new DOMParser().parseFromString(doc, 'text/html');
	return [...parsed.querySelectorAll('script')]
		.filter((s) => !s.hasAttribute('src') && !/^application\/(ld\+)?json$/i.test(s.type.trim()))
		.map((s) => (s.textContent ?? '').slice(0, 60));
}

const html = '<article class="lattice"><section>A</section><section>B</section></article>';

describe('the preview documents run no inline script', () => {
	it('buildSrcdoc, in every shape a host asks for', () => {
		for (const opts of [{}, { sync: true }, { slideEdge: 'var(--border)' }, { clamp: false }]) {
			const doc = buildSrcdoc({ html, css: '', mode: 'light', geom: { w: 1280, h: 720 }, runtimeUrl: '/p/v/1/lattice-runtime.js', gap: 16, ...opts });
			expect(inlineScripts(doc), JSON.stringify(opts)).toEqual([]);
			// …and it names the agents file beside the runtime, so it is not passing by running nothing.
			expect(doc).toContain('src="/p/v/1/lattice-frame-agents.js" data-agent="fit"');
				// The slides are hidden only under the agents file's mark, so a file that never ran
				// shows them rather than a blank pane; no unconditional hide is left.
				expect(doc).toContain(`html[${AGENTS_MARK}] .lattice{visibility:hidden;}`);
				expect(doc).not.toMatch(/(^|[;}])\.lattice\{visibility:hidden/);
		}
	});
	it('the Stage, in the iframe and as the projected window', () => {
		for (const standalone of [false, true]) {
			const doc = buildStageDoc({ html, width: 1280, height: 720, bg: '#000', css: '', runtimeUrl: '/p/v/1/lattice-runtime.js', standalone, token: 'a"b' });
			expect(inlineScripts(doc), `standalone=${standalone}`).toEqual([]);
			expect(doc).toMatch(/data-agent="stage-fit" data-sw="1280" data-sh="720"/);
		}
	});
});

describe('the agents file', () => {
	it('is one script that parses, and names exactly the agents a tag may ask for', () => {
		const src = frameAgentsSource();
		expect(() => new Function(src)).not.toThrow();
		for (const name of AGENT_NAMES) expect(src).toContain(`${JSON.stringify(name)}:function(D)`);
	});

	it('runs the one agent its tag names, with that tag’s data', () => {
		const win: Record<string, unknown> = {};
		// A stand-in DOM: the file reads the running tag through Document.prototype's own getter and
		// accepts only a real <script>, so the test hands it both.
		class Script {
			constructor(readonly dataset: Record<string, string>) {}
		}
		const runWith = (current: unknown, own?: unknown) => {
			class Doc {
				documentElement = { setAttribute: (k: string) => marks.push(k) };
			}
			Object.defineProperty(Doc.prototype, 'currentScript', { get: () => current });
			const doc = new Doc();
			if (own) Object.defineProperty(doc, 'currentScript', { value: own });
			new Function('window', 'document', 'Document', 'HTMLScriptElement', frameAgentsSource())(win, doc, Doc, Script);
		};
		const marks: string[] = [];
		const run = (dataset: Record<string, string>) => runWith(new Script(dataset));
		run({ agent: 'geom', w: '1920', h: '1080', edge: '1' });
		expect(win).toEqual({ __SLIDE_W: 1920, __SLIDE_H: 1080, __SLIDE_EDGE: 1 });
		// …and marks <html>, which is what lets a host hide its slides only when this file runs.
		expect(marks).toEqual([AGENTS_MARK]);
		// An unknown name, or a tag with none, runs nothing.
		const before = { ...win };
		run({ agent: 'toString' });
		run({});
		expect(win).toEqual(before);
	});

	// Author markup shares the frame's document, and a named element shadows `document.currentScript`
	// (`<img name="currentScript" data-agent="geom" data-w="777">`). The red team picked the agent and
	// its data that way in all three engines; the sanitizer strips the name today, this is the second wall.
	it('reads its own tag, never a named element that shadows document.currentScript', () => {
		const win: Record<string, unknown> = {};
		class Script {
			constructor(readonly dataset: Record<string, string>) {}
		}
		const runWith = (current: unknown, own?: unknown) => {
			class Doc {
				documentElement = { setAttribute: (k: string) => marks.push(k) };
			}
			Object.defineProperty(Doc.prototype, 'currentScript', { get: () => current });
			const doc = new Doc();
			if (own) Object.defineProperty(doc, 'currentScript', { value: own });
			new Function('window', 'document', 'Document', 'HTMLScriptElement', frameAgentsSource())(win, doc, Doc, Script);
		};
		const marks: string[] = [];
		const img = { tagName: 'IMG', dataset: { agent: 'geom', w: '777', edge: '1' } };
		runWith(new Script({ agent: 'geom', w: '1280', h: '720' }), img);
		expect(win).toEqual({ __SLIDE_W: 1280, __SLIDE_H: 720 });
		// …and a current element that is not a <script> runs nothing at all.
		const before = { ...win };
		marks.length = 0;
		runWith(img);
		expect(win).toEqual(before);
		// …and does not mark <html>: a page that hides its slides on the mark must still show them.
		expect(marks).toEqual([]);
	});

	it('sits beside the runtime, whatever the runtime URL carries after its path', () => {
		expect(frameAgentsUrl('/playground/v/abc/lattice-runtime.js?x=1#y')).toBe(`/playground/v/abc/${FRAME_AGENTS_FILE}`);
		expect(frameAgentsUrl('https://a.example/v/1/lattice-runtime.js')).toBe(`https://a.example/v/1/${FRAME_AGENTS_FILE}`);
	});
});

describe('agentTag', () => {
	it('writes data as attributes, escaped, and leaves out what is off', () => {
		const tag = agentTag('/v/a"b.js', 'stage-fit', { sw: 1280, tok: '"><x>', clamp: false, edge: true, none: null }, ' nonce="n"');
		expect(tag).toBe('<script nonce="n" src="/v/a&quot;b.js" data-agent="stage-fit" data-sw="1280" data-tok="&quot;&gt;&lt;x&gt;" data-edge="1"></script>');
		// …and the value an agent reads back is the one it was given.
		expect(inlineAgents(agentTag(`/v/${FRAME_AGENTS_FILE}`, 'stage-fit', { tok: '"><x>' }))).toContain('"tok":"\\"><x>"');
	});
	it('refuses an agent it does not know, and a data key that is not a plain word', () => {
		expect(() => agentTag('/a.js', 'evil')).toThrow(/unknown agent/);
		expect(() => agentTag('/a.js', 'fit', { 'x" onload="y': 1 })).toThrow(/data key/);
	});
});
