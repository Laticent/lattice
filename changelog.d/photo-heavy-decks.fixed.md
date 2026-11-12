- **Fixed: a deck with many Library photos no longer hangs Present or slows every full-deck surface.**
  A deck of 18 phone photos (24 MB) froze Present on a phone for up to 19 s with ~1.9 GB of memory,
  enough for iOS to close the tab and reload it. Present now opens with a 0.2 s longest block and a
  68 MB peak, the same as a deck with no photos. The Stage is built only when you open it, and loads
  the photos from the tab instead of a 34 MB copy. The Reading view opens in 2.5 s (was 15.7 s) and
  captions export in 2.7 s (was 12.3 s). PDF, PowerPoint, LibreOffice, images, webpage and print exports
  are 10–57 % faster with 3–5× less memory, and every exported file is unchanged apart from its timestamps.
