- **Fixed: a Studio test no longer fails at random in a full suite run.** `StudioShell`'s
  "reaches Fabricate from the launcher" test waited on the code-split Fabricate pane with
  Testing Library's 1s default, which is a wait on a module transform rather than on a state
  update and runs past that budget when the machine is busy. It now carries an explicit budget,
  matching the helpers that already do this elsewhere. No product code changes.
