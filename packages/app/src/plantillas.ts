/**
 * Plantillas de gráficos "explicativos" (estilo de la referencia Adrián Sáenz: un gráfico por cada idea que dice la persona):
 *   clave      palabra o cifra grande en cromo (una palabra clave a la vez)
 *   busqueda   barra de búsqueda de cristal que escribe sola y un resultado que aparece debajo
 *   contador   número que SUBE contando, con etiqueta
 *   preguntas  tarjetas de cristal que aparecen una por una (props.items = JSON [[texto, segundos desde el inicio de la capa], …])
 *   ficha      ficha de interfaz con interruptor que cambia (props.estado 'si' | 'no')
 * Todo depende solo del tiempo `t`, así que la vista previa y la exportación (mismo código) coinciden.
 */
import { H, W } from './constants'
import type { Rect } from './overlays'

type Ctx = CanvasRenderingContext2D
type L = { start: number; end: number; text: string; props?: Record<string, string> }

const clamp01 = (x: number) => Math.min(Math.max(x, 0), 1)
const easeOut3 = (x: number) => 1 - Math.pow(1 - clamp01(x), 3)
const easeBack = (x: number) => { const c1 = 1.70158, c3 = c1 + 1, v = clamp01(x); return 1 + c3 * Math.pow(v - 1, 3) + c1 * Math.pow(v - 1, 2) }
const FONT = (px: number, w = 800) => `${w} ${px}px Figtree, "Segoe UI", system-ui, sans-serif`
export const PLANTILLAS_NUEVAS = ['fondo', 'clave', 'busqueda', 'contador', 'preguntas', 'ficha']
const VERDE = '#2fd18b', ROJO = '#ff5a4d', ORO = '#ffc233'

/** Panel de cristal oscuro con borde brillante. */
function cristal(c: Ctx, x: number, y: number, w: number, h: number, r: number, acento?: string) {
  c.save()
  c.shadowColor = 'rgba(0,0,0,.45)'; c.shadowBlur = h * 0.35; c.shadowOffsetY = h * 0.1
  const g = c.createLinearGradient(x, y, x, y + h); g.addColorStop(0, 'rgba(58,58,64,.86)'); g.addColorStop(1, 'rgba(22,22,26,.9)')
  c.fillStyle = g; c.beginPath(); c.roundRect(x, y, w, h, r); c.fill()
  c.shadowColor = 'transparent'
  const b = c.createLinearGradient(x, y, x + w, y + h); b.addColorStop(0, 'rgba(255,255,255,.55)'); b.addColorStop(0.5, 'rgba(255,255,255,.12)'); b.addColorStop(1, acento ? `${acento}aa` : 'rgba(255,255,255,.3)')
  c.strokeStyle = b; c.lineWidth = Math.max(1.2, h * 0.025); c.stroke()
  const br = c.createLinearGradient(0, y, 0, y + h * 0.5); br.addColorStop(0, 'rgba(255,255,255,.14)'); br.addColorStop(1, 'rgba(255,255,255,0)')
  c.fillStyle = br; c.beginPath(); c.roundRect(x + 2, y + 2, w - 4, h * 0.5, [r, r, r * 0.4, r * 0.4]); c.fill()
  c.restore()
}

