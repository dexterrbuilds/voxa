# Wake Word Assets

Place Picovoice Porcupine Web/WASM assets here for browser wake-word detection.

Expected files for the default Voxa configuration:

- `nova_web.ppn`: custom Picovoice wake-word model for "Nova", exported for Web/WASM.
- `porcupine_params.pv`: Porcupine English parameter model.

These paths are configured with:

```env
NEXT_PUBLIC_PICOVOICE_KEYWORD_PATH=/wake/nova_web.ppn
NEXT_PUBLIC_PICOVOICE_MODEL_PATH=/wake/porcupine_params.pv
```

Do not commit private Picovoice access keys. The browser SDK requires
`NEXT_PUBLIC_PICOVOICE_ACCESS_KEY` at runtime.
