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
3. **The oracle is HTTP requests to one loopback server.** A late request (a refresh with a delay, an animation),
   a connection with no request, and a request to another origin are not seen. The address is always `127.0.0.1`.
4. **Fetch classes the generator does not emit:** `<picture>`, `<a ping>`, `<form action>`, `xml:base`,
   the Mermaid fence reader, `@media print`, a refresh with a non-zero delay.
5. **The first table's Chromium is the puppeteer build (131).** The composition runs use Chromium 153, Firefox 155
   and WebKit 26.6 (closed for them); the scanner-alone 100,000-input runs were not repeated on the newer builds.
6. The Studio's Reading view itself is covered by `docs/e2e/read-article-beacons.spec.ts`
   (every row of the payload table), not by the fuzz.

## Confidence

HIGH that the scanners agree with three engines on the grammar the fuzz generates, at 100,000
inputs per engine alone and 40,000 through each shipped composition in current builds, with the failing
arm demonstrated for each. MEDIUM, not higher, on "no web fetch can survive them": limits 3 and 4 are
untested classes, not tested-and-clean ones. To raise it further: add the fetch classes in item 4
(`<picture>`, `xml:base`, Mermaid fences, a refresh with a delay) and an oracle that sees late requests,
connections with no request, and other origins.
