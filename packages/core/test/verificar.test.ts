import { describe, expect, it } from 'vitest'
import { Store, createProject, exec, execBatch, verificar, type AssetInfo } from '../src'

const vid: AssetInfo = { id: 'a1', name: 'v', proxy: 'p.mp4', original: 'o.mov', duration: 60, fps: 30, width: 640, height: 1138 }
const base = () => { const s = new Store(createProject('t')); execBatch(s, [{ op: 'import_asset', asset: vid }, { op: 'add_clip', asset: 'a1', src_in: 0, src_out: 20 }]); return s }

describe('verificar', () => {
  it('un clip de 20 s sin cambios incumple la regla de movimiento', () => {
    const r = verificar(base().project)
    expect(r.ok).toBe(false)
    expect(r.tramosQuietos).toEqual([{ desde: 0, hasta: 20 }])
  })
  it('partido en trozos con zoom distinto cumple', () => {
    const s = base()
    execBatch(s, [{ op: 'split', at: 6 }, { op: 'split', at: 12 }, { op: 'split', at: 16 }])
    const ids = s.project.clips.map(c => c.id)
    exec(s, { op: 'set_zoom', clip: ids[1], zoom: { kind: 'punch', amount: 0.15 } })
    exec(s, { op: 'set_zoom', clip: ids[3], zoom: { kind: 'push', amount: 0.1 } })
    const r = verificar(s.project)
    expect(r.tramosQuietos).toEqual([])
    expect(r.texto).toContain('✓ Movimiento')
  })
  it('avisa de toma de apoyo con audio', () => {
    const s = base()
    exec(s, { op: 'add_overlay', asset: 'a1', start: 2, src_in: 0, src_out: 3, volume: 1 })
    expect(verificar(s.project).avisos.join()).toContain('con audio')
  })
})
