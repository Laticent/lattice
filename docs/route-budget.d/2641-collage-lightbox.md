studio: +656
playground: +576
home: +167
The collage lightbox host (`docs/src/playground/collage-host.js`) now builds the whole photo set for stepping and hands the shared transport kernel's key, swipe and zoom rules to the opener, and the Studio's click path carries the tap-versus-drag check (`lib/core/collage-tap.mjs`). The opener itself still loads on the first click. Given back first: the opener, the kernel import and the zoom machine stay in the lazy chunk; only the host glue is eager.
