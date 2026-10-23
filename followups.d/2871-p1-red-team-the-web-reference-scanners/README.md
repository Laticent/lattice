# Evidence: red-teaming the web-reference scanners

One file, `probe.test.js`: a per-payload copy of
`test/integration/invariants/web-ref-beacon.test.js`. It loads each payload in Chromium twice,
as written and after `blockWebImages`, against a loopback server, and prints one row per
payload: did the control fetch, did the rewritten copy leak, and how long the rewrite took.
The integration test asserts the whole set; this reports each spelling, which is what a red
team needs while it tries new ones.

Written against `fix/css-beacon-bypass` at 8d90629 (#2871), on top of `main` at 74eec5f.

```sh
node --test followups.d/2871-p1-red-team-the-web-reference-scanners/probe.test.js
PAYLOADS=/abs/path/my-payloads.js node --test …   # your own table, same shape
REF=main node --test …                            # probe origin/main's remote-ref.js instead
```

By default it reads `test/fixtures/web-ref-beacons.js`, which lands with #2871. `OUT` names
the JSON report (default: the OS temp directory).

**No payloads live here.** The repository is public, and a spelling that still fetches is a
working exploit until its fix merges. Keep new payloads outside the tree, and add each one to
`test/fixtures/web-ref-beacons.js` in the PR that fixes it.

Classes the pass should cover, none of them tried from outside yet:

- CSS tokenization: newlines and escapes inside strings, `url()` and functions spelled with
  escapes, comments in unusual places, nested blocks and at-rules.
- HTML tokenization: attribute separators, unquoted values, raw-text elements and how they
  end, foreign content (SVG, MathML), templates and shadow roots, character references.
- The seam between the two: CSS that arrives through an attribute, and markup that the
  sanitizer upstream turns into something the scanner reads differently.
- Cost: input that makes the scanner slow. #2871 removed one 25–50 s regex blow-up.
