import type { Clip, Transition, TransitionKind, ZoomFx, ZoomKind } from './types'

/** Estado visual de un clip en el instante `t` (s desde su inicio). */
export interface FxState {
  zoom: number     // 1 = sin zoom
  shift: number    // -1..1: desplazamiento horizontal como fracción del margen que deja el zoom
  flash: number    // >0 destello blanco, <0 oscurecer (fundido a negro), 0..1
}

export const ZOOM_DEFAULTS: Record<ZoomKind, { amount: number; duration?: number }> = {
  push: { amount: 0.14 }, pull: { amount: 0.14 }, punch: { amount: 0.22, duration: 0.35 },
}
export const TRANSITION_DEFAULTS: Record<TransitionKind, { duration: number; intensity: number }> = {
  slide: { duration: 0.44, intensity: 1 }, flash: { duration: 0.3, intensity: 1 }, dip: { duration: 0.5, intensity: 1 },
}
/** Límites de cada parámetro (los usan los comandos y el panel). */
export const LIMITS = { zoomAmount: [0.02, 0.8], zoomDuration: [0.05, 2], trDuration: [0.1, 2], trIntensity: [0.1, 1.5] } as const

const ease = (u: number) => Math.pow(Math.max(0, 1 - u), 2)
const SLIDE_ZOOM = 0.22, FLASH_PEAK = 0.9

/** Zoom del clip (se suma al de las transiciones). */
function zoomDelta(z: ZoomFx | undefined, t: number, dur: number) {
  if (!z) return 0
  const p = dur > 0 ? t / dur : 0
  if (z.kind === 'push') return z.amount * p
  if (z.kind === 'pull') return z.amount * (1 - p)
  return z.amount * ease(t / (z.duration ?? 0.35)) + 0.05 * p
}

/** Aporte de una transición. `e` = 1 justo en el corte y baja a 0 al terminar su mitad; `side` = +1 entrada, -1 salida. */
function apply(s: FxState, tr: Transition, e: number, side: 1 | -1) {
  if (e <= 0) return
  const k = tr.intensity * e
  if (tr.kind === 'slide') { s.zoom += SLIDE_ZOOM * k; s.shift += (side === 1 ? 1 : -1) * (tr.dir ?? 1) * e }
  else if (tr.kind === 'flash') s.flash += FLASH_PEAK * k
  else s.flash -= k
}

/**
 * Zoom + transición de entrada (la de este clip) + transición de salida (la del clip siguiente) en el instante `t`.
 * Mismas fórmulas que el render (server/exportar.ts): lo que ves en el editor es lo que sale en el MP4.
 */
export function fxAt(clip: Clip | undefined, next: Clip | undefined, t: number, dur: number): FxState {
  const s: FxState = { zoom: 1, shift: 0, flash: 0 }
  if (!clip) return s
  s.zoom += zoomDelta(clip.zoom, t, dur)
  if (clip.transition) apply(s, clip.transition, ease(t / (clip.transition.duration / 2)), 1)
  if (next?.transition) apply(s, next.transition, ease((dur - t) / (next.transition.duration / 2)), -1)
  s.flash = Math.max(-1, Math.min(1, s.flash))
  return s
}
