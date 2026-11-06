# Editor Gojaguar

Editor de video pensado para que Claude lo controle con pocos tokens y el usuario pueda corregir todo a mano. Se usa dentro de Claude Code (ver [CLAUDE.md](CLAUDE.md)).

- Plan por etapas: [docs/PLAN.md](docs/PLAN.md) · Producto: [docs/PRODUCTO.md](docs/PRODUCTO.md) · Mediciones: [docs/BENCHMARKS.md](docs/BENCHMARKS.md)

## Estructura

| Carpeta | Qué es |
|---|---|
| `packages/core` | Modelo del proyecto (clips + capas), comandos, historial, `.gojaguar`. Sin navegador. |
| `packages/app` | Interfaz (Home, Proyecto, Editor), motor de vista previa y API local (`server/api.ts`). |
| `biblioteca/` | Tus proyectos y referencias (no va a git). Ver CLAUDE.md. |
| `.claude/skills/guion-viral` | Criterios para editar el guion (claridad primero). |
| `experiments/estilo-3d` | Ensayo de estilo con Remotion + three.js. |
| `docs` | Plan, producto, benchmarks |

## Usar

```bash
npm install
npm run dev        # http://127.0.0.1:5273
npm test           # pruebas del núcleo
npm run check      # tipos
```

En el navegador: **Nuevo proyecto** → sube videos → **Recorta silencios y errores** → elige referencias → **Edición completa** → **Abrir editor**. Los botones que necesitan criterio le llegan a Claude Code (que vigila con `npm run vigilar`) y la app muestra el estado.

Herramientas: ffmpeg y ffprobe (obligatorias), whisper-cli + modelo (para el texto). La biblioteca se puede mover con `GOJAGUAR_BIBLIOTECA=/ruta`.

## Editor

Pasa el mouse por el timeline para ver los frames; arrastra bordes para recortar; **S** corta; **Espacio** reproduce; **Supr** borra; **Ctrl/⌘+Z** deshace; **Ctrl/⌘+S** guarda (también se guarda solo).
