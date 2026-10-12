// The Studio's door for a plugin's FENCES (door-run.ts), through the REAL engine and the real
// sanitizer, with the sandbox frame replaced by one that runs the renderer in-process. What the
// sandbox itself withholds (the network, the page) is proven on the real Studio
// (docs/e2e/plugin-fence.spec.ts); what this file proves is every RULE the door carries, on the
// same fixture the CLI's door is held to (test/fixtures/fence-door-parity.mjs, HARD RULE #1).

import { createRequire } from 'node:module';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CHECKS, DECK, DECK_UNLISTED, PLUGIN } from '../../../../test/fixtures/fence-door-parity.mjs';
import { approvePlugin, offeredIn, onCodePackagesStatus, pluginDigest, renderWithCodePackages, revokePlugin, setPlugins, unapprovedIn } from './door';

const require = createRequire(import.meta.url);
const trust = require('../../../../lib/packages/trust.js') as { pluginDigest: (code: string, fence: string) => string };
const engine = require('../../../../lib/engine') as { createEngine: () => { render: (s: string, t: string, o?: Record<string, unknown>) => { html: string } } };

// The frame the door opens: runs the renderer text in this realm. The real frame's walls are the browser's.
const opened: { code: string; fence: boolean; ran: number; closed: boolean }[] = [];
let renderer: ((f: { body: string; id: string }) => string) | null = null;
vi.mock('./runner', () => ({
	openPackageFrame: async (code: string, o: { fence?: boolean } = {}) => {
		const rec = { code, fence: !!o.fence, ran: 0, closed: false };
		opened.push(rec);
		let closed = false;
		return {
			get closed() {
				return closed;
			},
			close: () => {
				closed = true;
				rec.closed = true;
			},
			run: async () => {
				throw new Error('a plugin frame runs fences');
			},
			runFence: async (f: { body: string; id: string }) => {
				rec.ran++;
				if (renderer) return renderer(f);
				const mod = new Function(`${code.replace(/export\s*\{\s*(\w+)\s+as\s+default\s*\}\s*;?/, 'return $1;')}`)();
				return mod({ body: f.body, id: f.id });
			},
		};
	},
}));

const PG = {
	render: (source: string, theme: string, opts?: Record<string, unknown>) => engine.createEngine().render(source, theme, opts),
};
const draw = async (deck: string, status = false) => (await renderWithCodePackages<{ html: string }>(PG, deck, 'indaco', status ? { codeStatus: true } : {})).html;

// The door remembers results by code digest for the life of the page, so each test installs the
// fixture renderer under a comment of its own and nothing carries over from the one before.
let run = 0;
let code = PLUGIN.code;
beforeEach(async () => {
	localStorage.clear();
	opened.length = 0;
	renderer = null;
	code = `${PLUGIN.code}\n/* test ${++run} */`;
	await setPlugins([{ name: PLUGIN.name, fence: PLUGIN.fence, code }]);
});
afterEach(async () => {
	await setPlugins([]);
});

const approve = async (c = code, fence = PLUGIN.fence) => approvePlugin({ name: PLUGIN.name, sha256: await pluginDigest(c, fence) });

describe('consent', () => {
	it('the digest is the CLI’s: the fence’s length and name, then the renderer’s bytes', async () => {
		expect(await pluginDigest(PLUGIN.code, PLUGIN.fence)).toBe(trust.pluginDigest(PLUGIN.code, PLUGIN.fence));
		expect(await pluginDigest(PLUGIN.code, 'map')).not.toBe(await pluginDigest(PLUGIN.code, PLUGIN.fence));
		expect(await pluginDigest(`${PLUGIN.code} `, PLUGIN.fence)).not.toBe(await pluginDigest(PLUGIN.code, PLUGIN.fence));
	});

	it('an unapproved plugin never runs: the block stays, with a note, and the preview’s status offers the approval', async () => {
		const html = await draw(DECK, true);
		expect(opened).toEqual([]);
		expect(html).toContain('language-gantt');
		expect(html).toContain('data-package-error="gantt-plugin"');
		expect(html).toContain('its code has not been approved in this browser');
		expect(unapprovedIn(DECK).map((p) => p.name)).toEqual(['gantt-plugin']);
	});

	it('an approval is for this code and this fence, under plugin/<name>, and can be withdrawn', async () => {
		await approve();
		expect(JSON.parse(localStorage.getItem('lattice-code-package-approvals') as string).approved['plugin/gantt-plugin'].sha256).toBe(trust.pluginDigest(code, PLUGIN.fence));
		expect(unapprovedIn(DECK)).toEqual([]);
		await setPlugins([{ name: PLUGIN.name, fence: PLUGIN.fence, code: `${code}\n/* edited */` }]);
		expect(unapprovedIn(DECK).map((p) => p.name)).toEqual(['gantt-plugin']);
		await setPlugins([{ name: PLUGIN.name, fence: 'map', code }]);
		expect(unapprovedIn(DECK.replace('```gantt', '```map')).map((p) => p.name)).toEqual(['gantt-plugin']);
		await setPlugins([{ name: PLUGIN.name, fence: PLUGIN.fence, code }]);
		revokePlugin('gantt-plugin');
		expect(unapprovedIn(DECK).length).toBe(1);
	});
});

