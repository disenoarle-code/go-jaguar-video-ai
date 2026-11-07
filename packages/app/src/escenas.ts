import type { TextLayer } from '@gojaguar/core'
import { H, W } from './constants'

/**
 * Escenas animadas con seudo-3D dibujadas con código (sin texto legible). Todo sale solo del tiempo `t` (nada de azar entre fotogramas),
 * así la vista previa y el MP4 exportado coinciden. Capa gráfica con `template: 'escena'` y `props`:
 *  - tipo 'claude'  : la chispa de Claude (rayos naranja con carita), enorme y con energía. `humor`: 'curioso' | 'loco' | 'triste' | 'feliz' | 'locura'
 *                     ('locura' = se vuelve loca y al final se deshace en tristeza). `lado`: 'izq' | 'der' | 'centro'; `tam`: factor de tamaño (1 = casi todo el ancho).
 *  - tipo 'pantalla': una pantalla a cuadro completo con un editor de video (`pantalla:'editor'`) o código (`pantalla:'codigo'`) en tiempo real,
 *                     con cámara que se mueve, golpes de zoom y glitch al entrar y salir.
 */
const clamp01 = (x: number) => Math.min(Math.max(x, 0), 1)
const easeOut3 = (x: number) => 1 - Math.pow(1 - clamp01(x), 3)
const easeInOut = (x: number) => { const v = clamp01(x); return v < 0.5 ? 4 * v * v * v : 1 - Math.pow(-2 * v + 2, 3) / 2 }
const elastico = (x: number) => { const v = clamp01(x); return v === 0 ? 0 : v === 1 ? 1 : Math.pow(2, -9 * v) * Math.sin((v * 10 - 0.75) * ((2 * Math.PI) / 3)) + 1 }
const alea = (i: number) => { const s = Math.sin(i * 12.9898 + 78.233) * 43758.5453; return s - Math.floor(s) }      // azar determinista

type Ctx = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D
const lienzos = new Map<string, OffscreenCanvas>()
function lienzo(clave: string, w: number, h: number) {
  let c = lienzos.get(clave)
  if (!c || c.width !== w || c.height !== h) { c = new OffscreenCanvas(w, h); lienzos.set(clave, c) }
  const x = c.getContext('2d')!; x.setTransform(1, 0, 0, 1, 0, 0); x.globalCompositeOperation = 'source-over'; x.globalAlpha = 1; x.clearRect(0, 0, w, h); return { c, x }
}
const mezcla = (a: string, b: string, k: number) => {
  const p = (s: string) => [1, 3, 5].map(i => parseInt(s.slice(i, i + 2), 16)), A = p(a), B = p(b)
  return '#' + A.map((v, i) => Math.round(v + (B[i] - v) * clamp01(k)).toString(16).padStart(2, '0')).join('')
}

export interface Caja { x: number; y: number; w: number; h: number }
/** Caja de reposo de la escena (para hit-test, asas y margen). */
export function cajaEscena(o: TextLayer): Caja {
  const pr = o.type === 'graphic' ? o.props ?? {} : {}
  if ((pr.tipo ?? 'claude') === 'pantalla') return { x: 0, y: 0, w: W, h: H }
  const lado = pr.lado ?? 'centro', w = W * 0.92 * (parseFloat(pr.tam ?? '1') || 1)
  return { x: (lado === 'izq' ? 0.36 : lado === 'der' ? 0.64 : 0.5) * W - w / 2, y: H * 0.3 - w / 2, w, h: w }
}

/** Proyecta un lienzo con perspectiva girándolo sobre el eje vertical (tiras), como las tarjetas de cristal. */
function proyectar(ctx: Ctx, cv: OffscreenCanvas, cx: number, cy: number, w: number, h: number, th: number, alfa: number, escala = 1) {
  const D = w * 2.6, N = 64, cw = cv.width, ch = cv.height
  const proj = (x: number) => { const X = x * Math.cos(th), Z = x * Math.sin(th), s = D / (D + Z); return { px: cx + X * s * escala, s: s * escala } }
  ctx.save(); ctx.globalAlpha = alfa
  for (let i = 0; i < N; i++) {
    const a = proj((i / N - 0.5) * w), b = proj(((i + 1) / N - 0.5) * w), s = (a.s + b.s) / 2, dh = h * s
    ctx.drawImage(cv as unknown as CanvasImageSource, (i / N) * cw, 0, cw / N + 0.5, ch, a.px, cy - dh / 2, b.px - a.px + 0.7, dh)
  }
  ctx.restore()
}

