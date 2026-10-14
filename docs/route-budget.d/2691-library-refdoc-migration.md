studio: +64
The Library now rewrites reference PDFs saved as base64 text into binary when it opens (`migrateLegacyRefDocs`, an import and one call in Library.tsx's open effect, which ships in the Studio's eager chunk); the store module it lives in was already eager. CI measured +8 B gz against main on a1c4395; +64 covers this PR's later heads with room for gzip spread.