describe('activation: the deck’s plugins: line', () => {
	it('a plugin the deck did not list does not run, even when approved: a drawn placeholder stands in its block', async () => {
		await approve();
		const html = await draw(DECK_UNLISTED, true);
		expect(opened).toEqual([]);
		expect(html).not.toContain('data-lattice-plugin=');
		// The placeholder names the plugin and carries none of the author's text.
		expect(html).toMatch(/<div data-lattice-plugin-off="gantt-plugin" role="note"><span class="lattice-plugin-mark" aria-hidden="true"><\/span><span class="lattice-plugin-words"><strong>gantt-plugin<\/strong>/);
		expect(html).not.toMatch(/Design 1|Build 3/);
		// The shipped passes' slides keep the code block the author wrote: a placeholder there would sit in a slide the door does not draw on.
		expect(html).toContain('video slide, not drawn');
	});

	it('the offered plugin is reported to the strip, from the source and from the render', async () => {
		expect(offeredIn(DECK_UNLISTED).map((p) => p.name)).toEqual(['gantt-plugin']);
		expect(offeredIn(DECK)).toEqual([]);
		expect(offeredIn('---\ntheme: indaco\n---\n\n## No fence\n')).toEqual([]);
		let status: { offered?: { name: string }[] } = {};
		const off = onCodePackagesStatus((s) => {
			status = s;
		});
		await draw(DECK_UNLISTED, true);
		off();
		expect(status.offered?.map((p) => p.name)).toEqual(['gantt-plugin']);
	});

	it('a listed plugin whose fence the deck never writes loads nothing', async () => {
		await approve();
		await draw('---\ntheme: indaco\nplugins: [gantt-plugin]\n---\n\n## Plain\n\n```js\nx\n```\n');
		expect(opened).toEqual([]);
	});
});

describe('the same fixture as the CLI door', () => {
	it('an approved, listed plugin satisfies every check the CLI door is held to', async () => {
		await approve();
		const html = await draw(DECK);
		const failed = (CHECKS as [string, (h: string) => boolean][]).filter(([, ok]) => !ok(html)).map(([label]) => label);
		expect(failed).toEqual([]);
		expect(opened.map((o) => o.fence)).toEqual([true]);
	});
});

describe('a listed zip plugin is not an unknown plugin', () => {
	it('the engine is told every installed name, so its diagnostics do not say no plugin has it; a typo is still reported', async () => {
		await approve();
		const r = await renderWithCodePackages<{ html: string; diagnostics?: { id: string; plugin: string }[] }>(PG, DECK.replace('plugins: [gantt-plugin]', 'plugins: [gantt-plugin, gantt-plugni]'), 'indaco', {});
		expect((r.diagnostics ?? []).filter((d) => d.id === 'plugin/unknown-plugin').map((d) => d.plugin)).toEqual(['gantt-plugni']);
	});
});

