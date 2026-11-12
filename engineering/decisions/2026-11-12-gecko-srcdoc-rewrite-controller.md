---
status: in-progress
summary: Offline on Firefox the Studio preview drew nothing. Gecko gives a srcdoc document the page's service worker only when `srcdoc` was set BEFORE the frame entered the page; a rewrite, or a first write into a frame appended empty, gets none, so the runtime, fonts and Mermaid go to the network. Chromium and WebKit control every case. Fix — `docs/src/lib/srcdoc-write.js` `writeSrcdoc`: a new frame is written, then appended; a live frame is detached, written and put back, but only on an engine a one-off probe shows drops the controller (no user-agent test; it switches off when Gecko is fixed). Markup unchanged (HARD RULE #22). #3152's "Gecko never routes srcdoc" was a misread of a CSP `'self'` block. The gecko e2e cannot pass reliably until Playwright's Firefox driver stops crashing on a re-inserted frame.
---

# Firefox: a srcdoc set on a live frame loses the service worker

**Date:** 2026-11-12 · **Status:** in progress (the fix is in PR; the gecko e2e waits on #3152 and on a Playwright
decision, §7) · **Scope:** the docs site's preview frames that the Studio, the Playground and Print rewrite. No export
path, no builder's markup.

## 1. The answer

Gecko hands a `srcdoc` document the page's service-worker controller only when `srcdoc` was set before the frame went
into the page. The Studio appended its frame empty and wrote it afterward, then wrote it again on every full render, so
none of its documents was a worker client. Offline, `lattice-runtime.js`, the theme fonts and Mermaid all failed, and
nothing hydrated.

The fix writes a new frame before appending it. A frame already in the page is taken out, written and put back, which
gives it a fresh browsing context that Gecko does control. That second move runs only on an engine that needs it.

## 2. What was measured (Firefox 142.0.1, Playwright's `gecko` project, the built site over `serve-dist.ts`)

Frames made from the top page of a controlled Studio session; each fetched `/playground/v/<hash>/lattice-runtime.js`
from inside the frame, offline.

| Frame | controller in the frame | fetch, offline |
|---|---|---|
| `srcdoc` set, then appended | set | 200 from the worker (1,473,476 bytes) |
| that frame, `srcdoc` set again | **null** | **fails** |
| a third write | null | fails |
| `removeAttribute('srcdoc')`, then set | null | fails |
| `src = 'about:blank'`, load, then set `srcdoc` | null | fails |
| detach, set `srcdoc`, put back at the same place | set | 200 |
| a fresh element | set | 200 |
| about:blank (no src), a same-origin `src`, a `blob:` document | set | 200 |

The independent checker found the row this table first missed, on the same Firefox build with a minimal pass-through
worker: a frame **appended empty and then written** is uncontrolled on its first document too (Chromium: controlled).
That is how `mountLiveFrame` built the Studio's frame. The red team found the same for a frame that exists before the
page is controlled. Online, all of these go to the network and succeed, so nobody saw it. Chromium (desktop) and WebKit
(`webkit-tablet`) are controlled in every row.

In the Studio, after an offline edit, the live frame's resource timing lists `lattice-runtime.js` and the JetBrains Mono
faces with status 0, and the console reports `downloadable font: download failed … status=2152398861`
(NS_ERROR_CONNECTION_REFUSED).

### Why #3152 concluded otherwise

#3152 fetched the runtime from inside the live frame and saw it fail for every cache mode. But the preview's meta CSP
has `connect-src 'self'`, and **in a Gecko srcdoc frame `'self'` does not match the parent's origin**: that `fetch` is
blocked by CSP online and offline alike (console: "The page's settings blocked the loading of a resource (connect-src)").
Measured: `connect-src 'self'` and `default-src 'self'` fail; `connect-src <the origin>`, `connect-src *` and an
unrelated directive pass. So an in-frame `fetch` cannot test the worker in this frame. The `<script src>` is allowed by
nonce, and `font-src` already names the origin (a fix for this same gap), so the CSP trap does not touch the preview's
own loads.

