- **The Playground no longer fetches or builds CodeMirror on a load that opens in Explore.** `EditorHost`
  built the editor in its mount effect and imported its code statically, so an Explore load paid for
  CodeMirror while the editor sat behind `display: none`. The host's adapter now holds the text as a string until
  the editor has a size, and the draft restore and the first render run through it as before. The editor's chunk
  loads, and the view is built, when the editor is shown (the switch to Edit, an Edit load), when something asks to
  focus it, or on an idle moment after the first sign of a reader (a key, a tap, the pointer). The caret and the
  slide band set in the meantime are replayed on the new view. On a phone profile (4x CPU) the page's blocking
  time fell from a median of 2,335 ms to 2,007 ms. An Edit load starts fetching the editor's chunk
  while the page hydrates, so it shows the editor as soon as before.
- **ArrowUp and ArrowDown no longer jump when the caret is scrolled out of the rendered lines.** After the
  preview scroll carried the editor away from the caret, CodeMirror stepped from the viewport instead of the caret
  (line 1 went to line 23 on an 8-slide deck). The Playground editor now steps by the document's lines from the
  caret whenever it is not drawn.
