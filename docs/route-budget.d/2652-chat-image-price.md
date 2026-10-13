studio: +32
The chat's budget gate takes an `extraUsd` argument on `estimateUsd` and `cloudBudgetBlock` (architect.ts), so a model's own image price can ride into the hard stop. CI measured +9 bytes against main; +32 leaves room for gzip spread. `pictureSurchargeUsd` and the catalog's `imagePerM` field live in lazy chunks (agent-assets.ts, architect-model.js), not in eager JS.
Given back first: the new `ORPrice.imagePerM` is a type only, and the surcharge helper stays out of architect.ts so the startup bundle gains no pricing logic.
