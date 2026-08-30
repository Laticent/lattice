- **The Form-model z-plane legend no longer breaks its rows mid-word.** `.zlegend li` is
  a flex container, so `<b>z3</b>`, the bare text "chrome" and the `<small>` list were
  three separate flex items that shrank and wrapped independently — rendering "z 3 / chrom
  e" at 1440px and splitting `z1` at 820px. Each row's text is now one `<span>`, matching
  the `.own` legend in the same component, so it wraps as ordinary text. Verified on the
  built docs site at 1440 / 820 / 390.
