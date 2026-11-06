import { describe, expect, it } from 'vitest'
import { Store, createProject, exec, execBatch, fxAt, parseProject, serialize, type AssetInfo } from '../src'

const video: AssetInfo = { id: 'a1', name: 'v', proxy: 'p.mp4', original: 'o.mov', duration: 10, fps: 30, width: 640, height: 1138 }
const song: AssetInfo = { id: 'a2', name: 'musica', kind: 'audio', proxy: 'm.m4a', original: 'm.mp3', duration: 200, fps: 0, width: 0, height: 0 }

describe('efectos, música y formato', () => {
  it('guarda efecto por clip y lo quita', () => {
    const s = new Store(createProject('t'))
    execBatch(s, [{ op: 'import_asset', asset: video }, { op: 'add_clip', asset: 'a1', src_in: 0, src_out: 2, effect: 'slide', dir: -1 }])
    expect(s.project.clips[0]).toMatchObject({ fx: 'slide', fxDir: -1 })
    exec(s, { op: 'set_effect', clip: s.project.clips[0].id, effect: null })
    expect(s.project.clips[0].fx).toBeUndefined()
  })
  it('música y formato sobreviven a guardar y abrir', () => {
    const s = new Store(createProject('t'))
    execBatch(s, [{ op: 'import_asset', asset: video }, { op: 'import_asset', asset: song },
      { op: 'set_music', asset: 'a2', src_in: 10.29, volume: 0.9, fade_out: 0.9 }, { op: 'set_format', width: 1080, height: 1920 }])
    const back = parseProject(serialize(s.project))
    expect(back.music).toEqual({ assetId: 'a2', srcIn: 10.29, volume: 0.9, fadeOut: 0.9 })
    expect(back.format).toMatchObject({ width: 1080, height: 1920 })
  })
  it('rechaza música de un asset inexistente', () => {
    const s = new Store(createProject('t'))
    expect(exec(s, { op: 'set_music', asset: 'nada' })).toMatch(/no encontrado/)
  })
  it('fxAt: el punch arranca con zoom y se asienta; el destello se apaga', () => {
    expect(fxAt('punch', undefined, 0, 1).zoom).toBeCloseTo(1.22)
    expect(fxAt('punch', undefined, 0.5, 1).zoom).toBeCloseTo(1.025)
    expect(fxAt('dropflash', undefined, 0, 1).flash).toBeCloseTo(0.9)
    expect(fxAt('dropflash', undefined, 0.3, 1).flash).toBe(0)
    expect(fxAt('slide', -1, 0, 1).shift).toBe(-1)
    expect(fxAt(undefined, undefined, 0.3, 1)).toEqual({ zoom: 1, shift: 0, flash: 0 })
  })
})
