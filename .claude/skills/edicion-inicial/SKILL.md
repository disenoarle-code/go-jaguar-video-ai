---
name: edicion-inicial
description: Pedido `edicion` (botón "Editar" de la app): la PRIMERA y única edición automática de un video. Aplica propuesta aceptada, movimiento, voz, color y textos, mostrando el progreso al usuario, y entrega el video en el editor. Úsala cuando llegue un pedido de tipo edicion.
---

# Edición inicial (pedido `edicion`)

Llega por `npm run vigilar` como `PEDIDO {"tipo":"edicion","slug":…}`. Al pulsar **Editar**, la app YA armó la pista principal con el guion revisado (cortes con colchón de 30 ms, paso `guion` hecho) y muestra al usuario la pantalla "Editando tu video" con 7 pasos. Tú los vas marcando; el usuario los lee.

## Protocolo (siempre)
1. `npm run solicitud -- <id> en_curso`.
2. Antes de cada paso: `npm run progreso -- <slug> <paso> en_curso "frase corta de lo que haces, para el usuario"`; al acabar: `npm run progreso -- <slug> <paso> hecho "resultado en una frase"` (u `omitido` si no aplica, con el motivo).
   Pasos, en este orden: `voz` → `zonas` → `movimiento` → `color` → `textos` → `revision` (`guion` ya está hecho).
3. Al terminar: `npm run solicitud -- <id> hecho`. La app abre el editor y **desde ese momento el proyecto ya no vuelve a las pantallas de creación** (los cambios grandes son por el chat o a mano).
4. Si algo falla: `npm run solicitud -- <id> error "motivo"` (la app ofrece reintentar o volver a la propuesta).
5. Vuelve a arrancar `npm run vigilar`.

## Qué hacer en cada paso
Abre `http://127.0.0.1:5273/#/editor/<slug>` (`editor.describe()` antes de editar; lotes con `editor.batch`; nada de exportar pruebas).
- **voz**: `set_audio_fx {on:true}` y comprueba con `python3 scripts/medir-audio.py <archivo>`: sonoridad entre -19 y -14 LUFS, pico ≤ -2 dBFS, el inicio no más bajo que el resto (<1 dB) y nunca saturar (si suena duro, baja el volumen antes que comprimir más).
- **zonas**: `analisis/propuesta.json`: por cada zona con `decision:'aceptada'` (o `pendiente` si el usuario no decidió y la sugerencia es clara) pon la toma de apoyo/imagen (`add_overlay`, sin audio: `volume 0`) o crea la animación 2D/3D; usa las tomas que el usuario subió en `aportes` y respeta su `prompt` por zona. Las `descartada` NO se hacen. Reglas: fondo plano debajo de las cards (guía regla 6), cards 4:5 con 3D en vertical, tomas sin texto. Lee **siempre** `analisis/notas-edicion.json` (recomendaciones generales).
  Para animaciones/iconos/3D usa `.claude/skills/ilustraciones/SKILL.md` (comandos de una llamada, caché, 2D primero).
- **movimiento**: aplica la REGLA DE MOVIMIENTO de `.claude/skills/estilos/SKILL.md` (cambio cada 4–7 s, nunca >8 s igual, énfasis en lo dramático) con el estilo elegido.
- **color**: `scripts/analizar-color.py` por clip → `set_clip_color`, y revisa cuadros antes/después.
- **textos**: subtítulos y rótulos a tu criterio según el estilo gráfico/referencias (los subtítulos virales tendrán sección propia luego); karaoke sincronizado (guía).
- **revision**: capturas del editor en los momentos clave (no exportar); legibilidad, texto cortado, tomas con letras, ningún tramo >8 s igual; corrige. Resume al usuario en el chat qué quedó y qué falta.
