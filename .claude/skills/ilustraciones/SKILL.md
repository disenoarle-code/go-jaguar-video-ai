---
name: ilustraciones
description: Cómo ilustrar un video gastando los MÍNIMOS tokens. Escalera de decisión (2D minimalista primero, 3D solo si hace falta) y los comandos que traen o crean cada recurso en una llamada. Léelo antes de proponer o crear cualquier toma de apoyo animada, icono, gráfico o modelo 3D.
---

# Ilustraciones con mínimos tokens (prioridad: 2D minimalista)

**Regla:** siempre la opción MÁS BARATA que comunique la idea. El 2D minimalista casi siempre es mejor y más barato; el 3D solo cuando el 2D no alcanza. Nunca escribas código nuevo de animación si una plantilla o composición con parámetros lo resuelve.

## Escalera (de más barata a más cara; ~tokens por ilustración)
1. **Plantilla del editor (2D, ~200)**: `contador`, `clave`, `barras`, `flujo`, `comparacion`, `preguntas`, `ficha`, `busqueda`, `foto` sobre un `fondo` plano → una capa `add_layer` con props (guía `docs/guia/07-…`). Sin render, sin archivos.
2. **Icono + composición `Iconos` (2D, ~250)**: `python3 experiments/estilo-3d/scripts/assets.py traer icono <palabras en inglés>` (≈20 tokens de salida; solo MIT/Apache/CC0) y luego `python3 scripts/ilustrar.py Iconos '{"items":[{"icono":"<archivo.svg>","etiqueta":"TEXTO"}],"duracion":3}' <inicio>` → imprime el `editor.batch` listo (≈120 tokens). Minimalista: 1–3 iconos, blancos, etiqueta corta.
3. **Modelo 3D de Poly Haven + `Modelo3D` (~300)**: `assets.py traer modelo <palabras>` (CC0, 1k) y `ilustrar.py Modelo3D '{"modelo":"assets/modelos/<id>/<id>.gltf","movimiento":"giro1","duracion":3}' <inicio>`. Parámetros: `movimiento` giro|giro1|balanceo|quieto, `velocidad`, `distancia`, `elevacion`, `fov`, `hdri` (de `assets.py traer hdri`), `sombra`, `entrada`. Poly Haven es sobre todo utilería (muebles, plantas, herramientas): para un producto concreto NO habrá modelo.
4. **Composición nueva (código, ~1.500–3.000)**: solo si nada de lo anterior sirve; hazla PARAMETRIZADA y regístrala en `experiments/estilo-3d/src/Root.tsx` para que la próxima vez sea el nivel 2/3. Para un producto concreto: Blender (modelarlo una vez) o generación 3D externa.

## Cómo se usa lo que sale
- `ilustrar.py` renderiza con transparencia (secuencia PNG → MP4 "pack", ~5 s), **cachea** por composición+parámetros en `biblioteca/animaciones/` (repetir = instantáneo) y devuelve JSON: ejecútalo tal cual con `editor.batch(<salida>)` en el editor. Sin audio. El tercer argumento es el segundo de la línea de tiempo donde entra.
- NUNCA abras ni imprimas SVG/gltf/hdr/mp4. Verifica con `editor.hoja()` (una imagen), no con capturas sueltas.
- Una zona `animacion_2d`/`animacion_3d` de la propuesta debe nombrar el NIVEL de la escalera que usará (así el usuario ve cuánto cuesta) y guardar solo los parámetros.
