- **Fixed: a pasted deck no longer loses its front matter to an invisible byte.** A leading
  U+FEFF — what Notepad, PowerShell `>` and Visual Studio put at the head of a file — defeated
  the `^---` front-matter anchor, so the block parsed as a heading and rendered AS the first
  slide, with `theme:`, `size:` and `paginate:` silently ignored. It persisted and survived a
  reload. The deck source is now canonicalized where it enters — on paste, and when a deck is
  read from the store — so a deck saved with one before this landed opens clean rather than
  rendering its own front matter as the first slide.
- **Fixed: the slide rail names the component the engine actually renders.** The rail read a
  `<!-- _class: … -->` comment anywhere on a line, so one stray character after the `-->` — or
  a directive quoted inside a code fence, or prose before it — left the rail calling a slide
  `title` while the preview beside it painted `content`. It also took the FIRST directive on a
  slide where the engine applies the last, so merging two slides by deleting a `---` left the
  rail naming the slide that had just been absorbed. Both are gone because the rail now asks
  the kernel that already answers this question, so it also picks up the container-prefixed
  and running-global directives the old regex never saw.
- **Fixed: "Fix all issues" is offered exactly when something can be fixed.** It was gated on
  the count of unknown components while the button repairs a different set, so it was enabled
  and did nothing on a typo too far from any real name, and disabled over a finding whose Quick
  fix was underlined two inches away.
- **Fixed: undo survives a trip through Compose.** Switching to the rich editor and back
  destroyed the source editor, and its history went with it — ⌘Z did nothing, and nothing said
  why. The editor now carries its history across the switch, and drops it only when an edit
  made in Compose means it would undo the wrong thing.
