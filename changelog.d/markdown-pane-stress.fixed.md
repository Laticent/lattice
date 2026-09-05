- **Fixed: a pasted deck no longer loses its front matter to an invisible byte.** A leading
  U+FEFF — what Notepad, PowerShell `>` and Visual Studio put at the head of a file — defeated
  the `^---` front-matter anchor, so the block parsed as a heading and rendered AS the first
  slide, with `theme:`, `size:` and `paginate:` silently ignored. It persisted and survived a
  reload. The Studio's editor now canonicalizes the document at that door, as its file-open
  door already did, and heals a deck already stored with one.
- **Fixed: the slide rail names the component the engine actually renders.** The rail read a
  `<!-- _class: … -->` comment anywhere on a line, so one stray character after the `-->` — or
  a directive quoted inside a code fence, or prose before it — left the rail calling a slide
  `title` while the preview beside it painted `content`. It also took the FIRST directive on a
  slide where the engine applies the last, so merging two slides by deleting a `---` left the
  rail naming the slide that had just been absorbed.
- **Fixed: "Fix all issues" is offered exactly when something can be fixed.** It was gated on
  the count of unknown components while the button repairs a different set, so it was enabled
  and did nothing on a typo too far from any real name, and disabled over a finding whose Quick
  fix was underlined two inches away.
- **Fixed: undo survives a trip through Compose.** Switching to the rich editor and back
  destroyed the source editor, and its history went with it — ⌘Z did nothing, and nothing said
  why. The editor now carries its history across the switch, and drops it only when an edit
  made in Compose means it would undo the wrong thing.
