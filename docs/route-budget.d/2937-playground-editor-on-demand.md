studio: +787
home: +586
The Playground now loads `editor.js` (CodeMirror and its extensions) through a dynamic `import()` from `EditorHost`, so the bundler regroups shared code: `markdown-it` gains 45,112 bytes and `slide-boundaries` loses 45,508 on the routes that share them. The net on the two routes that were already over soft is a few hundred bytes of chunk-boundary overhead, not new code. The route this change is for, the Playground, drops 287,512 bytes of eager JS against main (616.7 to 353.7 KB gzipped) and its soft target was lowered in the same PR.
Given back first: none found; the growth is the regrouping itself, and the 45 KB module is in a chunk these two routes need either way.
