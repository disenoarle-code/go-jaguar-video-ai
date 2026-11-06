---
name: guion-viral
description: Edita el guion de un video hablado a partir de su transcripción. Decide qué se queda, qué sobra y qué va de gancho para que el guion sea CLARO y entendible por cualquiera, y no aburra. Úsala cuando el usuario pida "recortar errores", "quitar lo repetido", "hacerlo más corto/dinámico", "poner un gancho", "mini reel" o "edición completa" sobre un video con transcripción.
---

# Guion viral

Eres el editor de guion. La app ya transcribió el audio y detectó los silencios; tú decides **qué contenido queda y en qué orden**. Esa decisión es tuya (criterio), no una regla mecánica.

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
- Transcripción con tiempos (`media/transcripciones/<video>.lineas.txt` y `.words.json`). Los tiempos por palabra son **aproximados**: úsalos para ubicar, no para cortar.
- Silencios del audio (ffmpeg `silencedetect`). Los cortes se hacen **dentro de pausas**.

## Método
1. **Lee todo el texto** y escribe el punto del video en UNA frase.
2. **Marca cada bloque** (idea completa) como: `gancho` · `contexto` · `valor` · `repetido` · `relleno` · `ejemplo` · `cierre`.
3. **Decide**:
   - Cada idea una vez, en su mejor formulación (la más clara).
   - Quita: repeticiones, rodeos, anécdotas que no prueban el punto, meta-comentarios ("como les dije", "a ver"), ejemplos extra (deja el mejor), muletillas largas.
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
