- **Fixed: six more internal front-matter keys no longer ship as the speaker note.** A
  hyphenated key is never read as a directive — `\w` excludes `-` — so `<!-- logo-style: brand -->`,
  `<!-- logo-on: title -->`, `<!-- logo-x: … -->`, `<!-- logo-y: … -->`, `<!-- logo-scale: … -->`
  and `<!-- finish-override: -->` each did nothing AND landed in the presenter-notes field of
  every exported format. They are now classified as pragmas. Each matcher was derived from its
  producer and is pinned to it by a test, so a real note that opens with one of those words —
  `<!-- logo-on: the second half -->` — is still a note, and a marker the producer itself
  ignores (`logo-x: 1.2.3`, `LOGO-STYLE: brand`) stays visible rather than being silently
  suppressed.