// ---------------------------------------------------------------------------------------------------------------------------
// CHISPA DE CLAUDE
// ---------------------------------------------------------------------------------------------------------------------------
interface Humor { loco: number; triste: number; feliz: number; curioso: number }

/** Los rayos de la chispa: afilados, de largos distintos y un poco curvos, con degradado de la punta al centro. */
function rayos(c: Ctx, cx: number, cy: number, S: number, spin: number, largo: number, col0: string, col1: string, caida: number, t: number, alfa: number) {
  const n = 14
  c.save(); c.globalAlpha = alfa
  for (let i = 0; i < n; i++) {
    let dx = Math.cos((i / n) * Math.PI * 2 + spin), dy = Math.sin((i / n) * Math.PI * 2 + spin)
    dy += caida * 0.95; const m = Math.hypot(dx, dy); dx /= m; dy /= m                                              // la gravedad los dobla hacia abajo
    const L = S * (0.2 + 0.2 * alea(i * 1.7)) * largo * (1 + 0.1 * Math.sin(t * 6 + i * 1.3)), ancho = S * 0.045 * (0.8 + 0.5 * alea(i + 5))
    const nx = -dy, ny = dx, tx = cx + dx * (S * 0.1 + L), ty = cy + dy * (S * 0.1 + L)
    const g = c.createLinearGradient(cx, cy, tx, ty); g.addColorStop(0, col1); g.addColorStop(1, col0)
    c.fillStyle = g; c.beginPath()
    c.moveTo(cx + dx * S * 0.07 + nx * ancho, cy + dy * S * 0.07 + ny * ancho)
    c.quadraticCurveTo(cx + dx * (S * 0.1 + L * 0.55) + nx * ancho * 0.55, cy + dy * (S * 0.1 + L * 0.55) + ny * ancho * 0.55, tx, ty)
    c.quadraticCurveTo(cx + dx * (S * 0.1 + L * 0.55) - nx * ancho * 0.55, cy + dy * (S * 0.1 + L * 0.55) - ny * ancho * 0.55, cx + dx * S * 0.07 - nx * ancho, cy + dy * S * 0.07 - ny * ancho)
    c.closePath(); c.fill()
  }
  c.restore()
}

function estrella(c: Ctx, x: number, y: number, r: number, rot: number) {
  c.beginPath()
  for (let i = 0; i < 8; i++) { const a = rot + (i * Math.PI) / 4, rr = i % 2 === 0 ? r : r * 0.28; c.lineTo(x + rr * Math.cos(a), y + rr * Math.sin(a)) }
  c.closePath(); c.fill()
}

