# Benchmarks

Cómo medir: abre el editor con un video real (`?asset=<id>`), deja la pestaña **visible** y en la consola ejecuta:

```js
await editor.bench()
```

Mide scrub (60 saltos aleatorios), reproducción 5 s (frames distintos, avance del reloj, pausas >80 ms) y memoria JS.
Cada cambio importante debe correrlo; si una métrica empeora, no se acepta.

## Presupuestos (ver PLAN.md)

| Métrica | Objetivo |
|---|---|
| Scrub (mediana) | ≤ 25 ms |
| Reproducción | frames del video completos, 0 pausas >80 ms |
| Memoria JS con 10 min | < 1 GB |

## Línea base — 2026-11-05 (E1)

Mac arm64, navegador integrado (Chromium), video IMG_0047: 4K HEVC, 10:04, proxy 640 px todo-keyframes (159 MB).

| Caso | Scrub mediana / p90 / máx | Reproducción 5 s | Memoria JS |
|---|---|---|---|
| 1 clip, 10:04 | 17,8 / 19,1 / 19,8 ms | 151 frames, reloj 4,95 s, 0 pausas | 279 MB |
| 146 clips, ×1,1, 7:37 | 17,8 / 19,2 / 20,2 ms | 167 frames, reloj 4,95 s, 0 pausas | 387 MB |

Otros datos medidos antes (prototipo): preparar el proxy de 10 min tarda 2 min 17 s (HEVC 4K → H.264 640 px, con VideoToolbox); estirar el audio a ×1,1 sin cambiar el tono tarda ~0,8–1 s para 10 min.

Pendiente de medir: Windows, videos verticales, 60 fps, proyectos de 30+ min.
