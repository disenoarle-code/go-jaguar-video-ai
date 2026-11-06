import type { ClipFx } from '@gojaguar/core'

/** Nombre, color y duración del "golpe" de cada efecto (para mostrarlos en la línea de tiempo y el panel). */
export const FX_INFO: Record<ClipFx, { name: string; short: string; color: string; ink: string; hit: number; hint: string }> = {
  push:       { name: 'Zoom lento',            short: 'Zoom lento',  color: '#3f8f8b', ink: '#fff',    hit: 0,    hint: 'Se acerca despacio durante todo el clip.' },
  punch:      { name: 'Golpe de zoom',         short: 'Golpe',       color: '#e8b152', ink: '#1d1d1b', hit: 0.35, hint: 'Entra con zoom fuerte y se asienta en 0,35 s.' },
  slide:      { name: 'Deslizar',              short: 'Deslizar',    color: '#6dbb72', ink: '#1d1d1b', hit: 0.22, hint: 'La imagen entra de lado y se centra en 0,22 s.' },
  punchflash: { name: 'Golpe + destello',      short: 'Golpe+flash', color: '#d9778b', ink: '#1d1d1b', hit: 0.3,  hint: 'Golpe de zoom con un destello blanco corto.' },
  dropflash:  { name: 'Entrada fuerte',        short: 'Drop',        color: '#f8f4ec', ink: '#1d1d1b', hit: 0.5,  hint: 'Zoom grande y destello fuerte, para la entrada de la música.' },
}
