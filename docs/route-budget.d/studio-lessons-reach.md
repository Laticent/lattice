playground: +520
home: +520
components: +520
getting-started: +520

Lessons reach the site-wide search (slice 4 of engineering/decisions/2026-10-05-studio-lessons.md):
typing "pdf" on any page offers "How do I export a PDF?" and opens the Studio running it. The
lesson catalog itself loads on the first keystroke, as Pagefind does — as a static import it cost
+1.3 KB gzip on every route. What stays eager is the loader, the matcher and the "Learn in the
Studio" group: measured +462 to +464 B against `main` at 78eaf0d, declared with room for the phone
navigation fix in the same menu. The Studio itself is −17.4 KB gzip against `main` in this PR.
