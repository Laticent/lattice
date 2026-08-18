- **Studio cold load, overall:** eager JavaScript **983KB → 642KB gz (−34.7%)** and
  **2833KB → 1843KB raw (−990KB)**, the HTML document **433KB → 188KB**, and preview
  fonts **43 → 19 files** on a deck without math. Measured base-vs-head in one session
  against identical generated artifacts; the raw figure is the one that recurs, since
  hashed assets are served cache-first but are re-parsed on every launch.
