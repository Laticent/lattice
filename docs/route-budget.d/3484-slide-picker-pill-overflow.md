studio: +1854
playground: +593
home: +376
getting-started: +376

The add-slide gallery's family pills keep to one row and fold the rest into a "More" menu (#3484, owner pick 2026-11-23), so `PillTabs` now carries a fit rule, a ruler and that menu. The Studio already shipped the dropdown menu, and it moved into the `pill-tabs` chunk (+6,603 / −5,791 gzip); the rest of the Studio's growth is the fold rule and the match labels. The three other routes do not render the gallery: their +376 is Rollup re-splitting the shared `tap-away` chunk (+596, `select` −258) around that move, not new code they run.
