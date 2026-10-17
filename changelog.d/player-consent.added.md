- **Added: `--player-consent <origins>` lets a reader choose to load a player's web pictures.** Each
  picture from a named site ships as a placeholder. A banner names the sites and says what loading
  sends them, and the pictures load only when the reader presses **Load pictures**. With JavaScript
  off nothing loads, and the banner lists the pictures as links. The player's policy never lets the
  deck itself reach those sites: only its script can, after the reader agrees. The site must allow
  cross-origin reads. Off by default.
- **Fixed: `--player --allow-remote` embeds the deck's web pictures.** It used to ship them as links
  the player's own policy refused, so the reader saw broken images. A picture that cannot be
  fetched ships as a placeholder, and the run says so.
