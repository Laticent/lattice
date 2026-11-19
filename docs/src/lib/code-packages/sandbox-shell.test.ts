/**
 * The sandbox shell (lib/packages/sandbox-shell.mjs): how a sandboxed frame gets its own strict document
 * on a page whose policy a srcdoc would inherit. The shell's behavior in a real browser (the written
 * document's policy applies; an unhashed script is refused) is driven by e2e/site-csp.spec.ts; these
 * cells pin the host half and the shell's own policy.
 */

import { describe, expect, it } from 'vitest';
import { loadSandboxed, SANDBOX_SHELL_FILE, SHELL_CSP, SHELL_DOC, SHELL_DOC_PREFIX, SHELL_READY, sandboxShellHtml } from '../../../../lib/packages/sandbox-shell.mjs';

describe('the sandbox shell', () => {
	it('is one inline script under a policy that opens nothing outward', () => {
		const doc = new DOMParser().parseFromString(sandboxShellHtml(), 'text/html');
		expect(doc.querySelectorAll('script')).toHaveLength(1);
		expect(doc.querySelector('meta[http-equiv="Content-Security-Policy"]')?.getAttribute('content')).toBe(SHELL_CSP);
		for (const closed of ["connect-src 'none'", "frame-src 'none'", "object-src 'none'", "form-action 'none'", "base-uri 'none'", "default-src 'none'"]) expect(SHELL_CSP).toContain(closed);
		expect(SANDBOX_SHELL_FILE).toMatch(/\.html$/);
	});

	it('hands the document over only when its own frame says hello, and only once', () => {
		const posted: unknown[] = [];
		const contentWindow = { postMessage: (m: unknown) => posted.push(m) };
		const frame = { src: '', contentWindow } as unknown as HTMLIFrameElement;
		// A page with a content policy, which a srcdoc would inherit: only there does the frame go through the shell.
		const win = Object.assign(new EventTarget(), { document: { querySelector: () => ({}) } }) as unknown as Window;
		const say = (source: unknown, data: unknown) => win.dispatchEvent(Object.assign(new Event('message'), { source, data }));
		loadSandboxed(frame, '<!doctype html><p>doc</p>', '/v/1/lattice-sandbox.html', win);
		expect(frame.src).toBe('/v/1/lattice-sandbox.html');
		say({}, { t: SHELL_READY }); // another window
		say(contentWindow, { t: 'ready' }); // not the hello
		expect(posted).toEqual([]);
		say(contentWindow, { t: SHELL_READY });
		say(contentWindow, { t: SHELL_READY });
		expect(posted).toEqual([{ t: SHELL_DOC, html: '<!doctype html><p>doc</p>' }]);
	});

	it('leaves a page with no policy on srcdoc, which needs no network', () => {
		const frame = { src: '', srcdoc: '', contentWindow: {} } as unknown as HTMLIFrameElement;
		const win = Object.assign(new EventTarget(), { document: { querySelector: () => null } }) as unknown as Window;
		loadSandboxed(frame, '<p>doc</p>', null, win);
		expect(frame.srcdoc).toBe('<p>doc</p>');
		expect(frame.src).toBe('');
		// …and a page WITH one refuses rather than fall back to the srcdoc its policy would break.
		const strict = Object.assign(new EventTarget(), { document: { querySelector: () => ({}) } }) as unknown as Window;
		expect(() => loadSandboxed(frame, '<p>doc</p>', null, strict)).toThrow(/no sandbox shell/);
	});

	// THE SHELL IS A PUBLIC FILE: any page can frame it. Review found the first version wrote ANY framing
	// page's document onto our origin. This runs the shell's own script against each way it can be framed.
	it('writes a document only for a sandboxed frame whose page is on the site', () => {
		const script = new DOMParser().parseFromString(sandboxShellHtml(), 'text/html').querySelector('script')!.textContent!;
		const SITE = 'https://lattice.style';
		const OWN = `${SHELL_DOC_PREFIX}default-src 'none'"></head><body><p>x</p></body></html>`;
		const run = (selfOrigin: string, senderOrigin: string, html = OWN, fromParent = true) => {
			const listeners: Array<(e: unknown) => void> = [];
			const parent = { postMessage() {} };
			const written: string[] = [];
			const doc = { open() {}, write: (h: string) => written.push(h), close() {} };
			const win = { origin: selfOrigin };
			new Function('self', 'window', 'parent', 'location', 'document', 'addEventListener', 'removeEventListener', script)(
				win, win, parent, { origin: SITE }, doc, (_t: string, f: (e: unknown) => void) => listeners.push(f), () => {},
			);
			for (const f of listeners) f({ source: fromParent ? parent : {}, origin: senderOrigin, data: { t: SHELL_DOC, html } });
			return written;
		};
		expect(run('null', SITE)).toEqual([OWN]); // the site's own sandboxed frame
		expect(run(SITE, SITE)).toEqual([]); // framed unsandboxed, even by the site
		expect(run('https://evil.example', 'https://evil.example')).toEqual([]); // unsandboxed on another site
		expect(run('null', 'https://evil.example')).toEqual([]); // sandboxed, but the page is another site
		expect(run('null', SITE, OWN, false)).toEqual([]); // the right origin, but not this frame's parent
	});

	// A document with no policy of its own would run under the shell's alone, which admits a script from
	// any host (`script-src *`). The red team showed it reaching an outside server in all three engines,
	// so the shell writes only a document that opens with its own policy, the shape both hosts write.
	it('refuses a document that does not open with its own policy', () => {
		const script = new DOMParser().parseFromString(sandboxShellHtml(), 'text/html').querySelector('script')!.textContent!;
		const write = (html: string) => {
			const listeners: Array<(e: unknown) => void> = [];
			const parent = { postMessage() {} };
			const written: string[] = [];
			const doc = { open() {}, write: (h: string) => written.push(h), close() {} };
			const win = { origin: 'null' };
			new Function('self', 'window', 'parent', 'location', 'document', 'addEventListener', 'removeEventListener', script)(
				win, win, parent, { origin: 'https://lattice.style' }, doc, (_t: string, f: (e: unknown) => void) => listeners.push(f), () => {},
			);
			for (const f of listeners) f({ source: parent, origin: 'https://lattice.style', data: { t: SHELL_DOC, html } });
			return written.length;
		};
		expect(write('<!doctype html><html><head><meta charset="utf-8"></head><body><script>1</script>')).toBe(0);
		expect(write(` ${SHELL_DOC_PREFIX}x">`)).toBe(0); // the policy must come FIRST, not merely appear
		expect(write(`${SHELL_DOC_PREFIX}default-src 'none'"></head>`)).toBe(1);
	});
});
