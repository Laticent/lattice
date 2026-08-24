- **Fixed: the read-aloud docs test no longer depends on the order its own cases run in.**
  Two of its describes swapped in their own voice model for one case and cleaned up
  with `vi.doUnmock`, which drops the module's mock registration entirely — the
  file's own hoisted `vi.mock` included. `read-aloud.ts` reaches the voice model only
  through dynamic `import()`, so every later case that touched the top-level import
  silently ran against the real one: a spy that was never called, a highlight that
  never advanced. In declaration order those describes run last and nothing observes
  the aftermath. They now restore the file's stub instead of unmocking it.
