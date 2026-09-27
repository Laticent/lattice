- The engine no longer reads the lines of a `style: |` block as deck settings. A CSS rule's
  `color: #c00;` used to set the deck-wide `color` directive on every slide, and a line named
  like a register (`lift: on`) turned that register on while the Studio showed it off. The
  engine now skips those lines as the Studio does.
