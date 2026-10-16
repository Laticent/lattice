home: +5
playground: +1
CI measured these on 593a219 against main. The plugin placeholder's caption grew from "not listed in this deck's plugins:" to "not in this deck's plugins: list" (lib/packages/code-door-fence.mjs), and the Reading view's projection gained `withPlaceholderNotes` (lib/transformers/prose-projection.mjs); the door's style filter loads only when a render meets a plugin. A handful of gzipped bytes, declared rather than given back because the longer caption is the fix (the old one read as a sentence cut off).
