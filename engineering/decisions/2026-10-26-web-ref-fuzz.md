---
status: shipped
summary: >
  A seeded grammar fuzz of the web-reference scanners (blockWebImages, blockWebCss) now runs in
  Chromium, WebKit and Firefox against a loopback server. Its first runs found seven spellings of a
  web fetch that 30 known payloads and a red-team pass had not: all are fixed and in the payload
  table. After the fixes, 100,000 seeded inputs per engine produce no request at all, and so do 40,000 per
  engine through the Reading view and the preview frame's compositions in current Chromium, Firefox
  and WebKit. The note says what that does and does not show.
---

# Fuzzing the web-reference scanners (#2871 follow-up)

HARD RULE #22 says a remote reference in a rendered deck is a beacon. #2871 closed 30 spellings
that a regex scan read differently from the browser and merged at medium confidence, because
nothing had searched for spellings nobody had written down. This note records that search.

## What was built

- `test/fixtures/web-ref-fuzz.js`: a seeded generator (mulberry32) of CSS and HTML built from the
  tokenizer rules, not from known bypasses. Layers: a *reference* (a `url()`, `image-set()`,
  `@import`, `@font-face src`, an attribute that loads, a `<base>` plus a relative address, a refresh
  `<meta>`), its *spelling* (CSS escapes and line continuations; character references, tabs and
  newlines the URL parser strips; the scheme without its slashes, in capitals, protocol-relative;
  odd attribute separators and quotes) and a *context* (nested at-rules, junk before it, raw-text
  and foreign-content elements, comments of every closing shape). Input *i* depends on the seed, *i*
  and the length of the base address.
- `test/helpers/web-ref-fuzz.js`: loads each input unrewritten (the control), rewrites it, and loads
  the result as a document (`<iframe srcdoc>`) and as a fragment (`innerHTML`), each on a new page, against
  a loopback server. Any request to the attacker's origin after the rewrite fails the run; a
  request is pinned on an input only when it reproduces with that input alone. The harness page is
  served from a second loopback origin standing for the site's own, so `//host` and relative
  addresses resolve as they do on a real page.
- `npm run fuzz:web-refs` (tools/fuzz-web-refs.mjs): the three engines through Playwright,
  `--seed --count --from --engines --ref`. `--ref <git ref>` scans with that ref's scanner, which is
  how to watch the fuzz fail.
- `test/integration/invariants/web-ref-fuzz.test.js`: a 600-input Chromium slice on every PR, with a
  separate coverage floor for CSS and HTML inputs.

## What the fuzz found

Every finding below fetched from the loopback server through the old scanner, and is now a row in
`test/fixtures/web-ref-beacons.js` with a unit test.

| Spelling | Why the scanner missed it | Fix |
|---|---|---|
| `<base href="https://…">` plus a relative `src` | It names the web in no attribute that loads | A web `<base>` is removed |
| `<meta http-equiv=refresh content="0;url=https://…">` | A navigation, not a subresource | Removed; also when it names a `data:` or `blob:` page |
| `http:host`, `http:/host` (no `//`) | `webOrigin` wanted `^https?://`; the URL parser reads these as absolute on a page of another scheme | Any run of slashes after `http(s):` reads as `//` |
| `<iframe srcdoc>`, a `data:` page in an iframe, object or embed | The document it builds loads on its own | Attribute removed where no policy is behind the host (`fonts: true`) |
| SMIL `<set attributeName="href" to="https://…">` | The address is in `to`, not in an attribute that loads | Same |
| An unterminated `<!--` in an `<svg><style>` | The tree swallows the rest of the document; Chromium's preload scanner fetches the images after it anyway | The scanner reads the rest as markup and asks the page's parser |
| `<select>` holding a table, a style, a base | Newer browsers keep what older ones drop | A `<select>` makes the scanner ask the page's parser |
| `@import "/\127.0.0.1:9/x"` (Firefox) | Firefox's preloader fetches the string as written: `/\` is `//`. CSS decodes `\127` to a letter and the address is relative | A string with a backslash is refused if either reading names the web |

