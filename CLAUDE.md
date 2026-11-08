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
3. **Referencias**: elige las ya guardadas (casilla) o sube nuevas (compartidas por todos los proyectos). Antes del botón hay un cuadro opcional *"¿Alguna recomendación para el video?"*. Botón **"Edición completa basada en referencias"**: le pide a Claude convertir el video según las referencias marcadas y la recomendación. **Es una opción independiente, no el paso 2 del recorte:** si el material aún no está preparado, la app lo prepara en el mismo paso (proxies, texto, silencios y edición base) y solo entonces te llega el pedido `completa`; si ya estaba preparado, el pedido llega directo. Por eso un pedido `completa` puede llegar con un proyecto que el usuario nunca recortó (la edición base ya está hecha por la app: sobre ella aplicas el guion y el estilo). Opción 1 ("Recorta silencios y errores") = solo limpiar; opción 2 = todo.
4. **Abrir editor**: timeline para corregir a mano. Se guarda solo.

**El usuario también puede pedirte cosas directamente en el chat.** Los botones de la app que necesitan criterio dejan un *pedido* que tú recibes (ver abajo); la app muestra su estado ("esperando a Claude…", "Claude está editando…", "✓ Listo").

## Al empezar: vigila los pedidos de la app

Al abrir esta carpeta, **arranca en segundo plano**: `npm run vigilar`. Termina (y te avisa) cuando un botón de la app deja un pedido `pendiente`, imprimiendo `PEDIDO {json}` (`id`, `slug`, `tipo`: `errores`|`completa`, `referencias`, `recomendacion`: texto opcional del usuario, **tenla muy en cuenta**). Cuando te avise:
1. `npm run solicitud -- <id> en_curso` (la app muestra "Claude está editando…").
2. Ejecuta el pedido (abajo).
3. `npm run solicitud -- <id> hecho` (o `error "motivo"`). La app muestra "✓ Listo".
4. **Vuelve a arrancar `npm run vigilar`** para el siguiente pedido.

Los pedidos viven en `biblioteca/solicitudes/*.json`.

## Referencias en el editor (qué subió y qué seleccionó el usuario)

En el panel derecho del editor hay dos pestañas, **Medios** y **Referencias**. En Referencias el usuario importa videos (diálogo del sistema; se enlazan, no se copian), los **selecciona** tocándolos (✓ dorado) y se ordenan con un criterio MIXTO: lo nuevo y lo que más (y más recientemente) se usa va primero (`puntaje` = 45 % recencia de subida, decae en ~10 días + 55 % frecuencia de uso, decae en ~45 días; el uso cuenta proyectos distintos que la eligieron + pedidos a Claude que la incluyeron, y se guarda en `biblioteca/referencias/uso.json`).

**Cómo saber qué referencia se subió o seleccionó (léelo SIEMPRE antes de actuar cuando el usuario diga "la referencia", "la nueva referencia", "el video que acabo de subir", etc.):** `biblioteca/proyectos/<slug>/referencias-activas.json` (la app lo actualiza solo en cada cambio): `seleccionadas` (las que el usuario tiene marcadas ahora: nombre, ruta del video, si ya tienen `perfilDeEstilo`), `ultimaSubida` (la subida más reciente y si está seleccionada) y `eventos` (últimos 20: `subida` / `seleccionada` / `deseleccionada` con fecha). "La nueva referencia" = la `ultimaSubida` (o el evento `subida` más reciente). Analízala por su `ruta` (cortes por escena, fotogramas, subtítulos, paleta, zooms) y guarda su perfil en `biblioteca/referencias/<nombre>.estilo.json`; si ya hay perfil, reúsalo.

**Navegación:** en el editor ya no hay botón "Proyectos": el logo guarda y lleva a la página principal (todos los proyectos). Desde allí, un proyecto con edición abre DIRECTO el editor; la página de proyecto (material, prompt, referencias, botón "Recorta silencios") solo se ve para proyectos sin edición, o sea para la primera edición.

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

## Procedimientos estándar de TODA edición (botón 1 y botón 2, siempre)

