studio: +64
home: +16
CI measured studio +26 B and home +5 B of eager JS against main. The shipped scenes themselves load lazily: `lib/motion/scenes.generated.js` is its own chunk, fetched only when the Library asks for it, and `Library.tsx` is a lazy panel. The likeliest eager growth is `lib/packages/packages.generated.json`, which gains four motion rows and is read by the Studio's import code (`import-parsed.ts`, `door-run.ts`); the 5 B on home is not traced to a module and reads as gzip variation from a shared chunk. Declared with headroom over 26 / 5 for gzip spread.
