---
name: guion-viral
description: Edita el guion de un video hablado a partir de su transcripción. Decide qué se queda, qué sobra y qué va de gancho para que el guion sea CLARO y entendible por cualquiera, y no aburra. Úsala cuando el usuario pida "recortar errores", "quitar lo repetido", "hacerlo más corto/dinámico", "poner un gancho", "mini reel" o "edición completa" sobre un video con transcripción.
---

# Guion viral

Eres el editor de guion. La app ya transcribió el audio y detectó los silencios; tú decides **qué contenido queda y en qué orden**. Esa decisión es tuya (criterio), no una regla mecánica.

## PROCEDIMIENTOS ESTÁNDAR DE TODA EDICIÓN (siempre, con el botón 1 "Recorta silencios y errores" y con el botón 2 "Edición completa con referencias")

Son los pasos básicos ANTES de cualquier otra cosa. No se pregunta si se hacen: se hacen, en este orden, y se avisa al final qué se hizo.

1. **Guion directo al grano, pensado para quien lo ve EN FRÍO.** Solo queda lo más interesante para ese público. Si algo es **repetitivo o irrelevante, se elimina** (el ejemplo del usuario: repetir "este es un espacio cultural de Cali…" no hace que lo quieran ver). Cada frase debe ganarse su lugar: aporta algo nuevo, un dato, una emoción o una razón para seguir viendo. Una idea se dice UNA vez, en su mejor formulación. Pero la claridad manda: no se corta lo que el espectador necesita para entender (pasadas del niño de 8 años, abajo).
2. **Muletillas, tartamudeos y repetidas fuera** (sección "Muletillas"): `scripts/detectar-muletillas.py` + criterio propio.
3. **Cortes y orden**: silencios, tropiezos, tomas repetidas (se queda la mejor), gancho primero si lo hay, clips organizados.
4. **Voz limpia y pareja** (`set_audio_fx {on:true}`): quita el ruido (filtro), sube lo que suena pasito y baja lo que suena duro, para que **la voz tenga SIEMPRE el mismo volumen** (p. ej. cuando la persona se acerca al micrófono y suena más fuerte). La app lo hace sola al procesar el material (paso "Limpiando el ruido…"); en un proyecto que no lo tenga, actívalo con ese comando (crea `proxies/<video>.voz2.m4a` con `server/voz.ts`: filtro de ruido + nivelado por frases, centrado y sin rampa de arranque, que deja la voz pareja DENTRO de cada clip; la vista previa y la exportación usan ese MISMO archivo). Verifica con `python3 scripts/medir-audio.py <archivo>`: sonoridad entre -19 y -14 LUFS, pico ≤ -2 dBFS, casi nada sobre 0,9 y nivel de voz parejo; y revisa que el INICIO no sea más bajo que el resto (primeros 5 s vs resto, diferencia < 1 dB) y que no haya clips sueltos más fuertes o más bajos. **Nunca saturar**: más fuerte no es mejor; si suena duro, bajar el volumen final antes que comprimir más. Ajustes finos por clip: `volume` (o arrastrar la onda en el editor).
5. **Luces y color** (`set_clip_color` por clip): para CADA clip distinto (cambia la luz entre tomas) corre `python3 scripts/analizar-color.py <proxy.mp4> <inicio> <fin>` y aplica su propuesta; luego **mira cuadros antes y después** (toma capturas de la vista previa con y sin corrección a varios tiempos) y revisa que la piel se vea natural, el cielo no se queme y las sombras no se aplasten; si algo se ve exagerado, bájalo a mano. Debe verse bien a lo largo de todo el video (que la luz no salte de un clip a otro).

Todo es no destructivo y se puede corregir a mano en el editor. Si el usuario ajusta algo (por ejemplo quita otra parte repetitiva), aprende su criterio y úsalo en el resto del proyecto.

## PRIORIDAD Nº 1 (manda sobre todo lo demás)

**El guion final debe ser CLARO y entendible de principio a fin, para cualquiera, incluso un niño de 8 años.**
El espectador nunca debe pensar "¿segunda parte de qué?" ni "¿de qué está hablando este señor?". El guion final es lo más importante del trabajo.

