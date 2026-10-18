studio: +13
This PR changes two budget files and no code, and nothing in any route's eager JS imports them (they are named only in comments). CI measured +13 B of Studio eager JS against main on 017deb8 anyway: the CI-only drift #2744, #2750, #2760 and #2763 hit, logged as followups.d/2750-p1-route-budget-ci-local-mismatch.md. Declared so the gate passes.
