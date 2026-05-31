# Picovoice model files

These files power the optional **Wake Nova** voice activation (Porcupine Web).
They are loaded by the browser at runtime and are referenced by env vars in
`.env.local` (see `.env.example`).

## Required

- `porcupine_params.pv` — the Porcupine parameter model. **Required for wake
  detection to run at all**, even with a built-in keyword.
  Download from the Picovoice Porcupine repo:
  `https://github.com/Picovoice/porcupine/blob/master/lib/common/porcupine_params.pv`
  Place it here so it resolves at `/picovoice/porcupine_params.pv`
  (`NEXT_PUBLIC_PICOVOICE_MODEL_PATH`).

## Optional — true "Nova" wake word

- `nova.ppn` — a **custom** keyword model. Generate it in the
  [Picovoice Console](https://console.picovoice.ai) for the **Web (WASM)**
  platform, download the `.ppn`, and place it here so it resolves at
  `/picovoice/nova.ppn`. Then set:
  `NEXT_PUBLIC_NOVA_WAKE_WORD_MODEL_PATH=/picovoice/nova.ppn`

If `nova.ppn` is not provided, the app falls back to a built-in keyword
("Jarvis") as a temporary stand-in. The button still says "Wake Nova", but the
phrase that triggers it is the built-in keyword until the custom model is added.

> These model files are not committed to the repo. Add them locally and upload
> them as part of your deploy (they live under `public/` so they ship as static
> assets).
