- **`examples/system-design-foundations.md` now carries the reader across its own
  section boundaries.** Six kit-opening slides (data, compute, network, scale,
  reliability, security) now open by paying a debt instead of starting cold — five
  to the kit that just closed, and the data kit, which has none before it, to Part
  three's rung one — the compute kit answers the data kit's "every derived copy
  rebuilds unattended" with the thing that runs the rebuild, the scale kit shows
  the cache and the replica returning as scaling moves, the security kit asks
  reliability's fail-apart question about credentials. None of the six referred
  to an earlier section before; all six do now.
- **The deck's protagonist comes back for Parts three and six.** Maya, who opens
  the deck, was last named on slide 159 and not again until the closing slide —
  a run of 60 slides. She now carries three load-bearing references in Part three
  (the twelve-minute build as three requests at three rungs; two candidates for a
  ceiling and only one that stopped PR 482; where her Tuesday sat on the
  four-movement arc) and two in Part six (nothing that broke her day was load
  either; the manual part gives out before the machine). Per-part coverage:
  Part three 0/13 → 3/13, Part six 0/20 → 2/20.
- **Six new ask-then-answer exercises break Part four's drought.** That part ran
  96 slides with four `Your turn` slides in it, three of them in the last seven,
  so the reader read 51 slides between the data kit's exercise and the security
  kit's. Every kit now closes with one — run the data tree's first question on
  three teams; take or refuse three writes under a partition; place three
  workloads on a runtime; spend a latency budget on three cross-continent round
  trips; size a pool with Little's law, then break it in both directions; say
  what a page does when three dependencies go slow rather than down. Inside Part four the longest
  stretch without the reader producing something drops from 51 slides to 20; deck
  wide it drops from 51 to 45, and the longest run now starts in Part five.
- **Part seven now closes the loop the deck opened on.** The first eleven slides
  are a Tuesday that fails — pull request 482 does not merge — and the deck used to
  drop that thread in Part two and never return to it. It comes back twice now: in
  Part three, where her day supplies a worked example of a ceiling, and on a new
  slide before "What to do on Monday" that says what would have made Tuesday
  different, in the deck's own vocabulary: a bounded pool of one, a deadline
  nothing inherited, and admission control twenty minutes late.
