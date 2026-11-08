// Actualiza un paso de la pantalla "Editando tu video": node scripts/progreso.mjs <slug> <paso> <en_curso|hecho|omitido> ["lo que estás haciendo, en una frase para el usuario"]
// Pasos: guion, voz, zonas, movimiento, color, textos, revision
import { readFileSync, writeFileSync } from 'node:fs'
import { join, dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const raiz = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const [slug, paso, estado, detalle] = process.argv.slice(2)
if (!slug || !paso || !['en_curso', 'hecho', 'omitido'].includes(estado)) { console.error('uso: progreso.mjs <slug> <paso> <en_curso|hecho|omitido> [detalle]'); process.exit(1) }
const f = join(process.env.GOJAGUAR_BIBLIOTECA ?? join(raiz, 'biblioteca'), 'proyectos', slug, 'analisis', 'progreso-edicion.json')
const d = JSON.parse(readFileSync(f, 'utf8'))
const p = d.pasos.find(x => x.id === paso)
if (!p) { console.error('paso desconocido: ' + paso + ' (' + d.pasos.map(x => x.id).join(', ') + ')'); process.exit(1) }
p.estado = estado; if (detalle) p.detalle = detalle
writeFileSync(f, JSON.stringify(d, null, 2))
console.log(`${slug}/${paso} → ${estado}`)
