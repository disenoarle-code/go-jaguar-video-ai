import * as THREE from 'three'
import { FONT } from './theme'

const cache = new Map<string, THREE.CanvasTexture>()

/** Textura con texto, ajustado al ancho disponible. Se cachea por contenido. */
export function textTexture(text: string, o: { fill: string; stroke?: string; w?: number; h?: number; bg?: string }) {
  const w = o.w ?? 1024, h = o.h ?? 256
  const key = `${text}|${o.fill}|${o.stroke}|${w}x${h}|${o.bg}`
  const hit = cache.get(key); if (hit) return hit
  const c = document.createElement('canvas'); c.width = w; c.height = h
  const g = c.getContext('2d')!
  if (o.bg) { g.fillStyle = o.bg; g.fillRect(0, 0, w, h) }
  let size = h * 0.82
  g.font = `${size}px ${FONT}`
  while (g.measureText(text).width > w * 0.92 && size > 12) { size -= 4; g.font = `${size}px ${FONT}` }
  g.textAlign = 'center'; g.textBaseline = 'middle'; g.lineJoin = 'round'
  if (o.stroke) { g.lineWidth = size * 0.12; g.strokeStyle = o.stroke; g.strokeText(text, w / 2, h / 2 + size * 0.04) }
  g.fillStyle = o.fill; g.fillText(text, w / 2, h / 2 + size * 0.04)
  const t = new THREE.CanvasTexture(c)
  t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8
  cache.set(key, t)
  return t
}
