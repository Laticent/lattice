- **Changed: the family-overflow oracle is re-blessed after a month of drift.**
  `test/oracle/family-overflow.json` was last blessed on 2026-07-28 (#1236). It
  records which components overflow with pagination disabled, so ordinary spacing
  and typography work moves it. No layout changed here: `hd` — the one row where a
  clip is what a reader actually sees — stays at 0, every newly-recorded name is
  split-enrolled and paginates in a real export, and `--ladder`'s `rings` column is
  unchanged at every size. `matrix-grid` joins the roster because #1627 gave it an
  adaptive arm; it clips nowhere.
