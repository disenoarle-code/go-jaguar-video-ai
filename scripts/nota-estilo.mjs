// Anota (sin gastar tokens de análisis) una preferencia que el usuario pidió por el chat: node scripts/nota-estilo.mjs <slug> "texto corto"
import { appendFileSync, mkdirSync } from 'node:fs'
import { join, dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
const raiz = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const [slug, ...t] = process.argv.slice(2)
if (!slug || !t.length) { console.error('uso: nota-estilo.mjs <slug> "texto"'); process.exit(1) }
const d = join(process.env.GOJAGUAR_BIBLIOTECA ?? join(raiz, 'biblioteca'), 'proyectos', slug, 'analisis'); mkdirSync(d, { recursive: true })
appendFileSync(join(d, 'ediciones-usuario.jsonl'), JSON.stringify({ t: Date.now(), quien: 'chat', texto: t.join(' ').slice(0, 300) }) + '\n')
console.log('anotado')
