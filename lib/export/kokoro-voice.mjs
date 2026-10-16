// The Studio's Kokoro voice, as plain data — no imports, so anything can read it.
//
// `narrate-kokoro.mjs` holds a dynamic `import('kokoro-js')`, an OPTIONAL package. A bundler resolves
// that specifier when it transforms the file, so a test that imported the module just to read these
// constants failed to load wherever kokoro-js is not installed (CI): the docs-build job on #2540.
// The constants live here instead, and narrate-kokoro.mjs re-exports them.

/** The Studio's defaults (docs/src/playground/voice-model.js, tts-voice-catalog.ts). */
export const KOKORO = Object.freeze({ model: 'onnx-community/Kokoro-82M-v1.0-ONNX', voice: 'af_heart', dtype: 'q8', speed: 1 });

/** The version this path was measured with (engineering/decisions/2026-09-25-video-export.md §9). */
export const INSTALL_HINT = 'npm i --no-save kokoro-js@1.2.1 @breezystack/lamejs@1.2.7';
