import { describe as suite, expect, it } from 'vitest'
import {
  Store, createProject, exec, execBatch, describe, duration, layout, locate,
  type AssetInfo, type Cmd,
} from '../src'

const asset: AssetInfo = { id: 'a1', name: 'demo', proxy: 'p.mp4', original: 'o.mov', duration: 100, fps: 30, width: 1280, height: 720 }

function fresh() {
  const s = new Store(createProject('t'))
  exec(s, { op: 'import_asset', asset })
  exec(s, { op: 'add_clip', asset: 'a1' })
  return s
}
const total = (s: Store) => duration(s.project)

suite('importar y añadir', () => {
  it('añade un clip con el asset completo', () => {
    const s = fresh()
    expect(s.project.clips).toHaveLength(1)
    expect(total(s)).toBeCloseTo(100)
  })
  it('no duplica un asset ni acepta uno inexistente', () => {
    const s = fresh()
    expect(exec(s, { op: 'import_asset', asset })).toMatch(/ya existe/)
    expect(exec(s, { op: 'add_clip', asset: 'zzz' })).toMatch(/no encontrado/)
  })
})

suite('split', () => {
  it('corta en dos sin cambiar la duración', () => {
    const s = fresh()
    exec(s, { op: 'split', at: 40 })
    expect(s.project.clips).toHaveLength(2)
    expect(s.project.clips[0].srcOut).toBeCloseTo(40)
    expect(s.project.clips[1].srcIn).toBeCloseTo(40)
    expect(total(s)).toBeCloseTo(100)
  })
  it('respeta la velocidad al convertir tiempo de línea a tiempo de fuente', () => {
    const s = fresh()
    exec(s, { op: 'speed_all', value: 2 })          // 100 s de fuente = 50 s de línea
    exec(s, { op: 'split', at: 10 })                // 10 s de línea = 20 s de fuente
    expect(s.project.clips[0].srcOut).toBeCloseTo(20)
  })
  it('no corta en un borde', () => {
    const s = fresh()
    expect(exec(s, { op: 'split', at: 0 })).toMatch(/no se puede/)
    expect(s.project.clips).toHaveLength(1)
  })
})

suite('delete_range (ripple)', () => {
  it('borra un tramo central y cierra el hueco', () => {
    const s = fresh()
    exec(s, { op: 'delete_range', from: 20, to: 30 })
    expect(total(s)).toBeCloseTo(90)
    expect(s.project.clips).toHaveLength(2)
    expect(locate(s.project, 20.5)!.srcTime).toBeCloseTo(30.5)   // salta al segundo 30 de la fuente
  })
  it('borra desde el inicio y hasta el final', () => {
    const s = fresh()
    exec(s, { op: 'delete_range', from: 0, to: 10 })
    exec(s, { op: 'delete_range', from: 80, to: 90 })
    expect(total(s)).toBeCloseTo(80)
    expect(s.project.clips[0].srcIn).toBeCloseTo(10)
  })
  it('borra un rango que abarca varios clips', () => {
    const s = fresh()
    exec(s, { op: 'split', at: 30 }); exec(s, { op: 'split', at: 60 })
    exec(s, { op: 'delete_range', from: 20, to: 70 })
    expect(total(s)).toBeCloseTo(50)
    const l = layout(s.project)
    expect(l[l.length - 1].end).toBeCloseTo(50)
  })
  it('desplaza, recorta o elimina las capas según el ripple', () => {
    const s = fresh()
    exec(s, { op: 'add_text', type: 'subtitle', start: 5, end: 8, text: 'antes' })
    exec(s, { op: 'add_text', type: 'subtitle', start: 50, end: 55, text: 'después' })
    exec(s, { op: 'add_text', type: 'subtitle', start: 21, end: 22, text: 'dentro' })
    exec(s, { op: 'delete_range', from: 20, to: 30 })
    const byText = (t: string) => s.project.layers.find(l => 'text' in l && l.text === t)
    expect(byText('antes')!.start).toBeCloseTo(5)
    expect(byText('después')!.start).toBeCloseTo(40)
    expect(byText('dentro')).toBeUndefined()
  })
})

suite('delete_ranges (lote)', () => {
  it('equivale a borrar uno por uno, sin importar el orden recibido', () => {
    const ranges: [number, number][] = [[50, 55], [10, 12], [30, 31]]
    const a = fresh(); exec(a, { op: 'delete_ranges', ranges })
    // Los rangos del lote se interpretan en la línea de tiempo ORIGINAL; uno por uno hay que ir de atrás hacia adelante.
    const b = fresh(); for (const [f, t] of [[50, 55], [30, 31], [10, 12]]) exec(b, { op: 'delete_range', from: f, to: t })
    expect(total(a)).toBeCloseTo(100 - 8)
    const spans = (s: ReturnType<typeof fresh>) => s.project.clips.map(c => [c.srcIn, c.srcOut])
    expect(spans(a)).toEqual([[0, 10], [12, 30], [31, 50], [55, 100]])
    expect(spans(a)).toEqual(spans(b))
  })
  it('es UNA sola entrada de historial', () => {
    const s = fresh()
    exec(s, { op: 'delete_ranges', ranges: [[10, 12], [30, 31]] })
    s.undo()
    expect(total(s)).toBeCloseTo(100)
    expect(s.project.clips).toHaveLength(1)
  })
})