function pintarChispa(c: Ctx, S: number, t: number, h: Humor) {
  const cx0 = S / 2, cy0 = S / 2
  const jit = h.loco > 0.05 ? h.loco * S * 0.018 : 0, f = Math.floor(t * 24)
  const cx = cx0 + (alea(f * 3.1) - 0.5) * 2 * jit, cy = cy0 + (alea(f * 5.7) - 0.5) * 2 * jit + h.triste * S * 0.03
  const pulso = 1 + 0.06 * Math.sin(t * (6 + h.loco * 14 + h.feliz * 6)) + h.feliz * 0.07 * Math.abs(Math.sin(t * 7))
  const spin = t * (0.45 + h.loco * 7 + h.curioso * 0.3) * (h.triste > 0.5 ? 0.2 : 1)
  const largo = pulso * (1 - 0.42 * h.triste) * (1 + 0.25 * h.loco)
  const col0 = mezcla('#ff7a00', '#7a8fc8', h.triste), col1 = mezcla('#ffe0b8', '#c9d4f0', h.triste)
  // resplandor
  const rg = c.createRadialGradient(cx0, cy0, 0, cx0, cy0, S * 0.5); rg.addColorStop(0, h.triste > 0.5 ? 'rgba(120,150,255,.38)' : 'rgba(255,130,40,.55)'); rg.addColorStop(1, 'rgba(255,130,40,0)')
  c.fillStyle = rg; c.fillRect(0, 0, S, S)
  // copias fantasma (separación de color) cuando está loca
  if (h.loco > 0.1) for (const [dx, col] of [[-1, 'rgba(0,255,255,.55)'], [1, 'rgba(255,0,200,.55)']] as const) {
    c.save(); c.globalCompositeOperation = 'lighter'
    rayos(c, cx + dx * h.loco * S * 0.035, cy, S, spin + dx * 0.05, largo, col, col, 0, t, 0.7); c.restore()
  }
  rayos(c, cx, cy, S, spin, largo, col0, col1, h.triste * 0.9, t, 1)
  // cara
  const r = S * 0.125 * pulso
  const dg = c.createRadialGradient(cx - r * 0.3, cy - r * 0.35, r * 0.1, cx, cy, r); dg.addColorStop(0, mezcla('#ffb066', '#aebbe0', h.triste)); dg.addColorStop(1, mezcla('#ff6a00', '#6a7db8', h.triste))
  c.fillStyle = dg; c.beginPath(); c.arc(cx, cy, r, 0, Math.PI * 2); c.fill()
  const ex = r * 0.42, ey = cy - r * 0.12
  c.fillStyle = '#fff'; c.strokeStyle = '#2a1410'; c.lineCap = 'round'; c.lineWidth = r * 0.12
  if (h.loco > 0.4) {                                                                                                   // ojos en espiral y boca ondulada
    for (const l of [-1, 1]) { c.beginPath(); for (let a = 0; a < 18; a += 0.35) { const rr = r * 0.03 * a; c.lineTo(cx + l * ex + Math.cos(a + t * 12 * l) * rr * 0.9, ey + Math.sin(a + t * 12 * l) * rr * 0.9) } c.stroke() }
    c.beginPath(); for (let i = 0; i <= 12; i++) { const x = cx - r * 0.45 + (i / 12) * r * 0.9, y = cy + r * 0.5 + Math.sin(i * 1.6 + t * 20) * r * 0.1; i ? c.lineTo(x, y) : c.moveTo(x, y) } c.stroke()
  } else if (h.feliz > 0.4) {                                                                                           // ojos felices ^ ^ y gran sonrisa
    for (const l of [-1, 1]) { c.beginPath(); c.arc(cx + l * ex, ey + r * 0.1, r * 0.17, Math.PI * 1.1, Math.PI * 1.9); c.stroke() }
    c.fillStyle = '#2a1410'; c.beginPath(); c.arc(cx, cy + r * 0.22, r * 0.4, 0.05 * Math.PI, 0.95 * Math.PI); c.closePath(); c.fill()
    c.fillStyle = '#ff6f80'; c.beginPath(); c.ellipse(cx, cy + r * 0.62, r * 0.17, r * 0.1, 0, 0, Math.PI); c.fill()
  } else {                                                                                                              // ojos normales / tristes (con brillo) y lágrimas
    const mx = h.curioso * Math.sin(t * 2.2) * r * 0.08, blink = (t % 3.4) < 0.1 ? 0.2 : 1
    for (const l of [-1, 1]) {
      c.fillStyle = '#fff'; c.beginPath(); c.ellipse(cx + l * ex, ey, r * 0.2, r * 0.25 * blink * (1 + 0.15 * h.triste), 0, 0, Math.PI * 2); c.fill()
      c.fillStyle = '#2a1410'; c.beginPath(); c.arc(cx + l * ex + mx * 2, ey + h.triste * r * 0.05, r * 0.11 * (1 + 0.3 * h.triste), 0, Math.PI * 2); c.fill()
      c.fillStyle = '#fff'; c.beginPath(); c.arc(cx + l * ex + mx * 2 - r * 0.035, ey - r * 0.04, r * 0.035, 0, Math.PI * 2); c.fill()
      if (h.triste > 0.1) { c.strokeStyle = '#2a1410'; c.lineWidth = r * 0.1; c.beginPath(); c.moveTo(cx + l * (ex + r * 0.26), ey - r * 0.33 + h.triste * r * 0.04); c.lineTo(cx + l * (ex - r * 0.2), ey - r * 0.33 - h.triste * r * 0.15); c.stroke() }
    }
    c.strokeStyle = '#2a1410'; c.lineWidth = r * 0.1
    if (h.triste > 0.1) { c.beginPath(); c.arc(cx, cy + r * 0.75, r * 0.3, Math.PI * 1.15, Math.PI * 1.85); c.stroke() }
    else { c.beginPath(); c.arc(cx, cy + r * 0.3, r * 0.28, 0.2 * Math.PI, 0.8 * Math.PI); c.stroke() }
  }
  if (h.triste > 0.1) {                                                                                                 // chorros de lágrimas
    c.fillStyle = 'rgba(160,215,255,.92)'
    for (let i = 0; i < 10; i++) {
      const l = i % 2 ? 1 : -1, fase = (t * 1.5 + i * 0.173) % 1, x = cx + l * ex * (1.1 + 0.15 * alea(i)), y = ey + r * 0.2 + fase * S * 0.4
      c.globalAlpha = (1 - fase) * clamp01(h.triste * 1.5); c.beginPath(); c.ellipse(x, y, r * 0.06, r * 0.1, 0, 0, Math.PI * 2); c.fill()
    }
    c.globalAlpha = 1
  }
  // chispas y confeti que salen disparados
  if (h.loco > 0.1 || h.feliz > 0.1) {
    const n = h.feliz > 0.1 ? 34 : 20, inten = Math.max(h.loco, h.feliz)
    for (let i = 0; i < n; i++) {
      const ciclo = 0.9 + alea(i) * 0.7, f2 = ((t + alea(i + 9) * 3) % ciclo) / ciclo, a = alea(i + 2) * Math.PI * 2
      const rad = S * (0.18 + f2 * 0.42), x = cx0 + Math.cos(a) * rad, y = cy0 + Math.sin(a) * rad + (h.feliz > 0.1 ? f2 * f2 * S * 0.12 : 0)
      c.globalAlpha = (1 - f2) * inten
      c.fillStyle = h.feliz > 0.1 ? ['#ffd166', '#ff7a00', '#7bdff2', '#ff5d8f', '#b2f7ef'][i % 5] : (i % 2 ? '#ffe9b0' : '#ff9a3c')
      if (h.feliz > 0.1 && i % 3 === 0) { c.save(); c.translate(x, y); c.rotate(t * 6 + i); c.fillRect(-S * 0.012, -S * 0.02, S * 0.024, S * 0.04); c.restore() } else estrella(c, x, y, S * (0.014 + 0.018 * alea(i + 4)), t * 4 + i)
    }
    c.globalAlpha = 1
  }
}

