- **Fixed: the phone demo no longer drops its last keystroke.** The Studio's markdown editor
  reported each text it was handed back to the Studio as an edit. When that report ran late, it
  overwrote the newer text, so "My First Deck" saved one character short (`- Sentiment \`5`, no
  closing backtick) on real WebKit. The editor now reports a synced text only when the sync changed
  it, which today means stripping a leading BOM.
