# Editor Gojaguar — Plan por etapas

Objetivo: un editor de video simple y rápido que **Claude controla con pocos tokens** y que el usuario puede **corregir a mano** (cortes, subtítulos, gráficos).

## Enfoque (decidido 2026-11-06)

**El producto vive dentro de Claude Code: es un kit, no un aplicativo.**
- Se entrega una carpeta con el editor, un `CLAUDE.md` que explica cómo instalar y usar todo, skills de estilo y plantillas.
- El cliente abre Claude Code en esa carpeta y le dice "instala y abre el editor". Claude ejecuta `npm install`, `npm run dev`, instala ffmpeg si falta y abre el editor en el panel del navegador.
- Claude controla el editor directamente (comandos, archivos, panel). El servidor MCP y Electron quedan **opcionales / pospuestos**.
- Cliente: usa Claude Code (se le enseña). Acceso abierto: sin control de licencias ni de copias; el modelo de negocio (libro, curso, skills, gratis…) se decide aparte.
- Riesgo asumido: se entrega el código y no se controlan copias. Se espera que, con el tiempo, esto sea una función natural de Claude.

## Principios (no se negocian)

1. **Una sola capa de comandos.** La interfaz y Claude ejecutan exactamente los mismos comandos (cortar, borrar rango, velocidad…). De ahí salen deshacer, pruebas y el servidor MCP.
2. **Edición no destructiva.** El proyecto es una lista de referencias a los originales. Un corte nunca requiere renderizar para verse.
3. **Claude edita por texto, no mirando video.** Transcripción con tiempos + resumen compacto del timeline. Capturas de frame solo cuando hacen falta.
4. **Lotes en vez de pasos sueltos.** "Quita todos los silencios" es un comando, no 145.
5. **Medir antes de optimizar.** Cada etapa cierra con números (ver "Presupuestos").

## Lo ya validado (prototipo)

| Qué | Resultado medido |
|---|---|
| Scrub al pasar el mouse por el timeline | ~18 ms por frame (video 4K HEVC de 10 min, vía proxy) |
| Reproducción con 145 cortes | 30 fps reales, 0 pausas >80 ms |
| Cortes en vivo (sin render) | Correctos al frame |
| Velocidad sin cambiar el tono | 124 Hz vs 125 Hz del original; 0,8 s para 10 min |
| Comandos por lotes | 145 cortes + velocidad en 2 llamadas |
| Stack | Vite + TypeScript + WebCodecs + Web Audio + ffmpeg |

## Deuda técnica conocida (lo que aprendimos)

- Los tiempos por palabra de Whisper salen "estirados" sobre las pausas. Falta alineación fina (DTW / VAD) antes de editar por texto.
- El proxy (640 px) se ve suave: falta un proxy de más resolución o mostrar el original en pausa.
- Se carga el proxy completo en memoria y se copia dos veces (159 MB → ~480 MB). Hay que leer por tramos.
- El resumen para Claude crece con el número de clips (145 clips = mucho texto). Hay que agruparlo.
- Los cortes por silencio se detectaron por volumen: no están verificados contra palabras.
- El audio estirado se pre-procesa por velocidad usada; con velocidades distintas por clip hay que cachear por clip.
- El prototipo corre en un navegador; la importación se hace desde la app (Material → Elegir archivos / Importar); los proxies los crea la app.

---

## Etapas

### E0 — Definición del producto
Escrita en [PRODUCTO.md](PRODUCTO.md): cliente (principiantes + profesionales que quieren agilizar), flujo de proyecto con pestaña **Media** y **Referencias**, botones de **Edición rápida**, qué hace y qué no. Pendiente: Claude externo vs. chat integrado, y cómo se soportan las referencias por enlace.

### E1 — Cimientos ✅ (2026-11-05)
Hecho: repositorio git, paquetes `core` (sin navegador) y `app`, modelo de capas, guardar/abrir `.gojaguar` con validación y migraciones, 35 pruebas, benchmark (`editor.bench()`, línea base en BENCHMARKS.md). **Pendiente de E1:** lint (solo hay TypeScript estricto), probar el flujo Abrir/Nuevo con el selector de archivos en la interfaz (la lógica está probada, el clic no), medir en Windows.