function humorEn(humor: string, tt: number, dur: number): Humor {
  const h: Humor = { loco: 0, triste: 0, feliz: 0, curioso: 0 }
  if (humor === 'loco') h.loco = clamp01(tt / 0.6)
  else if (humor === 'triste') h.triste = easeOut3((tt - 0.4) / 0.6)
  else if (humor === 'feliz') h.feliz = easeOut3((tt - 0.1) / 0.3)
  else if (humor === 'locura') { const s = easeInOut((tt - (dur - 1.5)) / 0.7); h.loco = clamp01(tt / 0.9) * (1 - s); h.triste = s }
  else h.curioso = 1
  return h
}

function dibujarChispa(ctx: CanvasRenderingContext2D, o: TextLayer, t: number) {
  if (o.type !== 'graphic') return
  const pr = o.props ?? {}, b = cajaEscena(o), S = Math.round(b.w * 0.9)
  const tt = t - o.start, dur = o.end - o.start, ex = clamp01((tt - (dur - 0.35)) / 0.35), lado = pr.lado ?? 'centro'
  const { c, x } = lienzo('chispa', S, S); pintarChispa(x, S, tt, humorEn(pr.humor ?? 'curioso', tt, dur))
  const k = elastico(tt / 0.7)
  const giro = (1 - Math.min(k, 1)) * 5 + Math.sin(tt * 2) * 0.22 + (lado === 'izq' ? 0.1 : lado === 'der' ? -0.1 : 0)
  const cx = b.x + b.w / 2, cy = b.y + b.h / 2 + Math.sin(tt * 3.2) * H * 0.008
  const escala = k * (1 + ex * 0.9), alfa = clamp01(tt / 0.1) * (1 - ex)
  // onda de choque al entrar
  const ring = clamp01(tt / 0.55)
  if (ring > 0 && ring < 1) { ctx.save(); ctx.strokeStyle = `rgba(255,170,80,${0.8 * (1 - ring)})`; ctx.lineWidth = W * 0.03 * (1 - ring); ctx.beginPath(); ctx.arc(cx, cy, b.w * 0.55 * easeOut3(ring), 0, Math.PI * 2); ctx.stroke(); ctx.restore() }
  ctx.save(); ctx.translate(cx, cy); ctx.rotate(giro); ctx.translate(-cx, -cy)
  proyectar(ctx, c, cx, cy, b.w, b.w, Math.sin(tt * 2.6) * 0.28, alfa, escala)
  ctx.restore()
}

