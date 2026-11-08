---
name: propuesta-zonas
description: Paso 2 de la edición (después de revisar el guion). Analiza las ZONAS donde lo que se dice es relevante y propone con qué ilustrarlas o resaltarlas (tomas de apoyo, imágenes, gráficos, zooms). Se usa cuando llega un pedido `propuesta` de la app.
---

# Propuesta de edición por zonas (pedido `propuesta`)

Llega por `npm run vigilar` como `PEDIDO {"tipo":"propuesta","slug":…}`. Pasos: `npm run solicitud -- <id> en_curso` → trabajo → escribir `biblioteca/proyectos/<slug>/analisis/propuesta.json` → `npm run solicitud -- <id> hecho` (la app lo muestra en `#/p/<slug>/propuesta`). Luego vuelve a arrancar `npm run vigilar`.

## Qué leer (poco, por tokens)
1. `analisis/notas-edicion.json` → `texto`: **recomendaciones generales del usuario** para toda la edición (estilo, ritmo, tono, qué evitar). Tenlas MUY en cuenta aquí y en todo el resto de la edición.
2. `analisis/guion-texto.txt`: el guion FINAL en texto plano, una línea por sección (`S<n> <video> <inicio>-<fin> texto`), ya sin lo que el usuario quitó. **Léelo a él, NO `guion.json`** (ese trae los tiempos de cada palabra y pesa ~5 veces más; solo se abre si necesitas el tiempo exacto de una palabra para fijar `t0`/`t1` de una zona).
3. `analisis/apoyo/*.json` (tomas de apoyo): si `descripcion` es `null`, mira **UNA sola imagen**, la hoja de contacto `hoja` (un fotograma por escena con su hora; ruta relativa a `biblioteca/`; `escenas[n]` da el rango de cada celda) y **escribe** `descripcion` (qué muestra, qué segundos sirven, para qué tema). Si ya la tiene, usa solo esa.
4. Estilo gráfico: `.claude/skills/estilos/` (lee solo el estilo elegido) y su regla de movimiento.

## Qué ES una zona (y qué NO)
Una zona SOLO existe donde **de verdad entra otra imagen**:
- una **toma de apoyo** o una **imagen** (que ya subió el usuario, o que le pides que suba),
- un **video generado** (próximamente), o
- una **animación 2D o 3D** que yo creo para explicar algo complejo (un proceso, un mecanismo, una comparación, un dato abstracto).

**NO son zonas** (las decido yo sin preguntar, según el estilo gráfico o las referencias): textos, subtítulos, letras, rótulos, números en pantalla, zooms, cambios de plano, color. El estilo de **subtítulos virales** será una sección propia más adelante (por ahora los pongo a mi criterio, salvo que el usuario pida algo muy específico).
Pocas zonas (normalmente 2–8): solo donde la imagen ayuda de verdad a entender o retener.

## Formato de `propuesta.json`
```json
{ "estado": "lista", "zonas": [ {
  "id": "z1", "f": "<stem del video>", "t0": 12.4, "t1": 19.8,         // tiempos del VIDEO FUENTE (de words.json), no de la línea de tiempo
  "texto": "frase(s) que se dicen en la zona",
  "motivo": "por qué merece resaltarse (1 línea)",
  "opciones": [ { "tipo": "toma_apoyo|imagen|animacion_2d|animacion_3d|video_generado", "descripcion": "qué se vería y cómo entra", "apoyo": { "toma": "<stem de la toma de apoyo>", "t0": 3, "t1": 8 } , "busqueda": "clip de X (si falta material: lo que le pides al usuario)" } ],
  "elegida": 0, "prompt": "", "aportes": [], "decision": "pendiente"
} ] }
```
- Por ahora **UNA sola opción** por zona (`opciones` es un arreglo: el espacio para 3 opciones y para generación de video queda listo).
- Si una toma de apoyo ya existente sirve, ponla en `apoyo`. Si no hay nada que sirva, usa `busqueda` ("clip de manos usando el producto") para pedírselo al usuario en vez de inventar.
- **Elige siempre la ilustración más barata** (`.claude/skills/ilustraciones/SKILL.md`: 2D de plantilla > icono > 3D de Poly Haven > código nuevo); en `descripcion` di qué nivel usarás y con qué parámetros.
- **Redáctalo para que se entienda qué se le pide al usuario** (la app lo muestra así): con `apoyo` → "Voy a usar una toma que ya subiste"; sin `apoyo` y tipo toma_apoyo/imagen → "Sugiero que subas…" y en `busqueda` dices EXACTO qué debe mostrar (sujeto, acción, duración aprox.); animación → "Yo la creo, no tienes que subir nada" y en `descripcion` explicas qué mostrará la animación.
- **Movimiento (aparte de las zonas):** el video no debe pasar ~8 s con la misma toma sin cambio de plano o zoom; eso lo aplico yo en la edición, no es una zona.
- No inventes frases ni cifras que la persona no dijo. No toques los originales.

Al terminar, di en el chat cuántas zonas propusiste y qué falta (clips que pediste).