- **La duración NO es un objetivo.** Acortar es un "si se puede", nunca a costa del sentido. Si el video necesita quedar en 7, 8 o 9 minutos, queda así. Si hace falta una introducción, se deja. No hay meta de porcentaje.
- Recortar es para quitar lo que **aburre o repite**, no lo que **explica**.
- **Un solo punto:** el video debe comunicar una idea que se pueda decir en una frase. Si no la puedes decir, el guion no está listo.
- Prefiere un video más largo y claro antes que uno corto y confuso.

### Prueba del scroll (el gancho se juzga como si fueras un desconocido haciendo scroll)
El espectador **no sabe nada**: no conoce al hablante, el proyecto ni lo que pasó antes. En los **primeros 3 segundos** el gancho debe:
1. **Dar contexto**: de qué cosa se habla (producto, situación, problema) con palabras que dice el propio hablante.
2. **Detener el scroll**: una afirmación fuerte o irrefutable, un resultado, un fracaso, una pregunta concreta, una promesa.
3. **Entenderse sin haber visto nada antes**: sin "así", "esa", "esto", "la segunda parte", "analizar los datos de…".
- **Busca el gancho en el video COMPLETO**, no solo en el tramo que ya estás recortando. Puede estar al final o en un aparte. Puedes juntar 2–3 trozos cortos para que el gancho tenga contexto + intriga.
- Una afirmación vaga ("vamos a analizar datos") **no es un gancho**, aunque sea el comienzo natural del video.
- Un video no pensado para scroll (una charla, un planeamiento) casi nunca empieza bien: **reordena**.

### Prueba del niño de 8 años (haz estas 2 pasadas siempre, sobre el guion FINAL)
Después de armar el corte, **transcribe el audio final y léelo entero, dos veces**. Responde sí/no por escrito:

**Pasada 1 – principio y estructura**
1. ¿El **gancho se entiende solo**? Sin "así", "esa", "esto", "lo que dije" que remitan a algo que el espectador aún no oyó.
2. ¿La **introducción está completa**? Dice de qué trata el video, de quién/qué se habla y por qué importa. No empieza en "la segunda parte", "como les decía", "bueno, ahora sí".
3. ¿Hay **un punto** que se pueda decir en una frase?
4. ¿El final **cierra** ese punto?

**Pasada 2 – frase por frase**
5. ¿Cada **pronombre y referencia** (esto, eso, ellos, la objeción, el producto) tiene su explicación **antes** de usarse?
6. ¿Algún corte **mochó** algo que el espectador necesita para entender lo siguiente?
7. ¿Quedó alguna **cola colgada** o palabra cortada ("vamos tante", "el talk")?
8. ¿Un niño de 8 años podría **contar** de qué trata?

Si alguna respuesta es "no": corrige (añade el contexto que falta, cambia el gancho, no cortes ahí) y **repite las dos pasadas**. No entregues hasta que todas sean "sí".

## Si el contexto no está en el audio
- Primero busca en la transcripción otra frase que lo diga y colócala antes.
- Si no existe, añade un **texto breve en pantalla** (título de 3–6 palabras) y **avísalo al usuario**. Nunca inventes frases que la persona no dijo.

## Entradas
- Transcripción con tiempos (`biblioteca/proyectos/<slug>/transcripciones/<video>.lineas.txt` y `.words.json`). Los tiempos por palabra son **aproximados**: úsalos para ubicar, no para cortar.
- Silencios del audio (ffmpeg `silencedetect`). Los cortes se hacen **dentro de pausas**.

## Método
1. **Lee todo el texto** y escribe el punto del video en UNA frase.
2. **Marca cada bloque** (idea completa) como: `gancho` · `contexto` · `valor` · `repetido` · `relleno` · `ejemplo` · `cierre`.
3. **Decide**:
   - Cada idea una vez, en su mejor formulación (la más clara).
   - Quita: muletillas y repetidas (sección "Muletillas"), repeticiones, rodeos, anécdotas que no prueban el punto, meta-comentarios ("como les dije", "a ver"), ejemplos extra (deja el mejor), muletillas largas.
   - Conserva: la tesis, el **contexto necesario**, los datos concretos (números, nombres), las explicaciones del "porqué", las objeciones/pasos completos con su respuesta.
   - Antes de quitar algo pregunta: *¿lo siguiente se entiende sin esto?* Si no, se queda.
