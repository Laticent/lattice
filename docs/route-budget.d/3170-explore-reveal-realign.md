playground: +160

The Explore reveal fix (followup 3159-p7): a switch to Explore drops Edit's realign hold, a sequence number stops a
settle loop a later switch overtook, and the reveal publishes what it waits for as `data-hold` on the preview wrapper,
which is the signal the new playground-tab-switch case asserts on. Together they end a preview that stayed covered for
seconds after a quick Explore and back on a loaded machine.
