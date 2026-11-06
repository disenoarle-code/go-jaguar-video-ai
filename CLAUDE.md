# Go Jaguar Video AI — instrucciones para Claude

Editor de video local que tú (Claude) controlas con comandos. El usuario ve los cambios en vivo en el panel del navegador y puede corregirlos a mano.

**Estilo de respuesta:** corto y directo, en español. Sin explicaciones largas. Una cosa a la vez.

## Primer uso: "instala y abre el editor"

1. Comprueba herramientas: `node -v` (22+), `ffmpeg -version`, `ffprobe -version`. Para texto: `whisper-cli` y el modelo `~/.whisper-models/ggml-medium.bin`.
   - Falta algo → instálalo (Mac: `brew install node ffmpeg whisper-cpp`; Windows: `winget install OpenJS.NodeJS.LTS Gyan.FFmpeg`). Pide permiso antes de instalar.
2. `npm install` en la carpeta del proyecto.
3. Inicia **en segundo plano**: `npm run dev` → http://127.0.0.1:5273
4. Ábrelo en el panel del navegador. Verás el **Home** (lista de proyectos).

## Cómo se usa (lo hace el usuario en la interfaz)

1. **Home** → *Nuevo proyecto* (nombre + idioma).
2. **Material**: acepta **videos, música (mp3, wav, m4a…) e imágenes**. Botón *Elegir archivos* (diálogo del sistema) o arrastrar: los archivos se **enlazan donde ya están, no se copian** (cada tarjeta dice 🔗 enlazado o 📁 copia). Si el original se mueve o se borra, la tarjeta avisa y se puede *Ubicar* de nuevo; mientras tanto se puede seguir editando con la copia liviana (proxy). Botón **"Recorta silencios y errores"**: la app crea proxies, convierte el audio en texto, quita silencios, arma la edición base y **le pide a Claude** quitar lo repetido y ordenar el guion.
3. **Referencias**: elige las ya guardadas (casilla) o sube nuevas (compartidas por todos los proyectos). Antes del botón hay un cuadro opcional *"¿Alguna recomendación para el video?"*. Botón **"Edición completa basada en referencias"**: le pide a Claude convertir el video según las referencias marcadas y la recomendación.
4. **Abrir editor**: timeline para corregir a mano. Se guarda solo.

**El usuario también puede pedirte cosas directamente en el chat.** Los botones de la app que necesitan criterio dejan un *pedido* que tú recibes (ver abajo); la app muestra su estado ("esperando a Claude…", "Claude está editando…", "✓ Listo").

## Al empezar: vigila los pedidos de la app

Al abrir esta carpeta, **arranca en segundo plano**: `npm run vigilar`. Termina (y te avisa) cuando un botón de la app deja un pedido `pendiente`, imprimiendo `PEDIDO {json}` (`id`, `slug`, `tipo`: `errores`|`completa`, `referencias`, `recomendacion`: texto opcional del usuario, **tenla muy en cuenta**). Cuando te avise:
1. `npm run solicitud -- <id> en_curso` (la app muestra "Claude está editando…").
2. Ejecuta el pedido (abajo).
3. `npm run solicitud -- <id> hecho` (o `error "motivo"`). La app muestra "✓ Listo".
4. **Vuelve a arrancar `npm run vigilar`** para el siguiente pedido.

Los pedidos viven en `biblioteca/solicitudes/*.json`.

## La biblioteca (media lake)

Carpeta `biblioteca/` (configurable con `GOJAGUAR_BIBLIOTECA`; no va a git):

```
biblioteca/
  proyectos/<slug>/
    proyecto.json          nombre, idioma, referencias elegidas, assets
    proyecto.gojaguar      la edición (formato del core)
    analisis/              silencios (<video>.silencios.json) y ritmo de la música (<pista>.ritmo.json)
    material/              solo COPIAS (si no se pudo enlazar). Los videos normales se ENLAZAN: su ruta está en proyecto.json → material[].ruta
    proxies/               copias livianas para editar
    transcripciones/       <video>.lineas.txt y .words.json
    analisis/              silencios
    salidas/               renders finales (futuro)
  referencias/             <id>.ref.json (enlaces) o copias, y <nombre>.estilo.json (compartidas por todos los proyectos)
```

## Ejecutar un pedido (o una orden del chat)

1. **Proyecto:** `slug` del pedido (o el que esté abierto en el panel). Referencias: `proyecto.json` → `referencias`. Texto: `biblioteca/proyectos/<slug>/transcripciones/`.
2. **`errores` (guion)** → sigue `.claude/skills/guion-viral/SKILL.md` (claridad para alguien que hace scroll sin contexto; duración NO es objetivo; 2 pasadas de revisión del guion final).
3. **`completa`** → por cada referencia sin perfil: analízala (cortes por escena con ffmpeg, fotogramas, subtítulos, paleta, zooms), guarda `biblioteca/referencias/<nombre>.estilo.json` y aplica ese estilo, además del guion (skill).
4. Abre `http://127.0.0.1:5273/#/editor/<slug>` y aplica con `editor.batch([...])`. Se guarda solo en `proyecto.gojaguar`.
5. Muestra al usuario el **guion final** (texto), el resultado de las pasadas y qué quedó pendiente.

## Controlar el editor (desde el panel)

`window.editor` existe en la página del editor. Úsalo con la herramienta de JavaScript del navegador:

