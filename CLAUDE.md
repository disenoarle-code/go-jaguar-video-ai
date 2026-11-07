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

Comandos (`op`): `import_asset`, `add_clip {asset,src_in,src_out}`, `set_zoom {clip,zoom:{kind:'push'|'pull'|'punch',amount,duration?}|null}` (el ZOOM es un efecto del clip: intensidad en 0,02–0,8; `duration` solo en `punch`), `set_transition {clip,transition:{kind:'slide'|'flash'|'dip',duration,intensity,dir?}|null}` (la TRANSICIÓN vive en el corte: `clip` es el clip que ENTRA; es una sola y su mitad cae al final del clip anterior (salida) y la otra mitad al inicio de este (entrada); el primer clip no tiene), `set_music {asset,src_in,volume,fade_out}` (pista de música desde el inicio; el asset es `kind:'audio'` con `proxy` = la vista previa `.previews/<id>.m4a`), `clear_music`, `set_format {width,height}` (vertical: 1080×1920), `add_overlay {asset,start,track?,src_in?,src_out?,x?,y?,scale?,volume?}` (clip de video o audio superpuesto, libre en el tiempo; `track` 1,2,3… por tipo; si se solapa con otro se abre otra pista sola), `clip_to_overlay {clip,start,track?}` (lo que hace arrastrar un clip de la pista principal hacia arriba: sale de la principal, que se cierra, y pasa a una pista de video superpuesta a tamaño completo), `update_overlay {id,patch:{start,track,srcIn,srcOut,speed,volume,transform}}`, `delete_overlay {id}`, `set_track {track,locked?,hidden?,muted?}` (claves: `main`, `music`, `subtitle`, `graphic`, `v1`,`v2`… video superpuesto, `a1`,`a2`… audio extra; bloquear no deja editar la pista, ocultar la quita de la vista previa y del MP4, silenciar quita su audio), `split {at}`, `delete_range {from,to}`, `delete_ranges {ranges}`, `delete_clip {id}`, `speed {clip,value}`, `speed_all {value}`, `volume {clip,value}`, `move_clip {id,to_index}`, `trim {id,edge,src_time}`, `add_text {type:'subtitle'|'graphic',start,end,text,…}`, `add_layer`, `update_layer`, `delete_layer`. Definición: `packages/core/src/commands.ts`.

El editor es responsive: la cabecera se compacta por pasos solo cuando NO cabe (≤780 px "Proyectos" queda solo con la flecha; ≤720 px "Guardado" pasa a ✓; ≤640 px se oculta "VIDEO AI"; ≤520 px Exportar queda solo con su icono); no ocultes el texto "VIDEO AI" a anchos normales (el panel del usuario mide ~909 px). Bajo 860 px el panel derecho (medios y propiedades) pasa a ser un menú que entra desde la derecha con el botón del panel de la cabecera (se cierra tocando fuera o con Esc). Al probar anchos con `resize_window`, volver a `preset desktop`. El panel derecho del editor, sin nada seleccionado, es la **biblioteca de medios** (como CapCut): botón Importar (diálogo del sistema; los archivos se enlazan y `POST /api/proyectos/:slug/preparar` crea el proxy/audio para el editor), búsqueda, tarjetas con fotogramas u onda, insignia "Agregado", y se arrastran a una pista (o botón "+" en el cabezal). Arriba lleva el título **Medios** y filtros Todo/Videos/Audio. Las imágenes todavía no se pueden poner en la línea de tiempo. Los controles de la música aparecen al tocar su pista.

En el editor (línea de tiempo estilo CapCut) el usuario ve los **zooms** como una etiqueta dentro del clip y las **transiciones** como una pastilla blanca en el corte (su ancho es la duración). Al seleccionar un clip, el panel derecho tiene tres secciones separadas: **Efecto** (hoy el único efecto es Zoom: tipo acercar/alejar/golpe, intensidad, duración del golpe), **Transición de entrada** y **Transición de salida** (tipo, duración total, intensidad, dirección; la de salida de un clip es la de entrada del siguiente). Con nada seleccionado se ve la biblioteca de medios. Al pasar el mouse por la línea de tiempo (o arrastrar el cabezal) este se **pega como imán a los cortes**; al tocar el corte entre dos clips (pastilla "+") se abre un menú para poner o quitar la transición. No se ofrece en los cortes de un clip seleccionado (el usuario selecciona clips para ajustar tiempos); en el resto sí. Si el usuario cambia algo a mano, el MP4 de `salidas/` queda desactualizado: hay que re-renderizar.

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

