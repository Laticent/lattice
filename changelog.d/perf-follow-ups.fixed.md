- **Fixed: an unclosed `<!--` no longer freezes the render or the linter.** A pasted
  deck holding many HTML comment openers with no `-->` made several comment readers
  rescan to the end of the text from every opener. One 250 KB line of `<!--` took 148 s
  to render and 89 s to lint, and 280 KB of `a <!--` lines took 17 s to render. Both run
  on the Studio's main thread, and the Playground's layout gate did the same to a
  model-written skeleton. The readers now find each closer once and reuse it, and the
  markdown-it guard decides exactly whether upstream's comment pattern can close: those
  inputs take 0.1–0.4 s, and every example deck renders byte-identical.
- **Fixed: a cold render is about 16% faster again.** The render tier had drifted
  25–50% over its blessed baseline since 2026-09-08. Two costs were new: the section
  walker re-scanned the same document on every pass, and the CSS comment walk stepped
  through the 2.3 MB bundle one character at a time. The walker now remembers its
  answer for the last few documents, and the CSS walk jumps between the characters
  that matter.
- **Fixed: reopening Add slide or deck settings no longer grows memory on Safari and iPad.**
  Every reopen used to build its preview thumbnails as fresh documents, and WebKit never
  gives those back: about 30–45 MB per reopen. The Studio now keeps one set of preview
  frames for the whole session and lends them to whichever panel is open, so a reopen
  builds none. Needs Safari 26 or later; older browsers behave as before.

