- **`examples/system-design-foundations.md` now carries the reader across its own
  section boundaries.** Six kit-opening slides (data, compute, network, scale,
  reliability, security) each pay a debt from the kit that just closed instead of
  starting cold — the compute kit answers the data kit's "every derived copy
  rebuilds unattended" with the thing that runs the rebuild, the scale kit shows
  the cache and the replica returning as scaling moves, the security kit asks
  reliability's fail-apart question about credentials. Backward references inside
  Part four go from one slide to seven; the six kit openings go from zero bridges
  to six.
- **The deck's protagonist comes back for Parts three and six.** Maya, who opens
  the deck and then disappeared for 179 slides, now carries three load-bearing
  references in Part three (the twelve-minute build as three requests wearing one
  sentence; two candidates for a ceiling and only one that stopped PR 482; where
  her Tuesday sat on the four-movement arc) and two in Part six (nothing that
  broke her day was load either; the manual part gives out before the machine).
  Per-part spine coverage: Part three 0/13 → 3/13, Part six 0/20 → 2/20.
- **Fixed: two `cards-stack` bodies spilled past their card onto the card below**
  (slides 162 and 192, plus the one on 203 that this change rewrote anyway). A
  stack card is a fixed height, so a body that wraps to a second line paints
  over the next card's border — and nothing catches it: the slide does not clip
  at the frame, so the export's overflow oracle stays green and `lint:deck` only
  ever warns. Found by looking at the rendered pages.
