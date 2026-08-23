- The Studio preview no longer fetches every text face twice. It prepended a second
  `@font-face` supply on top of the theme's own, declaring the same 17
  family/weight/style combinations under a different URL scheme — so the preview frame
  downloaded ~226KB of duplicate woff2 on every cold load, and several weights resolved
  to the wrong bytes (that supply is 17 filenames over only 6 distinct files). Preview
  fonts: **1174KB → 948KB across 43 → 39 files**; `@font-face` rules in the frame 54 → 37.
