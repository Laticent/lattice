- **Fixed: Fix all no longer freezes the Studio on a large deck.** It ran every fix pass inside the click, so a deck
  that needs many passes (one card fixed per pass) froze the page for over 8 seconds. Each pass now runs on its own,
  so the page keeps responding while Fix all works. If you edit the deck before it finishes, nothing is replaced and
  Fix all asks you to press it again. The same holds in Compose and on the Playground.
