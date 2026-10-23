// The Studio's door for a plugin's FENCES (door-run.ts), through the REAL engine and the real
// sanitizer, with the sandbox frame replaced by one that runs the renderer in-process. What the
// sandbox itself withholds (the network, the page) is proven on the real Studio
// (docs/e2e/plugin-fence.spec.ts); what this file proves is every RULE the door carries, on the
// same fixture the CLI's door is held to (test/fixtures/fence-door-parity.mjs, HARD RULE #1).

import { createRequire } from 'node:module';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CHECKS, DECK, DECK_UNLISTED, PLUGIN } from '../../../../test/fixtures/fence-door-parity.mjs';
import { approvePlugin, codePackagesStamp, offeredIn, onCodePackagesStatus, pluginDigest, renderWithCodePackages, revokePlugin, setPlugins, unapprovedIn } from './door';

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

	it('an unapproved plugin never runs: the same card an unlisted one gets stands there, with its own words, and the preview’s status offers the approval', async () => {
		const html = await draw(DECK, true);
		expect(opened).toEqual([]);
		expect(html).toContain('data-lattice-plugin-off="gantt-plugin"');
		expect(html).toContain('data-reason="unapproved"');
		expect(html).toContain('Plugin block · not approved in this browser');
		expect(html).not.toContain('data-package-error');
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
		expect(html).toMatch(/<div data-lattice-plugin-off="gantt-plugin" data-placement="figure" role="note"><span class="lattice-plugin-mark" aria-hidden="true"><\/span><span class="lattice-plugin-words"><strong>gantt-plugin<\/strong>/);
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
		expect(revoked).toContain('Plugin block · not approved in this browser');
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

describe('rules whose removal no test used to notice', () => {
	const many = (n: number) => `---\ntheme: indaco\nplugins: [gantt-plugin]\n---\n\n## Many\n\n${Array.from({ length: n }, (_, i) => `\`\`\`gantt\nrow ${i}\n\`\`\`\n`).join('\n')}`;

	it('a remembered fence counts its RAW length, as a fresh one did (a result that shrinks in the sanitizer does not escape the cap on the second render)', async () => {
		await approve();
		// 1.5M raw each, but the sanitizer keeps only a sliver: raw is what the cap counts, fresh or remembered.
		renderer = () => `<script>${'x'.repeat(1_500_000)}</script><p>k</p>`;
		const first = await draw(many(4));
		const second = await draw(many(4));
		const drawn = (h: string) => (h.match(/data-lattice-plugin="gantt-plugin"/g) || []).length;
		expect(drawn(first)).toBe(2);
		expect(drawn(second)).toBe(drawn(first));
	});

	it('the memo is bounded in characters, not only in entries', async () => {
		await approve();
		renderer = (f) => `<p>${f.body.slice(0, 8).replace(/\W/g, '')}${'m'.repeat(3_000_000)}</p>`;
		for (let k = 0; k < 12; k++) await draw(`---\ntheme: indaco\nplugins: [gantt-plugin]\n---\n\n## M${k}\n\n\`\`\`gantt\nunique-${k}\n\`\`\`\n`);
		const before = opened.length;
		// The first fence was evicted long ago (12 x 3M > the 24M bound): drawing it again runs the renderer again.
		await draw(`---\ntheme: indaco\nplugins: [gantt-plugin]\n---\n\n## M0\n\n\`\`\`gantt\nunique-0\n\`\`\`\n`);
		expect(opened.length).toBeGreaterThan(before);
		// 13 renders of 3 MB each, sanitized: about 20 s of CPU on a loaded runner, which is the suite's default timeout. A bound that is
		// right is not a reason for the test that pins it to fail on a slow machine, so it gets its own, generous one.
	}, 120_000);
});