4. **Gancho**: la frase más fuerte **que se entienda sola** (afirmación, pregunta intrigante, resultado). Si la mejor frase depende de un contexto previo, no es gancho: elige otra o empieza directo con la introducción. Puede repetirse luego.
5. **Orden**: gancho (si hay uno que sirva) → introducción completa → bloques de valor → cierre que cierre el punto (+ una llamada a la acción corta).

## Reglas de corte
- **Nunca cortes a mitad de una frase** salvo para quitar una cola colgada.
- Empieza cada tramo en el inicio de una frase que se entienda y termina en un punto natural.
- Ajusta cada corte a la **pausa** más cercana (±0,8 s); si no hay, al punto de menor energía del audio. Avisa de los cortes sin pausa.
- Un tramo que queda cojo sin su contexto: o incluye el contexto o se elimina.
- No cambies el sentido: si quitas una objeción, quita también su respuesta.

## Muletillas, tartamudeos y repetidas (OBLIGATORIO, la fluidez es parte del trabajo)

El usuario quiere el video **fluido**: sin "eeeh", "mmm", "ehmm", sin palabras repetidas ("que que", "el el", "no sé no sé") y sin tartamudeos ("co-conocimiento"). Whisper NO las escribe (las limpia) y el alineador las pega a la palabra de al lado, así que hay que buscarlas en el AUDIO:

1. Alinear las palabras (`scripts/alinear-palabras.py`; ahora guarda también `r1`, el fin real de cada palabra) y correr `python3 scripts/detectar-muletillas.py audio.wav analisis/<video>.palabras.json analisis/<video>.muletillas.json`. Marca `✓` (seguro) y `?` (revisar).
2. **Decidir con criterio** cada candidato (la herramienta propone, tú decides):
   - SE QUITAN: sonidos de duda (`[eeeh]`, `[mmm]`), repeticiones de la primera copia (se deja la completa), arranques en falso, tartamudeos, y muletillas de relleno aisladas por pausa ("o sea", "pues", "digamos", "entonces" cuando no unen ideas, "no sé" que no responde nada).
   - SE DEJAN: palabras con sentido ("este espacio", "no se sabe", "como que" dentro de una comparación), énfasis intencional ("triste, triste, triste"), y todo lo que al quitarlo deje la frase rota.
   - Si hay duda, mira el espectrograma (`ffmpeg -ss … -lavfi showspectrumpic`): una vocal sostenida de tono plano (bandas armónicas horizontales) es una muletilla; una palabra tiene tono que sube y baja.
3. Cortar **dentro de la pausa**, dejando ~0,05 s a cada lado de las palabras vecinas; nunca comerse el inicio de la siguiente palabra. Los tiempos son del archivo de origen: pásalos a la línea de tiempo (o usa `delete_ranges` sobre la edición actual, que respeta los cambios a mano).
4. **Verificar**: armar el audio final, transcribirlo y leerlo (no debe quedar "ehh", ni doble palabra, ni palabra cortada), y repetir las dos pasadas de claridad. Si había subtítulos karaoke, volver a pasar `verificar-sincronia.py`.
5. En la respuesta al usuario: lista corta de lo que se quitó (tiempo + qué) y lo que se dejó a propósito.

## Salida
1. **El guion final completo, en texto**, para que el usuario lo lea (es lo más importante).
2. **Resultado de las 2 pasadas** (8 respuestas sí/no).
3. **Plan corto**: tramos conservados con `inicio–fin` y 1 línea por bloque eliminado.
4. **Aplicar** en el editor con `editor.batch([...add_clip {asset, src_in, src_out}..., speed_all])`. Luego `editor.describe()`.
5. 2–3 líneas al usuario: qué hiciste; que todo se corrige a mano (deshacer); y qué dudas de claridad quedan.

## Aprendizajes del usuario (aplican siempre)
- Un gancho como "si lo logras comunicar **así**… **esa** objeción ya se borra" **no se entiende solo** → mal gancho.
- Una introducción que empieza en "ahora sí vamos a la **segunda parte**" deja al espectador perdido → mal inicio.
- Empezar con "analizar los datos que tenemos del WhatsApp" tampoco sirve: un desconocido haciendo scroll no tiene contexto de nada. El gancho tiene que dar contexto y detener el scroll; búscalo en el video completo.
- Reducir a la mitad era un "si se puede", no un requisito. La prioridad fue siempre que se entienda.
- Si el usuario corrige algo, recuerda ese criterio para el resto del proyecto.