Two of these (`<base>`, refresh) are tags the Reading view's sanitizer already deletes, so on that
surface they were defense in depth; the CLI's `.html` export, which runs no sanitizer, carries them.

## Evidence (HARD RULE #23)

The scanner under test is the working tree at the commit that adds this note. Seed 20261026,
`node tools/fuzz-web-refs.mjs --seed 20261026 --count 100000 --engines <engine>` (Chromium in two
halves, `--from 0` and `--from 50000`, 50,000 each).

| Engine | Inputs | Fetch as written | Requests after the rewrite | Leaks, unattributed, scanner errors, hung |
|---|---|---|---|---|
| Chromium 131.0.6778.204 | 100,000 | 15,572 (CSS 4,583 of 50,159; HTML 10,989 of 49,841) | 0 | 0, 0, 0, 0 |
| WebKit 26.0 (Playwright) | 100,000 | 14,531 (CSS 4,992; HTML 9,539) | 0 | 0, 0, 0, 0 |
| Firefox 142.0.1 | 100,000 | 14,933 (CSS 4,530; HTML 10,403) | 0 | 0, 0, 0, 0 |

**The fuzz can fail.** `--ref 00f4785` (the scanner before this change), seed 20261026, 1,500
inputs in Chromium: 22 leaks and 64 unattributed requests. Slowest rewrite in any run: 443 ms
(WebKit; the median is a few milliseconds).

## Through the shipped compositions, in current browsers (added 2026-10-26)

The first table runs the scanner alone, in Chromium 131. The adversarial review asked for the shipped
compositions in current builds, and `--compose` now provides them (`test/helpers/web-ref-fuzz.js`):

- `reading`: the Studio's Reading view. The scanner, then the slide sanitizer (DOMPurify, the docs-site
  binding), then the scanner again; the stylesheet through `blockWebCss` and the style sanitizer. Loaded as
  a document and as a fragment (`innerHTML`).
- `preview`: a preview frame. `withOwnOrigin` allows the site's own origin, `fonts: false`, the slide sanitizer,
  and the content-security policy built from what the scanner refused, first in the head. Loaded as a document.

`node tools/fuzz-web-refs.mjs --seed 20261026 --count 40000 --engines <engine> --compose <reading|preview>`,
with `--playwright-chromium` for Chromium 153.

| Composition | Engine | Inputs | Fetch as written | Requests after the rewrite |
|---|---|---|---|---|
| reading | Chromium 153.0.8010.12 | 40,000 | 6,283 | 0 |
| reading | Firefox 155.0 | 40,000 | 6,078 | 0 |
| reading | WebKit 26.6 | 40,000 | 5,888 | 0 |
| preview | Chromium 153.0.8010.12 | 40,000 | 6,285 | 0 |
| preview | Firefox 155.0 | 40,000 | 6,069 | 0 |
| preview | WebKit 26.6 | 40,000 | 5,875 | 0 |

Leaks, unattributed requests, scanner errors and hung inputs: 0 in every run.

**What these runs say about the layers.** The compositions can fail, and the scanner is what holds them.
With a scanner that refuses nothing (`--scanner-file` pointing at a stub), the Reading view leaks 85
requests in 600 inputs (the sanitizer leaves images, a video `poster`, table backgrounds and styled
attributes in place), and a preview frame leaks 11 in 1,200 (the policy does not cover a stylesheet
`@import`, the one shape in the sample). With the scanner **before** this change, both compositions leaked nothing
at seed 20261026 over 1,200 inputs: on these two surfaces the sanitizer and the policy already stopped the
spellings the scanner-alone fuzz found (the sanitizer deletes `base`, `meta`, `style`, `iframe` and
`srcdoc`; the policy closes `base-uri`, `object-src` and `img-src`). Those fixes are defense in depth for
the surfaces that run no sanitizer, such as the CLI's `.html` export, and for any future caller that
forgets one.

Limits 2 and 5 below are therefore closed for `reading` and `preview`; the rest stand.

