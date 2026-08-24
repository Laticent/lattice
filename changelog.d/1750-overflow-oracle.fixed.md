- **Fixed: the "slide does not overflow its frame" invariant could never fail.**
  It read `scrollHeight > clientHeight` on the `<section>`, which is
  `overflow-y: hidden` — and a clipped box has no scroll extent, so the two
  numbers are equal by construction. The check was not weak, it was structurally
  incapable of firing, for all 61 components, for as long as the suite has
  existed. On a deliberately overflowing `agenda` that the emulator reports as
  `⚠ OVERFLOW … CLIPPED`, the section measured 716 === 716 while `.cell-stage`
  held a 1760px list in a 435px box, and the suite scored 6/6. The gate now
  measures through `lib/core/overflow-probe.js` — the same kernel behind the
  runtime ring, the export warning and autosplit — so it is cell-aware and cannot
  become a fourth opinion about what overflow means.
