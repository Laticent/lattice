- **Security: an imported `.zip`'s CSS is checked before it is stored — themes and
  components both.** A shared `.zip` is the one path in the threat model where the
  author and the victim are different people, and it reached storage with no CSS gate
  at all. The component arm was the wider half: hostile component CSS reaches the same
  same-origin preview `<style>` and every export, and the intended workflow — import,
  then insert the skeleton — is what fires it. A finish needs no gate by construction
  (its CSS is discarded and regenerated from the clamped recipe).
- **Refused per item, not per bundle.** The whole import used to sit in one
  `try`/`catch`, so one bad asset silently dropped every asset after it *and* left the
  shelf unrefreshed, which read as "nothing happened". Each refused item is now named
  with the reason, and everything else still imports.
- **Only unambiguous off-device fetches refuse.** A theme missing a contract token, a
  token whose *name* contains `javascript`, or a component class called `.javascript`
  all import as before — the exfiltration rules are what veto: a remote `url()`, a
  remote or unresolvable `@import`, `expression()`, `-moz-binding`.