// ---------------------------------------------------------------- clave: palabra cromada ----
const POS_Y: Record<string, number> = { arriba: 0.14, centro: 0.4, abajo: 0.68 }
const posY = (o: L) => POS_Y[o.props?.pos ?? 'arriba'] ?? (Number(o.props?.pos) || 0.14)      // pos: 'arriba' | 'centro' | 'abajo' o una altura 0–1
function medidaClave(c: Ctx, o: L) {
  const txt = (o.props?.texto ?? o.text).toUpperCase(), maxW = W * 0.9
  let size = W * 0.17; c.font = FONT(size, 900)
  while (c.measureText(txt).width > maxW && size > W * 0.05) { size *= 0.94; c.font = FONT(size, 900) }
  return { txt, size, w: c.measureText(txt).width }
}
export function cajaPlantilla(c: Ctx, o: L & { template: string }): Rect | null {
  const pos = posY(o)
  switch (o.template) {
    case 'fondo': return { x: 0, y: 0, w: W, h: H }
    case 'clave': { c.save(); const m = medidaClave(c, o); c.restore(); return { x: W / 2 - m.w / 2, y: H * pos - m.size * 0.6, w: m.w, h: m.size * 1.4 } }
    case 'busqueda': return { x: W * 0.1, y: H * 0.1, w: W * 0.8, h: H * 0.17 }
    case 'contador': return { x: W * 0.12, y: H * 0.08, w: W * 0.76, h: H * 0.2 }
    case 'preguntas': return { x: W * 0.07, y: H * 0.09, w: W * 0.86, h: H * 0.3 }
    case 'ficha': { const lado = o.props?.lado ?? 'der', yy = Number(o.props?.y ?? 0.3), w = W * 0.52; return { x: (lado === 'izq' ? 0.05 : lado === 'der' ? 0.95 - 0.52 : 0.24) * W, y: H * yy - H * 0.03, w, h: H * 0.06 } }
  }
  return null
}

function dibujarClave(c: Ctx, o: L, t: number) {
  const tt = t - o.start, dur = o.end - o.start, ent = easeOut3(tt / 0.45), ex = clamp01((tt - (dur - 0.35)) / 0.35)
  const pos = posY(o), sub = o.props?.sub ?? ''
  c.save(); const m = medidaClave(c, o)
  const cx = W / 2, cy = H * pos + (1 - ent) * m.size * 0.25 - ex * m.size * 0.1
  c.translate(cx, cy); const s = (1.22 - 0.22 * ent) * (1 - 0.06 * ex); c.scale(s, s)
  c.globalAlpha = clamp01(tt / 0.25) * (1 - ex)
  c.filter = `blur(${((1 - ent) * 10 + ex * 6).toFixed(1)}px)`
  c.font = FONT(m.size, 900); c.textBaseline = 'middle'; c.letterSpacing = `${-m.size * 0.01}px`
  const x = -m.w / 2, y0 = -m.size * 0.55, y1 = m.size * 0.55
  const g = c.createLinearGradient(0, y0, 0, y1)           // cromo: luz arriba, horizonte oscuro en el medio, rebote claro abajo
  g.addColorStop(0, '#ffffff'); g.addColorStop(0.42, '#d9dde3'); g.addColorStop(0.5, '#6d7580'); g.addColorStop(0.58, '#aeb5be'); g.addColorStop(1, '#f1f3f6')
  c.shadowColor = 'rgba(0,0,0,.6)'; c.shadowBlur = m.size * 0.28; c.shadowOffsetY = m.size * 0.06
  c.lineJoin = 'round'; c.lineWidth = m.size * 0.05; c.strokeStyle = 'rgba(25,28,34,.55)'; c.strokeText(m.txt, x, 0)
  c.shadowColor = 'transparent'; c.fillStyle = g; c.fillText(m.txt, x, 0)
  c.lineWidth = Math.max(1, m.size * 0.012); c.strokeStyle = 'rgba(255,255,255,.7)'; c.strokeText(m.txt, x, 0)
  if (sub) { c.filter = 'none'; c.font = FONT(m.size * 0.2, 700); c.letterSpacing = `${m.size * 0.03}px`; c.fillStyle = 'rgba(255,255,255,.92)'; c.shadowColor = 'rgba(0,0,0,.7)'; c.shadowBlur = m.size * 0.12; const sw = c.measureText(sub.toUpperCase()).width; c.fillText(sub.toUpperCase(), -sw / 2, m.size * 0.72) }
  c.restore()
}

