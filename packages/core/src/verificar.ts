import { clipDur, overlayDur } from './timeline'
import type { Project } from './types'

/** Tiempo máximo (s) que el video puede pasar sin ningún cambio visual (regla de movimiento). */
export const MAX_SIN_CAMBIO = 8
const f1 = (n: number) => n.toFixed(1)
const tc = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`

export interface Verificacion { ok: boolean; duracion: number; tramosQuietos: { desde: number; hasta: number }[]; avisos: string[]; texto: string }

/**
 * Verificación NUMÉRICA de una edición (sustituye a mirar capturas una por una; ahorra tokens). Revisa:
 *  · regla de movimiento: ningún tramo de más de 8 s sin cambio visual (cambio de zoom/encuadre/toma, video superpuesto o gráfico);
 *  · capas fuera de la duración o con texto vacío, clips diminutos, tomas de apoyo (video superpuesto) con audio, gráficos fuera del cuadro.
 * Lo que sigue necesitando ojos (legibilidad, texto cortado, tomas con letras) se mira con UNA hoja de contacto: `editor.hoja()`.
 */
export function verificar(p: Project): Verificacion {
  const avisos: string[] = []
  let t = 0
  const cambios = new Set<number>([0])
  let prev = ''
  for (const c of p.clips) {
    const d = clipDur(c)
    const tr = c.transform
    const key = JSON.stringify([c.assetId, c.zoom?.kind ?? null, c.zoom?.amount ?? 0, tr ? [tr.x, tr.y, tr.scale] : null])
    if (key !== prev) cambios.add(+t.toFixed(3))
    if (c.zoom && (c.zoom.kind === 'push' || c.zoom.kind === 'pull')) { cambios.add(+t.toFixed(3)); cambios.add(+(t + d).toFixed(3)) }     // movimiento progresivo: hay cambio mientras dura
    if (d < 0.3) avisos.push(`clip muy corto ${c.id} (${f1(d)} s) en ${tc(t)}`)
    prev = key; t += d
  }
  const dur = t
  for (const o of p.overlays ?? []) {
    if (o.kind !== 'video') continue
    cambios.add(+o.start.toFixed(3)); cambios.add(+(o.start + overlayDur(o)).toFixed(3))
    if (o.volume > 0) avisos.push(`toma de apoyo ${o.id} con audio (vol ${o.volume}): las tomas de apoyo van sin audio`)
  }
  for (const l of p.layers) {
    if (l.type === 'graphic' && l.template !== 'fondo') { cambios.add(+l.start.toFixed(3)); cambios.add(+l.end.toFixed(3)) }
    if (l.end > dur + 0.05) avisos.push(`capa ${l.id} termina después del video (${f1(l.end)} s > ${f1(dur)} s)`)
    if ((l.type === 'subtitle' || l.type === 'graphic') && !l.text.trim() && !l.props) avisos.push(`capa ${l.id} sin texto`)
    const x = l.transform.x, y = l.transform.y
    if (x < 0 || x > 1 || y < 0 || y > 1) avisos.push(`capa ${l.id} con el centro fuera del cuadro (${f1(x)}, ${f1(y)})`)
  }
  const pts = [...cambios, dur].filter(x => x <= dur + 0.001).sort((a, b) => a - b)
  const tramosQuietos: { desde: number; hasta: number }[] = []
  for (let i = 1; i < pts.length; i++) if (pts[i] - pts[i - 1] > MAX_SIN_CAMBIO) tramosQuietos.push({ desde: pts[i - 1], hasta: pts[i] })
  const maxGap = pts.slice(1).reduce((m, x, i) => Math.max(m, x - pts[i]), 0)
  const lineas = [
    `VERIFICACIÓN "${p.name}" ${tc(dur)} · ${p.clips.length} clips · ${cambios.size} cambios visuales`,
    tramosQuietos.length ? `✗ Movimiento: ${tramosQuietos.length} tramo(s) de más de ${MAX_SIN_CAMBIO} s sin cambio: ${tramosQuietos.map(q => `${tc(q.desde)}–${tc(q.hasta)} (${f1(q.hasta - q.desde)} s)`).join(', ')}`
      : `✓ Movimiento: el tramo más largo sin cambio dura ${f1(maxGap)} s (máx. ${MAX_SIN_CAMBIO})`,
    ...(avisos.length ? avisos.map(a => `✗ ${a}`) : ['✓ Sin avisos (capas, audio de tomas de apoyo, clips cortos)']),
  ]
  return { ok: !tramosQuietos.length && !avisos.length, duracion: dur, tramosQuietos, avisos, texto: lineas.join('\n') }
}
