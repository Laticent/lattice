- The split census is stated from the REAL emulator, not from calling the splitter directly. A
  fast sweep that calls `render()` then `splitDoc()` makes a 245-deck × 4-size run affordable and
  **over-reports**, because `splitDoc` does not gate on the size family — only the emulator
  decides whether auto-split runs at all. Measured against each other on every deck the fast
  sweep says moves: they agree on 27 of 29 at portrait, with the fast sweep counting one slide
  too many. The totals now quoted come from driving `dist/lattice-emulator.js` in both trees.
