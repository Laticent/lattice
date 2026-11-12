---
status: in-progress
summary: Offline on Firefox the Studio preview stopped drawing after the first edit. The cause is a Gecko behavior, not srcdoc routing in general — a frame's FIRST srcdoc document is a service-worker client, but setting `srcdoc` AGAIN on the same element gives a document with no controller, online and offline alike, so its runtime, fonts and Mermaid go to the network. Chromium and WebKit keep the controller. Fix: `docs/src/lib/srcdoc-write.js` `writeSrcdoc` detaches the frame, assigns, and re-inserts it when the page is controlled and the frame already holds a srcdoc document. The markup is unchanged (HARD RULE #22 untouched), one code path for every engine, no measurable cost. #3152's diagnosis ("Gecko never routes a srcdoc frame through the worker") was a misread of a CSP block.
---

# Firefox: a srcdoc REWRITE loses the service worker

**Date:** 2026-11-12 · **Status:** DECIDED (decision D2 option A, a dedicated session with the adversarial trio) ·
**Scope:** the docs site's live preview frames (the Studio's `single-slide-render.ts`, the Playground's `deck-render.js`).
No export path, no builder's markup.

## 1. The answer

A document reached by setting `srcdoc` a second time on the same `<iframe>` gets no service-worker controller in Gecko.
The Studio preview writes `srcdoc` on every full render, so from the first edit on, the preview's `lattice-runtime.js`,
its theme fonts and Mermaid are fetched from the network. Offline, every one of them fails and nothing hydrates. The fix
re-inserts the frame around the assignment, which gives it a fresh browsing context, and Gecko makes that one a client.

## 2. What was measured (Firefox 142.0.1, Playwright's `gecko` project, the built site over `serve-dist.ts`)

Each probe made its frames from the top page of a controlled Studio session, then fetched
`/playground/v/<hash>/lattice-runtime.js` from inside the frame.

| Frame | `navigator.serviceWorker.controller` in the frame | fetch, offline |
|---|---|---|
| first `srcdoc` write on a new element | set | 200 from the worker (1,473,476 bytes) |
| `srcdoc` set again on that element | **null** | **fails** |
| third write | null | fails |
| `removeAttribute('srcdoc')`, then set | null | fails |
| `src = 'about:blank'`, load, then set `srcdoc` | null | fails |
| a fresh element | set | 200 |
| detach, set `srcdoc`, re-insert at the same place | set | 200 |
| about:blank (no src), a same-origin `src`, a `blob:` document | set | 200 |

The second row behaves the same ONLINE: the frame is still uncontrolled and its requests go to the network, which
answers, so nobody saw it. Chromium (desktop) and WebKit (`webkit-tablet`) return "set, 200" for every row.

The Studio's live frame shows the same thing end to end. After the offline edit, its resource timing lists
`lattice-runtime.js` and the JetBrains Mono faces with status 0, and the console reports
`downloadable font: download failed … status=2152398861` (NS_ERROR_CONNECTION_REFUSED).

### Why #3152 concluded otherwise

#3152 fetched the runtime from inside the live preview frame and saw it fail for every cache mode, while the controller
read "set". Two things were mixed in that probe. First, the frame it read may have been a first-write document while
the failing loads came from a rewrite. Second, the preview's meta CSP has `connect-src 'self'`, and **in a srcdoc frame
Gecko does not match `'self'` to the parent's origin**: `fetch` is blocked by CSP online and offline alike (console:
"The page's settings blocked the loading of a resource (connect-src)"). Measured: `connect-src 'self'` and
`default-src 'self'` fail, while `connect-src <the origin>`, `connect-src *` and an unrelated directive (`img-src 'self'`)
pass. So an in-frame `fetch` cannot test service-worker routing in this frame. The `<script src>`, the fonts and Mermaid
are governed by `script-src` (nonce, `strict-dynamic`) and `font-src` (the origin is listed explicitly), so the CSP
trap does not touch them. The worker trap does.

