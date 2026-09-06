- **Fixed: two `cards-stack` bodies in `examples/system-design-foundations.md`
  spilled past their card onto the card below.** A stack card is a fixed height,
  so a body that wraps to a second line paints that line over the next card's
  border — and nothing catches it: the slide still fits the frame, so the
  export's overflow oracle stays green and `lint:deck` only ever warns. Measured
  on this deck at this size, a body of 115 characters sets on one line and 117
  wraps; the two that spilled ran to 124 and 147.