## What this does not show

The honest reading of "zero in 100,000" is narrow; an adversarial review (the Munger inversion) of
this harness listed the gaps, and none is closed here.

1. **About 15% of the inputs fetch as written.** The rest are syntax the browser rejects. The
   claim covers the 15,000 per engine that do, by construct unevenly: the CSS half fetches at 5%.
2. **The first table runs the scanner alone** (closed for the Reading view and the preview frame by the
   section above). Still open: the CLI `.html` export composition, and the `blocked` list the policy depends
   on is not checked for completeness.
3. **The oracle is HTTP requests to one loopback server.** It waits 1.3 s after each load settles, so a request
   up to a second late is seen and attributed (a refresh with a one-second delay is generated). A connection with no
   request (`<link rel=preconnect>`) and a request to another origin are not seen. The address is always `127.0.0.1`.
4. **Fetch classes the generator does not emit:** `<a ping>` and `<form action>` (both need a click or a submit),
   the Mermaid fence reader (a markdown-layer reader; the scanner sees only its SVG output), `@media print`, and a
   refresh with a delay over a second. Added after the first version, with the failing arm shown: `<picture>` with
   `<source srcset>` and a `media`/`type` choice, `xml:base` on an SVG or a group with a relative `href`, a refresh
   with a one-second delay, and a two-candidate `srcset`.
5. **The first table's Chromium is the puppeteer build (131).** The composition runs use Chromium 153, Firefox 155
   and WebKit 26.6 (closed for them); the scanner-alone 100,000-input runs were not repeated on the newer builds.
6. The Studio's Reading view itself is covered by `docs/e2e/read-article-beacons.spec.ts`
   (every row of the payload table), not by the fuzz.

## `--wide`: the click, submit and hint classes (2026-10-27)

`npm run fuzz:web-refs -- --wide` adds `<a ping>`, `<area ping>`, `<form action>`, `formaction`, `<link rel=preconnect|dns-prefetch|prefetch|prerender|preload>`, and spells the host seven ways (`127.1`, `2130706433`, `0x7f000001`, a second loopback address as another origin, `localhost`). It clicks every `ping` and `formaction` and submits every form, once, as a reader would. Off, the generated stream is byte for byte the one every earlier run used.

| Composition (seed 20261026) | Inputs | Requests after the rewrite |
|---|---|---|
| Reading view, Chromium 153 / Firefox 155 / WebKit 26.6 | 4,000 each | 0 in all three |
| Preview frame, same three engines | 4,000 each | 0 in all three |
| Scanner alone, Chromium 131 | 3,000 | **77 leaks**: 37 `ping`, 26 `action` or `formaction` and 14 more of the same kinds spelled with a space before `=` |

**Closed by the owner's call (2026-10-27): the scanner now refuses them** where no policy stands behind the host (`fonts: true`), by name on any element, with an approved origin still passing (the door a plugin will use). Before that change the scanner alone did not refuse a web `ping`, `action` or `formaction`: `blockWebImages` leaves the attributes that act only on a click or a submit (`remote-ref.js` `RENDER_FETCH_ATTRS`), while the gallery gate's `attrIsRemote` flags them. The shipped compositions hold because the slide sanitizer strips them and the preview frame's content-security policy blocks the rest. No composition that runs the scanner without either is shipped today; whether the scanner should refuse them is a decision about the scanner's claim, not a fuzz finding, and it changes exported bytes for a deck that carries one.

The connection-with-no-request oracle (`conns.idle()`) sees nothing: the control load, which does carry `rel=preconnect`, opens no idle connection that the server can attribute in headless Chromium, so the oracle cannot fail and is not counted as coverage.

## The allowed-origin smuggle (2026-10-27), found by the checker on the click-time change