describe('rules the inversion lens found untested', () => {
	it('a plugin whose fence is a highlight.js language (python) never runs: it would take every such block', async () => {
		await setPlugins([{ name: 'py-plugin', fence: 'python', code }]);
		approvePlugin({ name: 'py-plugin', sha256: await pluginDigest(code, 'python') });
		const html = await draw('---\nplugins: [py-plugin]\n---\n\n## P\n\n```python\nprint(1)\n```\n');
		expect(opened).toEqual([]);
		expect(html).not.toContain('data-lattice-plugin=');
	});

	it('consent and activation are read BEFORE the memo: a drawn fence is not shown after approval is withdrawn or the deck stops listing it', async () => {
		await approve();
		expect(await draw(DECK)).toContain('data-lattice-plugin="gantt-plugin"');
		revokePlugin('gantt-plugin');
		const revoked = await draw(DECK);
		expect(revoked).not.toContain('data-lattice-plugin=');
		expect(revoked).toContain('its code has not been approved in this browser');
		await approve();
		expect(await draw(DECK_UNLISTED)).not.toContain('data-lattice-plugin=');
	});

	it('remembered output counts against the render’s cap as fresh output does', async () => {
		await approve();
		renderer = () => `<p>${'z'.repeat(1_500_000)}</p>`;
		const many = (n: number) => `---\ntheme: indaco\nplugins: [gantt-plugin]\n---\n\n## Many\n\n${Array.from({ length: n }, (_, i) => `\`\`\`gantt\nrow ${i}\n\`\`\`\n`).join('\n')}`;
		await draw(many(2));
		const again = await draw(many(4));
		expect((again.match(/data-lattice-plugin="gantt-plugin"/g) || []).length).toBe(2);
		expect((again.match(/returned more than 4,000,000 characters in all/g) || []).length).toBe(2);
	});

	it('a failure of time is not remembered: the next render runs the renderer again', async () => {
		await approve();
		renderer = () => {
			throw new Error('the transform did not finish within 2000 ms');
		};
		await draw(DECK);
		await draw(DECK);
		expect(opened.length).toBe(2);
	});

	it('every frame a render opens is closed when the render ends', async () => {
		await approve();
		await draw(DECK);
		expect(opened.length).toBe(1);
		await new Promise((r) => setTimeout(r, 0));
		expect(opened.every((o) => o.closed)).toBe(true);
	});

	it('a name= attribute is dropped (it would shadow a window global), and serialization growth counts against the cap', async () => {
		await approve();
		renderer = () => '<img name="__latticeDagreNotNeeded" src="data:image/gif;base64,R0lGODlhAQABAAAAACw=" alt=""><form name="x"></form><p>ok</p>';
		const html = await draw(DECK);
		expect(html).not.toMatch(/name="/);
		expect(html).toContain('<p>ok</p>');
		await setPlugins([{ name: 'gantt-plugin', fence: 'gantt', code: `${code}\n/* nbsp */` }]);
		await approve(`${code}\n/* nbsp */`);
		renderer = () => `<p>${'\u00a0'.repeat(300_000)}</p>`;
		const many = `---\ntheme: indaco\nplugins: [gantt-plugin]\n---\n\n## Many\n\n${Array.from({ length: 4 }, (_, i) => `\`\`\`gantt\nnb ${i}\n\`\`\`\n`).join('\n')}`;
		const out = await draw(many);
		// Each result is 300k raw but ~1.8M once `&nbsp;` is written: the cap sees 1.8M, so only two fit in 4M.
		expect((out.match(/data-lattice-plugin="gantt-plugin"/g) || []).length).toBe(2);
	});

	it('an <img> or <image> whose address is empty or a bare # is dead too', async () => {
		await approve();
		renderer = () => '<p>kept</p><img src="" alt=""><img src="#" alt=""><svg width="4" height="4"><image href=""></image></svg>';
		const html = await draw(DECK);
		expect(html).toContain('<p>kept</p>');
		expect(html).not.toMatch(/<img|<image/);
	});
});

describe('a refused plugin', () => {
	it('is never offered or approvable, and a listed one says why even though nothing runs', async () => {
		await setPlugins([{ name: 'py-plugin', fence: 'python', code }]);
		const deck = '---\nplugins: [py-plugin]\n---\n\n## P\n\n```python\nx\n```\n';
		expect(unapprovedIn(deck)).toEqual([]);
		expect(offeredIn(deck.replace('plugins: [py-plugin]\n', ''))).toEqual([]);
		let notes: string[] = [];
		const off = onCodePackagesStatus((s) => {
			notes = s.notes ?? [];
		});
		await draw(deck, true);
		off();
		expect(notes.join('\n')).toMatch(/plugin py-plugin is not run: `python` is a code language/);
	});

	it('an unrelated installed plugin’s refusal is not shown on a deck that does not list it', async () => {
		await setPlugins([{ name: 'py-plugin', fence: 'python', code }]);
		let notes: string[] = ['x'];
		const off = onCodePackagesStatus((s) => {
			notes = s.notes ?? [];
		});
		await draw('---\ntheme: indaco\n---\n\n## Plain\n', true);
		off();
		expect(notes).toEqual([]);
	});
});