// ---------------------------------------------------------------------------------------------------------------------------
// PANTALLA A CUADRO COMPLETO (editor de video / código)
// ---------------------------------------------------------------------------------------------------------------------------
const BW = 540, BH = 960

function flecha(c: Ctx, x: number, y: number, s: number) {
  c.fillStyle = '#fff'; c.strokeStyle = '#111'; c.lineWidth = 2; c.beginPath(); c.moveTo(x, y); c.lineTo(x, y + s * 1.5); c.lineTo(x + s * 0.4, y + s * 1.15); c.lineTo(x + s * 0.7, y + s * 1.75); c.lineTo(x + s * 0.95, y + s * 1.6); c.lineTo(x + s * 0.65, y + s * 1.05); c.lineTo(x + s * 1.1, y + s * 1.05); c.closePath(); c.fill(); c.stroke()
}

function pintarEditor(c: Ctx, t: number) {
  c.fillStyle = '#0d0f17'; c.fillRect(0, 0, BW, BH)
  for (let i = 0; i < 3; i++) { c.fillStyle = ['#ff5f57', '#febc2e', '#28c840'][i]; c.beginPath(); c.arc(22 + i * 20, 22, 6, 0, Math.PI * 2); c.fill() }
  // vista previa
  const py = 48, ph = 400, hue = (t * 40) % 360
  const g = c.createLinearGradient(16, py, BW - 16, py + ph); g.addColorStop(0, `hsl(${hue},70%,28%)`); g.addColorStop(1, `hsl(${(hue + 80) % 360},75%,40%)`)
  c.fillStyle = g; c.beginPath(); c.roundRect(16, py, BW - 32, ph, 14); c.fill()
  c.fillStyle = 'rgba(255,255,255,.9)'; c.beginPath(); c.arc(BW / 2 + Math.sin(t * 2.3) * 120, py + ph * 0.5 + Math.cos(t * 3.1) * 60, 46, 0, Math.PI * 2); c.fill()
  c.fillStyle = 'rgba(0,0,0,.25)'; c.beginPath(); c.arc(BW / 2 + Math.sin(t * 2.3 + 1) * 140, py + ph * 0.6, 90, 0, Math.PI * 2); c.fill()
  // herramientas
  for (let i = 0; i < 7; i++) { const on = Math.floor(t * 4) % 7 === i; c.fillStyle = on ? '#ff7a00' : '#222738'; c.beginPath(); c.roundRect(16 + i * 74, 470, 62, 46, 10); c.fill(); c.fillStyle = on ? '#fff' : '#4a5270'; c.beginPath(); c.arc(16 + i * 74 + 31, 493, 9, 0, Math.PI * 2); c.fill() }
  // línea de tiempo: los clips entran rebotando
  const ty = 540; c.fillStyle = '#10131e'; c.fillRect(0, ty, BW, BH - ty)
  for (let i = 0; i < 40; i++) { c.fillStyle = '#2f3652'; c.fillRect(14 + i * 13, ty + 12, 1.5, i % 4 === 0 ? 14 : 7) }
  const colores = ['#ff7a00', '#2ec4b6', '#9b5de5', '#4cc9f0', '#f15bb5', '#90be6d']
  for (let r = 0; r < 5; r++) {
    let x = 14 - ((t * (14 + r * 6)) % 60)
    for (let i = 0; i < 9; i++) {
      const w0 = 40 + alea(r * 9 + i) * 90, ap = clamp01((t * 1.7 - (r * 0.15 + i * 0.1)) / 0.3), rebote = ap < 1 ? Math.sin(ap * Math.PI) * 10 : 0
      c.fillStyle = colores[(r * 3 + i) % colores.length]; c.beginPath(); c.roundRect(x, ty + 40 + r * 64 - rebote, w0 * easeOut3(ap), 52, 9); c.fill()
      if (r === 1) { c.fillStyle = 'rgba(0,0,0,.28)'; for (let k = 0; k < w0 / 6 * easeOut3(ap); k++) c.fillRect(x + 4 + k * 6, ty + 66 - Math.abs(Math.sin(k * 1.3 + t * 9)) * 18, 3, Math.abs(Math.sin(k * 1.3 + t * 9)) * 30 + 4) }
      x += w0 + 8
    }
  }
  const hx = 14 + ((t * 0.55) % 1) * (BW - 28); c.fillStyle = '#fff'; c.fillRect(hx, ty, 3, BH - ty); c.beginPath(); c.moveTo(hx - 8, ty); c.lineTo(hx + 11, ty); c.lineTo(hx + 1.5, ty + 12); c.fill()
  // avisos que saltan
  for (let i = 0; i < 3; i++) {
    const f = ((t + i * 0.45) % 1.35) / 1.35, k = elastico(f * 3), y = 62 + i * 54
    if (f < 0.75) { c.save(); c.translate(BW - 54, y); c.scale(k, k); c.fillStyle = '#1f2a22'; c.beginPath(); c.roundRect(-34, -22, 68, 44, 12); c.fill(); c.strokeStyle = '#3ddc84'; c.lineWidth = 5; c.lineCap = 'round'; c.beginPath(); c.moveTo(-12, 0); c.lineTo(-3, 9); c.lineTo(14, -10); c.stroke(); c.restore() }
  }
  // cursor que va y hace clic
  const paso = Math.floor(t / 0.9), fr = (t % 0.9) / 0.9, A = [paso, paso + 1].map(p => [60 + alea(p * 1.9) * 420, 150 + alea(p * 4.3) * 700])
  const e = easeInOut(fr * 1.6), mx = A[0][0] + (A[1][0] - A[0][0]) * e, my = A[0][1] + (A[1][1] - A[0][1]) * e
  if (fr > 0.62) { c.strokeStyle = `rgba(255,255,255,${1 - (fr - 0.62) / 0.38})`; c.lineWidth = 3; c.beginPath(); c.arc(mx, my, 8 + (fr - 0.62) * 90, 0, Math.PI * 2); c.stroke() }
  flecha(c, mx, my, 22)
}

