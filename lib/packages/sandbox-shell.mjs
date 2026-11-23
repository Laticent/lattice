/**
 * lib/packages/sandbox-shell.mjs — how a sandboxed frame gets its document on a page with a strict policy.
 *
 * The site's two sandboxes — the code-package runner (docs/src/lib/code-packages/runner.ts) and the draw
 * host (docs/src/lib/code-packages/draw-host.ts) — each build a whole document with its own strict policy
 * and the exact hash of the one script it allows (`sandboxCsp`, `drawFrameCsp`). They used to hand it to an
 * `<iframe sandbox="allow-scripts">` as `srcdoc`. A srcdoc document INHERITS its parent page's policy as
 * well, and the page's policy (docs/scripts/csp.mjs) allows only same-origin files and the hashes of the
 * page's own inline scripts: so the frame's script, allowed by its own policy, was refused by the page's.
 * A `data:` or `blob:` document inherits the same way (measured in Chromium, Gecko and WebKit, 2026-11-17).
 * Only a document loaded from a URL starts with no policy but its own.
 *
 * So the frame loads THIS shell from the site, beside the runtime, and the shell writes the host's
 * document into itself: `document.open()` + `write()` + `close()`. The written document's own
 * `<meta http-equiv="Content-Security-Policy">` applies on top of the shell's, so what runs is exactly
 * what the host's document allows, and nothing the shell would add: the shell's own policy is the
 * looser of the two in every directive the documents use, and it closes the rest. Measured in all three
 * engines: the hashed inline script runs, an unhashed one is refused, a `fetch` is refused, a module
 * from the named directory loads, and `'unsafe-eval'` works only where the written document grants it
 * (function-plot's frame does). WebKit needs `*` in the shell's `script-src` for the module case: a
 * sandboxed document's `'self'` does not match the site there.
 *
 * The HOSTS frame it `sandbox="allow-scripts"` (an opaque origin, no `allow-same-origin`), and the shell
 * REFUSES to run any other way (see SHELL_SCRIPT): it acts only in an opaque document, and only on a
 * document sent from the site's own origin. The frame's window is the same before and after the write,
 * so the hosts' `e.source === frame.contentWindow` checks are unchanged, and `document.open()` drops the
 * shell's listener before the document's own scripts run.
 */

/** The shell's file name, beside `lattice-runtime.js` in the versioned asset directory. */
export const SANDBOX_SHELL_FILE = 'lattice-sandbox.html';

/** The shell's hello, and the message that carries the document. */
export const SHELL_READY = 'lattice-sandbox-shell';
export const SHELL_DOC = 'lattice-sandbox-doc';

/**
 * The shell's own policy: loose only where a written document's policy is the narrower one, closed
 * everywhere else. `script-src` must admit every script a written document allows (its hashed inline
 * script, `'unsafe-eval'` for a library that declares it, modules from an http(s) directory), and
 * `font-src` every face directory a draw frame names.
 */
export const SHELL_CSP = [
  "default-src 'none'",
  "script-src * 'unsafe-inline' 'unsafe-eval'",
  "style-src 'unsafe-inline'",
  'img-src data: blob:',
  'font-src * data:',
  "connect-src 'none'",
  "media-src 'none'",
  "frame-src 'none'",
  "child-src 'none'",
  'worker-src blob:',
  "object-src 'none'",
  "manifest-src 'none'",
  "form-action 'none'",
  "base-uri 'none'",
].join('; ');

// The one shape the shell writes: a document whose own policy comes first and starts by denying
// everything (runner.ts `frameDoc` via code-door-core `sandboxCsp`, draw-frame-core.mjs `drawFrameCsp`).
// Without it the written document would run under the shell's policy alone, which admits any script
// host (`script-src *`); every host writes this prefix today, and the shell refuses anything else
// rather than trusting the next caller to (found by the red team). The `default-src 'none'` is part of
// the prefix because a policy tag alone proves nothing: `content=""` is an empty policy, which the
// browser ignores (found by the code checker).
// The `;` closes the directive: `default-src 'none' *` is `default-src *` (a source list that names
// anything beside 'none' ignores the 'none').
export const SHELL_DOC_PREFIX = '<!doctype html><html><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="default-src \'none\';';

/**
 * Is the written document's own `script-src` as narrow as every host writes it? The prefix proves the
 * policy denies by default, but `default-src` covers only the directives a policy leaves out, so
 * `default-src 'none'; script-src *` would still pass it (found by the code checker on 32ab992). The
 * shell keeps its own policy across `document.open()`, and the written document runs under both, so
 * the pair is only as strict as the written one. Every host writes `script-src` as hashes, plus
 * `'unsafe-eval'` for function-plot's frame and one ESM base URL for the module frame
 * (code-door-core `sandboxCsp`, draw-frame-core `drawFrameCsp` / `drawFrameEsmCsp`). Refused: a policy
 * with no hashed `script-src`, a wildcard, `'unsafe-inline'`, `'strict-dynamic'`, a bare scheme, or a
 * `script-src-elem` / `script-src-attr` that would override it, or any `&` (a character reference the
 * browser decodes first). Runs inside the shell, so it is
 * serialized with `toString()` and must stay self-contained ES5.
 * @param {string} html @param {string} prefix
 */