Convertir el prototipo en un proyecto ordenado.
- `git init`, estructura de carpetas, TypeScript estricto, lint.
- Separar en paquetes: **core** (modelo, comandos, historial; sin interfaz), **app** (interfaz), **engine** (decodificación/audio), **mcp** (servidor, después).
- **Formato de proyecto** `.gojaguar` (JSON con versión y migraciones). Guardar y abrir.
- **Modelo de capas desde el inicio**: el proyecto no es solo "clips de video". Cada elemento es una capa con tipo (`video`, `audio`, `imagen`, `texto`, `grafico` por plantilla, `escena3d`, `recorte`) y propiedades animables (posición, escala, rotación 3D, opacidad). Las implementaciones llegan por etapas, pero el modelo debe soportarlas desde E1 para no rehacerlo.
- Comando `importar_media(ruta)`: cualquier archivo, venga de donde venga (cámara, generado por IA), entra a la biblioteca y se puede usar en una capa.
- Pruebas automáticas de la capa de comandos (cortar, borrar rango, ripple, deshacer).
- Conjunto fijo de videos de prueba + script de benchmark (ver Presupuestos).
- **Listo cuando:** guardas, cierras, abres y todo sigue igual; las pruebas pasan.

### E2 — Importar y preparar video (en progreso, 2026-11-06)
**Hecho:** Home con lista de proyectos, pantalla de proyecto (Material, Referencias compartidas, botones "Recorta silencios y errores" y "Edición completa"), biblioteca en disco (`biblioteca/proyectos/<slug>/…` y `biblioteca/referencias/`), subida por streaming, proxy + transcripción + silencios con progreso, edición base sin silencios, tareas para Claude en `pendiente/`, editor que carga y autoguarda en la carpeta del proyecto. **Pendiente:** probar arrastrar y soltar con archivos reales desde la interfaz, leer el proxy por tramos (memoria), videos verticales/60 fps, borrar proyectos desde la interfaz, Windows.

- Elegir videos desde cualquier carpeta (sin copiarlos) ✅ (enlaces por ruta, diálogo nativo en Mac/Windows, aviso si el original se mueve).
- ffmpeg genera el proxy con **barra de progreso** y en segundo plano; el editor se puede usar mientras tanto.
- Caché en disco de proxy, miniaturas, onda de audio y análisis (silencios, escenas).
- Lectura por tramos (sin cargar el proxy entero en memoria).
- Soporte probado: iPhone MOV/HEVC, H.264, vertical y horizontal, 30/60 fps, audio mono/estéreo.
- **Listo cuando:** importar un video 4K de 10 min toma <3 min y la app responde mientras tanto.

### E3 — Exportar (primer ciclo completo)
Sin esto no hay producto utilizable.
- Render con ffmpeg desde el JSON del proyecto: cortes, velocidad (`atempo`, conserva tono), volumen, fundidos.
- Presets: 9:16 y 16:9, 1080p y 4K, H.264/AAC.
- Codificadores por hardware (VideoToolbox en Mac; NVENC/QSV/AMF en Windows).
- Verificar que el video exportado coincide con la vista previa (comparación de frames).
- **Listo cuando:** importar → editar → exportar funciona de punta a punta y se ve/suena igual que en pantalla.

### E4 — Claude Code controla el editor
Lo que diferencia al producto. Se hace temprano para validar el costo en tokens.
- **Con el enfoque del kit:** Claude Code usa los comandos del editor directamente (`editor.exec`, CLI con los mismos comandos, archivos de proyecto) y ve el resultado en el panel. El **servidor MCP es opcional** (útil si algún día se quiere Claude Desktop sin terminal).
- `CLAUDE.md` del kit: cómo iniciar el editor, qué comandos existen, flujo recomendado, qué NO hacer.
- Herramientas pequeñas y por lotes: `estado` (resumen compacto), `aplicar` (lista de comandos), `deshacer`, `fotograma`, `exportar`, `silencios`.
- Respuestas de una línea por cambio, nunca el proyecto completo. Resúmenes agrupados y por rango de tiempo.
- Ver en vivo en la app lo que hace Claude; todo con deshacer.
- Guías ("playbooks") para tareas típicas: limpiar silencios, acelerar, subtitular.
- **Listo cuando:** "quita silencios y acelera a 1,1" cuesta menos de N tokens (se fija con la primera medición) y el usuario puede corregir el resultado a mano.