function pintarCodigo(c: Ctx, t: number) {
  c.fillStyle = '#0a0c13'; c.fillRect(0, 0, BW, BH)
  for (let i = 0; i < 3; i++) { c.fillStyle = ['#ff5f57', '#febc2e', '#28c840'][i]; c.beginPath(); c.arc(22 + i * 20, 22, 6, 0, Math.PI * 2); c.fill() }
  const cols = ['#ff9e64', '#7aa2f7', '#9ece6a', '#bb9af7', '#e0af68', '#c0caf5', '#2ac3de']
  const lh = 26, cps = 520, total = t * cps
  let usado = 0, cursor: [number, number] | null = null
  const scroll = Math.max(0, total / 42 - 26) * lh                      // al llenarse la pantalla el código sube
  for (let l = 0; l < 90; l++) {
    const y = 56 + l * lh - scroll; const segs = 3 + Math.floor(alea(l + 9) * 4), ind = Math.floor(alea(l * 3.1) * 3) * 26; let x = 56 + ind
    const inicio = usado
    for (let s = 0; s < segs; s++) {
      const largo = 4 + Math.floor(alea(l * 7 + s) * 9), vis = clamp01((total - usado) / largo); usado += largo
      if (y > 36 && y < 780 && vis > 0) { c.fillStyle = cols[Math.floor(alea(l * 5 + s * 2.3) * cols.length)]; c.beginPath(); c.roundRect(x, y, 8.2 * largo * vis, 13, 3); c.fill(); cursor = [x + 8.2 * largo * vis, y] }
      x += 8.2 * largo + 9
    }
    if (y > 36 && y < 780 && total > inicio) { c.fillStyle = '#3a4160'; c.fillRect(16, y, 18, 12) }
    if (usado > total + 40) break
  }
  if (cursor && Math.floor(t * 4) % 2 === 0) { c.fillStyle = '#fff'; c.fillRect(cursor[0] + 2, cursor[1] - 3, 9, 19) }
  // terminal de abajo: barra de progreso que se llena y se pone verde con visto
  c.fillStyle = '#11141f'; c.fillRect(0, 800, BW, BH - 800)
  const prog = clamp01(((t * 0.45) % 1.2) / 1.0), ok = ((t * 0.45) % 1.2) > 1.0
  c.fillStyle = '#1d2233'; c.beginPath(); c.roundRect(24, 850, BW - 48, 26, 13); c.fill()
  c.fillStyle = ok ? '#3ddc84' : '#ff7a00'; c.beginPath(); c.roundRect(24, 850, (BW - 48) * prog, 26, 13); c.fill()
  if (ok) { c.strokeStyle = '#3ddc84'; c.lineWidth = 10; c.lineCap = 'round'; c.beginPath(); c.moveTo(BW / 2 - 28, 920); c.lineTo(BW / 2 - 6, 942); c.lineTo(BW / 2 + 34, 898); c.stroke() }
}

