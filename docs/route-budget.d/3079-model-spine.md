studio: +5800
The model spine reads the stored chat and voice selections synchronously at boot (`lib/model-selection.js`, with its one-time migration of the legacy keys), so the chat chip, Present's voice pill and Workspace › AI paint their final state on the first frame instead of jumping when the model module answers. The Studio's boot path also asks the key store whether a key is stored (`providerKeyState`), to tell "needs a key" from "still opening" without loading the model. On top of that, the boot-path guard rails added after review: the key store retries a transient failure by itself, the voice model stops on a retired model (`isModelGoneError`) and reads every page of Gemini's voice list, the status names a direct provider's default model, and the shell turns the retired-voice event into one notice (an event, so the notice kernel is not split into its own chunk). Measured locally on c2685787+ against `main` 644f177: +3799 bytes of eager JS (`openrouter-key` split into its own chunk +2031, `tts-voice-catalog` +1490, `architect` +392, `images` −268, `panel-shells` −211). The chooser, provider rows and chip switch load with the lazy Workspace sheet and chat panel. `main` already sits 1.2 KB over the studio soft target, so none of the 2 KB allowance is free. Declared with a little room for gzip variation.

The routes redesign (engineering/decisions/2026-11-08-studio-ai-routes-ux.md) adds to the boot path: the fill rules
(`fillUnset`, `fillFromConnections`, `canRunKokoro`, which the shell runs at startup), the image-reader selection and
its migration in `lib/model-selection.js`, per-use spend booking in `spend.js`, the Not-set and retired chip states,
and the shared Models in use / Connections labels in `panel-shells.tsx` (shared with the loading frame so the sheet
does not move). Version healing (`lib/model-family.js`) and the retired / out-of-credit registry
(`lib/model-retired.js`) were split OFF the boot path for this budget: a first build put them there at +7.7 KB.
Measured on 2026-11-08 against `main` 234538b8 with `measure-route-base.sh`: +4,913 bytes raw, about +5,350 once the
files `main` changed since this branch forked are set aside (`tts-voice-catalog` +2,125, `openrouter-key` +2,100,
`architect` +521, `StudioIsland` +228, `radio-group` +207, `spend` +207, `panel-shells` +146, `images` -268).
Declared with a little room for gzip variation.

