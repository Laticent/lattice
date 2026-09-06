- Four claims in shipped text and docs said things measurement refutes, all corrected in place:
  - `design/skills/lens.md` told authors a projection RENUMBERS surviving `captions:` entries. It
    keeps their numbers — position-holding projection reversed that, and the doc an author reads was
    the last thing still describing the old behavior.
  - the lens kernel's header and `engineering/pipeline.md` both said a projected deck "is the shorter
    deck" by the time anything measures it. It is the authored length with holes; that premise is the
    one that produced six authored-vs-shipped index defects.
  - `docs/src/lib/lente/tags.ts` claimed the only regexes left in the file were trivial split
    delimiters, in a file this branch gave a nested-quantifier regex. It is kept and it is linear —
    median of nine runs, 0.016 ms at n=1000 and 0.770 ms at n=50000 on the shapes that make a
    polynomial regex blow up, i.e. ~48x the time for 50x the input — and the header now says so
    instead of denying the regex exists. (The first draft of that line quoted a single unwarmed run,
    0.08 ms / 1.94 ms, which measured JIT warm-up and scaled SUB-linearly; a reviewer could not
    reproduce it. Take the median.)
  - the corpus sweep's title claimed "147 real decks" while `examples/` had grown to 156, and its
    guard was a `> 140` floor that could not notice. The count is derived from the directory now.
- The visible page number under a reducing projection is pinned by a test for the first time.
  Replacing the hole test in `lib/engine/slides.js` with `false` left 109 lens arms green while a
  three-page export printed 1..5 with its shipped pages reading 1, 3, 5 — the withheld slots named on
  the face of the artifact, which is the disclosure the two-number split exists to prevent.
- `assertArtifactPages` itself had no arm: replacing its body with `return;` left all 17 artifact
  channel arms green, on all four formats. It has three now, and each dies to a DIFFERENT mutant —
  stubbing the guard kills the `beforeprint` arm, un-anchoring the promise kills the decoy arm, and
  zeroing the appended allowance kills the glossary arm. Stated that way because the first draft of
  this line said "they die when it is stubbed", which is true of one of the three: a coverage claim
  that overstated its own coverage, in the PR about claims nobody re-derives.
