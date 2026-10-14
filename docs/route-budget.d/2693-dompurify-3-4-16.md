studio: +900
playground: +880
home: +880
DOMPurify 3.4.11 → 3.4.16 is a security bump of the sanitizer every route loads eagerly (sanitizeSlideHtml, HARD RULE #22). CI measured +847 B gz on the Studio and +826 B gz on the playground and home routes against main; the declared figures add about 50 B for gzip spread. The bytes are upstream's own fixes (the shared-allowlist fork, the raw-text closing-tag check, new SVG attributes), so there is nothing in this PR to give back short of dropping the fix.