Antes de cualquier otra cosa, en TODO video que entre a edición, ya sea el pedido `errores` (botón 1 "Recorta silencios y errores") o `completa` (botón 2 "Edición completa basada en referencias"):

1. **Guion al grano para quien lo ve en frío**: solo lo más interesante; lo repetitivo o irrelevante se elimina.
2. **Muletillas, tartamudeos y repetidas** fuera (`scripts/detectar-muletillas.py`).
3. **Cortes y orden** (silencios, tropiezos, tomas repetidas, gancho, clips organizados).
4. **Voz limpia y pareja**: `set_audio_fx {on:true}` (quita ruido y nivela para que la voz suene siempre igual de fuerte; la app ya lo hace al procesar el material).
5. **Luces y color**: `scripts/analizar-color.py` por clip → `set_clip_color`, y revisar cuadros antes/después.

Detalle y criterios en `.claude/skills/guion-viral/SKILL.md` (sección "PROCEDIMIENTOS ESTÁNDAR"). Estos pasos van primero; el estilo de las referencias (botón 2) se aplica encima de ellos.

## Ejecutar un pedido (o una orden del chat)

1. **Proyecto:** `slug` del pedido (o el que esté abierto en el panel). Referencias: `proyecto.json` → `referencias`. Texto: `biblioteca/proyectos/<slug>/transcripciones/`.
2. **`errores` (guion)** → primero los **procedimientos estándar** (arriba) y sigue `.claude/skills/guion-viral/SKILL.md` (claridad para alguien que hace scroll sin contexto; duración NO es objetivo; 2 pasadas de revisión del guion final).
3. **`completa`** → primero los **procedimientos estándar** (arriba); luego, por cada referencia sin perfil: analízala (cortes por escena con ffmpeg, fotogramas, subtítulos, paleta, zooms), guarda `biblioteca/referencias/<nombre>.estilo.json` y aplica ese estilo, además del guion (skill).
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

Comandos (`op`): `import_asset`, `add_clip {asset,src_in,src_out}`, `set_zoom {clip,zoom:{kind:'push'|'pull'|'punch',amount,duration?}|null}` (el ZOOM es un efecto del clip: intensidad en 0,02–0,8; `duration` solo en `punch`), `set_clip_color {clip,color:{brillo,contraste,saturacion}|null}` (luces y color del clip, 1 = sin cambio; brillo 0,5–1,8, contraste 0,6–1,6, saturación 0–2; la vista previa usa el filtro del lienzo y la exportación `lutrgb`+`colorchannelmixer`, misma fórmula), `set_audio_fx {on}` (voz limpia y pareja de todo el proyecto), `set_clip_transform {clip,transform:{x,y,scale,rotation}|null}` (mover/agrandar/girar el VIDEO de un clip sin deformarlo: x,y = centro 0..1, scale 1 = entero dentro del cuadro, rotation en grados; `null` lo deja ajustado y centrado), `set_transition {clip,transition:{kind:'slide'|'flash'|'dip',duration,intensity,dir?}|null}` (la TRANSICIÓN vive en el corte: `clip` es el clip que ENTRA; es una sola y su mitad cae al final del clip anterior (salida) y la otra mitad al inicio de este (entrada); el primer clip no tiene), `set_music {asset,src_in,volume,fade_out}` (pista de música desde el inicio; el asset es `kind:'audio'` con `proxy` = la vista previa `.previews/<id>.m4a`), `clear_music`, `set_format {width,height}` (vertical: 1080×1920), `add_overlay {asset,start,track?,src_in?,src_out?,x?,y?,scale?,volume?}` (clip de video o audio superpuesto, libre en el tiempo; `track` 1,2,3… por tipo; si se solapa con otro se abre otra pista sola), `clip_to_overlay {clip,start,track?}` (lo que hace arrastrar un clip de la pista principal hacia arriba: sale de la principal, que se cierra, y pasa a una pista de video superpuesta a tamaño completo), `update_overlay {id,patch:{start,track,srcIn,srcOut,speed,volume,transform,crop,mascara,transicion}}` (`mascara {x,y,w,aspect,r}` = ventana tipo card; `transicion` 'fundido'|'subir'|'3d'), `delete_overlay {id}`, `set_track {track,locked?,hidden?,muted?}` (claves: `main`, `music`, `subtitle`, `graphic`, `v1`,`v2`… video superpuesto, `a1`,`a2`… audio extra; bloquear no deja editar la pista, ocultar la quita de la vista previa y del MP4, silenciar quita su audio), `split {at}`, `delete_range {from,to}`, `delete_ranges {ranges}`, `delete_clip {id}`, `speed {clip,value}`, `speed_all {value}`, `volume {clip,value}`, `move_clip {id,to_index}`, `trim {id,edge,src_time}`, `add_text {type:'subtitle'|'graphic',start,end,text,…}`, `add_layer`, `update_layer`, `delete_layer`. Definición: `packages/core/src/commands.ts`.