export function shellPolicyOk(html, prefix) {
  if (html.indexOf(prefix) !== 0) return false;
  var end = html.indexOf('"', prefix.length);
  if (end < 0) return false;
  var policy = html.slice(prefix.length, end);
  // A browser decodes character references in an attribute before it applies the policy, so `&#42;`
  // is `*` to it and invisible to the checks below (found by the card grader). No host writes `&`.
  if (policy.indexOf('&') >= 0) return false;
  if (/script-src-(elem|attr)/.test(policy)) return false;
  var m = /(^|;)\s*script-src\s+([^;]*)/.exec(policy);
  if (!m) return false;
  var list = ' ' + m[2] + ' ';
  if (/\*|'unsafe-inline'|'strict-dynamic'|\s(https?|data|blob|filesystem):\s/.test(list)) return false;
  return list.indexOf(" 'sha256-") >= 0;
}

// TWO ORIGIN GUARDS (and the prefix above), because the shell is a public file and its safety must not rest on the caller. A page on
// ANY origin can frame it; without these, an unsandboxed frame on someone else's site would write that
// site's script onto ours (found by review, reproduced in all three engines).
//   - `self.origin === "null"`: the document is OPAQUE, which holds only in a frame sandboxed without
//     `allow-same-origin`. Framed any other way, the shell does nothing at all.
//   - `e.origin === location.origin`: the document comes from a page on the site. A sandboxed document's
//     `location` keeps the URL's origin, so this pins the sender to our origin, whoever framed us.
const SHELL_SCRIPT =
  '(function(){if(self.origin!=="null"||window===parent)return;var done=false;var ok=' +
  shellPolicyOk.toString() +
  ';' +
  'addEventListener("message",function on(e){' +
  `if(done||e.source!==parent||e.origin!==location.origin||!e.data||e.data.t!==${JSON.stringify(SHELL_DOC)}||typeof e.data.html!=="string"||!ok(e.data.html,${JSON.stringify(SHELL_DOC_PREFIX)}))return;` +
  'done=true;removeEventListener("message",on);document.open();document.write(e.data.html);document.close();});' +
  `parent.postMessage({t:${JSON.stringify(SHELL_READY)}},"*");})();`;

/** The text of `lattice-sandbox.html`, staged by docs/scripts/sync-playground-assets.mjs. */
export function sandboxShellHtml() {
  return `<!doctype html><html><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="${SHELL_CSP}"><meta name="robots" content="noindex"></head><body><script>${SHELL_SCRIPT}</script></body></html>\n`;
}

/** Does the page carry a Content-Security-Policy its srcdoc frames would inherit? */
export function pageHasPolicy(doc) {
  return !!doc?.querySelector?.('meta[http-equiv="Content-Security-Policy" i]');
}

/**
 * Load `html` into the sandboxed `frame`. Call before the frame joins the page. The host's own ready
 * message and timeout still decide whether the frame opened: a shell that never answers leaves the
 * document unwritten, which the host already reads as a frame that did not open.
 *
 * ONLY A PAGE WITH A POLICY USES THE SHELL. A page without one (the Studio today) writes `srcdoc` as it
 * always did: nothing is inherited there, and a srcdoc needs no network, where the shell is a navigation
 * a sandboxed frame makes past the service worker (it never controls an opaque-origin frame), so it is
 * only as available offline as the HTTP cache.
 * @param {HTMLIFrameElement} frame
 * @param {string} html the whole document, with its own policy
 * @param {string | null} shellUrl the shell's URL (`SANDBOX_SHELL_FILE` beside the runtime), or null when unknown
 * @param {Window} [win] the page's window (a test passes its own)
 * @returns {() => void} stops waiting for the shell's hello (call when the frame is closed)
 */
export function loadSandboxed(frame, html, shellUrl, win = globalThis.window) {
  if (!pageHasPolicy(win?.document)) {
    frame.srcdoc = html;
    return () => {};
  }
  if (!shellUrl) throw new Error('this page has a content policy, and no sandbox shell is known yet to open the frame through');
  const onHello = (e) => {
    if (e.source !== frame.contentWindow || !e.data || e.data.t !== SHELL_READY) return;
    win.removeEventListener('message', onHello);
    frame.contentWindow.postMessage({ t: SHELL_DOC, html }, '*');
  };
  win.addEventListener('message', onHello);
  frame.src = shellUrl;
  return () => win.removeEventListener('message', onHello);
}