It does touch images. The inversion reviewer measured `img-src 'self'` blocking a same-origin `<img>` in a Gecko srcdoc
frame, and the preview policy's `img-src` and `media-src` are `'self' data: blob:` (`lib/core/subresource-csp.mjs`), so
a `sample:` image is likely blocked in the Firefox preview online and offline. That is pre-existing and the fix is one
line, but the Studio's export capture frame shares the policy, so the fix changes a Firefox export's bytes. That needs
the owner's sign-off (QUALITY BAR, exports), so it is a decision, not part of this change (§7).

### Upstream

No Gecko bug matches. Bug 1426979 (fixed in Firefox 59) made about:blank and about:srcdoc documents keep their
controller on a first load; Bug 1942354 (Firefox 136) is about srcdoc inheritance in general. Filing a report is an
outward-facing act, so it is left to the owner (§7).

## 3. Options

| Option | What it costs | Verdict |
|---|---|---|
| **A. Write a new frame before appending it; re-insert a live frame around a write** (`writeSrcdoc`) | ~100 lines with the probe; the frame's window is a new object after a re-insert | **chosen** |
| B. Give the frame a real same-origin URL the worker serves | a route the worker must synthesize from the parent's markup, a second path for an uncontrolled first visit, a builder change at the #22 sink | larger than the defect |
| C. The parent supplies the bytes (inline the runtime, blob URLs) | 1.4 MB re-parsed per write, or a blob per asset; every `url()` in the theme rewritten; changes what markup the frame receives (#22) | larger, riskier |
| D. A fresh `<iframe>` element per write | every caller holds the element (React refs, `host` lookups, `onload`) | larger than A for the same effect |
| E. Re-insert on every engine | no probe | rejected after measuring (§5) |
| F. Re-insert on Gecko only, by user-agent | a sniff to maintain, and it never switches off | rejected for the probe |

## 4. The fix

`writeSrcdoc(frame, html, parent?)`:

1. **A frame not in the page** is written, then appended to `parent`. Every engine controls that shape, so it needs no
   probe. `mountLiveFrame` no longer appends; both of its callers write in the same task and pass `host`.
2. **A frame in the page, on a controlled page,** is detached, written and put back before the same sibling, unless the
   probe has shown this engine keeps the controller. Focus that was on the frame comes back (looked up on the frame's
   own root, so a shadow root works). If the sibling moved, the frame is appended instead, never left out of the page.
3. **Otherwise** the write is in place, as before.

**The probe.** The first re-insert on a page starts it: a hidden 1×1 frame written twice, then read. "Controller kept"
sends that page back to in-place writes for good; "dropped" keeps re-inserting; a first document with no controller at
all (an engine that never serves srcdoc frames) also turns re-inserting off, since it cannot help. It writes two empty
paragraphs, never the deck. Measured by the red team: Firefox answers "drops" in 19 ms, Chromium "keeps" in 25 ms, WebKit
"keeps" in 14 ms.

**Call sites.** `single-slide-render.ts` (the bake write and the full write), `deck-render.js` (the Playground),
`PrintOptionsPanel.tsx` (Print reuses its kept frame, which the first draft of this note wrongly listed as written once).
The non-pooled print preview renders `<iframe srcDoc>` through React. Its key now changes with each new set of documents,
so React builds a fresh frame (written before it is inserted) instead of setting `srcdoc` on the one in the page.

**HARD RULE #22.** Every call passes exactly the expression it assigned before (`srcdoc()`, `buildSrcdoc(…)`, Print's
`doc`), all built and sanitized upstream. No allowlist changes. The gates key on the builders, not the assignment, and
`build:check` passes all four #22 checks. The frame's CSP, nonce and sandbox are unchanged.

**Not changed, and why.** The export capture frame (`deck-export.js` `createCaptureFrame`) and the player prune frame
(`player-prune-browser.ts`) append an empty frame and then write it, so by §2 they are uncontrolled on Firefox and an
offline Firefox export would miss its runtime and fonts. That is pre-existing and on the export path, which needs the
owner's sign-off, so it is recorded as a follow-up rather than changed here. The sandboxed draw and code-package frames
have an opaque origin, which is never a worker client in any engine; the draw host already falls back for that.

