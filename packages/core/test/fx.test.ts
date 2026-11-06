import { describe, expect, it } from 'vitest'
import { PROJECT_VERSION, Store, createProject, exec, execBatch, fxAt, parseProject, serialize, type AssetInfo } from '../src'

const video: AssetInfo = { id: 'a1', name: 'v', proxy: 'p.mp4', original: 'o.mov', duration: 10, fps: 30, width: 640, height: 1138 }
const song: AssetInfo = { id: 'a2', name: 'musica', kind: 'audio', proxy: 'm.m4a', original: 'm.mp3', duration: 200, fps: 0, width: 0, height: 0 }
const three = () => { const s = new Store(createProject('t')); execBatch(s, [{ op: 'import_asset', asset: video }, { op: 'add_clip', asset: 'a1', src_in: 0, src_out: 2 }, { op: 'add_clip', asset: 'a1', src_in: 3, src_out: 5 }, { op: 'add_clip', asset: 'a1', src_in: 6, src_out: 8 }]); return s }

describe('zoom (efecto del clip)', () => {
  it('se pone con tipo, intensidad y duración, y se limita a valores razonables', () => {
    const s = three(), id = s.project.clips[0].id
    exec(s, { op: 'set_zoom', clip: id, zoom: { kind: 'punch', amount: 0.3, duration: 0.5 } })
    expect(s.project.clips[0].zoom).toEqual({ kind: 'punch', amount: 0.3, duration: 0.5 })
    exec(s, { op: 'set_zoom', clip: id, zoom: { kind: 'push', amount: 9 } })
    expect(s.project.clips[0].zoom).toEqual({ kind: 'push', amount: 0.8 })
    exec(s, { op: 'set_zoom', clip: id, zoom: null })
    expect(s.project.clips[0].zoom).toBeUndefined()
  })
})

describe('transición (en el corte)', () => {
  it('se guarda en el clip que entra y es también la salida del anterior', () => {
    const s = three(), [a, b] = s.project.clips
    exec(s, { op: 'set_transition', clip: b.id, transition: { kind: 'slide', duration: 0.6, intensity: 1, dir: -1 } })
    expect(s.project.clips[1].transition).toMatchObject({ kind: 'slide', duration: 0.6, dir: -1 })
    // salida del clip A (cerca de su final) y entrada del B (cerca de su inicio) usan la misma transición
    const outA = fxAt(a, s.project.clips[1], 1.95, 2), inB = fxAt(s.project.clips[1], s.project.clips[2], 0.05, 2)
    expect(outA.shift).not.toBe(0); expect(inB.shift).not.toBe(0)
    expect(Math.sign(outA.shift)).toBe(-Math.sign(inB.shift))      // sale hacia un lado y entra desde el otro
    expect(fxAt(a, s.project.clips[1], 0.5, 2).shift).toBe(0)      // lejos del corte no hay efecto
  })
  it('el primer clip no tiene corte antes', () => {
    const s = three()
    expect(exec(s, { op: 'set_transition', clip: s.project.clips[0].id, transition: { kind: 'flash', duration: 0.3, intensity: 1 } })).toMatch(/primer clip/)
  })
  it('destello y fundido: pico en el corte y se apagan', () => {
    const s = three(), b = s.project.clips[1]
    exec(s, { op: 'set_transition', clip: b.id, transition: { kind: 'flash', duration: 0.4, intensity: 1 } })
    expect(fxAt(s.project.clips[1], undefined, 0, 2).flash).toBeCloseTo(0.9)
    expect(fxAt(s.project.clips[1], undefined, 0.3, 2).flash).toBe(0)
    exec(s, { op: 'set_transition', clip: b.id, transition: { kind: 'dip', duration: 0.4, intensity: 1 } })
    expect(fxAt(s.project.clips[1], undefined, 0, 2).flash).toBeCloseTo(-1)
  })
  it('al cortar un clip, la mitad nueva no repite zoom ni transición', () => {
    const s = three(), b = s.project.clips[1]
    execBatch(s, [{ op: 'set_transition', clip: b.id, transition: { kind: 'flash', duration: 0.3, intensity: 1 } }, { op: 'set_zoom', clip: b.id, zoom: { kind: 'push', amount: 0.1 } }])
    exec(s, { op: 'split', at: 3 })      // dentro del clip B (2–4 s)
    expect(s.project.clips[1].transition).toBeDefined()
    expect(s.project.clips[2].transition).toBeUndefined(); expect(s.project.clips[2].zoom).toBeUndefined()
  })
})

describe('fxAt y proyectos antiguos', () => {
  it('el punch arranca con zoom y se asienta', () => {
    const s = three(), c = s.project.clips[0]
    exec(s, { op: 'set_zoom', clip: c.id, zoom: { kind: 'punch', amount: 0.22, duration: 0.35 } })
    expect(fxAt(s.project.clips[0], undefined, 0, 2).zoom).toBeCloseTo(1.22)
    expect(fxAt(s.project.clips[0], undefined, 1, 2).zoom).toBeCloseTo(1.025)
    expect(fxAt(undefined, undefined, 0.3, 1)).toEqual({ zoom: 1, shift: 0, flash: 0 })
  })
  it('un proyecto v1 con fx único se convierte en zoom + transición', () => {
    const s = three()
    const raw = JSON.parse(serialize(s.project)); raw.version = 1
    raw.project.clips[0].fx = 'push'; raw.project.clips[1].fx = 'dropflash'; raw.project.clips[2].fx = 'slide'; raw.project.clips[2].fxDir = -1
    const p = parseProject(JSON.stringify(raw))
    expect(p.version).toBe(PROJECT_VERSION)
    expect(p.clips[0].zoom).toMatchObject({ kind: 'push' })
    expect(p.clips[1]).toMatchObject({ zoom: { kind: 'punch', amount: 0.35 }, transition: { kind: 'flash' } })
    expect(p.clips[2].transition).toMatchObject({ kind: 'slide', dir: -1 })
    expect((p.clips[0] as any).fx).toBeUndefined()
  })
  it('zoom y transición sobreviven a guardar y abrir; música también', () => {
    const s = three(); exec(s, { op: 'import_asset', asset: song })
    execBatch(s, [{ op: 'set_music', asset: 'a2', src_in: 10.29, volume: 0.9, fade_out: 0.9 }, { op: 'set_format', width: 1080, height: 1920 },
      { op: 'set_zoom', clip: s.project.clips[0].id, zoom: { kind: 'pull', amount: 0.2 } }, { op: 'set_transition', clip: s.project.clips[1].id, transition: { kind: 'dip', duration: 0.5, intensity: 1 } }])
    const back = parseProject(serialize(s.project))
    expect(back.clips[0].zoom).toEqual({ kind: 'pull', amount: 0.2 }); expect(back.clips[1].transition?.kind).toBe('dip')
    expect(back.music).toEqual({ assetId: 'a2', srcIn: 10.29, volume: 0.9, fadeOut: 0.9 }); expect(back.format).toMatchObject({ width: 1080, height: 1920 })
  })
})