suite('velocidad, volumen, orden y recorte', () => {
  it('speed_all cambia la duración', () => {
    const s = fresh(); exec(s, { op: 'speed_all', value: 1.1 })
    expect(total(s)).toBeCloseTo(100 / 1.1)
  })
  it('limita la velocidad a 0.1–8', () => {
    const s = fresh(); exec(s, { op: 'speed', clip: 'c1', value: 99 })
    expect(s.project.clips[0].speed).toBe(8)
  })
  it('move_clip reordena', () => {
    const s = fresh(); exec(s, { op: 'split', at: 30 })
    const [a, b] = s.project.clips.map(c => c.id)
    exec(s, { op: 'move_clip', id: a, to_index: 1 })
    expect(s.project.clips.map(c => c.id)).toEqual([b, a])
  })
  it('trim respeta límites', () => {
    const s = fresh()
    exec(s, { op: 'trim', id: 'c1', edge: 'in', src_time: 10 })
    exec(s, { op: 'trim', id: 'c1', edge: 'out', src_time: 999 })
    expect(s.project.clips[0].srcIn).toBeCloseTo(10)
    expect(s.project.clips[0].srcOut).toBeCloseTo(100)    // no pasa de la duración del asset
  })
})

suite('capas', () => {
  it('add_text, update_layer (con transform parcial) y delete_layer', () => {
    const s = fresh()
    exec(s, { op: 'add_text', type: 'graphic', start: 1, end: 3, text: 'Hola' })
    const id = s.project.layers[0].id
    exec(s, { op: 'update_layer', id, patch: { text: 'Chao', transform: { x: 0.7 } } })
    const l = s.project.layers[0] as any
    expect(l.text).toBe('Chao'); expect(l.transform.x).toBe(0.7); expect(l.transform.y).toBeCloseTo(0.18)
    exec(s, { op: 'delete_layer', id })
    expect(s.project.layers).toHaveLength(0)
  })
  it('el modelo admite capas de otros tipos (imagen, 3D, recorte)', () => {
    const s = fresh()
    exec(s, { op: 'add_layer', layer: { type: 'scene3d', start: 0, end: 5, template: 'capas', params: { n: 5 } } })
    exec(s, { op: 'add_layer', layer: { type: 'image', start: 5, end: 8, assetId: 'a1', transform: { scale: 0.5 } } })
    exec(s, { op: 'add_layer', layer: { type: 'cutout', start: 0, end: 8, clipId: 'c1', model: 'rvm' } })
    expect(s.project.layers.map(l => l.type)).toEqual(['scene3d', 'image', 'cutout'])
    expect(s.project.layers[1].transform.scale).toBe(0.5)
    expect(s.project.layers[1].transform.opacity).toBe(1)
  })
})

suite('historial', () => {
  it('deshacer y rehacer', () => {
    const s = fresh()
    exec(s, { op: 'delete_range', from: 10, to: 20 })
    expect(total(s)).toBeCloseTo(90)
    s.undo(); expect(total(s)).toBeCloseTo(100)
    s.redo(); expect(total(s)).toBeCloseTo(90)
  })
  it('una acción nueva descarta el rehacer', () => {
    const s = fresh()
    exec(s, { op: 'speed_all', value: 2 }); s.undo()
    exec(s, { op: 'speed_all', value: 3 })
    expect(s.canRedo).toBe(false)
  })
  it('execBatch es una sola entrada', () => {
    const s = fresh()
    execBatch(s, [{ op: 'split', at: 10 }, { op: 'split', at: 20 }, { op: 'speed_all', value: 1.5 }] as Cmd[])
    expect(s.project.clips).toHaveLength(3)
    s.undo()
    expect(s.project.clips).toHaveLength(1)
    expect(s.project.clips[0].speed).toBe(1)
  })
  it('los arrastres (tx) crean una sola entrada', () => {
    const s = fresh()
    s.beginTx()
    for (let i = 1; i <= 10; i++) s.live(p => { p.clips[0].srcOut = 100 - i })
    s.endTx()
    expect(s.project.clips[0].srcOut).toBe(90)
    s.undo()
    expect(s.project.clips[0].srcOut).toBe(100)
  })
})

suite('describe (resumen para Claude)', () => {
  it('agrupa clips consecutivos para no crecer con cada corte', () => {
    const s = fresh()
    exec(s, { op: 'delete_ranges', ranges: Array.from({ length: 50 }, (_, i) => [i * 2 + 1, i * 2 + 1.5] as [number, number]) })
    expect(s.project.clips.length).toBeGreaterThan(40)
    expect(describe(s).split('\n').length).toBeLessThan(6)
    expect(describe(s)).toMatch(/clips demo/)
  })
})

