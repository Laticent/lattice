studio: +200
playground: +20
home: +20
components: +20
getting-started: +20

Studio lessons, the Sharing track and the Vetrina phone floor (engineering/decisions/2026-10-05-studio-lessons.md
§Sharing, §Caption). The Studio carries two more lesson catalog rows (id, question, search words);
the lessons themselves load on demand. Every route carries the one-attribute check that keeps a
walkthrough's Exit usable over an open sheet (`data-modal-exempt` in ui/persistent-surface.tsx).
Measured against `main` at 281e9e0 with measure-route-base.sh: studio +150 B, every other route +12 B;
declared with a little room for CI's own build.
