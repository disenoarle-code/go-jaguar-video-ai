// Espera hasta que haya un pedido 'pendiente' (botones de la app) y lo imprime. Termina con código 0.
// Claude lo corre en segundo plano al empezar: cuando termina, Claude recibe el aviso y ejecuta el pedido.
import { readdirSync, readFileSync, existsSync } from 'node:fs'
import { join, dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const raiz = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const dir = join(process.env.GOJAGUAR_BIBLIOTECA ?? join(raiz, 'biblioteca'), 'solicitudes')
const espera = ms => new Promise(r => setTimeout(r, ms))

for (;;) {
  if (existsSync(dir)) {
    const pend = readdirSync(dir).filter(n => n.endsWith('.json')).map(n => JSON.parse(readFileSync(join(dir, n), 'utf8'))).filter(x => x.estado === 'pendiente')
    pend.sort((a, b) => a.creado.localeCompare(b.creado))
    if (pend.length) { console.log('PEDIDO ' + JSON.stringify(pend[0])); process.exit(0) }
  }
  await espera(2000)
}