// ---------------------------------------------------------------- busqueda ----
function dibujarBusqueda(c: Ctx, o: L, t: number) {
  const q = o.props?.texto ?? o.text, res = o.props?.resultado ?? '', acc = o.props?.acento ?? ROJO
  const tt = t - o.start, dur = o.end - o.start, ent = easeBack(tt / 0.5), ex = clamp01((tt - (dur - 0.35)) / 0.35)
  const w = W * 0.8, h = H * 0.07, x = W / 2 - w / 2, y = H * 0.11
  c.save(); c.globalAlpha = clamp01(tt / 0.25) * (1 - ex); c.translate(W / 2, y + h / 2); const s = 0.8 + 0.2 * Math.min(ent, 1.1); c.scale(s, s); c.translate(-W / 2, -(y + h / 2))
  cristal(c, x, y, w, h, h / 2)
  const ix = x + h * 0.55, iy = y + h / 2, r = h * 0.17        // lupa
  c.strokeStyle = 'rgba(255,255,255,.85)'; c.lineWidth = h * 0.06; c.lineCap = 'round'; c.beginPath(); c.arc(ix - r * 0.2, iy - r * 0.2, r, 0, Math.PI * 2); c.moveTo(ix + r * 0.55, iy + r * 0.55); c.lineTo(ix + r * 1.25, iy + r * 1.25); c.stroke()
  const n = Math.min(q.length, Math.floor(Math.max(0, tt - 0.35) * 15)), typed = q.slice(0, n)
  let fs = h * 0.42; c.font = FONT(fs, 600); c.textBaseline = 'middle'
  const disp = w - h * 1.6; while (c.measureText(q).width > disp && fs > h * 0.2) { fs *= 0.95; c.font = FONT(fs, 600) }
  c.fillStyle = '#fff'; c.fillText(typed, x + h * 1.05, y + h / 2 + 1)
  if (Math.floor(tt * 2.4) % 2 === 0 && n < q.length + 6) { const cw = c.measureText(typed).width; c.fillStyle = 'rgba(255,255,255,.9)'; c.fillRect(x + h * 1.05 + cw + 2, y + h * 0.28, Math.max(2, h * 0.04), h * 0.44) }
  c.restore()
  if (res) {
    const tr = 0.35 + q.length / 15 + 0.25, k = easeBack((tt - tr) / 0.45)
    if (k > 0) {
      c.save(); c.globalAlpha = clamp01((tt - tr) / 0.2) * (1 - ex)
      let rf = h * 0.46; c.font = FONT(rf, 800); const rw = c.measureText(res).width + h * 1.1, rh = h * 0.95, rx = W / 2 - rw / 2, ry = y + h + H * 0.02
      c.translate(W / 2, ry + rh / 2); const ss = 0.7 + 0.3 * Math.min(k, 1.15); c.scale(ss, ss); c.translate(-W / 2, -(ry + rh / 2))
      c.shadowColor = acc; c.shadowBlur = rh * 0.8
      const g = c.createLinearGradient(rx, ry, rx, ry + rh); g.addColorStop(0, acc); g.addColorStop(1, `${acc}cc`); c.fillStyle = g; c.beginPath(); c.roundRect(rx, ry, rw, rh, rh * 0.5); c.fill()
      c.shadowColor = 'transparent'; c.strokeStyle = 'rgba(255,255,255,.6)'; c.lineWidth = 1.5; c.stroke()
      c.fillStyle = '#fff'; c.textBaseline = 'middle'; c.fillText(res, rx + h * 0.55, ry + rh / 2 + 1); c.restore()
    }
  }
}

