studio: +40
Show work now opens as a bottom sheet on a phone as well as a dialog above 640 px, and a finished reply carries the new one-line `ChatActivityRow`. Both ship in the chat's eager code (`diff-card` +81 B gz, offset by `StudioIsland` -60 B), and CI measured +21 B gz against main at a66520a. +40 covers that head with room for gzip spread.
Given back first: the sheet reuses the existing `Sheet` primitive and the dialog's shared `TraceBody`, so there is one trace body, not two; the snippet and tail helpers are a few lines each.
