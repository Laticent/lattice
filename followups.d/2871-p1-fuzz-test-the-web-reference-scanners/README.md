# Evidence: fuzz-testing the web-reference scanners

One file, `probe.test.js`: a per-payload copy of
`test/integration/invariants/web-ref-beacon.test.js`. It loads each payload in Chromium twice,
as written and after `blockWebImages`, against a loopback server, and prints one row per
payload: did the control fetch, did the rewritten copy leak, and how long the rewrite took.
The integration test asserts the whole set; this reports each spelling, which is what a fuzz
run needs to turn a failure into a row.

Written against `fix/css-beacon-bypass` (#2871, merged).

```sh
node --test followups.d/2871-p1-fuzz-test-the-web-reference-scanners/probe.test.js
PAYLOADS=/abs/path/my-payloads.js node --test …   # your own table, same shape
REF=main node --test …                            # probe origin/main's remote-ref.js instead
```

By default it reads `test/fixtures/web-ref-beacons.js`. `OUT` names
the JSON report (default: the OS temp directory).

**No payloads live here.** The repository is public, and a spelling that still fetches is a
working exploit until its fix merges. Keep new payloads outside the tree, and add each one to
`test/fixtures/web-ref-beacons.js` in the PR that fixes it.

The first red-team run (2026-10-20) tested the scanners from outside before a safety filter
stopped it. It found 7 spellings in SVG paint attributes, `<feImage href>` and a table's
`background`, now fixed in #2871 and in the payload table. It never reached the first three
classes below, and the other two runs tested nothing. A fuzzer build was stopped the same way.

Since then, #2871 checks two of those classes with the existing table: the rewrite is a fixed
point under the page parser's re-serialization (30 rows and 430 decks, in Chromium), and the
whole table runs through the gallery gate and the door. The table holds in Chromium, WebKit and
Firefox. What none of that does is generate inputs no one has written down: that is this item.

Classes the pass should cover:

- CSS tokenization: newlines and escapes inside strings, `url()` and functions spelled with
  escapes, comments in unusual places, nested blocks and at-rules.
- HTML tokenization: attribute separators, unquoted values, raw-text elements and how they
  end, foreign content (SVG, MathML), templates and shadow roots, character references.
- The seam between the two: CSS that arrives through an attribute, and markup that the
  sanitizer upstream turns into something the scanner reads differently.
- Mutation through the parser check: `verifyWithParser` re-serializes the parsed markup when it
  rewrites something, and runs before the sanitizer.
- The other readers of the same table: the gallery gate (`galleryRemoteRefs`) and the
  code-package door (`cssRefTargets`).
- Cost: input that makes the scanner slow. #2871 removed one 25–50 s regex blow-up.