## Efectos de sonido y luces (propios, sin descargar nada)

`scripts/efectos/sonidos.py <carpeta>` sintetiza swooshes de AIRE libres de derechos (ruido rosa suave que pasa por un filtro que se abre y se cierra, con modulación irregular, cola de reverberación y estéreo): `SFX-swoosh-izq-der/der-izq` (0,55 s, graves y suaves), `SFX-swoosh-grande` (1,1 s, para la entrada de la música) y `SFX-subida-aire-3.4s`. `scripts/efectos/luces.py <carpeta>` genera luces de lente (cálida, fría, dorada). Se dejan en `material/` del proyecto, el botón Importar (o `POST /preparar`) los trae al editor y se colocan con `add_overlay`. **Reglas del usuario:** pocos; **nunca tambores, golpes, impactos ni "dings"/campanas**: solo swooshes de aire, graves, de duración media (ni muy cortos ni muy largos), suaves de volumen (0,5–0,7) y nada robóticos (sin tonos sinusoidales). Colocación: subida que termina en la entrada de la música + swoosh grande en ella, y swoosh centrado (pico ~0,27 s después de su inicio) en 2 deslizamientos. Luces (video con `blend:'screen'`, `scale:1`, centradas en el corte, empiezan ~45 % de su duración antes) solo en 2 cortes fuertes. Para mezclar con `blend` en ffmpeg ambas entradas deben tener el mismo formato (`gbrp`) o el color sale magenta.

## Atajos de la línea de tiempo (como CapCut)

⌘B (o S) corta el clip en el cabezal; **Q** borra lo anterior del clip bajo el cabezal; **W** borra lo posterior; los botones `][` de la barra hacen lo mismo y muestran la tecla al pasar el mouse. Borrar y recortar bordes (`delete_range`, `trim`) **corren juntos** las capas, los tiempos de las palabras del karaoke (`props.palabras`) y los superpuestos/sonidos que vienen después (`rippleTodo` en `commands.ts`): no hace falta moverlos a mano.

## Editar subtítulos en el editor

Con un subtítulo seleccionado, el panel derecho tiene dos pestañas: **Ajustes** y **Subtítulos** (lista con una fila por subtítulo: tiempo + texto editable; Enter/↑/↓ pasan de fila; ✕ borra; clic en el tiempo va a ese punto). Cambiar `text` de un karaoke rehace sus `props.palabras` con `sincronizarPalabras` (core): las palabras que no cambian conservan su tiempo. Por eso `update_layer {patch:{text}}` también funciona por comando.

## Escenas animadas (sin texto), glitch y temblor

- **Escenas** (`packages/app/src/escenas.ts`, capa gráfica `template:'escena'`): `props.tipo:'claude'` = el **muñeco de Claude** (naranja, seudo-3D con volumen, brillo y squash & stretch). `anim`: `golpe` (vuela desde un lado, **te pega en la cabeza** en el centro de su caja, ráfaga de cómic, rebota mareado y según `humor` se queda `triste` | `feliz` | `asustado` | `loco`; al final se cae), `baile` (entra de abajo y salta) o `quieto`; `lado` desde donde entra; `tam`; `y` = altura del golpe (0,2 = cabeza). El impacto cae a `0,7 s` del inicio de la capa: alinéalo con un corte con flash/glitch y con `SFX-golpe-aire`. `props.tipo:'pantalla'` = pantalla a cuadro completo con un editor de video (`pantalla:'editor'`) o código (`pantalla:'codigo'`) en tiempo real, cámara que se mueve, golpes de zoom y glitch al entrar/salir. Solo dependen del tiempo (la exportación coincide con el editor). Se mueven, escalan, giran y borran como cualquier gráfico. **Lecciones del usuario:** nada de textos 3D; los SOLES/chispas no le gustaron ("¿qué putas?"); le gustó el muñequito 3D pero más dinámico (que le pegue en la cabeza), y las pantallas de computador; las animaciones tranquilas no le sirven: quiere ritmo, glitch, flashes, zooms.
- **Efectos de clip** (`set_zoom {clip, zoom:{kind,amount,duration?}}`): `temblor` (cámara tiembla; amount 0,12–0,3), `glitch` (separación de color RGB + sacudida durante `duration` s al empezar el clip; amount = intensidad) además de `push`/`pull`/`punch`. Parte el clip (`split`) para que dure solo un momento. Fórmulas en `fx.ts` (vista previa) y `exportar.ts` (`zoompan` + `rgbashift`).
- **Sonidos** propios: `scripts/efectos/sonidos-escenas.py <carpeta>` → `SFX-tecleo.wav`, `SFX-temblor.wav`, `SFX-suspiro.wav`; `sonidos.py` → swooshes y `SFX-subida-aire-3.4s.wav` (subida de aire antes de un clímax). Se dejan en `material/`, `POST /preparar` los trae y `import_asset` + `add_overlay` los coloca. Sin tambores; el único golpe permitido es `SFX-golpe-aire.wav` (soplido sordo, solo cuando el muñeco pega). Bájalos si tapan la voz (0,4).

