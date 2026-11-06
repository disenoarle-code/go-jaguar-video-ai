import { PROJECT_VERSION, type Project } from './types'

export class ProjectError extends Error {}

export interface ProjectFile { format: 'gojaguar'; version: number; savedAt: string; project: Project }

/**
 * Migraciones: la clave N convierte un proyecto de la versión N a la N+1.
 * Al subir PROJECT_VERSION, añade aquí la función correspondiente.
 */
export const migrations: Record<number, (p: any) => any> = {}

/** Aplica las migraciones from → to (la tabla se puede inyectar para probar el mecanismo). */
export function migrateProject(project: any, from: number, to: number, table = migrations): any {
  for (let v = from; v < to; v++) {
    const m = table[v]
    if (!m) throw new ProjectError(`Falta la migración de la versión ${v}`)
    project = m(project)
  }
  return project
}

export function serialize(p: Project, now = new Date()): string {
  const file: ProjectFile = { format: 'gojaguar', version: PROJECT_VERSION, savedAt: now.toISOString(), project: p }
  return JSON.stringify(file, null, 2)
}

export function parseProject(text: string): Project {
  let raw: any
  try { raw = JSON.parse(text) } catch { throw new ProjectError('El archivo no es un JSON válido') }
  if (!raw || raw.format !== 'gojaguar') throw new ProjectError('No es un proyecto de Editor Gojaguar')
  let v = raw.version
  if (!Number.isInteger(v) || v < 1) throw new ProjectError('Versión de proyecto inválida')
  if (v > PROJECT_VERSION) throw new ProjectError(`El proyecto es de una versión más nueva (${v}); actualiza la aplicación`)
  const project = migrateProject(raw.project, v, PROJECT_VERSION)
  project.version = PROJECT_VERSION
  validate(project)
  return project as Project
}

const num = (x: unknown) => typeof x === 'number' && Number.isFinite(x)

export function validate(p: any): asserts p is Project {
  const fail = (m: string): never => { throw new ProjectError('Proyecto dañado: ' + m) }
  if (!p || typeof p !== 'object') fail('sin contenido')
  if (typeof p.name !== 'string') fail('falta el nombre')
  if (!p.format || !num(p.format.width) || !num(p.format.height) || !(p.format.fps > 0)) fail('formato inválido')
  for (const k of ['assets', 'clips', 'layers']) if (!Array.isArray(p[k])) fail(`falta la lista "${k}"`)
  const ids = new Set<string>()
  const uniq = (id: unknown) => { if (typeof id !== 'string' || ids.has(id)) fail(`id repetido o inválido (${String(id)})`); ids.add(id as string) }
  for (const a of p.assets) { uniq(a.id); if (!num(a.duration) || !(a.duration > 0)) fail(`asset ${a.id} sin duración`) }
  const assetIds = new Set<string>(p.assets.map((a: any) => a.id))
  for (const c of p.clips) {
    uniq(c.id)
    if (!assetIds.has(c.assetId)) fail(`clip ${c.id} usa un asset inexistente (${c.assetId})`)
    if (![c.srcIn, c.srcOut, c.speed, c.volume].every(num)) fail(`clip ${c.id} con números inválidos`)
    if (!(c.srcOut > c.srcIn) || !(c.speed > 0)) fail(`clip ${c.id} con rango o velocidad inválidos`)
  }
  if (p.music && (!assetIds.has(p.music.assetId) || ![p.music.srcIn, p.music.volume, p.music.fadeOut].every(num))) fail('la música usa un asset inexistente o con números inválidos')
  for (const l of p.layers) {
    uniq(l.id)
    if (typeof l.type !== 'string') fail(`capa ${l.id} sin tipo`)
    if (!num(l.start) || !num(l.end) || !(l.end > l.start)) fail(`capa ${l.id} con tiempos inválidos`)
    if (!l.transform || ![l.transform.x, l.transform.y, l.transform.scale, l.transform.rotation, l.transform.opacity].every(num)) fail(`capa ${l.id} sin transform válido`)
  }
  // nextId siempre mayor que cualquier id numérico existente
  let max = 0
  for (const id of ids) { const m = /(\d+)$/.exec(id); if (m) max = Math.max(max, Number(m[1])) }
  p.nextId = Math.max(num(p.nextId) ? p.nextId : 1, max + 1)
}