suite('ripple de superpuestos, karaoke y recortes de borde', () => {
  const conKaraoke = () => {
    const s = fresh()
    exec(s, { op: 'add_layer', layer: { type: 'subtitle', start: 50, end: 52, text: 'x', size: 54, color: '#fff', template: 'karaoke', props: { palabras: JSON.stringify([['hola', 50, 51], ['mundo', 51, 52]]) } } })
    return s
  }
  it('delete_range mueve también las palabras del karaoke', () => {
    const s = conKaraoke(); exec(s, { op: 'delete_range', from: 20, to: 30 })
    const l = s.project.layers[0] as unknown as { start: number; props: { palabras: string } }
    expect(l.start).toBeCloseTo(40); expect(JSON.parse(l.props.palabras)[1][1]).toBeCloseTo(41)
  })
  it('trim del borde de salida corre capas, palabras y sonidos como un borrado', () => {
    const s = conKaraoke(); exec(s, { op: 'split', at: 30 }); const c = s.project.clips[0]
    exec(s, { op: 'trim', id: c.id, edge: 'out', src_time: 20 })
    const l = s.project.layers[0] as unknown as { start: number; props: { palabras: string } }
    expect(l.start).toBeCloseTo(40); expect(JSON.parse(l.props.palabras)[0][1]).toBeCloseTo(40)
  })
})

suite('sincronizarPalabras (cambiar el texto de un karaoke)', () => {
  const crear = () => {
    const s = fresh()
    exec(s, { op: 'add_layer', layer: { type: 'subtitle', start: 1, end: 5, text: 'hola mundo cruel', size: 54, color: '#fff', template: 'karaoke', props: { palabras: JSON.stringify([['hola', 1, 2], ['mundo', 2, 3], ['cruel', 3, 4]]) } } })
    return s
  }
  const pal = (s: ReturnType<typeof fresh>) => JSON.parse((s.project.layers[0] as unknown as { props: { palabras: string } }).props.palabras) as [string, number, number][]
  it('cambiar una palabra conserva los tiempos', () => {
    const s = crear(); exec(s, { op: 'update_layer', id: s.project.layers[0].id, patch: { text: 'hola gente cruel' } })
    expect(pal(s)).toEqual([['hola', 1, 2], ['gente', 2, 3], ['cruel', 3, 4]])
  })
  it('agregar y quitar palabras reparte el hueco sin mover las demás', () => {
    const s = crear(); exec(s, { op: 'update_layer', id: s.project.layers[0].id, patch: { text: 'hola querido mundo cruel' } })
    const p = pal(s); expect(p.map(x => x[0])).toEqual(['hola', 'querido', 'mundo', 'cruel'])
    expect(p[0][1]).toBe(1); expect(p[2]).toEqual(['mundo', 2, 3]); expect(p[1][1]).toBeGreaterThanOrEqual(2 - 1e-6 - 1)
    exec(s, { op: 'update_layer', id: s.project.layers[0].id, patch: { text: 'mundo cruel' } })
    expect(pal(s)).toEqual([['mundo', 2, 3], ['cruel', 3, 4]])
  })
})

suite('set_clip_transform', () => {
  it('mueve, agranda y gira el video sin deformarlo; los valores por defecto limpian la transformación', () => {
    const store = fresh(), id = store.project.clips[0].id
    exec(store, { op: 'set_clip_transform', clip: id, transform: { scale: 1.5, rotation: 190, x: 0.4 } })
    expect(store.project.clips[0].transform).toEqual({ x: 0.4, y: 0.5, scale: 1.5, rotation: -170 })
    exec(store, { op: 'set_clip_transform', clip: id, transform: { scale: 99 } })
    expect(store.project.clips[0].transform!.scale).toBe(8)
    exec(store, { op: 'set_clip_transform', clip: id, transform: null })
    expect(store.project.clips[0].transform).toBeUndefined()
  })
})

suite('set_clip_color y set_audio_fx', () => {
  it('limita los valores y limpia cuando todo vuelve a 1', () => {
    const store = fresh(), id = store.project.clips[0].id
    exec(store, { op: 'set_clip_color', clip: id, color: { brillo: 3, contraste: 1.2, saturacion: 1.1 } })
    expect(store.project.clips[0].color).toEqual({ brillo: 1.8, contraste: 1.2, saturacion: 1.1 })
    exec(store, { op: 'set_clip_color', clip: id, color: null })
    expect(store.project.clips[0].color).toBeUndefined()
    exec(store, { op: 'set_audio_fx', on: true })
    expect(store.project.mejoras?.audio).toBe(true)
  })
})

suite('capas: el fondo va debajo del texto', () => {
  it('un fondo agregado después queda primero en la lista (se dibuja antes)', () => {
    const store = fresh()
    exec(store, { op: 'add_layer', layer: { type: 'graphic', template: 'contador', text: '', size: 40, color: '#fff', start: 0, end: 2 } })
    exec(store, { op: 'add_layer', layer: { type: 'graphic', template: 'fondo', text: '', size: 40, color: '#000', start: 0, end: 2 } })
    expect(store.project.layers.map(l => (l.type === 'graphic' ? l.template : l.type))).toEqual(['fondo', 'contador'])
  })
})