### E5 — Texto como lenguaje del video
- Whisper local incluido (whisper.cpp), con **alineación fina de palabras** (DTW + detección de voz) para que los tiempos sean reales.
- Modelo de datos: palabras con id y tiempos; silencios; cambios de escena; quién habla.
- **Edición por texto**: borrar palabras = corte exacto al hueco entre palabras. Detección de muletillas y repeticiones.
- Formato compacto para Claude (líneas con rango de palabras) y consulta por rango.
- Subtítulos automáticos a partir de la transcripción, editables.
- Opcional más adelante: transcripción en la nube para audio difícil.
- **Listo cuando:** los cortes caen en el hueco entre palabras (verificado) y Claude puede editar solo con texto.

### E6 — Editor pulido
- Varias pistas de video y audio, snapping, selección múltiple, copiar/pegar, marcadores.
- Atajos de teclado (los de Premiere/CapCut que más se usan), paso por frame, zoom del timeline.
- Fundidos y volumen por clip, normalización de audio, duck de música.
- Arrastrar para reordenar, modo ripple y overwrite.
- Rendimiento con proyectos largos (virtualizar el timeline).
- **Listo cuando:** un editor de Premiere/CapCut se siente cómodo sin leer instrucciones.

### E7 — Subtítulos y gráficos
- Estilos de subtítulo (fuente, color, contorno, posición, resaltado de palabra activa) guardables como plantillas.
- **Sistema de plantillas con parámetros**: títulos, tercios inferiores, contadores, transiciones. Claude solo rellena valores; el usuario las mueve y estira.
- Keyframes básicos (posición, escala, opacidad).
- "Enseñar el estilo": guardar un estilo gráfico (kit de marca) que Claude reutiliza.
- Más adelante: capa 3D con Three.js en el mismo canvas de WebGL.
- Los gráficos se exportan cuadro a cuadro dentro del render de E3.
- **Listo cuando:** lo que se ve en pantalla es idéntico al exportado, con gráficos incluidos.

### E7b — Referencias y estilo
- Pestaña **Referencias**: archivos o enlaces.
- Análisis de cada referencia → **perfil de estilo** (ritmo de cortes, velocidad, estructura de apertura, estilo de subtítulos, paleta, uso de zooms/transiciones/gráficos). Se guarda el perfil, no el video.
- Cortes por escena + fotogramas muestreados que Claude interpreta; ritmo del discurso desde la transcripción.
- Botón **Aplicar estilo de referencia**: Claude traduce el perfil a comandos y plantillas existentes.
- Referencias por enlace: solo con aviso de términos de uso; la vía recomendada es subir el archivo.
- **Listo cuando:** dada una referencia, el resultado se acerca a su ritmo y a su estilo de subtítulos de forma reconocible.

### E7c — Capas avanzadas y conectores (el editor como centro)
El editor es el **punto donde se juntan todos los materiales**; Claude es quien orquesta las herramientas.
- **Claude externo conecta varias herramientas a la vez** (ej.: el MCP de Higgsfield para generar imágenes/video, más el MCP del editor). Claude genera el material y lo trae con `importar_media`; el editor lo compone. No hace falta integrar cada servicio dentro de la app.
- **Capa 3D** (Three.js en el mismo canvas WebGL): escenas con el video como textura en planos, perspectiva, capas flotantes, tutorial en 3D. Plantillas con parámetros + keyframes.
- **Recorte de fondo**: modelo de segmentación local → capa con transparencia.
- **Imágenes**: del usuario o generadas por conectores externos.
- **Íconos animados y lettering**: biblioteca de íconos + plantillas de texto animado.
- Exportación cuadro a cuadro de las capas 3D/gráficas, con vista previa idéntica al resultado.
- **Listo cuando:** los 10 estilos de referencia (montaje 3D, motion explicativo, tutorial 3D, bruto→editado, perspectiva 3D, recorte de fondo, 3D explicativo, inserción de imágenes, íconos animados, lettering) se pueden pedir a Claude y retocar a mano.
- Las generaciones externas consumen créditos de la cuenta del usuario y quedan bajo los términos de cada servicio.

### E8 — Kit de instalación (reemplaza a la app de escritorio)
- **Paquete listo para dar a alguien:** carpeta del editor + `CLAUDE.md` + guía de primer uso + skills de estilo + plantillas + video de prueba.
- Que Claude Code lo instale solo (Node, ffmpeg, dependencias) en **Mac y Windows**, y que lo verifique.
- Actualizaciones: el cliente actualiza el kit (git o descarga nueva).
- **Listo cuando:** una persona nueva abre Claude Code en la carpeta, dice "instala y abre el editor", y en <10 min edita su primer video.

