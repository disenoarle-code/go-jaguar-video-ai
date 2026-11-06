# Editor Gojaguar

Editor de video pensado para que Claude lo controle con pocos tokens y el usuario pueda corregir todo a mano.

- Plan por etapas: [docs/PLAN.md](docs/PLAN.md)
- Definición del producto: [docs/PRODUCTO.md](docs/PRODUCTO.md)
- Mediciones de rendimiento: [docs/BENCHMARKS.md](docs/BENCHMARKS.md)

## Estructura

| Carpeta | Qué es |
|---|---|
| `packages/core` | Modelo del proyecto (clips + capas), comandos, historial, guardar/abrir `.gojaguar`. **Sin dependencias del navegador**: lo usarán la app, el servidor MCP y la exportación. |
| `packages/app` | Interfaz y motor de vista previa (WebCodecs + Web Audio). Vite + TypeScript. |
| `media/originales` | Tus videos (no van al repositorio) |
| `media/proxies` | Copias livianas "todo keyframes" (no van al repositorio) |
| `docs` | Plan, producto, benchmarks |

## Comandos

```bash
npm install
npm run dev        # editor en http://127.0.0.1:5273
npm test           # pruebas del núcleo
npm run check      # tipos de core y app
```

Agregar un video tuyo (genera el proxy y lo registra en `media/manifest.json`):

```bash
HWACCEL=videotoolbox npm run proxy -- media/originales/mi_video.mp4    # HWACCEL es opcional (Mac)
```

Abrir un video concreto: `http://127.0.0.1:5273/?asset=a2`. Proyecto limpio: `?nuevo`.

## Usarlo

- Pasa el mouse por el timeline para ver los frames; arrastra los bordes para recortar; **S** corta; **Espacio** reproduce; **Supr** borra; **Ctrl/⌘+Z** deshace; **Ctrl/⌘+S** guarda.
- El proyecto se autoguarda en el navegador y se puede guardar/abrir como archivo `.gojaguar`.
- En la consola: `editor.exec({op:'delete_ranges', ranges:[[10,12],[30,31]]})`, `editor.describe()`, `await editor.bench()`.
