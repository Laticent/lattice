- **Fixed: an author with no OpenRouter key can export a narrated webpage with the on-device
  voice.** If the on-device voice finished loading while Share → Webpage was open, the
  "Narration audio" switch stayed disabled and the export shipped with no sound. The panel now
  notices when the voice becomes ready. With the on-device voice chosen, the panel also stops
  quoting cloud billing ("publishes no price", "bills the whole deck", "Connect OpenRouter"). It
  prices the synthesis as free, and it names the voice that will narrate.
- **Fixed: the "Narration audio" switch can always be turned off.** If the cloud voice became
  unavailable while the webpage export panel was open with audio on, the switch stayed on and
  could not be changed. It now only blocks turning audio on.
- **Fixed: an on-device narration that times out no longer says "check your connection".** The
  on-device voice makes no network request, so the export's refusal now names the real cause:
  the voice is too slow on this device.
