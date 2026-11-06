import { interpolate, spring, useCurrentFrame, useVideoConfig } from 'remotion'
import { sec } from './theme'

/** Vida de un elemento entre t0 y t1 (segundos): entra con rebote y sale encogiéndose. */
export function useLife(t0: number, t1: number) {
  const frame = useCurrentFrame()
  const { fps } = useVideoConfig()
  const s = sec(t0), e = sec(t1)
  const pop = spring({ frame: frame - s, fps, config: { damping: 11, stiffness: 140, mass: 0.8 } })
  const out = interpolate(frame, [e - 8, e], [1, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' })
  return { visible: frame >= s && frame <= e, pop, k: Math.max(pop, 0) * out, t: (frame - s) / fps, frame }
}
