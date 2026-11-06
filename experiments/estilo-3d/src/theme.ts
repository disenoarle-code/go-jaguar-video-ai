import { Easing, interpolate, interpolateColors } from 'remotion'

export const FPS = 30
export const DURATION_FRAMES = 832
export const sec = (s: number) => Math.round(s * FPS)
export const FONT = '"Arial Black","Helvetica Neue",Impact,sans-serif'

/** Secciones de color: el fondo, las luces y el brillo del contorno cambian con lo que se dice. */
export const SECTIONS = [
  { t: 0.0,  dark: '#0d0524', glow: '#3b1190', accent: '#b46bff' },
  { t: 2.7,  dark: '#1a0420', glow: '#8a1566', accent: '#ff2e9a' },   // precio
  { t: 6.3,  dark: '#1b1405', glow: '#7a5a00', accent: '#ffd23f' },   // 60 dólares
  { t: 8.3,  dark: '#1c0615', glow: '#a3123f', accent: '#ff4d6d' },   // descuento
  { t: 10.9, dark: '#031a14', glow: '#0b7a5a', accent: '#2effb0' },   // 50 → 45
  { t: 13.4, dark: '#04112b', glow: '#0a3fa8', accent: '#27a9ff' },   // colombia
  { t: 16.2, dark: '#1a0d05', glow: '#8a4a14', accent: '#ff9a3c' },   // tabla
  { t: 18.9, dark: '#1f0505', glow: '#b3200f', accent: '#ff5a36' },   // ticket alto
  { t: 21.6, dark: '#0d0524', glow: '#3b1190', accent: '#b46bff' },   // qué hacer
  { t: 25.5, dark: '#070707', glow: '#7d0b0b', accent: '#ff2a2a' },   // no bajar
  { t: 27.8, dark: '#070707', glow: '#7d0b0b', accent: '#ff2a2a' },
]
const frames = SECTIONS.map(s => sec(s.t))
export const colorAt = (frame: number, key: 'dark' | 'glow' | 'accent') =>
  interpolateColors(frame, frames, SECTIONS.map(s => s[key]))

/** Zooms dramáticos sobre la persona: `peak` = cuánto se agrega a la escala base, `hold` = segundos que se mantiene. */
export const BASE_SCALE = 1.1
export const ZOOMS = [
  { t: 1.05, peak: 0.14, hold: 0.5 },   // objeción
  { t: 2.8,  peak: 0.30, hold: 1.1 },   // precio
  { t: 6.45, peak: 0.26, hold: 0.9 },   // 60
  { t: 9.2,  peak: 0.14, hold: 0.6 },   // descuento
  { t: 11.0, peak: 0.24, hold: 0.55 },  // 50
  { t: 11.76, peak: 0.46, hold: 1.2 },  // 45  ← golpe fuerte
  { t: 13.6, peak: 0.14, hold: 0.6 },   // colombia
  { t: 16.4, peak: 0.22, hold: 1.0 },   // tabla de picar
  { t: 19.0, peak: 0.46, hold: 1.5 },   // ticket alto
  { t: 25.6, peak: 0.26, hold: 0.5 },   // no es bajar
  { t: 26.7, peak: 0.52, hold: 1.2 },   // no lo vamos a bajar  ← final
]

export function zoomAt(frame: number) {
  let extra = 0, shakeX = 0, shakeY = 0
  for (const z of ZOOMS) {
    const s = sec(z.t), hold = sec(z.hold)
    const up = interpolate(frame, [s, s + 5], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: Easing.out(Easing.cubic) })
    const down = interpolate(frame, [s + hold, s + hold + 14], [1, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: Easing.inOut(Easing.quad) })
    extra = Math.max(extra, z.peak * Math.min(up, down))
    const age = frame - s
    if (age >= 0 && age < 14) {
      const k = Math.exp(-age / 4) * z.peak * 38
      shakeX += Math.sin(age * 2.9) * k; shakeY += Math.cos(age * 3.7) * k
    }
  }
  return { scale: BASE_SCALE + extra, shakeX, shakeY }
}

export const hitFrames = ZOOMS.map(z => sec(z.t))
