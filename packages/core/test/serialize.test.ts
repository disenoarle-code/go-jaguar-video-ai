import { describe as suite, expect, it } from 'vitest'
import {
  PROJECT_VERSION, ProjectError, Store, createProject, exec, migrateProject, parseProject, serialize,
  type AssetInfo,
} from '../src'

const asset: AssetInfo = { id: 'a1', name: 'demo', proxy: 'p.mp4', original: 'o.mov', duration: 100, fps: 30, width: 1280, height: 720 }
function sample() {
  const s = new Store(createProject('mi proyecto'))
  exec(s, { op: 'import_asset', asset }); exec(s, { op: 'add_clip', asset: 'a1' })
  exec(s, { op: 'delete_range', from: 10, to: 20 }); exec(s, { op: 'speed_all', value: 1.1 })
  exec(s, { op: 'add_text', type: 'subtitle', start: 1, end: 3, text: 'Hola ñandú' })
  return s
}

suite('guardar y abrir', () => {
  it('ida y vuelta sin pérdida', () => {
    const s = sample()
    const back = parseProject(serialize(s.project))
    expect(back).toEqual(s.project)
  })
  it('el archivo declara formato y versión', () => {
    const f = JSON.parse(serialize(sample().project))
    expect(f.format).toBe('gojaguar'); expect(f.version).toBe(PROJECT_VERSION)
  })
  it('tras abrir, los ids nuevos no chocan con los existentes', () => {
    const p = parseProject(serialize(sample().project))
    const s = new Store(p)
    exec(s, { op: 'split', at: 30 })
    const ids = [...p.clips.map(c => c.id), ...p.layers.map(l => l.id)]
    expect(new Set(ids).size).toBe(ids.length)
  })
  it('Store.load reemplaza el proyecto y limpia el historial', () => {
    const s = sample(); const saved = serialize(s.project)
    exec(s, { op: 'speed_all', value: 3 })
    s.load(parseProject(saved))
    expect(s.canUndo).toBe(false)
    expect(s.project.clips[0].speed).toBe(1.1)
  })
})

suite('archivos inválidos', () => {
  it('rechaza JSON roto', () => expect(() => parseProject('{no')).toThrow(ProjectError))
  it('rechaza otros formatos', () => expect(() => parseProject('{"format":"otro"}')).toThrow(/No es un proyecto/))
  it('rechaza versiones más nuevas', () => {
    const f = JSON.parse(serialize(sample().project)); f.version = PROJECT_VERSION + 1
    expect(() => parseProject(JSON.stringify(f))).toThrow(/más nueva/)
  })
  it('detecta clips con asset inexistente', () => {
    const f = JSON.parse(serialize(sample().project)); f.project.clips[0].assetId = 'nope'
    expect(() => parseProject(JSON.stringify(f))).toThrow(/asset inexistente/)
  })
  it('detecta rangos y velocidades inválidos', () => {
    const f = JSON.parse(serialize(sample().project)); f.project.clips[0].speed = 0
    expect(() => parseProject(JSON.stringify(f))).toThrow(/inválidos/)
  })
  it('detecta ids repetidos', () => {
    const f = JSON.parse(serialize(sample().project)); f.project.layers[0].id = f.project.clips[0].id
    expect(() => parseProject(JSON.stringify(f))).toThrow(/repetido/)
  })
})

suite('migraciones', () => {
  it('encadena las migraciones en orden', () => {
    const table = { 1: (p: any) => ({ ...p, a: 1 }), 2: (p: any) => ({ ...p, b: p.a + 1 }) }
    expect(migrateProject({}, 1, 3, table)).toEqual({ a: 1, b: 2 })
  })
  it('falla con claridad si falta una migración', () => {
    expect(() => migrateProject({}, 1, 3, { 1: (p: any) => p })).toThrow(/Falta la migración de la versión 2/)
  })
  it('no hace nada si ya está en la versión actual', () => {
    const p = { x: 1 }
    expect(migrateProject(p, PROJECT_VERSION, PROJECT_VERSION)).toBe(p)
  })
})