describe('the rules the CLI door learned', () => {
	const many = (n: number) => `---\ntheme: indaco\nplugins: [gantt-plugin]\n---\n\n## Many\n\n${Array.from({ length: n }, (_, i) => `\`\`\`gantt\nrow ${i}\n\`\`\`\n`).join('\n')}`;

	it('at most 400 fences are drawn in a render; the rest stay code, and the status says so', async () => {
		await approve();
		const html = await draw(many(405));
		expect((html.match(/data-lattice-plugin="gantt-plugin"/g) || []).length).toBe(400);
		expect((html.match(/language-gantt/g) || []).length).toBe(5);
	});

	it('a fence past 200,000 characters stays code', async () => {
		await approve();
		const html = await draw(`---\ntheme: indaco\nplugins: [gantt-plugin]\n---\n\n## Long\n\n\`\`\`gantt\n${'x'.repeat(200_001)}\n\`\`\`\n`);
		expect(html).not.toContain('data-lattice-plugin');
		expect(opened).toEqual([]);
	});

	it('the render’s output is capped in claim order: the early fences draw and the later ones carry the note', async () => {
		await approve();
		renderer = () => `<p>${'y'.repeat(1_500_000)}</p>`;
		const html = await draw(many(4));
		expect((html.match(/data-lattice-plugin="gantt-plugin"/g) || []).length).toBe(2);
		expect((html.match(/returned more than 4,000,000 characters in all/g) || []).length).toBe(2);
	});

	it('ids and classes are kept only in the plugin’s lp-<name> namespace', async () => {
		await approve();
		const html = await draw(DECK);
		expect(html).toMatch(/id="lp-gantt-plugin-[0-9a-f]{8}-0"/);
		expect(html).not.toMatch(/foreign-class/);
		expect(/<div data-lattice-plugin="gantt-plugin">[\s\S]*?<\/ul>/.exec(html)?.[0]).not.toMatch(/cell-stage/);
	});

	it('two plugins that claim one fence name run for neither', async () => {
		await setPlugins([
			{ name: 'gantt-plugin', fence: 'gantt', code },
			{ name: 'other', fence: 'gantt', code },
		]);
		await approve();
		await draw(DECK);
		expect(opened).toEqual([]);
	});

	it('a fence a shipped plugin owns, and a name that is a hyphen-prefix of another’s, are refused', async () => {
		await setPlugins([{ name: 'mine', fence: 'mermaid', code }]);
		approvePlugin({ name: 'mine', sha256: await pluginDigest(code, 'mermaid') });
		await draw(DECK.replace('gantt-plugin', 'mine').replace('```gantt', '```mermaid'));
		expect(opened).toEqual([]);
		await setPlugins([
			{ name: 'gantt', fence: 'gantt', code },
			{ name: 'gantt-plugin', fence: 'gantt2', code },
		]);
		approvePlugin({ name: 'gantt', sha256: await pluginDigest(code, 'gantt') });
		approvePlugin({ name: 'gantt-plugin', sha256: await pluginDigest(code, 'gantt2') });
		await draw(DECK.replace('gantt-plugin', 'gantt'));
		expect(opened).toEqual([]);
		expect(await draw(DECK.replace('gantt-plugin', 'gantt'))).not.toContain('data-lattice-plugin');
	});

	it('a renderer that throws leaves the block, with its note, and the deck still draws', async () => {
		await approve();
		renderer = () => {
			throw new Error('boom <b>');
		};
		const html = await draw(DECK);
		expect(html).toContain('did not draw this block: boom &lt;b&gt;');
		expect(html).toContain('language-js');
	});

	it('a renderer that closes its container is refused, and nothing it wrote survives', async () => {
		await approve();
		renderer = () => '</section><section class="x"><script>alert(3)</script>';
		const html = await draw(DECK);
		expect(html).toContain('the renderer returned markup that closes its own container');
		expect(html).not.toMatch(/alert\(3\)/);
	});

	it('a dead media element is dropped (no address survives for it), and a data: image stays: the PDF writer fails on an empty <video> or <img>', async () => {
		await approve();
		renderer = () => '<p>kept</p><video poster="https://evil.example/p.png"></video><audio></audio><img src="https://evil.example/i.png" alt=""><svg width="4" height="4"><image href="https://evil.example/x.png" width="4" height="4"></image><rect width="4" height="4"></rect></svg><img alt="data" src="data:image/png;base64,iVBORw0KGgo=">';
		const html = await draw(DECK);
		expect(html).toContain('<p>kept</p>');
		expect(html).not.toMatch(/<video|<audio|<image|evil\.example/);
		expect(html).toContain('<rect width="4" height="4">');
		expect(html).toMatch(/<img alt="data" src="data:image\/png;base64,iVBORw0KGgo=">/);
		expect((html.match(/<img/g) || []).length).toBe(1);
	});

	it('a result is remembered by the code’s digest and the fence’s text: a second render runs nothing', async () => {
		await approve();
		await draw(DECK);
		expect(opened.map((o) => o.ran)).toEqual([1]);
		await draw(DECK);
		expect(opened.map((o) => o.ran)).toEqual([1]);
	});
});
