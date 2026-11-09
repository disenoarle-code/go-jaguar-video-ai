---
name: aprender-estilo
description: Aprendizaje del estilo de edición del usuario con el mínimo de tokens. Explica qué aprende el código solo, y cómo condensar en estilo-usuario.md las notas cualitativas cuando llega un pedido `aprendizaje`. Léelo al recibir ese pedido o al terminar una orden de edición por el chat.
---

# Aprender el estilo del usuario (casi todo lo hace el código)

**Qué hace el programa SOLO (0 tokens):** el editor anota lo que el usuario hace a mano (`analisis/ediciones-usuario.jsonl`; mis órdenes por `window.editor` NO cuentan); cada ~20 eventos y al pasar al editor, `scripts/aprender.py` funde los eventos nuevos en `biblioteca/aprendizaje/perfil.json` (contadores y medias; no guarda historial crudo, así no crece) y regenera el bloque AUTOMÁTICO de `biblioteca/aprendizaje/estilo-usuario.md` (solo lo repetido n≥3 y dominante ≥60 %: zoom, transición, color, texto, tomas superpuestas, qué acepta o descarta de las propuestas, cuánto recorta el guion).

**Qué lees tú (≈400 tokens, siempre):** `biblioteca/aprendizaje/estilo-usuario.md` ANTES de proponer o editar; prevalece sobre el estilo base (`.claude/skills/estilos/`) cuando chocan. NUNCA leas `perfil.json`, los `.jsonl` ni el historial.

**Cuándo te piden algo (solo si hay notas CUALITATIVAS nuevas):** pedido `aprendizaje` (recomendaciones escritas por el usuario, prompts por zona, notas del chat):
1. `npm run solicitud -- <id> en_curso`.
2. Lee `biblioteca/aprendizaje/perfil.json` SOLO el campo `pendientes` (`node scripts/py.mjs -c "import json;print(json.load(open('biblioteca/aprendizaje/perfil.json'))['pendientes'])"`) y la sección "Cualitativo" de `estilo-usuario.md`.
3. Reescribe esa sección (entre `<!-- cualitativo -->` y `<!-- fin -->`): **una regla corta por línea, máx. 15 líneas**; funde duplicados, generaliza (“prefiere X” no “en el video de ayer pidió X”), descarta lo puntual de un solo video y quita lo que ahora se contradiga. Nada de explicaciones.
4. `node scripts/py.mjs scripts/aprender.py --condensado` (limpia los pendientes) → `npm run solicitud -- <id> hecho` → vuelve a `npm run vigilar`.

**Órdenes por el chat:** cuando el usuario te pida un cambio de edición, además de hacerlo anota la preferencia en una línea: `npm run nota-estilo -- <slug> "prefiere zoom más suave en la cara"` (~30 tokens). Solo si parece una preferencia general, no un arreglo puntual.

Reglas de oro: lo cuantitativo es del código; tú solo condensas lo cualitativo; el .md nunca crece más de ~40 líneas; sin pedido no se gasta nada.
