import { MIN_DUR, clipDur, duration, freeTrack, layout, overlayDur } from './timeline'
import type { Store } from './store'
import {
  DEFAULT_TRANSFORM, isTextLayer,
  CLIP_FX, type AssetInfo, type Clip, type ClipFx, type Layer, type Project, type TextLayer, type Transform,
} from './types'

/** Capa nueva sin id; el transform puede ser parcial. */
export type NewLayer = (Layer extends infer L ? L extends Layer ? Omit<L, 'id' | 'transform'> & { transform?: Partial<Transform> } : never : never)
export type OverlayPatch = { start?: number; track?: number; srcIn?: number; srcOut?: number; speed?: number; volume?: number; transform?: Partial<Transform> }
export type LayerPatch = { transform?: Partial<Transform>; [k: string]: unknown }

/**
 * Comandos de alto nivel. La interfaz y Claude (por MCP) usan exactamente estos.
 * Todos los tiempos son segundos. Los de lote reciben tiempos de la línea de tiempo ACTUAL.
 */
export type Cmd =
  | { op: 'import_asset'; asset: AssetInfo }
  | { op: 'add_clip'; asset: string; src_in?: number; src_out?: number; effect?: ClipFx; dir?: 1 | -1 }
  | { op: 'add_overlay'; asset: string; start: number; track?: number; src_in?: number; src_out?: number; x?: number; y?: number; scale?: number; volume?: number }
  | { op: 'update_overlay'; id: string; patch: OverlayPatch }
  | { op: 'delete_overlay'; id: string }
  | { op: 'set_effect'; clip: string; effect: ClipFx | null; dir?: 1 | -1 }
  | { op: 'set_music'; asset: string; src_in?: number; volume?: number; fade_out?: number }
  | { op: 'clear_music' }
  | { op: 'set_format'; width: number; height: number; fps?: number }
  | { op: 'split'; at: number }
  | { op: 'delete_range'; from: number; to: number }
  | { op: 'delete_ranges'; ranges: [number, number][] }
  | { op: 'delete_clip'; id: string }
  | { op: 'speed'; clip: string; value: number }
  | { op: 'speed_all'; value: number }
  | { op: 'volume'; clip: string; value: number }
  | { op: 'move_clip'; id: string; to_index: number }
  | { op: 'trim'; id: string; edge: 'in' | 'out'; src_time: number }
  | { op: 'add_text'; type: 'subtitle' | 'graphic'; start: number; end: number; text: string; x?: number; y?: number; size?: number; color?: string }
  | { op: 'add_layer'; layer: NewLayer }
  | { op: 'update_layer'; id: string; patch: LayerPatch }
  | { op: 'delete_layer'; id: string }

const f2 = (n: number) => n.toFixed(2)
const clamp = (v: number, a: number, b: number) => Math.min(Math.max(v, a), b)

/** Ejecuta un comando como UNA entrada de historial. Devuelve un resumen de una línea. */
export function exec(store: Store, cmd: Cmd): string {
  let msg = 'sin cambios'
  store.mutate(p => { msg = apply(store, p, cmd) })
  return msg
}

/** Ejecuta varios comandos como UNA sola entrada de historial. */
export function execBatch(store: Store, cmds: Cmd[]): string[] {
  const out: string[] = []
  store.mutate(p => { for (const c of cmds) out.push(apply(store, p, c)) })
  return out
}