## Color de marca

La palabra resaltada del karaoke y el acento por defecto de las plantillas usan el naranja de Go Jaguar: `NARANJA` (hoy `#ff7a00`, valor provisional: el repo no tiene el hex oficial) en `packages/app/src/overlays.ts`. Cámbialo solo ahí. Las tarjetas de cristal y píldoras 3D siguen disponibles como plantillas, pero el usuario no las quiere por defecto en los videos.

## Subtítulos y gráficos: mover, escalar, estirar, girar (en la vista previa)

Al seleccionar un subtítulo o gráfico en el video aparece una caja con asas: arrastrar dentro = mover; esquinas = agrandar/achicar; barritas de los lados = estirar (`transform.sx`/`sy`); asa de abajo = girar (se pega a 0°/45°/90°…); × = borrar. En subtítulos hay una casilla **"Aplicar a todos los subtítulos"** (activada por defecto, `localStorage gj.aplicarTodos`): mover/escalar/girar uno lo hace en todos; desmarcada, solo el seleccionado. Las plantillas (`karaoke`, `glass`, `pildora`, `lanzamiento`) se dibujan en su lugar por defecto y `transform.x/y = 0,5` significa "ahí" (mover suma un desplazamiento); la posición INICIAL respeta un margen invisible del 5 % a los lados y 3 % arriba/abajo (`MARGEN_X`/`MARGEN_Y` en `overlays.ts`) y, si no cabe, se achica; al moverlo a mano puede salirse. Al mover hay un **imán al centro**: cuando el centro del elemento queda a ≤ 8 px (de pantalla) de la mitad, se pega y aparece una línea fina celeste que cruza el video (vertical = centrado horizontal, horizontal = centrado vertical); Alt desactiva el imán (`guias` en `overlays.ts`). La exportación aplica el mismo transform (mismo código `overlays.ts`).

## Subtítulos karaoke: sincronía con la voz (OBLIGATORIO revisarla)

Los tiempos por palabra de Whisper se desfasan (hasta ~1 s), así que **no se usan** para karaoke. Pasos, siempre:
1. Audio de origen: `ffmpeg -i <proxy o video> -vn -ac 1 -ar 16000 audio.wav`.
2. Alinear: `~/.gojaguar-alinear/bin/python scripts/alinear-palabras.py audio.wav transcripciones/<video>.words.json analisis/<video>.palabras.json` (alineación forzada CTC con wav2vec2 en español, Apache 2.0). Instalación única y gratuita (~1,5 GB, pedir permiso antes): `python3 -m venv ~/.gojaguar-alinear && ~/.gojaguar-alinear/bin/pip install torch torchaudio transformers soundfile numpy`.
3. Revisar: `python3 scripts/verificar-sincronia.py audio.wav analisis/<video>.palabras.json` (voz sobre silencio, pausas dentro de palabras, ventanas re-transcritas). Si dice `SINCRONÍA MALA`, no seguir.
4. Armar las capas karaoke con los tiempos pasados a la línea de tiempo (en los cortes, restar lo eliminado), exportar desde la app a una carpeta temporal y revisar de punta a punta: `ffmpeg -i export.mp4 -vn -ac 1 -ar 16000 exp.wav` y `python3 scripts/verificar-sincronia.py exp.wav proyecto.gojaguar`. Restaurar la carpeta de exportación del usuario.
5. **Sin comillas** (`"` `“` `”` `«` `»`) en el texto de los subtítulos ni en sus palabras: el usuario las quita siempre.
6. Si escribiste `proyecto.gojaguar` en disco con el editor abierto, **recarga la página del editor** (`location.reload()`): no detecta cambios externos, sigue mostrando (y guardando) la versión vieja. Comprueba con `JSON.parse(editor.serialize())`.
7. Mirar a ojo 2-3 zonas (energía vs palabras) antes de decir "listo".