### Upstream

No Gecko bug matches. Bug 1426979 (fixed in Firefox 59) made about:blank and about:srcdoc documents keep their
controller, and its tests cover a first load only. Bug 1942354 (Firefox 136) is about srcdoc inheritance in general.
Filing a new report is an outward-facing act, so it is left to the owner (follow-up note,
`followups.d/gecko-srcdoc-rewrite-upstream.md`).

## 3. Options

| Option | What it costs | Verdict |
|---|---|---|
| **A. Re-insert the frame around a rewrite** (`writeSrcdoc`) | 40 lines; the frame's window is a new object after a write | **chosen** |
| B. Give the frame a real same-origin URL the worker serves | a new route the worker must synthesize from the parent's markup, a second path for an uncontrolled first visit, and a builder change at the #22 sink | larger than the defect |
| C. The parent supplies the bytes (inline the runtime, blob URLs) | 1.4 MB re-parsed per write, or a blob per asset; the runtime's "load Mermaid beside me" and every `url()` in the theme would need rewriting; touches what markup the frame receives (#22) | larger, and riskier |
| D. A fresh `<iframe>` element per write | callers hold the element (React refs, `host` lookups, `onload`); every one would need re-wiring | larger than A for the same effect |
| E. Re-insert on Gecko only (user-agent test) | Chromium CI never runs the branch; a sniff to maintain | rejected: A costs nothing measurable (§5) |

## 4. The fix, and what it keeps

`writeSrcdoc(frame, html)` assigns in place unless the page has a controller AND the frame is connected AND it already
holds a `srcdoc` document. Then it removes the frame, assigns, and inserts it back before the same sibling. If the
frame had focus, it gets focus back (the preview's keyboard verbs live on it). The element is the same object, so its
id, classes, inline style, `onload` and listeners survive. Its window is new, which matters only to code that cached
`contentWindow` across a write; an audit of every `contentWindow` read under `docs/src` found none that does (each reads
it after the load).

**HARD RULE #22.** The helper never sees markup it did not get from a builder: each call site passes exactly what it
assigned to `.srcdoc` before (`srcdoc()` in `single-slide-render.ts`, `buildSrcdoc` in `deck-render.js`, both
sanitized). No allowlist changes. The frame's CSP, nonce and sandbox are as before.

**Not changed:** the export capture frame (`deck-export.js` `createCaptureFrame`), Print (`PrintOptionsPanel.tsx`) and
the player prune frame (`player-prune-browser.ts`) each write `srcdoc` once into a frame they just created, and a first
write is controlled in every engine (§2). The sandboxed draw and code-package frames have an opaque origin, which is
never a worker client in any engine; the draw host already falls back to the page for that. A future builder that
rewrites a live frame should call `writeSrcdoc` too.

## 5. Cost

Median time from the write to the runtime's boot mark, ten rewrites each of the real Studio preview document, same
machine, three runs:

| Engine | in place | re-insert |
|---|---|---|
| Chromium | 46 / 49 / 52 ms | 48 / 49 / 48 ms |
| Gecko | 217 / 243 / 231 ms | 239 / 255 / 228 ms |
| WebKit | 181 / 231 / 186 ms | 211 / 229 / 193 ms |

The run-to-run spread is larger than the difference in every engine, so the fix ships for all of them.

## 6. Evidence

`docs/e2e/studio-warm-offline.spec.ts` "a diagram never rendered online draws offline" on gecko, webkit-tablet and
desktop; the failing arm and the repeat counts are in the PR. Unit: `docs/src/lib/srcdoc-write.test.ts`.

**A harness note, not a product one.** Offline on Gecko, Playwright's mouse input hangs after `serve-dist`'s server is
closed, even on the bare `/offline/` page, while the keyboard and `evaluate` answer. So that spec focuses the editor
instead of clicking it. A real user's click is an OS event and never goes through that path.
