studio: +16
No eager code grows. `tidyPptx` lives in Calco (`docs/src/lib/calco/pptx.ts`), which the Studio loads only through a dynamic `import('@/lib/calco')` when an office file is exported. The +2 B CI measured on the Studio's eager JS is gzip variation from a lazy chunk's changed hash, as #2361 saw on the playground. Declared +16 to leave room for that variation.