#### E8b — Aplicación de escritorio (pospuesta, ya no es prioridad)
Solo si un día se necesita llegar a gente sin Claude Code.
- Envolver en **Electron** (mismo código, misma velocidad).
- ffmpeg y Whisper empaquetados. **Licencia de ffmpeg:** usar un build LGPL con codificadores por hardware (el build con x264 es GPL y obliga a condiciones estrictas al vender). Decidirlo antes de empaquetar.
- Instaladores firmados y notarizados: .dmg (Mac, Apple Developer) y .exe (Windows, certificado de firma).
- Pruebas reales en Windows (aceleración por hardware y códecs distintos).
- **Listo cuando:** una persona sin conocimientos técnicos instala y exporta su primer video.

### E9 — Comercial (pospuesta y a definir)
Con el enfoque del kit no hay control de licencias. Definir más adelante: cómo se distribuye y se monetiza (libro/curso/skills, gratis con donaciones, etc.). Lo de abajo solo aplicaría si se vuelve aplicativo (E8b):
- Cuentas e inicio de sesión (Supabase u otro), planes y cobros con un "merchant of record" (Lemon Squeezy o Paddle: manejan impuestos).
- Licencias con modo sin conexión de gracia (la app no debe dejar de funcionar si falla internet unos días).
- Actualizaciones automáticas (canal estable y beta).
- Reporte de errores con consentimiento; telemetría mínima y opcional.
- Términos, privacidad y política de reembolso.

### E10 — Beta cerrada
- 5–10 editores reales con sus videos. Recoger: qué pidieron a Claude, qué corrigieron a mano, dónde se trabó.
- Con eso se priorizan las funciones nuevas (no antes).

---

## Cómo optimizamos poco a poco

Ciclo en cada etapa: **medir → encontrar el cuello de botella → arreglar → volver a medir → no retroceder**.

### Presupuestos (objetivos)
| Métrica | Objetivo |
|---|---|
| Scrub (hover sobre timeline → frame visible) | ≤ 25 ms (hoy ~18) |
| Reproducción | 30/60 fps estables, 0 pausas >80 ms |
| Preparar video 4K de 10 min (importar) | < 3 min (hoy 2 min 17 s) y app usable mientras tanto |
| Cambiar velocidad (audio listo) | < 2 s para 10 min (hoy 0,8 s) |
| Memoria con un proyecto de 10 min | < 1 GB |
| Abrir proyecto | < 3 s |
| Exportar 10 min a 1080p | < 0,5× la duración con hardware |
| Tokens de Claude por tarea típica | Medir en E4 y bajar versión a versión |

### Cómo se mide
- `benchmark` automático sobre un set fijo de videos (iPhone 4K, 1080p, vertical, largo).
- Cada cambio importante corre el benchmark; si una métrica empeora, no se acepta.
- Para Claude: tareas fijas ("quitar silencios y acelerar", "subtitular y estilizar") y se cuenta cuántos tokens y llamadas gastan. Meta: bajar el número con cada versión.

### Orden de mejoras probables
1. Proxy por tramos y menos copias en memoria (E2).
2. Resúmenes agrupados para Claude (E4).
3. Alineación fina de palabras (E5).
4. Proxy de mayor resolución / original en pausa (E6).
5. Caché de audio estirado por clip (E6).
6. Motor nativo para el render si ffmpeg se queda corto (solo si el benchmark lo exige).

## Riesgos principales

| Riesgo | Mitigación |
|---|---|
| Licencia GPL de ffmpeg al vender | Build LGPL + hardware encoders; decidir en E3/E8 |
| Códecs y patentes (HEVC) | Proxies H.264; originales solo para exportar |
| Diferencias Mac/Windows en decodificación | Probar en Windows desde E2, no al final |
| Calidad de transcripción en español con ruido | Modelo local + opción de nube |
| Vista previa ≠ exportado | Prueba automática de comparación de frames (E3, E7) |
| Alcance que crece | Cada etapa tiene "listo cuando"; lo demás va a una lista aparte |

## Siguiente paso recomendado

**E2 (importar y preparar video)** y, en paralelo, un primer **`CLAUDE.md` del kit** para probar que Claude Code puede instalar y abrir el editor desde cero.