**Behavior a reviewer should know about.**
- After a re-insert, `frame.contentDocument` is a fresh `about:blank` until the new document commits, where an in-place
  write kept the outgoing one. In `deck-render.js`, a second full write in that gap reads no anchor and opens at slide 1.
  On Gecko an in-place write already blanks the document early (§5), so this is close to what Gecko did before.
- Re-inserting a focused frame fires the parent window's `focus` (and `blur` on Chromium and WebKit). Two handlers wake
  up (`StudioShell` asset refresh, `PlaygroundApp` hand-off check); both are idempotent. With the probe, Chromium and
  WebKit see it at most once per page.
- Exactly one `load` fires per write, for the new document (checked in all three engines, including a write during an
  in-flight load). `history.length` does not grow. Scroll position, ResizeObserver and keyboard input to the new
  document survive.

## 5. Cost

Time from the write to the runtime's boot mark, ten rewrites of the real Studio preview document, three runs, medians:

| Engine | in place | re-insert |
|---|---|---|
| Chromium | 46 / 49 / 52 ms | 48 / 49 / 48 ms |
| Gecko | 217 / 243 / 231 ms | 239 / 255 / 228 ms |
| WebKit | 181 / 231 / 186 ms | 211 / 229 / 193 ms |

Load time is within noise. What the screen shows is not: animation frames with no slide in the frame, six writes each,

| Engine | in place | re-insert |
|---|---|---|
| Chromium | 0,1,0,0,0,0 | 0,1,0,1,1,0 |
| WebKit | 0,0,0,0,0,0 | 0,0,1,0,0,0 |
| Gecko | 4,4,7,7,5,6 | 5,5,5,5,5,7 |

Re-inserting adds an occasional one-frame blank on Chromium and WebKit, which gain nothing from it. Gecko already
blanks during an in-place write. Hence the probe: Chromium and WebKit re-insert at most once per page. (The checker's
pixel sample of a slow load showed no difference; the frame count above is the stricter measure.)

## 6. Evidence

The test is `studio-warm-offline.spec.ts`, "a diagram never rendered online draws offline". It needs #3152's draw-host
and `serve-dist` fixes, which are not on `main` yet, so these runs used #3152's four product files applied locally and
not committed. The editor is focused rather than clicked (Playwright's mouse input hangs offline on Gecko, even on the
bare `/offline/` page); the assertion reads the live frame's document through `page.evaluate`.

| Run | Result |
|---|---|
| desktop, 10 repeats alone / under load | 10/10, 10/10 |
| webkit-tablet, 10 repeats alone / under load | 10/10, 10/10 |
| gecko, 10 repeats alone / under load | 2/10, 8/10 — every failure is the Playwright driver crash (§7), none the product |
| gecko, fix reverted (append, then assign) | 3/3 red: `ctrl=false`, no diagram |

Unit: `docs/src/lib/srcdoc-write.test.ts` (13 cells: the three paths, the probe's three verdicts, focus, sibling order,
detached frames, no service-worker API).

## 7. Open, for the owner

1. **The gecko e2e.** Playwright's `FrameManager.frameCommittedNewDocumentNavigation` (1.56.1 and upstream `main`) does
   not guard an unknown frame, and Firefox reports one when a page re-inserts an iframe. The spec cannot pass reliably on
   gecko until that is guarded: by a `patch-package` patch in `docs/patches/` (the repo already patches `sonner`), by an
   upstream fix, or by keeping the gecko case `fixme` with that reason.
2. **Same-origin images in the Firefox preview** (§2): add the page's origin to `img-src` and `media-src` as `font-src`
   already does. This changes a Firefox export's bytes.
3. **Offline Firefox export** (§4): route the capture and prune frames through `writeSrcdoc`. Export path.
4. **Upstream reports** to Mozilla (§2) and Playwright (item 1).
