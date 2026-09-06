- Four claims in shipped text and docs said things measurement refutes, all corrected in place:
  - `design/skills/lens.md` told authors a projection RENUMBERS surviving `captions:` entries. It
    keeps their numbers — position-holding projection reversed that, and the doc an author reads was
    the last thing still describing the old behavior.
  - the lens kernel's header and `engineering/pipeline.md` both said a projected deck "is the shorter
    deck" by the time anything measures it. It is the authored length with holes; that premise is the
    one that produced six authored-vs-shipped index defects.
  - `docs/src/lib/lente/tags.ts` claimed the only regexes left in the file were trivial split
    delimiters, in a file this branch gave a nested-quantifier regex. It is kept and it is linear —
    measured at 0.08ms for n=1000 and 1.94ms for n=50000 on the shapes that make a polynomial regex
    blow up — and the header now says so instead of denying the regex exists.
  - the corpus sweep's title claimed "147 real decks" while `examples/` had grown to 156, and its
    guard was a `> 140` floor that could not notice. The count is derived from the directory now.
- The visible page number under a reducing projection is pinned by a test for the first time.
  Replacing the hole test in `lib/engine/slides.js` with `false` left 109 lens arms green while a
  three-page export printed 1..5 with its shipped pages reading 1, 3, 5 — the withheld slots named on
  the face of the artifact, which is the disclosure the two-number split exists to prevent.
- `assertArtifactPages` itself had no arm: replacing its body with `return;` left all 17 artifact
  channel arms green, on all four formats. It has three now, and they die when it is stubbed.