// ---------------------------------------------------------------- contador ----
function dibujarContador(c: Ctx, o: L, t: number) {
  const pr = o.props ?? {}, de = Number(pr.desde ?? 0), a = Number(pr.hasta ?? 100), suf = pr.sufijo ?? '', et = pr.etiqueta ?? '', col = pr.color ?? ORO
  const tt = t - o.start, dur = o.end - o.start, ex = clamp01((tt - (dur - 0.35)) / 0.35), ent = easeOut3(tt / 0.4)
  const v = de + (a - de) * easeOut3((tt - 0.15) / 1.3), txt = Math.round(v).toLocaleString('es-CO') + (suf ? ' ' + suf : '')
  const size = W * 0.2; c.save(); c.globalAlpha = ent * (1 - ex); c.translate(W / 2, H * 0.17 + (1 - ent) * 14)
  c.font = `italic 700 ${size}px Georgia, "Times New Roman", serif`; c.textBaseline = 'middle'
  let fs = size; while (c.measureText(txt).width > W * 0.88 && fs > W * 0.06) { fs *= 0.95; c.font = `italic 700 ${fs}px Georgia, "Times New Roman", serif` }
  const w = c.measureText(txt).width
  const rg = c.createRadialGradient(0, 0, 0, 0, 0, Math.max(w, W * 0.5) * 0.6); rg.addColorStop(0, `${col}66`); rg.addColorStop(1, `${col}00`)
  c.fillStyle = rg; c.fillRect(-W / 2, -H * 0.1, W, H * 0.2)
  const g = c.createLinearGradient(0, -fs * 0.5, 0, fs * 0.5); g.addColorStop(0, '#fff6d6'); g.addColorStop(0.5, col); g.addColorStop(1, '#b97a00')
  c.shadowColor = 'rgba(0,0,0,.65)'; c.shadowBlur = fs * 0.25; c.fillStyle = g; c.fillText(txt, -w / 2, 0); c.shadowColor = 'transparent'
  if (et) { c.font = FONT(W * 0.04, 700); c.letterSpacing = `${W * 0.004}px`; c.fillStyle = 'rgba(255,255,255,.92)'; c.shadowColor = 'rgba(0,0,0,.7)'; c.shadowBlur = 8; const lw = c.measureText(et.toUpperCase()).width; c.fillText(et.toUpperCase(), -lw / 2, fs * 0.62) }
  c.restore()
}

// ---------------------------------------------------------------- preguntas ----
function dibujarPreguntas(c: Ctx, o: L, t: number) {
  let items: [string, number][] = []
  try { items = JSON.parse(o.props?.items ?? '[]') } catch { return }
  const acc = o.props?.acento ?? ROJO, tt = t - o.start, dur = o.end - o.start, ex = clamp01((tt - (dur - 0.4)) / 0.4)
  const w = W * 0.84, h = H * 0.075, gap = H * 0.012, x = W / 2 - w / 2, y0 = H * 0.1
  items.forEach(([texto, ti], i) => {
    const k = easeBack((tt - ti) / 0.5); if (k <= 0) return
    const y = y0 + i * (h + gap)
    c.save(); c.globalAlpha = clamp01((tt - ti) / 0.2) * (1 - ex)
    c.translate(x + w / 2, y + h / 2); const s = 0.8 + 0.2 * Math.min(k, 1.12); c.scale(s, s); c.translate(-(x + w / 2), -(y + h / 2)); c.translate((1 - Math.min(k, 1)) * -W * 0.25, 0)
    cristal(c, x, y, w, h, h * 0.3, acc)
    const r = h * 0.3, bx = x + h * 0.55, by = y + h / 2           // insignia "?"
    const g = c.createLinearGradient(bx - r, by - r, bx + r, by + r); g.addColorStop(0, acc); g.addColorStop(1, '#8c1d14'); c.shadowColor = acc; c.shadowBlur = r; c.fillStyle = g; c.beginPath(); c.arc(bx, by, r, 0, Math.PI * 2); c.fill(); c.shadowColor = 'transparent'
    c.fillStyle = '#fff'; c.font = FONT(r * 1.35, 900); c.textBaseline = 'middle'; const qw = c.measureText('?').width; c.fillText('?', bx - qw / 2, by + 1)
    let fs = h * 0.36; c.font = FONT(fs, 700); const disp = w - h * 1.55; while (c.measureText(texto).width > disp && fs > h * 0.15) { fs *= 0.95; c.font = FONT(fs, 700) }
    c.fillStyle = '#fff'; c.fillText(texto, x + h * 1.1, y + h / 2 + 1)
    c.restore()
  })
}