function apply(store: Store, p: Project, cmd: Cmd): string {
  switch (cmd.op) {
    case 'import_asset': {
      if (p.assets.some(a => a.id === cmd.asset.id)) return `asset ${cmd.asset.id} ya existe`
      p.assets.push(cmd.asset)
      return `asset ${cmd.asset.id} importado (${cmd.asset.name})`
    }
    case 'add_clip': {
      const a = p.assets.find(x => x.id === cmd.asset)
      if (!a) return 'asset no encontrado'
      const srcIn = clamp(cmd.src_in ?? 0, 0, a.duration)
      const srcOut = clamp(cmd.src_out ?? a.duration, srcIn, a.duration)
      if (srcOut - srcIn < MIN_DUR) return 'tramo demasiado corto'
      const c: Clip = { id: store.newId('c'), assetId: a.id, srcIn, srcOut, speed: 1, volume: 1, ...(cmd.effect ? { fx: cmd.effect, fxDir: cmd.dir } : {}) }
      p.clips.push(c)
      return `${c.id} añadido (${a.name} ${f2(srcIn)}–${f2(srcOut)})`
    }
    case 'add_overlay': {
      const a = p.assets.find(x => x.id === cmd.asset)
      if (!a) return 'asset no encontrado'
      const kind: 'audio' | 'video' = a.kind === 'audio' ? 'audio' : 'video'
      const srcIn = clamp(cmd.src_in ?? 0, 0, a.duration)
      const srcOut = clamp(cmd.src_out ?? a.duration, srcIn, a.duration)
      if (srcOut - srcIn < MIN_DUR) return 'tramo demasiado corto'
      const start = Math.max(cmd.start, 0)
      const track = freeTrack(p, kind, start, start + (srcOut - srcIn), cmd.track ?? 1)
      const o = { id: store.newId('o'), assetId: a.id, kind, track, start, srcIn, srcOut, speed: 1, volume: clamp(cmd.volume ?? 1, 0, 4),
        transform: { ...DEFAULT_TRANSFORM, x: cmd.x ?? 0.5, y: cmd.y ?? 0.5, scale: cmd.scale ?? (kind === 'video' ? 0.5 : 1) } }
      ;(p.overlays ??= []).push(o)
      return `${o.id} ${kind} en pista ${track} desde ${f2(start)}s (${a.name})`
    }
    case 'update_overlay': {
      const o = p.overlays?.find(x => x.id === cmd.id)
      if (!o) return 'clip superpuesto no encontrado'
      const { transform, ...rest } = cmd.patch
      const a = p.assets.find(x => x.id === o.assetId)
      Object.assign(o, rest)
      if (a) { o.srcIn = clamp(o.srcIn, 0, a.duration); o.srcOut = clamp(o.srcOut, o.srcIn + MIN_DUR * o.speed, a.duration) }
      o.start = Math.max(o.start, 0); o.speed = clamp(o.speed, 0.1, 8); o.volume = clamp(o.volume, 0, 4)
      if (transform) o.transform = { ...o.transform, ...transform }
      if (cmd.patch.start !== undefined || cmd.patch.track !== undefined || cmd.patch.srcIn !== undefined || cmd.patch.srcOut !== undefined || cmd.patch.speed !== undefined)
        o.track = freeTrack(p, o.kind, o.start, o.start + overlayDur(o), cmd.patch.track ?? o.track, o.id)   // si pisa a otro, se abre otra pista
      return `${o.id} actualizado (pista ${o.track}, ${f2(o.start)}s)`
    }
    case 'delete_overlay': {
      const n = p.overlays?.length ?? 0
      p.overlays = (p.overlays ?? []).filter(x => x.id !== cmd.id)
      if (store.selection?.id === cmd.id) store.selection = null
      return n === p.overlays.length ? 'clip superpuesto no encontrado' : `${cmd.id} eliminado`
    }
    case 'set_effect': {
      const c = p.clips.find(x => x.id === cmd.clip)
      if (!c) return 'clip no encontrado'
      if (cmd.effect && !CLIP_FX.includes(cmd.effect)) return `efecto desconocido (${CLIP_FX.join(', ')})`
      if (cmd.effect) { c.fx = cmd.effect; c.fxDir = cmd.dir ?? c.fxDir } else { delete c.fx; delete c.fxDir }
      return `${c.id} efecto ${cmd.effect ?? 'ninguno'}`
    }
    case 'set_music': {
      const a = p.assets.find(x => x.id === cmd.asset)
      if (!a) return 'asset no encontrado'
      p.music = { assetId: a.id, srcIn: clamp(cmd.src_in ?? 0, 0, a.duration), volume: clamp(cmd.volume ?? 1, 0, 4), fadeOut: clamp(cmd.fade_out ?? 0.9, 0, 10) }
      return `música ${a.name} desde ${f2(p.music.srcIn)}s`
    }
    case 'clear_music': { delete p.music; return 'música quitada' }
    case 'set_format': {
      p.format = { width: Math.round(clamp(cmd.width, 16, 8192)), height: Math.round(clamp(cmd.height, 16, 8192)), fps: cmd.fps ?? p.format.fps }
      return `formato ${p.format.width}x${p.format.height}`
    }
    case 'split': {
      const hit = layout(p).find(x => cmd.at > x.start + MIN_DUR && cmd.at < x.end - MIN_DUR)
      if (!hit) return 'no se puede cortar ahí (borde del clip)'
      const srcAt = hit.clip.srcIn + (cmd.at - hit.start) * hit.clip.speed
      const right: Clip = { ...hit.clip, id: store.newId('c'), srcIn: srcAt }
      hit.clip.srcOut = srcAt
      p.clips.splice(p.clips.indexOf(hit.clip) + 1, 0, right)
      return `corte en ${f2(cmd.at)}s → ${hit.clip.id} | ${right.id}`
    }
    case 'delete_range': {
      const { from, to } = cmd
      if (to - from < 1e-3) return 'rango vacío'
      const out: Clip[] = []
      for (const { clip, start, end } of layout(p)) {
        const pieces: [number, number][] = []
        if (from > start) pieces.push([start, Math.min(end, from)])
        if (to < end) pieces.push([Math.max(start, to), end])
        pieces.forEach(([a, b], i) => {
          if (b - a < MIN_DUR) return
          out.push({
            ...clip,
            id: i === 0 ? clip.id : store.newId('c'),
            srcIn: clip.srcIn + (a - start) * clip.speed,
            srcOut: clip.srcIn + (b - start) * clip.speed,
          })
        })
      }
      p.clips = out
      // Las capas se desplazan con el ripple.
      const d = to - from
      p.layers = p.layers.flatMap(l => {
        if (l.end <= from) return [l]
        if (l.start >= to) return [{ ...l, start: l.start - d, end: l.end - d }]
        const s = Math.min(l.start, from)
        const e = l.end > to ? l.end - d : from
        return e - s < 0.1 ? [] : [{ ...l, start: s, end: e }]
      })
      return `borrado ${f2(from)}–${f2(to)}s (ripple, ${f2(d)}s)`
    }
    case 'delete_ranges': {
      // De atrás hacia adelante para que el ripple no desplace los rangos pendientes.
      const rs = [...cmd.ranges].sort((a, b) => b[0] - a[0])
      let removed = 0
      for (const [from, to] of rs) { apply(store, p, { op: 'delete_range', from, to }); removed += to - from }
      return `${rs.length} cortes, ${f2(removed)}s eliminados`
    }
    case 'delete_clip': {
      const placed = layout(p).find(x => x.clip.id === cmd.id)
      if (!placed) return 'clip no encontrado'
      return apply(store, p, { op: 'delete_range', from: placed.start, to: placed.end })
    }
    case 'speed': {
      const c = p.clips.find(x => x.id === cmd.clip)
      if (!c) return 'clip no encontrado'
      c.speed = clamp(cmd.value, 0.1, 8)
      return `${c.id} velocidad x${c.speed}`
    }
    case 'speed_all': {
      const v = clamp(cmd.value, 0.1, 8)
      p.clips.forEach(c => { c.speed = v })
      return `${p.clips.length} clips a x${v}`
    }
    case 'volume': {
      const c = p.clips.find(x => x.id === cmd.clip)
      if (!c) return 'clip no encontrado'
      c.volume = clamp(cmd.value, 0, 4)
      return `${c.id} volumen ${c.volume}`
    }
    case 'move_clip': {
      const i = p.clips.findIndex(x => x.id === cmd.id)
      if (i < 0) return 'clip no encontrado'
      const [c] = p.clips.splice(i, 1)
      p.clips.splice(clamp(cmd.to_index, 0, p.clips.length), 0, c)
      return `${c.id} movido a posición ${p.clips.indexOf(c)}`
    }
    case 'trim': {
      const c = p.clips.find(x => x.id === cmd.id)
      if (!c) return 'clip no encontrado'
      const total = p.assets.find(a => a.id === c.assetId)?.duration ?? Infinity
      const minSrc = MIN_DUR * c.speed
      if (cmd.edge === 'in') c.srcIn = Math.min(Math.max(cmd.src_time, 0), c.srcOut - minSrc)
      else c.srcOut = Math.max(Math.min(cmd.src_time, total), c.srcIn + minSrc)
      return `${c.id} recortado (${cmd.edge}) → ${f2(c.srcIn)}–${f2(c.srcOut)}`
    }
    case 'add_text': {
      const sub = cmd.type === 'subtitle'
      const layer = {
        id: store.newId(sub ? 's' : 'g'),
        type: cmd.type, start: cmd.start, end: cmd.end, text: cmd.text,
        ...(sub ? {} : { template: 'lowerthird' }),
        size: cmd.size ?? (sub ? 54 : 44),
        color: cmd.color ?? (sub ? '#ffffff' : '#ff3d6e'),
        transform: { ...DEFAULT_TRANSFORM, x: cmd.x ?? (sub ? 0.5 : 0.28), y: cmd.y ?? (sub ? 0.85 : 0.18) },
      } as TextLayer
      p.layers.push(layer)
      store.selection = { type: 'layer', id: layer.id }
      return `${layer.id} añadido ${f2(layer.start)}–${f2(layer.end)}s "${layer.text}"`
    }
    case 'add_layer': {
      const l = { ...cmd.layer, id: store.newId('l'), transform: { ...DEFAULT_TRANSFORM, ...cmd.layer.transform } } as Layer
      p.layers.push(l)
      return `${l.id} (${l.type}) añadido ${f2(l.start)}–${f2(l.end)}s`
    }
    case 'update_layer': {
      const l = p.layers.find(x => x.id === cmd.id)
      if (!l) return 'capa no encontrada'
      const { transform, ...rest } = cmd.patch
      Object.assign(l, rest)
      if (transform) l.transform = { ...l.transform, ...transform }
      return `${l.id} actualizado`
    }
    case 'delete_layer': {
      const n = p.layers.length
      p.layers = p.layers.filter(x => x.id !== cmd.id)
      if (store.selection?.id === cmd.id) store.selection = null
      return n === p.layers.length ? 'capa no encontrada' : `${cmd.id} eliminada`
    }
  }
}

