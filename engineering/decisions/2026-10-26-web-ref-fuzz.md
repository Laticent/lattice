---
status: shipped
summary: >
  A seeded grammar fuzz of the web-reference scanners (blockWebImages, blockWebCss) now runs in
  Chromium, WebKit and Firefox against a loopback server. Its first runs found seven spellings of a
  web fetch that 30 known payloads and a red-team pass had not: all are fixed and in the payload
  table. After the fixes, 100,000 seeded inputs per engine produce no request at all. The note says
  what that does and does not show.
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

## What this does not show

The honest reading of "zero in 100,000" is narrow; an adversarial review (the Munger inversion) of
this harness listed the gaps, and none is closed here.

1. **About 15% of the inputs fetch as written.** The rest are syntax the browser rejects. The
   claim covers the 15,000 per engine that do, by construct unevenly: the CSS half fetches at 5%.
2. **The scanner runs alone**, with `{ fonts: true }` and no allowed origin. No shipped surface
   uses exactly that: the Reading view puts the sanitizer and the scanner in series, and the
   previews run `fonts: false` with an allowlist and a content-security policy. The `blocked` list
   those policies depend on is not checked for completeness.
3. **The oracle is HTTP requests to one loopback server.** A late request (a refresh with a delay, an animation),
   a connection with no request, and a request to another origin are not seen. The address is always `127.0.0.1`.
4. **Fetch classes the generator does not emit:** `<picture>`, `<a ping>`, `<form action>`, `xml:base`,
   the Mermaid fence reader, `@media print`, a refresh with a non-zero delay.
5. **Chromium is the puppeteer build (131)**, older than current stable. Newer builds parse `<select>` content
   differently, which is why the `<select>` rule above exists; no newer build was run.
6. The Studio's Reading view itself is covered by `docs/e2e/read-article-beacons.spec.ts`
   (every row of the payload table), not by the fuzz.

## Confidence

HIGH that the scanners agree with three engines on the grammar the fuzz generates, at 100,000
inputs per engine, with the failing arm demonstrated. MEDIUM, not higher, on "no web fetch can
survive them": limits 2 to 4 are untested classes, not tested-and-clean ones. To raise it: run the
fuzz through the real compositions (scanner, then the sanitizer, then the scanner again for the
Reading view; `fonts: false` with an allowlist and the policy for previews), add the fetch classes
in item 4, and run a current-stable Chromium.
