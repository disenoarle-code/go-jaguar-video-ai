import type { TransitionKind, ZoomKind } from '@gojaguar/core'

/** Nombres, colores y explicación de cada zoom (efecto del clip). */
export const ZOOM_INFO: Record<ZoomKind, { name: string; color: string; hint: string }> = {
  push: { name: 'Zoom lento', color: '#3f8f8b', hint: 'Se acerca poco a poco durante todo el clip.' },
  pull: { name: 'Alejar', color: '#5f86b8', hint: 'Empieza cerca y se aleja poco a poco durante todo el clip.' },
  punch: { name: 'Golpe de zoom', color: '#e8b152', hint: 'Entra con un zoom fuerte y se asienta.' },
  glitch: { name: 'Glitch RGB', color: '#c04fd9', hint: 'Al empezar el clip la imagen se parte en colores y se sacude un instante (la intensidad es cuánto se separan los colores; la duración, cuánto dura).' },
  temblor: { name: 'Temblor de cámara', color: '#d97757', hint: 'La cámara tiembla durante todo el clip (la intensidad es el zoom que le da margen). Parte el clip para que tiemble solo un momento.' },
}

/** Nombres, colores y explicación de cada transición (en el corte entre dos clips). */
export const TRANSITION_INFO: Record<TransitionKind, { name: string; color: string; hint: string }> = {
  slide: { name: 'Deslizar', color: '#6dbb72', hint: 'La imagen sale hacia un lado y la siguiente entra desde el otro.' },
  flash: { name: 'Destello', color: '#d9778b', hint: 'Un destello blanco justo en el corte.' },
  dip: { name: 'Fundido a negro', color: '#8d8a82', hint: 'La imagen se oscurece hacia el corte y vuelve a aparecer.' },
}