`refuse` decoded entities on every value, but most callers hand it a value the browser has already decoded once. `https://own.example&amp;sol;@evil.example/x` (the attribute text `&amp;sol;` is the characters `&sol;`, not a slash) was read as `https://own.example/@evil.example/x`, an allowed origin. A browser reads `own.example&sol;` as userinfo and fetches from `evil.example`. The Reading view always allows its own origin, so no reader action was needed, and the leak was live for a `srcset`, a `src` and a style `url()` on Firefox and Safari. Chromium refuses a credentialed subresource and a credentialed form navigation in an iframe, so a Chromium-only fuzz could not see it. The fuzz missed it for a second reason: it allowed no origin. Both are fixed:

- `refuse` no longer decodes. The two callers that hand over raw attribute text (`<base href>` and a media `src`) decode it themselves, once, in attribute mode.
- The harness allows the page's own origin in the plain and reading compositions, and `--wide` writes addresses that begin with it and continue with the attacker's (`own&amp;sol;@evil`, six joiners, seven carriers). Seed 20261027, 3,000 inputs, `--wide`: the scanner before the fix leaks 38 times in WebKit 26.0 and 30 in Firefox 142.0.1; after it, 0 and 0. In Chromium 131 both give 0, which is why the other two engines are the check for this class.

### And the noscript the sanitizer unwraps (same day)

