import type { Clip, OverlayClip, Project } from './types'

/** Duración mínima de cualquier tramo (≈ 2 frames a 30 fps). */
export const MIN_DUR = 1 / 15

export const clipDur = (c: Clip) => (c.srcOut - c.srcIn) / c.speed

export interface Placed { clip: Clip; start: number; end: number }

/** Posiciona los clips de la pista principal uno tras otro. */
export function layout(p: Project): Placed[] {
  let t = 0
  return p.clips.map(clip => {
    const start = t
    t += clipDur(clip)
    return { clip, start, end: t }
  })
}

/** Duración de la pista principal. */
export const mainDuration = (p: Project) => p.clips.reduce((s, c) => s + clipDur(c), 0)

export const overlayDur = (o: OverlayClip) => (o.srcOut - o.srcIn) / o.speed
export const overlayEnd = (o: OverlayClip) => o.start + overlayDur(o)

/** Duración total: lo más lejos que llega la pista principal o cualquier clip superpuesto. */
export const duration = (p: Project) => (p.overlays ?? []).reduce((m, o) => Math.max(m, overlayEnd(o)), mainDuration(p))

/** Número de pistas usadas por un tipo (video o audio). */
export const trackCount = (p: Project, kind: OverlayClip['kind']) => (p.overlays ?? []).reduce((m, o) => (o.kind === kind ? Math.max(m, o.track) : m), 0)

/**
 * Primera pista (desde `from`) donde cabe [start, end) sin pisar a otro clip del mismo tipo.
 * Si todas están ocupadas devuelve una nueva: así "se abre otra pista" al superponer.
 */
export function freeTrack(p: Project, kind: OverlayClip['kind'], start: number, end: number, from = 1, ignoreId?: string): number {
  for (let t = Math.max(from, 1); ; t++) {
    const busy = (p.overlays ?? []).some(o => o.kind === kind && o.track === t && o.id !== ignoreId && o.start < end - 1e-6 && overlayEnd(o) > start + 1e-6)
    if (!busy) return t
  }
}

/** ¿Qué clip y qué tiempo del archivo fuente corresponden a un tiempo de la línea de tiempo? */
export function locate(p: Project, t: number): { placed: Placed; srcTime: number } | null {
  const l = layout(p)
  if (!l.length) return null
  const md = mainDuration(p)
  if (t > md + 1e-3) return null     // pasado el final de la pista principal (solo siguen los clips superpuestos)
  const tt = Math.min(Math.max(t, 0), md - 1e-4)
  const placed = l.find(x => tt >= x.start && tt < x.end) ?? l[l.length - 1]
  return { placed, srcTime: placed.clip.srcIn + (tt - placed.start) * placed.clip.speed }
}
