studio: +200
playground: +80
The Library gets a Plugins pill, and the editor's lint now re-runs when a plugin is imported or removed (CI measured studio +186 gzip bytes against main: editor-diagnostics +78, panel-shells +31, plugin-library +27, StudioIsland +26; playground +77, all editor-diagnostics). The playground share is the plugin-vocabulary version counter the lint subscribes to.