// ---------------------------------------------------------------- ficha (interruptor) ----
function dibujarFicha(c: Ctx, o: L, t: number) {
  const texto = o.props?.texto ?? o.text, si = (o.props?.estado ?? 'si') === 'si', lado = o.props?.lado ?? 'der', yy = Number(o.props?.y ?? 0.3)
  const tt = t - o.start, dur = o.end - o.start, k = easeBack(tt / 0.45), ex = clamp01((tt - (dur - 0.3)) / 0.3)
  c.save(); const h = H * 0.052; c.font = FONT(h * 0.42, 700)
  const w = c.measureText(texto).width + h * 2.4, x = lado === 'izq' ? W * 0.05 : lado === 'der' ? W * 0.95 - w : W / 2 - w / 2, y = H * yy - h / 2
  c.globalAlpha = clamp01(tt / 0.2) * (1 - ex); c.translate(x + w / 2, y + h / 2); const s = 0.75 + 0.25 * Math.min(k, 1.15); c.scale(s, s); c.translate(-(x + w / 2), -(y + h / 2))
  cristal(c, x, y, w, h, h / 2)
  c.fillStyle = '#fff'; c.textBaseline = 'middle'; c.fillText(texto, x + h * 0.5, y + h / 2 + 1)
  const sw = h * 0.95, sh = h * 0.5, sx = x + w - sw - h * 0.35, sy = y + h / 2 - sh / 2, flip = easeOut3((tt - 0.5) / 0.3)      // interruptor: arranca apagado y cambia
  const on = si ? flip : 1 - flip * 0 , col = si ? VERDE : ROJO
  c.fillStyle = `rgba(90,90,96,${1 - flip})`; c.beginPath(); c.roundRect(sx, sy, sw, sh, sh / 2); c.fill()
  c.fillStyle = col; c.globalAlpha *= flip; c.beginPath(); c.roundRect(sx, sy, sw, sh, sh / 2); c.fill(); c.globalAlpha /= Math.max(flip, 0.0001)
  const kx = sx + sh / 2 + (si ? (sw - sh) * flip : (sw - sh) * 0), kr = sh * 0.38
  c.fillStyle = '#fff'; c.beginPath(); c.arc(kx, sy + sh / 2, kr, 0, Math.PI * 2); c.fill()
  if (!si && flip > 0.5) { c.strokeStyle = col; c.lineWidth = kr * 0.28; c.lineCap = 'round'; const q = kr * 0.4; c.beginPath(); c.moveTo(kx - q, sy + sh / 2 - q); c.lineTo(kx + q, sy + sh / 2 + q); c.moveTo(kx + q, sy + sh / 2 - q); c.lineTo(kx - q, sy + sh / 2 + q); c.stroke() }
  void on
  c.restore()
}

// ---------------------------------------------------------------- fondo (corte a pantalla de gráfico) ----
/** Cubre todo el cuadro con un fondo liso (negro con resplandor, o crema; `alpha` < 1 lo vuelve un velo que oscurece el video de abajo para que se lean los gráficos): el video sigue sonando; los gráficos de encima se leen como en un corte a "pantalla de gráfico". */
function dibujarFondo(c: Ctx, o: L, t: number) {
  const tt = t - o.start, dur = o.end - o.start, a = clamp01(tt / 0.3) * (1 - clamp01((tt - (dur - 0.3)) / 0.3)) * clamp01(Number(o.props?.alpha ?? 1)), acc = o.props?.acento ?? ORO, crema = (o.props?.tono ?? 'negro') === 'crema'
  c.save(); c.globalAlpha = a
  const g = c.createLinearGradient(0, 0, 0, H)
  if (crema) { g.addColorStop(0, '#f8f2e8'); g.addColorStop(1, '#e8dfd0') } else { g.addColorStop(0, '#0a0a0c'); g.addColorStop(1, '#17171b') }
  c.fillStyle = g; c.fillRect(0, 0, W, H)
  if (!crema) { const rg = c.createRadialGradient(W / 2, H * 0.2, 0, W / 2, H * 0.2, W * 0.9); rg.addColorStop(0, `${acc}44`); rg.addColorStop(1, `${acc}00`); c.fillStyle = rg; c.fillRect(0, 0, W, H) }
  c.restore()
}

/** Despacha las plantillas nuevas; devuelve true si dibujó alguna. */
export function dibujarPlantillaNueva(c: Ctx, o: L & { template: string }, t: number): boolean {
  switch (o.template) {
    case 'fondo': dibujarFondo(c, o, t); return true
    case 'clave': dibujarClave(c, o, t); return true
    case 'busqueda': dibujarBusqueda(c, o, t); return true
    case 'contador': dibujarContador(c, o, t); return true
    case 'preguntas': dibujarPreguntas(c, o, t); return true
    case 'ficha': dibujarFicha(c, o, t); return true
  }
  return false
}
