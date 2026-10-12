---
group: Test & verify
---
Ask the RENDERING engine whether every CSS value we ship is actually in its property's grammar — CSS.supports() in the same Chromium the PDF/HTML paths use. Catches the declaration a browser DROPS at parse time, which no other gate can see: it is valid SYNTAX so checkCssSyntax passes, and a dropped override usually moves no pixels so no golden drifts. Budget 0 + a SANCTIONED allowlist for deliberate cross-engine pairs (stale entries fail too). On-demand, not in build:check — that gate is contractually render-free.