function dibujarPantalla(ctx: CanvasRenderingContext2D, o: TextLayer, t: number) {
  if (o.type !== 'graphic') return
  const pr = o.props ?? {}, tt = t - o.start, dur = o.end - o.start
  const ex = clamp01((tt - (dur - 0.4)) / 0.4), ent = clamp01(tt / 0.35)
  const { c, x } = lienzo('pantalla', BW, BH)
  // cámara virtual: deriva continua + un golpe de zoom cada 1,1 s
  const golpe = Math.pow(Math.max(0, 1 - ((tt + 0.2) % 1.1) / 0.28), 2), Z = 1 + 0.07 + 0.05 * Math.sin(tt * 1.3) + 0.13 * golpe
  x.save(); x.translate(BW / 2 + Math.sin(tt * 0.9) * 26, BH / 2 + Math.cos(tt * 1.1) * 40); x.scale(Z, Z); x.translate(-BW / 2, -BH / 2)
  if (pr.pantalla === 'codigo') pintarCodigo(x, tt); else pintarEditor(x, tt)
  x.restore()
  const vg = x.createRadialGradient(BW / 2, BH / 2, BH * 0.3, BW / 2, BH / 2, BH * 0.65); vg.addColorStop(0, 'rgba(0,0,0,0)'); vg.addColorStop(1, 'rgba(0,0,0,.6)'); x.fillStyle = vg; x.fillRect(0, 0, BW, BH)
  // composición: entra con golpe de zoom + glitch por franjas, sale igual
  const gl = Math.max(1 - tt / 0.35, ex), esc = (1 + 0.28 * (1 - easeOut3(ent)) + 0.35 * ex)
  const cx = W / 2, cy = H / 2
  ctx.save(); ctx.globalAlpha = clamp01(tt / 0.08) * (1 - ex * 0.9)
  ctx.translate(cx, cy); ctx.scale(esc, esc); ctx.translate(-cx, -cy)
  if (gl > 0.02) {
    const N = 16
    for (let i = 0; i < N; i++) {
      const sy = (i / N) * BH, hh = BH / N + 1, off = (alea(i * 7 + Math.floor(tt * 20)) - 0.5) * 2 * gl * 60
      ctx.drawImage(c as unknown as CanvasImageSource, 0, sy, BW, hh, off, (i / N) * H, W, H / N + 1)
    }
    ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha *= 0.55 * gl
    ctx.drawImage(c as unknown as CanvasImageSource, 0, 0, BW, BH, -gl * 26, 0, W, H); ctx.drawImage(c as unknown as CanvasImageSource, 0, 0, BW, BH, gl * 26, 0, W, H)
  } else { ctx.translate(cx, cy); ctx.rotate(Math.sin(tt * 1.7) * 0.012); ctx.scale(1.06, 1.06); ctx.translate(-cx, -cy); ctx.drawImage(c as unknown as CanvasImageSource, 0, 0, BW, BH, 0, 0, W, H) }   // a cuadro completo, con un ligero vaivén
  ctx.restore()
  const flash = Math.max(0, 1 - tt / 0.18); if (flash > 0) { ctx.save(); ctx.fillStyle = `rgba(255,255,255,${0.7 * flash})`; ctx.fillRect(0, 0, W, H); ctx.restore() }
}

/** Dibuja la escena `o` (graphic con template 'escena') en el instante `t`. */
export function dibujarEscena(ctx: CanvasRenderingContext2D, o: TextLayer, t: number) {
  if (o.type !== 'graphic') return
  if ((o.props?.tipo ?? 'claude') === 'pantalla') dibujarPantalla(ctx, o, t); else dibujarChispa(ctx, o, t)
}
