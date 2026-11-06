// Cambia el estado de un pedido: node scripts/solicitud.mjs <id> <en_curso|hecho|error> ["nota"]
import { readFileSync, writeFileSync } from 'node:fs'
import { join, dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const raiz = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const dir = join(process.env.GOJAGUAR_BIBLIOTECA ?? join(raiz, 'biblioteca'), 'solicitudes')
const [id, estado, nota] = process.argv.slice(2)
if (!id || !['en_curso', 'hecho', 'error'].includes(estado)) { console.error('uso: solicitud.mjs <id> <en_curso|hecho|error> [nota]'); process.exit(1) }
const f = join(dir, id + '.json')
const s = JSON.parse(readFileSync(f, 'utf8'))
s.estado = estado; if (nota) s.nota = nota
writeFileSync(f, JSON.stringify(s, null, 2))
console.log(`${id} → ${estado}`)
