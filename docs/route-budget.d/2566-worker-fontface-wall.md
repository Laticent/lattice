home: +5
The code package worker's second wall grew: `workerScript` (lib/packages/code-shape.mjs) now removes
FontFace, FontFaceSet and fonts, walks the global's prototype chain, clears two `navigator` names and
checks itself. That module, re-exported by code-door-core.mjs, is the only code the site bundles that
this PR changes; CI measured +5 B gz on home's eager JS against main (studio −15, playground −2). It is
a security fix with nothing to give back without weakening the wall.
