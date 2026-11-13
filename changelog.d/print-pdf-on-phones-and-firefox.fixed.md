- **Fixed: Print on a phone or in Firefox printed one page, a picture of the Studio, instead of the deck.**
  Those browsers print the whole page rather than the hidden print frame. On iOS, Android, any Firefox and any
  touch-first device, Print now prepares a real PDF (tap Print), then opens it to print (tap Open PDF), the path iOS
  already used. Desktop Chrome and Safari keep the print dialog.
- **Faster: printing or downloading a printed PDF no longer freezes the Studio.** Each page's image work runs in
  background workers as the slides are drawn: a 50-slide print went from 119 s to 58 s, with the longest freeze from
  2.6 s to 1.0 s, and the file is unchanged.
- **Faster: a printed PDF compresses each page once.** Print re-compressed every slide picture the Studio had just
  written; it now carries the picture's own compressed pixels, as the PDF export already did. Pixel-identical, about
  13 s faster for a 50-slide photo deck, and 2–7 % larger on disk.
