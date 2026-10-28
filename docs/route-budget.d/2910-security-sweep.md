studio: +5
playground: +66
The Studio's crash sentinel now checks for a missed wipe before it writes on a visibility change (#1634), so a stale tab cannot restore a deck the user cleared.
The Playground's front-matter panel quotes and unquotes values so that what it writes is exactly what it reads back, including backslashes and quotes (#1958).