```js
editor.describe()                      // resumen compacto (léelo ANTES de editar)
editor.batch([ {op:'delete_clip', id:'c1'}, {op:'add_clip', asset:'a1', src_in:4.2, src_out:17.6}, {op:'speed_all', value:1.1} ])
editor.exec({ op: 'delete_ranges', ranges: [[10,12],[30,31]] })
await editor.bench()                   // mide scrub y reproducción (pestaña visible)
```

Comandos (`op`): `import_asset`, `add_clip {asset,src_in,src_out,effect?,dir?}`, `set_effect {clip,effect|null,dir?}` (efectos: `push` zoom lento, `punch` golpe de zoom, `slide` deslizamiento, `punchflash`/`dropflash` zoom con destello), `set_music {asset,src_in,volume,fade_out}` (pista de música desde el inicio; el asset es `kind:'audio'` con `proxy` = la vista previa `.previews/<id>.m4a`), `clear_music`, `set_format {width,height}` (vertical: 1080×1920), `split {at}`, `delete_range {from,to}`, `delete_ranges {ranges}`, `delete_clip {id}`, `speed {clip,value}`, `speed_all {value}`, `volume {clip,value}`, `move_clip {id,to_index}`, `trim {id,edge,src_time}`, `add_text {type:'subtitle'|'graphic',start,end,text,…}`, `add_layer`, `update_layer`, `delete_layer`. Definición: `packages/core/src/commands.ts`.

En el editor (línea de tiempo estilo CapCut) el usuario ve los **zooms** como una etiqueta dentro del clip y las **transiciones** (`slide`, `punchflash`, `dropflash`) como una pastilla blanca en el corte donde entra ese clip. Cambia el zoom/transición del clip seleccionado en el panel derecho (selector + dirección + "Ver este clip") y ajusta la música (volumen, dónde empieza, fundido) con nada seleccionado. Si el usuario cambia algo a mano, el MP4 de `salidas/` queda desactualizado: hay que re-renderizar.

Reglas:
- **Nunca borres, muevas ni renombres los videos originales del usuario** (están enlazados, no copiados). Quitar algo de la app solo quita el enlace.
- **Usa lotes** (`editor.batch`, `delete_ranges`, `speed_all`), no cientos de llamadas.
- `add_clip` en el orden final permite **reordenar** (gancho primero).
- Los tiempos de `delete_ranges` son de la línea de tiempo **actual**.
- Cada `exec`/`batch` es **una** entrada de deshacer.
- No renderices para ver un cambio: la vista previa es en vivo.
- Ediciones no destructivas (nunca tocan los originales).

## Música e imágenes del Material

Cada pista de audio se analiza sola al agregarla → `analisis/<pista>.ritmo.json`: `bpm`, `bpmAlt` (doble/mitad), `confianza`, `beats` (pulsos, s), `golpes` (kicks/impactos fuertes, s), `energia` (cada 0,5 s). Úsalo para **cortar sobre el beat** (cada 2, 4 u 8 pulsos), poner zooms y transiciones en los `golpes`, y dejar los momentos de más energía para lo mejor del producto. El tempo es fiable en música con pulso marcado (trap, hip hop, electrónica); si `confianza` < 0,3 revísalo a oído. Los tiempos de `beats` pueden tener ~±0,03 s de desfase. La música y las imágenes **no se procesan** con el botón "Recorta silencios" (solo los videos); las usas tú al armar la edición. Las pistas de Pixabay u otras las descarga el usuario a mano (sus términos prohíben bots) y las agrega aquí.

## Recetas

- **Silencios:** ya los quita el botón. A mano: `ffmpeg -i proxy -vn -af silencedetect=noise=-32dB:d=0.45 -f null -`.
- **Velocidad sin cambiar el tono:** `speed_all` (1,1 suena natural).
- **Verificar un corte:** arma el audio final con ffmpeg (`atrim` + `concat`), transcríbelo con `whisper-cli` y léelo. Ojo: los tiempos por palabra de Whisper salen **desfasados hasta ~1 s**; para ubicar un corte transcribe un tramo corto y mira la **energía** del audio.
- **Estilo 3D / zooms / subtítulos animados:** `experiments/estilo-3d` (Remotion + three.js): `cd experiments/estilo-3d && npm install && npm run studio`. Licencia de Remotion: revisarla antes de uso comercial.

## Estructura del código

- `packages/core` — modelo, comandos, historial, guardar/abrir. Sin navegador. Con pruebas (`npm test`).
- `packages/app` — interfaz (`src/`), motor de vista previa y **API local** (`server/api.ts`: biblioteca, subidas, procesamiento, tareas).
- `docs/` — `PLAN.md`, `PRODUCTO.md`, `BENCHMARKS.md`.

Antes de cambiar código: `npm test` y `npm run check` deben pasar.

## Límites actuales (no prometas lo que no existe)

- No hay exportación a MP4 desde el editor todavía (E3): el MP4 final se renderiza con ffmpeg a partir de la misma edición (cortes + `fx` + música). El editor muestra y reproduce música y efectos en vivo; aún no tiene capa de imágenes. Falta que la vista previa de "Proyectos" use música y efectos.
- 3D, zoom y subtítulos animados viven solo en `experiments/estilo-3d`; no son capas del editor.
- El análisis de referencias lo haces tú (Claude) cuando el usuario pide la edición completa; la app no lo hace sola.
- Recorte de fondo (Apple Vision) solo en Mac: `experiments/estilo-3d/scripts/matte.swift`.
- Probado solo en Mac. Windows sin verificar. Arrastrar y soltar archivos en la interfaz no está probado por mí (sí la subida por API y el procesamiento).