El editor es responsive: la cabecera se compacta por pasos solo cuando NO cabe (≤780 px "Proyectos" queda solo con la flecha; ≤720 px "Guardado" pasa a ✓; ≤640 px se oculta "VIDEO AI"; ≤520 px Exportar queda solo con su icono); no ocultes el texto "VIDEO AI" a anchos normales (el panel del usuario mide ~909 px). Bajo 860 px el panel derecho (medios y propiedades) pasa a ser un menú que entra desde la derecha con el botón del panel de la cabecera (se cierra tocando fuera o con Esc). Al probar anchos con `resize_window`, volver a `preset desktop`. El panel derecho del editor, sin nada seleccionado, es la **biblioteca de medios** (como CapCut): botón Importar (diálogo del sistema; los archivos se enlazan y `POST /api/proyectos/:slug/preparar` crea el proxy/audio para el editor), búsqueda, tarjetas con fotogramas u onda, insignia "Agregado", y se arrastran a una pista (o botón "+" en el cabezal). Arriba lleva el título **Medios** y filtros Todo/Videos/Audio. Las **imágenes** (jpg, png, webp, avif, heic…) también se importan con el mismo botón (lo que no es compatible se AVISA en el panel, nunca se descarta en silencio; las fotos se ven en una cuadrícula de vistas cuadradas): quedan como copia liviana `proxies/<nombre>.img.jpg|png` (máx. 2160 px; la original no se toca), aparecen en la pestaña "Imágenes" de Medios con la etiqueta Foto y se arrastran a una pista de video superpuesto como un clip de 4 s (se estira con el borde, lleva posición, tamaño, giro y opacidad como cualquier superpuesto; un PNG con transparencia la conserva). Comando: `add_overlay {asset, start, src_out?}` con un asset de tipo `image`. Cualquier superpuesto (video o imagen) admite `crop {l,t,r,b}` (fracciones 0–0,45 de cada borde) con `update_overlay {id, patch:{crop}}`: quita barras negras o subtítulos quemados de una toma de apoyo sin deformarla (vista previa y exportación). Receta de B-roll en vertical: tomas 16:9 como CARD 4:5 con máscara y entrada/salida 3D (ver "Reglas de la edición con apoyo visual"); el audio de la toma de apoyo va en `volume 0`. Los controles de la música aparecen al tocar su pista.

En el editor (línea de tiempo estilo CapCut) el usuario ve los **zooms** como una etiqueta dentro del clip y las **transiciones** como una pastilla blanca en el corte (su ancho es la duración). Al seleccionar un clip, el panel derecho tiene tres secciones separadas: **Efecto** (hoy el único efecto es Zoom: tipo acercar/alejar/golpe, intensidad, duración del golpe), **Transición de entrada** y **Transición de salida** (tipo, duración total, intensidad, dirección; la de salida de un clip es la de entrada del siguiente). Con nada seleccionado se ve la biblioteca de medios. Al pasar el mouse por la línea de tiempo (o arrastrar el cabezal) este se **pega como imán a los cortes**; al tocar el corte entre dos clips (pastilla "+") se abre un menú para poner o quitar la transición. No se ofrece en los cortes de un clip seleccionado (el usuario selecciona clips para ajustar tiempos); en el resto sí. Si el usuario cambia algo a mano, el MP4 de `salidas/` queda desactualizado: hay que re-renderizar.

