- **Fixed: the Studio test "the strip's Undo is the editor's own undo" no longer fails under load.** It typed into
  the editor right after picking slide 2 on the strip, but the editor moves its caret to a picked slide one frame
  later. On a busy machine the text landed in slide 1, the focus followed it back there, and the ⋯ the test then
  clicked was gone before the click, so the slide menu never opened. The test now waits for the caret to reach
  slide 2. Slowing every frame to 200 ms reproduces the old failure every time; with the wait, all 74 cases in
  the file pass with slowed frames.