const tc = (t: number) => `${Math.floor(t / 60)}:${(t % 60).toFixed(2).padStart(5, '0')}`

/**
 * Resumen compacto del proyecto (lo que lee Claude). Los clips consecutivos del mismo
 * archivo con la misma velocidad se agrupan para que el tamaño no crezca con cada corte.
 */
export function describe(store: Store): string {
  const p = store.project
  const placed = layout(p)
  const lines = [`"${p.name}" ${p.format.width}x${p.format.height}@${p.format.fps} · ${tc(duration(p))} · ${p.clips.length} clips · ${p.layers.length} capas${p.overlays?.length ? ` · ${p.overlays.length} superpuestos` : ''}${p.music ? ` · música ${store.asset(p.music.assetId)?.name ?? p.music.assetId} desde ${f2(p.music.srcIn)}s` : ''}`]
  let i = 0
  while (i < placed.length) {
    let j = i
    while (j + 1 < placed.length
      && placed[j + 1].clip.assetId === placed[i].clip.assetId
      && placed[j + 1].clip.speed === placed[i].clip.speed
      && placed[j + 1].clip.volume === placed[i].clip.volume
      && placed[j + 1].clip.fx === placed[i].clip.fx) j++
    const a = store.asset(placed[i].clip.assetId)
    const first = placed[i], last = placed[j]
    const n = j - i + 1
    lines.push(n === 1
      ? `${first.clip.id} [${tc(first.start)}–${tc(first.end)}] ${a?.name ?? first.clip.assetId} src ${f2(first.clip.srcIn)}–${f2(first.clip.srcOut)} x${first.clip.speed} vol${first.clip.volume}${first.clip.fx ? ` fx:${first.clip.fx}` : ''}`
      : `${first.clip.id}…${last.clip.id} [${tc(first.start)}–${tc(last.end)}] ${n} clips ${a?.name ?? first.clip.assetId} x${first.clip.speed} vol${first.clip.volume}`)
    i = j + 1
  }
  for (const o of [...(p.overlays ?? [])].sort((a, b) => a.kind.localeCompare(b.kind) || a.track - b.track || a.start - b.start))
    lines.push(`${o.id} ${o.kind === 'video' ? 'video' : 'audio'} pista ${o.track} [${tc(o.start)}–${tc(o.start + overlayDur(o))}] ${store.asset(o.assetId)?.name ?? o.assetId} src ${f2(o.srcIn)}–${f2(o.srcOut)} vol${o.volume}${o.kind === 'video' ? ` @(${f2(o.transform.x)},${f2(o.transform.y)}) ×${f2(o.transform.scale)}` : ''}`)
  for (const l of [...p.layers].sort((a, b) => a.start - b.start)) {
    const t = l.transform
    lines.push(`${l.id} ${l.type} [${tc(l.start)}–${tc(l.end)}] ${isTextLayer(l) ? `"${l.text}" ` : ''}@(${f2(t.x)},${f2(t.y)})`)
  }
  return lines.join('\n')
}
