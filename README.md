# Go Jaguar Video AI

Editor de video pensado para que Claude lo controle con pocos tokens y el usuario pueda corregir todo a mano. Se usa dentro de Claude Code (ver [CLAUDE.md](CLAUDE.md)).

- Plan por etapas: [docs/PLAN.md](docs/PLAN.md) · Producto: [docs/PRODUCTO.md](docs/PRODUCTO.md) · Mediciones: [docs/BENCHMARKS.md](docs/BENCHMARKS.md)

## Estructura

| Carpeta | Qué es |
|---|---|
| `packages/core` | Modelo del proyecto (clips + capas), comandos, historial, `.gojaguar`. Sin navegador. |
| `packages/app` | Interfaz (Home, Proyecto, Editor), motor de vista previa y API local (`server/api.ts`). |
| `biblioteca/` | Tus proyectos y referencias (no va a git). Ver CLAUDE.md. |
| `experiments/estilo-3d` | Ensayo de estilo con Remotion + three.js. |
| `docs` | Plan, producto, benchmarks |

## Instalar (Mac y Windows)

Requisitos previos: **Git**, **Node 22+** ([nodejs.org](https://nodejs.org)) y **Claude Code**. En Windows se usa `winget` (viene con Windows 10/11); en Mac, [Homebrew](https://brew.sh).

```bash
git clone https://github.com/gojaguarco/go-jaguar-video-ai.git
cd go-jaguar-video-ai
npm install
npm run instalar                   # solo REVISA qué falta (no instala nada)
npm run instalar -- --instalar     # instala lo que falte: ffmpeg, Python y sus paquetes, whisper-cli + modelo de voz (1,5 GB),
                                   # modelo de recorte de persona (15 MB), Chrome y las dependencias de las animaciones
```

- **Windows:** después de instalar con winget, cierra y abre la terminal y vuelve a correr `npm run instalar` hasta que todo salga con ✓.
- Opcionales (marcadas con `·`): whisper (texto del guion) y su modelo, recorte de persona, y `--alinear` para subtítulos karaoke (+1,5 GB). Sin ellas, esa función se omite y el resto funciona.
- Los scripts de Python se ejecutan con `node scripts/py.mjs scripts/<script>.py …` (elige solo `python` o `python3`; no hace falta activar nada).
- Con Claude Code: abre la carpeta, escribe `claude` y pide **"instala y abre el editor"**.
- Variables útiles: `GOJAGUAR_BIBLIOTECA` (dónde guardar proyectos), `GOJAGUAR_WHISPER_MODEL`, `GOJAGUAR_PYTHON`, `GOJAGUAR_NO_HWACCEL=1`.

## Usar

```bash
npm run dev        # http://127.0.0.1:5273
npm test           # pruebas del núcleo
npm run check      # tipos
```

En el navegador: **Nuevo proyecto** → sube videos → **Recorta silencios y errores** → elige referencias → **Edición completa** → **Abrir editor**. Los botones que necesitan criterio le llegan a Claude Code (que vigila con `npm run vigilar`) y la app muestra el estado.

Herramientas: ffmpeg y ffprobe, Python 3.9+ y Chrome (obligatorias); whisper-cli + modelo (para el texto, opcional). La biblioteca se puede mover con `GOJAGUAR_BIBLIOTECA=/ruta`.

## Editor

Pasa el mouse por el timeline para ver los frames; arrastra bordes para recortar; **S** corta; **Espacio** reproduce; **Supr** borra; **Ctrl/⌘+Z** deshace; **Ctrl/⌘+S** guarda (también se guarda solo).