The post-fix preview run on Firefox found a second hole, in the composition the Playground ships (`deck-preview.js`: scanner, then `sanitizeSlideHtml`, then a content-security policy in a `<meta>`). The scanner reads `<noscript>` as raw text, as a page that runs scripts does, so `<noscript><img srcset="//evil/a 1x, //evil/b 2x"></noscript>` showed it nothing. DOMPurify parses without scripts, keeps the `<img>` and drops the wrapper, so the image came out live. The content-security policy did not stop it: Firefox 142 fetched the `srcset` image although `img-src 'self' data: blob:` was in force (the meta policy does not govern a load the parser already started; not investigated further). The Reading view was not exposed, because it scans again after the sanitizer. Found only because the new two-candidate `srcset` class and the corrected `nameOf` (which had filed the first candidate's `-a` request as unattributed) put a `srcset` inside a `<noscript>`. Fix: a `<noscript>` makes `risky`, so the page's own parser (scripts off) is asked as well, as it already is for `<select>` and foreign content. Without a `DOMParser` (a Node caller) the scan is unchanged. The real surfaces were then driven (HARD RULE #23), on a build of `2a1c699` (`npm run build:e2e`, Firefox 142, a loopback server as the tracker). The Studio's live preview, a deck whose one slide holds an ordinary image plus four `<noscript>` payloads (a `srcset` pair, a `src` inside a `<p>`, and a tab-split `srcset`): with nothing allowed, 0 requests; after "Load images", the ordinary image is fetched and no `<noscript>` image is. The Playground's preview, the same payloads plus a form with a `formaction` and a link with a `ping`: 0 requests, and the preview's DOM holds no `<noscript>`, no `<form>` and no `ping`, so the engine drops them before the scanner runs. So on the surfaces that ship, `<noscript>` content never became a live image: the hole was in the order of the harness's steps (scanner, sanitizer, policy), which is the order `deck-preview.js` names, not in what the engine hands it. The fix stays as defense in depth; the control arm could not show the old scanner leaking there. This is a hole the harness showed, closed here, not a leak observed in the real app.

### `attributionsrc` in a real browser, and refresh delays (2026-10-27)

`--wide` now generates `<img attributionsrc>` and `<a attributionsrc>` (a whitespace-separated list of reporting addresses; the harness clicks the link). Chromium 131 fires them: seed 20261029, 3,000 inputs, the scanner before the click-time change (`--ref 2dddb7b`) leaks 29 inputs (67 requests); the working tree leaks none (0 requests). Refresh delays are covered by unit rows instead of the fuzz, because the scanner ignores the delay (`refreshTarget` reads the address after the time and the separator): 0, 1, 3, 60, 3,600, 86,400, 0.5, `1.`, `.5`, 7 as `00007`, 2,147,483,647 and 4,294,967,296, each with five separators, all removed; `1e3;url=https://…` reads as the relative page `e3;url=…` in the browser and the scanner agrees. The default stream (seed 20261026) is unchanged by the new class.

### Mermaid: what it can fetch and link, measured (2026-10-27)

The scanner does not parse Mermaid's grammar. It reads a fence's text (`mermaidRemoteRefs`: decoded, every URL spelling) and refuses what it finds, and a diagram that carries a web reference is not drawn until the reader allows it. Measured with the vendored Mermaid 11.14 at the runtime's own config (`engineInitConfig`, `securityLevel: 'strict'`), a fresh page per case, a loopback server, Chromium 131 and Firefox 142:

| Case | Drawn | On render | After a click |
|---|---|---|---|
| `img:` shape | yes | **fetches** | nothing |
| `<img src>` in an HTML label | yes | **fetches** | nothing |
| `themeCSS` in `%%{init}%%`, a `url()` | yes | **fetches** | nothing |
| markdown image in a label | yes | nothing | nothing |
| `click A href "…"` (flowchart, class) | yes, as an `<a>` | nothing | the page **navigates** to the address |
| gantt `click … href` | yes | nothing | navigates (Mermaid's own `window.open(url, "_self")`) |
| `click B call alert(1)`, `click A callback` | yes | nothing | nothing, no dialog (strict returns early) |
| `click A href "javascript:alert(1)"` | yes, empty `<a>` | nothing | nothing, no dialog |

So a diagram fetches on render in three ways, and links only on a reader's click, as an `<a href>` does. On the Studio's Reading view (no content-security policy; the scanner is the wall), a deck of one ordinary image plus four diagrams (`img:` shape, label `<img>`, `themeCSS`, `click href`): the notice reads "This deck loads 5 images"; with nothing allowed the article makes 0 requests; after "Load images" it fetches the control image, the shape image and the label image, and a click anchor is drawn. The `themeCSS` address did not fetch in the Reading view even once allowed (counted and refused all the same). The CLI's PDF render makes no request either: its Chromium is offline (a server on all interfaces saw nothing for a shape, a label image and a click link), the shape case reports "Mermaid render failed", and the scanner reports the address as left out.

A defect found while validating and fixed here: a rendered diagram carries `xmlns="http://www.w3.org/2000/svg"`, a namespace name the browser never fetches, and the diagram scan counted it as a web image, so every deck with a drawn diagram printed "3 web images from http://www.w3.org were left out" in the CLI and a Studio notice. The scan now ignores `xmlns` declarations (an `<image href>` or `<a xlink:href>` it draws is still counted). It existed at the merge base; only the `blocked` list changes, not the markup (the 384 decks are still byte-identical).

### Mermaid fences fuzzed, and a connection oracle that can fail (2026-10-29)

Followups 2909-p3. Two gaps from the table above, closed.

**The fuzz now writes Mermaid.** `npm run fuzz:mermaid-refs` (tools/fuzz-mermaid-refs.mjs) generates
Markdown with one fenced diagram (test/fixtures/mermaid-ref-fuzz.js): backticks or tildes, three to
six of them, a language with attributes or none, indented, quoted or in a list; inside, an `img:`
shape, an `<img>` label, `themeCSS` with a `url()`, or a `click … href`, with the address spelled
with entity codes, Mermaid's `#58;`, a dropped tab, capitals or `//host`. Each input is rendered by
the real engine. The blocks the runtime draws (the registry's `DRAWN_FENCE_CODE`) are drawn with the
vendored Mermaid 11.14 at the runtime's config, and every link a diagram draws is clicked in a frame
of its own. The control draws everything; the scanned arm draws only what `blockWebImages` lets
through, the rule the Studio applies before it draws. Seed 7, 200 inputs per engine, at `74149fe`:

| Engine | Drawn as written | Reach the server as written | Held back | Leaks |
|---|---|---|---|---|
| Chromium 131 | 91 | 35 | 149 | 0 |
| WebKit 26.0 | 91 | 26 | 149 | 0 |
| Firefox 142 | 91 | 26 | 149 | 0 |

By class in Chromium: `click` 5 of 53 reach as written, `themeCSS` 9 of 47, `img:` 4 of 45, label
`<img>` 17 of 55. `themeCSS` reached the server in Chromium only (0 of 47 in WebKit and Firefox),
which the 2026-10-27 table did not see because it measured Firefox with a plain spelling. One
control request per run lands on `/` and names no input: Mermaid decodes `#47;` to `/` inside a CSS
`url()`, but the browser reads a `#` there as the start of a fragment. It is reported, never a
failure, because only the control makes it.

**The arm can fail.** `--scanner-file test/fixtures/naive-diagram-scanner.js` holds a diagram back
only when its text names the address the plain way (`http://127.0.0.1…`). Seed 7, 120 inputs: 12
leaks in Chromium, 9 in WebKit and 9 in Firefox, every one an odd spelling (`&sol;`, `#46;`,
`Http&#58//`, capitals, `//host`). The older scanner (`--ref 1bec8e4`) holds all of them, so it is not
a failing arm for this class.

**The connection oracle.** A `<link rel=preconnect>` opens a connection and sends no request, so
only an idle-connection count sees it. Measured with a lone preconnect to a loopback server: WebKit
opens one connection; headless Chromium and Firefox open none, with Playwright's default flags and
with `--disable-background-networking` dropped, `--headless=new`, Firefox's speculative-connection
preference raised, and the proxy variables unset. In a batch the old control could not see it even
in WebKit: another input's fetch reuses the preconnected socket, which then reads as asked. So
`--wide` now opens with a calibration load of one lone preconnect and reports `sees` or `blind` per
engine; the count also includes sockets that closed unused. Where the oracle sees, an idle
connection after the rewrite fails the run. Seed 3, 300 inputs: `sees` in WebKit with 0 idle after
the rewrite, `blind` in Chromium and Firefox. The failing arm
(`--scanner-file test/fixtures/hint-passing-scanner.js`, which returns a document with a preconnect
as written) fails in WebKit on 600 inputs with 0 requests and 1 idle connection. So `fetch/hint` has
measured coverage in WebKit, and none in the other two engines, which is a fact about headless
browsers, not a gap in the fuzz.

### The click, made in the Reading view (2026-10-29)

Followups 2909-p5. `docs/e2e/read-article-beacons.spec.ts` now drives a deck whose only web
reference is a flowchart `click A href` to a loopback server: the strip offers to load it, the
Reading view draws the anchor, nothing is requested in the 3 s before the click, and the click
navigates the Studio's own tab to the address (not a new tab, not intercepted). Same result in
Chromium, Firefox and WebKit (`desktop`, `gecko`, `webkit-tablet`).

Driving it found a defect: the Studio's cheap pre-check (`web-image-hint.ts`) woke the web-images
count only for image-shaped references, so a deck whose only web reference was a diagram link got
no strip at all, while the scanner refused that address as a `diagram` ref. The pre-check now
matches a Mermaid `click … href` line too (the rule is the scanner's set, not "images"), with unit
cases; the spec failed in all three engines before the change and passes after.

## Confidence

HIGH that the scanners agree with three engines on the grammar the fuzz generates. After the generator grew
(`<picture>`, `xml:base`, a delayed refresh, a two-candidate `srcset`) and the oracle learned to wait for late
requests, seed 20261026 gave **0 requests after the rewrite**: 12,000 inputs in each of Chromium 131, WebKit 26.6 and
Firefox 155 for the scanner alone, and 6,000 in each of Chromium 153, Firefox 155 and WebKit 26.6 through the Reading
view and through a preview frame. The failing arm still fails: `--ref 00f4785`, 1,500 inputs, Chromium 131, leaks 86
(it was 22 before the new classes; two of the 86 are `<picture>`, two `xml:base`). MEDIUM, not higher, on "no web fetch
can survive them": `<a ping>`, `<form action>`, a connection with no request, other origins, delays over a second and the
CLI `.html` export composition are untested classes, not tested-and-clean ones.
