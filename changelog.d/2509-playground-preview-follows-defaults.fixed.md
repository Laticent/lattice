- The Playground page's preview re-renders when the host changes its plugin defaults
  (`LatticePlayground.setPluginDefaults`), as its editor's lint already did; it used to keep the
  render made under the old defaults until the next keystroke.
