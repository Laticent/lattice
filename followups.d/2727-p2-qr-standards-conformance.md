---
origin: 2727
priority: P2
recorded: 2026-10-16
area: engine
severity: medium
swimlane: engineering/decisions/2026-10-16-qr-plugin.md §3c
source: https://github.com/Laticent/lattice/pull/2727
---

# The shipped QR codes miss four points of the QR, Wi-Fi URI and vCard standards

why now   — A contact or Wi-Fi code with an accented name or SSID decodes garbled in a standards-following reader,
            and three smaller gaps sit beside it. The QR plugin (2026-10-16-qr-plugin.md §4, slice 1b) moves this code
            and owes the fixes.
where     — `lib/components/connect/_qr-card/qr-card.js:83` (`margin: 3`; no ECI), `lib/engine/qr.js` (the encoder
            call), `lib/components/connect/wifi/wifi.transform.js:22-41` (Wi-Fi URI), `lib/components/connect/contact/contact.transform.js:26-45` (vCard).
done when — (1) the encoder's quiet zone is 4 modules; (2) a payload with a non-ASCII character carries ECI 26
            (UTF-8), after a scan check on an iPhone and an Android camera; (3) the Wi-Fi payload follows the WPA3
            specification §7 grammar where phones accept it, with a `hidden` field, and the WPA3 `T:` value chosen
            by joining a test network; (4) the vCard carries `N` and CRLF line ends. Each is pinned by a decode test.
evidence  — 2026-10-16: CLI export of a `contact` slide with `José Núñez` and a `wifi` slide with `Café-Guest`, decoded
            with zbar 0.23.93: `FN:Jos矇 N繳簽ez`, an SSID garbled the same way, no `N:` line, LF line ends,
            `T:WPA` for `WPA3`. The same name encoded with ECI (segno) decodes as `José Núñez`.
verify    — render both slides, decode the PNGs with `zbarimg --raw`, then scan them with two phones.