Reglas:
- **Nunca borres, muevas ni renombres los videos originales del usuario** (están enlazados, no copiados). Quitar algo de la app solo quita el enlace.
- **Usa lotes** (`editor.batch`, `delete_ranges`, `speed_all`), no cientos de llamadas.
- `add_clip` en el orden final permite **reordenar** (gancho primero).
- Los tiempos de `delete_ranges` son de la línea de tiempo **actual**.
- Cada `exec`/`batch` es **una** entrada de deshacer.
- No renderices para ver un cambio: la vista previa es en vivo.
- Ediciones no destructivas (nunca tocan los originales).

## Guía detallada (léela antes de una EDICIÓN COMPLETA o al tocar el área)

Todo lo aprendido vive en `docs/GUIA-DEL-EDITOR.md`: música e imágenes, efectos de sonido y luces, formato y video movible, controles del reproductor, voz limpia/luces/color/dB, selección múltiple, plantillas de gráficos explicativos, **reglas de la edición con apoyo visual (cards 4:5 con 3D, tomas sin texto, verificar con capturas del editor y no exportando)**, recorte de persona (texto detrás), atajos, subtítulos y karaoke (**sincronía obligatoria**), muletillas, momentos sin voz, sincronía de proxies, escenas animadas y color de marca.
Reglas de oro: nunca tocar los originales; lotes en vez de llamadas sueltas; no exportar pruebas; nada solo de Mac; SFX solo swooshes de aire suaves; sin comillas en subtítulos.

## Estructura del código

- `packages/core` — modelo, comandos, historial, guardar/abrir. Sin navegador. Con pruebas (`npm test`).
- `packages/app` — interfaz (`src/`), motor de vista previa y **API local** (`server/api.ts`: biblioteca, subidas, procesamiento, tareas).
- `docs/` — `PLAN.md`, `PRODUCTO.md`, `BENCHMARKS.md`.

Antes de cambiar código: `npm test` y `npm run check` deben pasar.

## Límites actuales (no prometas lo que no existe)

- Los textos (subtítulos y gráficos) salen en el MP4: la exportación los dibuja con un Chromium sin pantalla (`server/rotulos.ts` + página `src/render.ts`, el MISMO código de `overlays.ts` que usa el editor) como PNG con transparencia y ffmpeg los superpone. Si un rótulo se ve distinto en el MP4, el cambio va en `overlays.ts`. Rótulo animado: capa `graphic` con `template:'lanzamiento'` y `props:{linea1,linea2,modelo,marca (ruta api/files/… del logo blanco con transparencia),acento}`.
- **La exportación pregunta la carpeta** (campo "Guardar en" con botón Cambiar…, diálogo nativo del sistema vía `POST /api/carpeta`), recuerda la última en `biblioteca/configuracion.json` (por defecto `~/Movies`) y deja el MP4 final en esa carpeta, no en la biblioteca; lo exportado se registra en `biblioteca/exportaciones.json` (solo esas rutas se sirven o se muestran en el Finder).
- **El video se exporta desde la app** (botón **Exportar** del editor: resolución, calidad, progreso, descargar). El servidor renderiza la edición actual con ffmpeg (`server/exportar.ts`: cortes, zoom/transiciones, superpuestos, audio de clips, música). **Nunca le envíes el video al usuario por el chat ni lo renderices tú a mano**; si algo falta en la exportación, se arregla en `exportar.ts`.
- 3D, zoom y subtítulos animados viven solo en `experiments/estilo-3d`; no son capas del editor.
- El análisis de referencias lo haces tú (Claude) cuando el usuario pide la edición completa; la app no lo hace sola.
- Recorte de fondo (Apple Vision) solo en Mac: `experiments/estilo-3d/scripts/matte.swift`.
- Probado solo en Mac. Windows sin verificar. Arrastrar y soltar archivos en la interfaz no está probado por mí (sí la subida por API y el procesamiento).