## Momentos sin voz que hay que reconocer y cortar

No basta con quitar silencios: el usuario también quiere cortar tramos en que **no habla** aunque haya ruido (toca el celular, mira a otro lado, ruido de caja o de micrófono). Al preparar una edición, lista los huecos sin voz ≥ 0,5 s (energía baja entre palabras alineadas, también al inicio y al final del video), mira fotogramas de cada uno (`ffmpeg … fps=5 … tile`) y corta los que no son habla; deja ~0,1 s antes de la siguiente palabra. Tras cortar vuelve a pasar la revisión de sincronía. Ojo: `silencedetect`/energía baja NO es lo mismo que voz: golpes del celular y ruidos de boca parecen "voz" con un umbral flojo; el fin real de la última palabra es el del alineador, no el de la cola de ruido.

## Sincronía audio/video de la vista previa (proxies)

La vista previa busca el fotograma por su **PTS real** (`FrameSource.idxAt` en `media.ts`), no por índice÷fps. Motivo (2026-11-07): el decodificador por hardware (VideoToolbox) fallaba en los primeros cuadros de los videos Sony sin dar error y el proxy salía con **11 fotogramas de menos** (hueco de 0,4 s en t=0,1); con índice÷fps el video iba hasta 0,37 s adelantado al audio. `makeProxy` ahora repite por software si ffmpeg dice "failed to decode" y fuerza fps constante. Tras crear un proxy comprueba que no tenga huecos: `ffprobe -select_streams v -show_entries frame=pts_time -of csv=p=0 proxy.mp4` (saltos > 0,06 s = mal) y que los frames igualen a los del original.

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

- Los textos (subtítulos y gráficos) salen en el MP4: la exportación los dibuja con un Chromium sin pantalla (`server/rotulos.ts` + página `src/render.ts`, el MISMO código de `overlays.ts` que usa el editor) como PNG con transparencia y ffmpeg los superpone. Si un rótulo se ve distinto en el MP4, el cambio va en `overlays.ts`. Rótulo animado: capa `graphic` con `template:'lanzamiento'` y `props:{linea1,linea2,modelo,marca (ruta api/files/… del logo blanco con transparencia),acento}`.
- **La exportación pregunta la carpeta** (campo "Guardar en" con botón Cambiar…, diálogo nativo del sistema vía `POST /api/carpeta`), recuerda la última en `biblioteca/configuracion.json` (por defecto `~/Movies`) y deja el MP4 final en esa carpeta, no en la biblioteca; lo exportado se registra en `biblioteca/exportaciones.json` (solo esas rutas se sirven o se muestran en el Finder).
- **El video se exporta desde la app** (botón **Exportar** del editor: resolución, calidad, progreso, descargar). El servidor renderiza la edición actual con ffmpeg (`server/exportar.ts`: cortes, zoom/transiciones, superpuestos, audio de clips, música). **Nunca le envíes el video al usuario por el chat ni lo renderices tú a mano**; si algo falta en la exportación, se arregla en `exportar.ts`.
- 3D, zoom y subtítulos animados viven solo en `experiments/estilo-3d`; no son capas del editor.
- El análisis de referencias lo haces tú (Claude) cuando el usuario pide la edición completa; la app no lo hace sola.
- Recorte de fondo (Apple Vision) solo en Mac: `experiments/estilo-3d/scripts/matte.swift`.
- Probado solo en Mac. Windows sin verificar. Arrastrar y soltar archivos en la interfaz no está probado por mí (sí la subida por API y el procesamiento).
