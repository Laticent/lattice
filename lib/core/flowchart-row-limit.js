// The most nodes a flowchart row may hold, shared by the row grammar (its `maxNodes`, per run of text)
// and `splitRow` (the sum over a row's runs). A leaf of its own, so `splitRow` need not require the
// grammar module, whose factory would ride into the Studio's lint bundle (route-budget lintCoreGz).
// The longest of the 882 corpus rows holds 27 nodes; a 6,000-step chain holds 18,000 (24,000 with labels).
module.exports = { MAX_NODES: 65536 };
