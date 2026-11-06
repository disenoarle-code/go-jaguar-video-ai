import { describe, expect, it } from 'vitest'
import { Store, createProject, describe as desc, duration, exec, execBatch, locate, parseProject, serialize, type AssetInfo } from '../src'

const vid: AssetInfo = { id: 'a1', name: 'v', proxy: 'p.mp4', original: 'o.mov', duration: 10, fps: 30, width: 640, height: 1138 }
const aud: AssetInfo = { id: 'a2', name: 'musica', kind: 'audio', proxy: 'm.m4a', original: 'm.mp3', duration: 60, fps: 0, width: 0, height: 0 }
const base = () => { const s = new Store(createProject('t')); execBatch(s, [{ op: 'import_asset', asset: vid }, { op: 'import_asset', asset: aud }, { op: 'add_clip', asset: 'a1', src_in: 0, src_out: 8 }]); return s }

describe('superposición de pistas', () => {
  it('un clip superpuesto va a la pista 1; si se solapa con otro, se abre la pista 2', () => {
    const s = base()
    exec(s, { op: 'add_overlay', asset: 'a1', start: 1, src_in: 0, src_out: 3 })
    exec(s, { op: 'add_overlay', asset: 'a1', start: 2, src_in: 0, src_out: 3 })
    exec(s, { op: 'add_overlay', asset: 'a1', start: 4.5, src_in: 0, src_out: 2 })   // cabe en la pista 1 (el primero termina en 4)
    expect(s.project.overlays!.map(o => o.track)).toEqual([1, 2, 1])
  })
  it('video y audio tienen pistas separadas', () => {
    const s = base()
    exec(s, { op: 'add_overlay', asset: 'a1', start: 0, src_in: 0, src_out: 3 })
    exec(s, { op: 'add_overlay', asset: 'a2', start: 0, src_in: 5, src_out: 20 })
    exec(s, { op: 'add_overlay', asset: 'a2', start: 1, src_in: 0, src_out: 5 })
    expect(s.project.overlays!.map(o => `${o.kind}${o.track}`)).toEqual(['video1', 'audio1', 'audio2'])
  })
  it('mover a una pista ocupada abre otra', () => {
    const s = base()
    execBatch(s, [{ op: 'add_overlay', asset: 'a1', start: 0, src_in: 0, src_out: 4 }, { op: 'add_overlay', asset: 'a1', start: 5, src_in: 0, src_out: 4 }])
    const [a, b] = s.project.overlays!
    exec(s, { op: 'update_overlay', id: b.id, patch: { start: 2 } })
    expect(b.track).toBe(2)
    exec(s, { op: 'update_overlay', id: b.id, patch: { start: 5, track: 1 } })   // al pedir la pista 1 y estar libre, vuelve
    expect(s.project.overlays!.find(o => o.id === b.id)!.track).toBe(1)
    expect(a.track).toBe(1)
  })
  it('la duración incluye los superpuestos que pasan del final', () => {
    const s = base()
    expect(duration(s.project)).toBeCloseTo(8)
    exec(s, { op: 'add_overlay', asset: 'a1', start: 6, src_in: 0, src_out: 5 })
    expect(duration(s.project)).toBeCloseTo(11)
    expect(locate(s.project, 9)).toBeNull()
  })
  it('se guarda, se abre y se describe', () => {
    const s = base()
    exec(s, { op: 'add_overlay', asset: 'a1', start: 1, src_in: 0, src_out: 3, x: 0.8, y: 0.2, scale: 0.4 })
    const back = parseProject(serialize(s.project))
    expect(back.overlays![0]).toMatchObject({ kind: 'video', track: 1, start: 1, transform: { x: 0.8, y: 0.2, scale: 0.4 } })
    expect(desc(new Store(back))).toMatch(/video pista 1/)
    exec(s, { op: 'delete_overlay', id: s.project.overlays![0].id })
    expect(s.project.overlays).toHaveLength(0)
  })
  it('si una pista se queda vacía, las demás bajan (sin huecos)', () => {
    const s = base()
    execBatch(s, [{ op: 'add_overlay', asset: 'a1', start: 0, src_in: 0, src_out: 4 }, { op: 'add_overlay', asset: 'a1', start: 1, src_in: 0, src_out: 4 }])
    const [a, b] = s.project.overlays!
    expect([a.track, b.track]).toEqual([1, 2])
    exec(s, { op: 'delete_overlay', id: a.id })
    expect(s.project.overlays![0].track).toBe(1)
  })
})

describe('estado de pista', () => {
  it('bloquear, ocultar y silenciar se guardan y se limpian al volver a normal', () => {
    const s = base()
    exec(s, { op: 'set_track', track: 'main', locked: true, muted: true })
    exec(s, { op: 'set_track', track: 'v1', hidden: true })
    expect(parseProject(serialize(s.project)).tracks).toEqual({ main: { locked: true, muted: true }, v1: { hidden: true } })
    exec(s, { op: 'set_track', track: 'main', locked: false, muted: false })
    expect(s.project.tracks).toEqual({ v1: { hidden: true } })
  })
})
