- **Fixed: reopening the deck settings or Present's slide overview no longer grows memory on
  Safari and iPad.** Each reopen used to rebuild the preview thumbnails inside them, and WebKit
  never gives a torn-down preview back: the deck settings' preset tiles made 8 new documents
  per reopen (+197 MB over six reopens), and the overview 14 (+260 MB). Both now stay loaded
  after their first open and are only hidden when you close them, so a reopen builds none. They
  still open fresh, at the top, with nothing left expanded, and their previews still scroll
  with the panel.
- **Fixed: closing a panel on a phone no longer pops up the hint of the button that opened
  it.** A hint now appears on keyboard focus and on hover, but not when a closing panel
  hands focus back after a tap.
