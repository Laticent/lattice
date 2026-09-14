- **Changed: a PowerPoint export no longer freezes the tab while it builds the
  file.** The whole `.pptx` document — one XML part per slide, the base64 of every
  image, the zip — now assembles in a Web Worker; the main thread only draws. On a
  56-slide deck the longest frame gap drops from 717 ms to 383 ms and the total time
  the tab cannot paint from 10.8 s to 8.4 s, which is the same floor the PDF export
  already sits on. The file is byte-identical but for its creation timestamp.
