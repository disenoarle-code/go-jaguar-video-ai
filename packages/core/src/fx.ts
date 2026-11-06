import type { ClipFx } from './types'

/** Estado visual de un efecto de clip en el instante `t` (s desde el inicio del clip) de un clip que dura `dur`. */
export interface FxState {
  zoom: number     // 1 = sin zoom
  shift: number    // -1..1: desplazamiento horizontal como fracción del margen que deja el zoom
  flash: number    // 0..1: destello blanco
}

const ease = (t: number, d: number) => Math.pow(Math.max(0, 1 - t / d), 2)

/** Misma fórmula que usa el render final (experiments/render): lo que ves en el editor es lo que sale en el MP4. */
export function fxAt(fx: ClipFx | undefined, dir: 1 | -1 | undefined, t: number, dur: number, last = false): FxState {
  const p = dur > 0 ? t / dur : 0
  switch (fx) {
    case 'push': return { zoom: 1 + (last ? 0.22 : 0.14) * p, shift: 0, flash: 0 }
    case 'punch': return { zoom: 1 + 0.22 * ease(t, 0.35) + 0.05 * p, shift: 0, flash: 0 }
    case 'slide': return { zoom: 1.22 + 0.06 * p, shift: (dir ?? 1) * ease(t, 0.22), flash: 0 }
    case 'punchflash': return { zoom: 1 + 0.2 * ease(t, 0.3) + 0.05 * p, shift: 0, flash: 0.55 * ease(t, 0.15) }
    case 'dropflash': return { zoom: 1 + 0.35 * ease(t, 0.5) + 0.06 * p, shift: 0, flash: 0.9 * ease(t, 0.15) }
    default: return { zoom: 1, shift: 0, flash: 0 }
  }
}