describe('the placeholder takes space the way the plugin says (plugin.schema.json placeholder)', () => {
	const attrs = (html: string) => {
		const m = /<div data-lattice-plugin-off="gantt-plugin" data-placement="(\w+)"( data-size="(\w+)")?( style="--lp-w:(\d+);--lp-h:(\d+)")?/.exec(html);
		return m ? { placement: m[1], size: m[3] ?? null, ratio: m[5] ? `${m[5]}/${m[6]}` : null } : null;
	};
	const install = (placeholder?: { placement?: string; aspect?: string; size?: string }, c = code) => setPlugins([{ name: 'gantt-plugin', fence: 'gantt', code: c, ...(placeholder ? { placeholder } : {}) }]);

	it('with nothing declared it is a figure with no ratio of its own (the stylesheet’s 16 / 9)', async () => {
		await approve();
		expect(attrs(await draw(DECK_UNLISTED))).toEqual({ placement: 'figure', size: null, ratio: null });
	});

	it('a declared figure ratio sizes it', async () => {
		await install({ aspect: '3/1' });
		await approve();
		expect(attrs(await draw(DECK_UNLISTED))).toEqual({ placement: 'figure', size: null, ratio: '3/1' });
	});

	it('stage fills the stage, and carries no ratio even when one is declared', async () => {
		await install({ placement: 'stage', aspect: '3/1' });
		await approve();
		expect(attrs(await draw(DECK_UNLISTED))).toEqual({ placement: 'stage', size: null, ratio: null });
	});

	it('a chip is a square in the avatar size scale, mark only, named in its title', async () => {
		await install({ placement: 'chip', size: 'lg' });
		await approve();
		const html = await draw(DECK_UNLISTED);
		expect(attrs(html)).toEqual({ placement: 'chip', size: 'lg', ratio: null });
		expect(html).toMatch(/data-placement="chip"[^>]*title="gantt-plugin: not listed in this deck's plugins:"/);
		expect(html).not.toMatch(/<div data-lattice-plugin-off[^>]*data-placement="chip"[^>]*>(?:(?!<\/div>).)*lattice-plugin-words/);
	});

	it('for a figure, the proportions of the last drawn output win over the declared ones, by the code’s digest', async () => {
		await install({ aspect: '3/1' });
		await approve();
		renderer = () => '<svg viewBox="0 0 400 100" width="400"><rect width="4" height="4"></rect></svg>';
		await draw(DECK);
		expect(attrs(await draw(DECK_UNLISTED))?.ratio).toBe('4/1');
		// A different version of the code is a different plugin: it does not inherit the size.
		await install({ aspect: '5/1' }, `${code}\n/* v2 */`);
		expect(attrs(await draw(DECK_UNLISTED))?.ratio).toBe('5/1');
	});

	it('what was remembered does not size a stage or a chip, and plain output remembers nothing', async () => {
		await install({ placement: 'stage' });
		await approve();
		renderer = () => '<svg viewBox="0 0 400 100" width="400"><rect width="4" height="4"></rect></svg>';
		await draw(DECK);
		expect(attrs(await draw(DECK_UNLISTED))).toEqual({ placement: 'stage', size: null, ratio: null });
		await install(undefined, `${code}\n/* plain */`);
		await approve(`${code}\n/* plain */`);
		renderer = () => '<p>plain</p>';
		await draw(DECK);
		expect(attrs(await draw(DECK_UNLISTED))?.ratio).toBeNull();
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

describe('a plugin’s stylesheet reaches the previews, rebuilt behind its root', () => {
	it('an approved plugin’s sheet rides the stamp, every selector behind the plugin’s root; an unapproved one adds nothing; a hostile sheet adds nothing', async () => {
		const css = '.lp-x{color:red}\n}\nsection{visibility:hidden}\n.y{';
		await setPlugins([{ name: PLUGIN.name, fence: PLUGIN.fence, code, css: '.lp-x { color: var(--accent) }\nsection { display: block }' }]);
		expect(codePackagesStamp()).not.toContain('[data-lattice-plugin');
		approvePlugin({ name: PLUGIN.name, sha256: await pluginDigest(code, PLUGIN.fence) });
		const stamp = codePackagesStamp();
		expect(stamp).toContain(`[data-lattice-plugin="${PLUGIN.name}"] .lp-x {`);
		expect(stamp).toContain(`[data-lattice-plugin="${PLUGIN.name}"] section {`);
		await setPlugins([{ name: PLUGIN.name, fence: PLUGIN.fence, code, css }]);
		approvePlugin({ name: PLUGIN.name, sha256: await pluginDigest(code, PLUGIN.fence) });
		expect(codePackagesStamp()).not.toContain('visibility');
	});
});

describe('data returns (threat-model decisions 11 and 12): the CLI door’s rules, in the Studio', () => {
	const { RETURN_ENVELOPE, pluginReturnFields } = require('../../../../lib/packages/code-shape.mjs') as { RETURN_ENVELOPE: string; pluginReturnFields: (m: unknown) => ReturnType<typeof import('../../../../lib/packages/code-shape.mjs').pluginReturnFields> };
	const cli = require('../../../../lib/packages/trust.js') as { pluginDigest: (code: string, fence: string, kinds?: unknown[], returns?: unknown[]) => string };
	const RETURNS = { fields: { status: { type: 'word', values: ['ok', 'late'] }, note: { type: 'text' } } };
	const fields = pluginReturnFields({ contributes: { returns: RETURNS } });
	const returning = (data: Record<string, unknown>) => () => `${RETURN_ENVELOPE}${JSON.stringify({ html: '<p>drawn</p>', data })}`;
	const install = async () => {
		await setPlugins([{ name: PLUGIN.name, fence: PLUGIN.fence, code, returns: RETURNS }]);
		await approvePlugin({ name: PLUGIN.name, sha256: await pluginDigest(code, PLUGIN.fence, [], fields) });
	};
	const statusOf = async (deck: string) => {
		let status: { failed?: { name: string; why: string }[] } = {};
		const off = onCodePackagesStatus((s) => {
			status = s;
		});
		const html = await draw(deck, true);
		off();
		return { html, failed: status.failed ?? [] };
	};

	it('the declaration is pinned into the digest the CLI computes, and an approval without it does not run the plugin', async () => {
		expect(await pluginDigest(code, PLUGIN.fence, [], fields)).toBe(cli.pluginDigest(code, PLUGIN.fence, [], fields));
		expect(await pluginDigest(code, PLUGIN.fence, [], fields)).not.toBe(await pluginDigest(code, PLUGIN.fence));
		await setPlugins([{ name: PLUGIN.name, fence: PLUGIN.fence, code, returns: RETURNS }]);
		await approve();
		expect(await draw(DECK)).toContain('Plugin block · not approved in this browser');
	});

	it('a clean value lands on the slide’s own <section>, escaped', async () => {
		await install();
		renderer = returning({ status: 'late', note: 'a "q" & b' });
		const html = await draw(DECK);
		expect(html).toContain('<p>drawn</p>');
		expect(html).toMatch(/<section\b[^>]*data-returned-gantt-plugin--status="late"[^>]*data-returned-gantt-plugin--note="a &quot;q&quot; &amp; b"/);
	});

	it('a value its declaration does not admit disables the plugin for the render, with a note and a strip alert, every render the result is reused', async () => {
		await install();
		renderer = returning({ status: 'late', note: '</style><img src=//e>' });
		for (const pass of [1, 2]) {
			const { html, failed } = await statusOf(DECK);
			expect(html, `pass ${pass}`).not.toContain('<p>drawn</p>');
			expect(html).not.toMatch(/data-returned-|<img src=\/\/e/);
			expect(html).toContain('the plugin was disabled for this render, because its note holds markup');
			expect(failed.some((f) => /disabled for this render/.test(f.why))).toBe(true);
		}
		expect(opened.map((o) => o.ran)).toEqual([1]);
	});

	it('a malformed envelope fails the block, and nothing of it lands', async () => {
		await install();
		renderer = () => `${RETURN_ENVELOPE}{"html":3}`;
		const html = await draw(DECK);
		expect(html).toContain('the renderer returned an object whose html is not text');
		expect(html).not.toMatch(/data-returned-/);
	});

	it('two blocks on one slide with different values for one field: the first is kept, and the strip says so', async () => {
		await install();
		renderer = (f) => `${RETURN_ENVELOPE}${JSON.stringify({ html: '<p>drawn</p>', data: { status: f.body.includes('Second') ? 'ok' : 'late' } })}`;
		const deck = '---\ntheme: indaco\nplugins: [gantt-plugin]\n---\n\n## Two\n\n```gantt\nFirst 1\n```\n\n```gantt\nSecond 2\n```\n';
		const { html, failed } = await statusOf(deck);
		expect(html).toContain('data-returned-gantt-plugin--status="late"');
		expect(html).not.toContain('data-returned-gantt-plugin--status="ok"');
		expect(failed.some((f) => /two different values for status/.test(f.why))).toBe(true);
	});

	it('host slots: `${field}` in the drawing’s visible text takes the checked value, on every render a remembered result is reused', async () => {
		await install();
		renderer = () => `${RETURN_ENVELOPE}${JSON.stringify({ html: '<p class="x" title="${status}">${status}: ${note} ${nope}</p>', data: { status: 'late', note: 'a < b & c' } })}`;
		for (const pass of [1, 2]) {
			const html = await draw(DECK);
			expect(html, `pass ${pass}`).toContain('title="${status}"');
			expect(html).toContain('late: a &lt; b &amp; c ${nope}');
		}
		expect(opened.map((o) => o.ran)).toEqual([1]);
	});

	it('host slots: a disabled plugin and a failed block keep what they had; no value reaches a note', async () => {
		await install();
		renderer = () => `${RETURN_ENVELOPE}${JSON.stringify({ html: '<p>${note}</p>', data: { status: 'evil', note: 'x' } })}`;
		const html = await draw(DECK);
		expect(html).not.toMatch(/<p>x<\/p>/);
		expect(html).toContain('the plugin was disabled for this render');
	});

	it('a stored record with a malformed declaration does not stop the plugin door: it declares nothing, so its data is refused', async () => {
		await setPlugins([{ name: PLUGIN.name, fence: PLUGIN.fence, code, returns: { fields: { status: { type: 'word' } } } }]);
		await approvePlugin({ name: PLUGIN.name, sha256: await pluginDigest(code, PLUGIN.fence) });
		renderer = returning({ status: 'late' });
		const { html, failed } = await statusOf(DECK);
		expect(html).toContain('it declares no return fields');
		expect(failed.some((f) => /disabled for this render/.test(f.why))).toBe(true);
	});
});
