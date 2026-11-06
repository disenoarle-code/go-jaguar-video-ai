import type { Clip, Project } from './types'

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

export const duration = (p: Project) => p.clips.reduce((s, c) => s + clipDur(c), 0)

/** ¿Qué clip y qué tiempo del archivo fuente corresponden a un tiempo de la línea de tiempo? */
export function locate(p: Project, t: number): { placed: Placed; srcTime: number } | null {
  const l = layout(p)
  if (!l.length) return null
  const tt = Math.min(Math.max(t, 0), duration(p) - 1e-4)
  const placed = l.find(x => tt >= x.start && tt < x.end) ?? l[l.length - 1]
  return { placed, srcTime: placed.clip.srcIn + (tt - placed.start) * placed.clip.speed }
}
