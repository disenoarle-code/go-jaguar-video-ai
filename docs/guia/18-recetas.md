## Recetas

- **Silencios:** ya los quita el botón. A mano: `ffmpeg -i proxy -vn -af silencedetect=noise=-32dB:d=0.45 -f null -`.
- **Velocidad sin cambiar el tono:** `speed_all` (1,1 suena natural).
- **Verificar un corte:** arma el audio final con ffmpeg (`atrim` + `concat`), transcríbelo con `whisper-cli` y léelo. Ojo: los tiempos por palabra de Whisper salen **desfasados hasta ~1 s**; para ubicar un corte transcribe un tramo corto y mira la **energía** del audio.
- **Estilo 3D / zooms / subtítulos animados:** `experiments/estilo-3d` (Remotion + three.js): `cd experiments/estilo-3d && npm install && npm run studio`. Licencia de Remotion: revisarla antes de uso comercial.
