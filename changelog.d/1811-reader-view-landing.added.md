- **Added: a deck can now say which reader view its readers land on.** The
  front-matter `lens-default:` key has been parsed, inherited, emitted and
  validated since reader views shipped, but nothing honored it — Present always
  opened on the full deck. It now opens on the deck's landing view, and the
  Reader views panel has a "Readers land on" control to set it.
- **A landing view fails soft, on purpose.** It says where a reader *starts*,
  not what they may see, so a landing view that is unapproved, edited since
  approval, staged, empty, or simply gone opens the full deck instead — the
  picker offered that anyway. Scoped views a reader *picks* are unchanged: those
  still fail closed with an explicit "unavailable", because a scoping view can
  be a deliberate redaction. The panel says which case you are in.
