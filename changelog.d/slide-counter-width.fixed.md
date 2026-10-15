- **Fixed: the Studio's slide counter no longer widens on decks past 99 slides.** Its reserved
  width was 78px, and "Slide 100 / 999" draws 78.75px, so the row shifted by up to a pixel. The
  slot now reserves 80px, which holds every count up to "Slide 999 / 999".
