# Editor Gojaguar — Definición del producto (borrador v0.1)

## Para quién
- **Principal:** personas que quieren editar sus videos **sin conocimientos de edición**.
- **Secundario:** editores profesionales que quieren **agilizar** su trabajo.
- No es un editor avanzado. **Claude organiza y mejora el video; la persona se lo pide y corrige lo justo a mano.**

## Qué NO es
Sin colorimetría, efectos complejos ni ajustes finos manuales. Eso no se diseña para hacerse a mano: o lo hace Claude, o no está en la v1.

## Flujo
1. **Crear proyecto** (nombre, formato 9:16 / 16:9).
2. **Pestaña MEDIA** (al estilo CapCut, más simple): importar los archivos que irán en el video.
3. **Referencias**: videos de referencia (archivo o enlace) para copiar estilo visual y de edición.
4. **Edición rápida**: botones con las tareas más comunes.
5. **Pedirle cosas a Claude** para pulir.
6. **Ajuste a mano** (cortes, subtítulos, gráficos) y **exportar**.

## Pantalla de proyecto
- Izquierda: pestañas **Media · Referencias · Audio · Texto/Subtítulos · Gráficos · Estilos**.
- Centro: vista previa (donde se arrastran subtítulos y gráficos).
- Derecha: propiedades del elemento y **registro de Claude** (qué hizo, con deshacer por paso).
- Abajo: timeline.

## Media y referencias
- **Media:** zona de arrastrar y soltar; videos, fotos y audio. Se prepara solo en segundo plano (proxy, transcripción, silencios, nitidez).
- **Referencias:** archivos o **enlaces**. De cada una se genera un **perfil de estilo** (no se conserva el video):
  - ritmo de cortes (duración media de plano, cortes por minuto) y velocidad;
  - estructura (cómo abre, primeros 3 s);
  - subtítulos (posición, tamaño, colores, resaltado, cuántas palabras por línea);
  - paleta de color y encuadres (planos, zooms);
  - uso de transiciones, gráficos y música (presencia, no el archivo);
  - ritmo del discurso (palabras por minuto, pausas).
- Límite: se copia **el estilo aproximado**, no tipografías exactas ni efectos que la app no tenga.

## Edición rápida (botones)
Dos tipos: **locales** (sin Claude, sin costo de tokens) y **con Claude** (juicio y creatividad).

| Botón | Qué hace | Tipo |
|---|---|---|
| Primer corte | Transcribe, quita silencios y muletillas, deja la última toma repetida | Local |
| Subtitular | Subtítulos automáticos con el estilo elegido | Local |
| Solo tomas nítidas | Descarta tramos desenfocados | Local |
| Acelerar | Velocidad uniforme conservando el tono | Local |
| Reformatear | Pasa de 16:9 a 9:16 centrando al sujeto | Local |
| Aplicar estilo de referencia | Ajusta ritmo, subtítulos y gráficos al perfil | Claude |
| Versión corta | Elige las mejores partes hasta N segundos | Claude |
| Gancho inicial | Propone y arma una apertura | Claude |
| Estructurar con el guion | Ordena las tomas según un guion o texto dado | Claude |
| Pídeme lo que quieras | Instrucción libre | Claude |

## Cómo se conecta Claude
- **Decidido (2026-11-06):** el producto es un **kit para Claude Code**: una carpeta con el editor + `CLAUDE.md` + skills. El cliente abre Claude Code ahí y Claude instala y abre el editor; el cliente usa su propia suscripción. MCP y aplicativo (Electron) quedan opcionales/pospuestos. Ver PLAN.md, "Enfoque".
- (Decisión anterior, ahora secundaria): Claude externo por MCP.
- Los botones locales funcionan sin Claude.
- **Decidido (2026-11-06, ajuste):** las órdenes con criterio se dan **en el chat con Claude**, no desde la app. La app solo tiene botones con acciones claras (recortar silencios, elegir referencias, abrir editor). Se descartó el sistema de "tareas pendientes".
- (Antes) la app no puede "llamar" a Claude. Los botones que requieren Claude (aplicar estilo, versión corta, gancho, guion) dejan una **tarea pendiente** visible en la app (con la instrucción ya redactada y un botón de copiar). Claude la lee con la herramienta MCP `tareas_pendientes` cuando el usuario le dice "haz lo pendiente".
- Todo lo que hace Claude pasa por los **mismos comandos** que la interfaz, queda en el registro y se puede deshacer.

## Decisiones abiertas
1. ~~Claude externo vs. chat integrado~~ → **Claude externo**.
2. ~~Referencias~~ → **en la v1 son archivos de video** que el usuario aporta (más fiable para analizar). Los enlaces quedan fuera de la v1.
3. Lista final de botones de la v1.

## Referencias por enlace (fuera de la v1)
- Decidido: la v1 solo acepta **archivos**. Lo de abajo queda como nota para una versión futura.
- Claude **no ve video desde un enlace**. Para analizar imagen hay que traer el video (aunque sea una copia temporal de baja calidad), extraer el perfil de estilo y **borrar la copia**.
- Descargar de plataformas puede contravenir sus términos de uso; responsabilidad y aviso al usuario por definir.
- Lo que se puede obtener sin bajar el video: título, descripción, duración, miniatura y, en algunas plataformas, subtítulos/transcripción.
- La opción más limpia: **que el usuario suba el archivo** de referencia.
