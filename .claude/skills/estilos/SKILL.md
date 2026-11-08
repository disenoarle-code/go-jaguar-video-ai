---
name: estilos
description: Estilos de edición de Go Jaguar y la REGLA DE MOVIMIENTO (el video nunca debe verse quieto). Léelo antes de proponer o aplicar una edición completa: elige un estilo, lee solo su archivo y aplica el movimiento. También para añadir un estilo nuevo o resumir una referencia.
---

# Estilos de edición y movimiento

Reemplaza a la sección "Referencias" de la app: los estilos viven aquí, en archivos `.md` (uno por estilo). **Lee solo el estilo elegido**, no todos. Si el usuario no eligió, usa `adrian-saenz-explicativo.md` salvo que sus recomendaciones generales (`analisis/notas-edicion.json`) digan otra cosa.

Estilos disponibles:
- `adrian-saenz-explicativo.md`: gráficos que explican cada idea, fondos lisos, 16:9. (Vertical: adáptalo con las reglas de `docs/guia/07-plantillas-de-graficos-explicativos-esti.md`.)

**Estilo aprendido del usuario:** lee también `biblioteca/aprendizaje/estilo-usuario.md` (si existe, ≈400 tokens): prevalece sobre el estilo base cuando chocan. Cómo se genera: `.claude/skills/aprender-estilo/SKILL.md`.

## REGLA DE MOVIMIENTO (siempre, en cualquier estilo)
El video de Naty quedó "muy plano". Un video viral no pasa **más de ~8 s con la misma toma** sin que cambie algo: zoom, tamaño de la toma, plano, cámara, toma de apoyo, gráfico.

1. **Ritmo base:** cambio visual cada **4–7 s** (mediana ~6 s). Cuenta tiempo de la LÍNEA DE TIEMPO final, no del bruto. Nunca más de 8 s seguidos igual (inclúyelo en la verificación).
2. **Cómo se cambia con un solo clip hablado** (lo habitual):
   - Parte el clip en las pausas o fin de frase más cercanos a los 4–7 s (`split {at}`; el corte respeta el padding de 30 ms porque cae en pausas, nunca a media palabra).
   - Alterna el encuadre de los trozos: **ancho** (zoom 1,0) → **cerrado** (`set_zoom punch` ~0,12–0,18) → **ancho** → **push lento** (`push` ~0,08–0,12) → … Un corte a un plano más cercano se consigue con un clip adyacente con zoom fijo; el movimiento progresivo con `push`/`pull`.
   - Nunca el mismo valor dos trozos seguidos. Ángulos diferentes (`set_clip_transform x,y`) para que el cambio se note y no parezca un tic.
3. **Énfasis:** en las zonas dramáticas (la afirmación fuerte, la cifra, el giro, el remate) usa un **acercamiento a la cara** (`push` 0,15–0,25 en ~2–3 s o `punch` justo en la palabra clave) y devuélvelo con un **alejamiento** (`pull`) al soltar la tensión. En lo calmado, cambios más suaves.
4. **Con cámaras adicionales** (cuando existan): el cambio de ángulo cuenta como cambio de toma.
5. **Tomas de apoyo, imágenes y animaciones** (las zonas aceptadas) también cuentan como cambio, pero no las pongas solo para cumplir la regla.
6. **Transiciones:** suaves (ver reglas de `docs/guia/07-plantillas-de-graficos-explicativos-esti.md`); no una en cada corte.
7. **Verificar:** al terminar, saca la lista de clips con `editor.describe()` y comprueba que ningún tramo supera ~8 s sin cambio de zoom/transform/toma; corrige y revisa con capturas del editor (no exportando).

## Añadir un estilo nuevo
1. Sube la referencia: la app deja una hoja de contacto por escenas en `biblioteca/referencias/<id>.analisis/` (`hoja.jpg` + `escenas.json`). Mira esa imagen, no fotogramas sueltos. Si ya existe `<nombre>.estilo.json` o un `.md` de estilo, **lee solo eso**.
2. Para el audio usa transcripción/`scripts/medir-audio.py` y escucha lo justo (música, efectos).
3. Crea `<nombre>.md` aquí con la misma estructura que `adrian-saenz-explicativo.md` (formato, ritmo, estructura de ejemplo, elementos y cómo recrearlos, color, audio, reglas). Añádelo a la lista de arriba.
