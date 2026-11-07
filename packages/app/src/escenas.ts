import type { TextLayer } from '@gojaguar/core'
import { H, W } from './constants'

/**
 * Escenas animadas con seudo-3D dibujadas con código (sin texto legible): el muñeco de Claude y una persona trabajando frente a un Mac.
 * Todo sale solo del tiempo `t` (nada de azar entre fotogramas), así la vista previa y el MP4 exportado coinciden.
 * Capa gráfica con `template: 'escena'` y `props`: tipo ('claude' | 'trabajo'), humor ('triste' | 'curioso' | 'feliz'), pantalla ('editor' | 'codigo'), lado ('izq' | 'der' | 'centro').
 */
const NARANJA_CLAUDE = '#d97757'
const clamp01 = (x: number) => Math.min(Math.max(x, 0), 1)
const easeOut3 = (x: number) => 1 - Math.pow(1 - clamp01(x), 3)
const easeBack = (x: number) => { const c1 = 1.70158, c3 = c1 + 1, v = clamp01(x); return 1 + c3 * Math.pow(v - 1, 3) + c1 * Math.pow(v - 1, 2) }
const alea = (i: number) => { const s = Math.sin(i * 12.9898 + 78.233) * 43758.5453; return s - Math.floor(s) }      // azar determinista

type Ctx = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D
const lienzos = new Map<string, OffscreenCanvas>()
function lienzo(clave: string, w: number, h: number) {
  let c = lienzos.get(clave)
  if (!c || c.width !== w || c.height !== h) { c = new OffscreenCanvas(w, h); lienzos.set(clave, c) }
  const x = c.getContext('2d')!; x.setTransform(1, 0, 0, 1, 0, 0); x.clearRect(0, 0, w, h); return { c, x }
}

export interface Caja { x: number; y: number; w: number; h: number }
/** Caja de reposo de la escena (para hit-test, asas y margen). */
export function cajaEscena(o: TextLayer): Caja {
  const pr = o.type === 'graphic' ? o.props ?? {} : {}
  if ((pr.tipo ?? 'claude') === 'trabajo') { const w = W * 0.94, h = w * 0.82; return { x: W * 0.5 - w / 2, y: H * 0.30 - h / 2, w, h } }
  const lado = pr.lado ?? 'der', w = W * 0.66
  return { x: (lado === 'izq' ? 0.3 : lado === 'der' ? 0.7 : 0.5) * W - w / 2, y: H * 0.2 - w / 2, w, h: w }
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
// MUÑECO DE CLAUDE
// ---------------------------------------------------------------------------------------------------------------------------
function pintarClaude(c: Ctx, S: number, t: number, humor: string) {
  const triste = humor === 'triste' ? easeOut3((t - 0.5) / 0.7) : 0
  const feliz = humor === 'feliz' ? easeOut3((t - 0.3) / 0.4) : 0
  const resp = Math.sin(t * 3.1) * 0.008 * S                       // respira
  const temblor = triste > 0.4 ? Math.sin(t * 46) * 0.0035 * S * triste : 0
  const salto = feliz ? -Math.abs(Math.sin(t * 6)) * 0.05 * S * feliz : 0
  const bx = S * 0.5 + temblor, by = S * 0.54 + triste * 0.03 * S + resp + salto
  const bw = S * 0.62, bh = S * 0.40 * (1 - 0.07 * triste)
  // resplandor y sombra en el suelo
  const rg = c.createRadialGradient(S / 2, S * 0.55, 0, S / 2, S * 0.55, S * 0.55); rg.addColorStop(0, humor === 'triste' ? 'rgba(120,150,255,.28)' : 'rgba(255,140,80,.35)'); rg.addColorStop(1, 'rgba(0,0,0,0)')
  c.fillStyle = rg; c.fillRect(0, 0, S, S)
  c.fillStyle = 'rgba(0,0,0,.35)'; c.beginPath(); c.ellipse(S / 2, S * 0.84, bw * 0.62 * (1 + salto / S), S * 0.035, 0, 0, Math.PI * 2); c.fill()
  const cuerpo = (dx: number, dy: number, col: string) => {
    c.fillStyle = col
    c.beginPath(); c.roundRect(bx - bw / 2 + dx, by - bh / 2 + dy, bw, bh, S * 0.04); c.fill()                         // cuerpo
    const brazo = (lado: number) => {                                                                              // brazos: caídos si está triste
      const ang = (0.35 + triste * 0.5 - feliz * 1.1 * Math.abs(Math.sin(t * 6))) * lado
      c.save(); c.translate(bx + lado * (bw / 2) + dx, by + dy - bh * 0.05); c.rotate(ang); c.beginPath(); c.roundRect(lado > 0 ? -S * 0.005 : -S * 0.075, -S * 0.02, S * 0.08, S * 0.11, S * 0.025); c.fill(); c.restore()
    }
    brazo(1); brazo(-1)
    for (let i = 0; i < 4; i++) { c.beginPath(); c.roundRect(bx - bw * 0.36 + i * bw * 0.24 + dx, by + bh / 2 - S * 0.005 + dy, S * 0.055, S * 0.085, S * 0.015); c.fill() }   // patitas
  }
  cuerpo(S * 0.03, S * 0.03, '#8a3d22'); cuerpo(S * 0.016, S * 0.016, '#b4532f')                                       // extrusión (profundidad)
  cuerpo(0, 0, NARANJA_CLAUDE)
  const g = c.createLinearGradient(0, by - bh / 2, 0, by + bh / 2); g.addColorStop(0, 'rgba(255,255,255,.32)'); g.addColorStop(0.45, 'rgba(255,255,255,0)'); g.addColorStop(1, 'rgba(0,0,0,.22)')
  c.fillStyle = g; c.beginPath(); c.roundRect(bx - bw / 2, by - bh / 2, bw, bh, S * 0.04); c.fill()
  // cara
  const ey = by - bh * 0.1 + triste * 0.02 * S, ex = bw * 0.2
  const mira = humor === 'curioso' ? Math.sin(t * 2.2) * S * 0.012 : 0, parpadeo = (t % 3.2) < 0.12 ? 0.15 : 1
  c.fillStyle = '#2a1410'
  for (const l of [-1, 1]) {
    const eh = S * 0.085 * parpadeo * (1 - 0.35 * triste) * (feliz ? 0.6 : 1)
    c.beginPath(); c.roundRect(bx + l * ex - S * 0.022 + mira, ey - eh / 2, S * 0.044, Math.max(eh, S * 0.01), S * 0.012); c.fill()
    if (triste > 0.05) {                                                                                           // cejas caídas hacia afuera
      c.strokeStyle = '#2a1410'; c.lineWidth = S * 0.014; c.lineCap = 'round'
      c.beginPath(); c.moveTo(bx + l * (ex + S * 0.05), ey - S * 0.075 + triste * S * 0.02); c.lineTo(bx + l * (ex - S * 0.045), ey - S * 0.075 - triste * S * 0.035); c.stroke()
    }
  }
  if (triste > 0.1) {                                                                                              // boca triste y lágrima
    c.strokeStyle = '#2a1410'; c.lineWidth = S * 0.012; c.beginPath(); c.arc(bx, ey + S * 0.115, S * 0.03, Math.PI * 1.15, Math.PI * 1.85); c.stroke()
    const p = ((t - 0.9) % 1.3) / 1.3
    if (t > 0.9) { c.fillStyle = 'rgba(150,210,255,.9)'; const tx = bx - ex - S * 0.01, ty = ey + S * 0.03 + p * S * 0.2; c.beginPath(); c.ellipse(tx, ty, S * 0.011, S * 0.017, 0, 0, Math.PI * 2); c.fill() }
  } else if (feliz > 0.1) { c.strokeStyle = '#2a1410'; c.lineWidth = S * 0.012; c.beginPath(); c.arc(bx, ey + S * 0.06, S * 0.03, 0.15 * Math.PI, 0.85 * Math.PI); c.stroke() }
  if (triste > 0.3) {                                                                                              // nubecita de lluvia sobre la cabeza
    const nx = bx + S * 0.02, ny = by - bh / 2 - S * 0.14, a = clamp01(triste)
    c.fillStyle = `rgba(70,80,110,${0.9 * a})`
    for (const [dx, dy, r] of [[-0.07, 0.01, 0.06], [0, -0.02, 0.075], [0.075, 0.012, 0.055], [0.01, 0.025, 0.07]]) { c.beginPath(); c.arc(nx + dx * S, ny + dy * S, r * S, 0, Math.PI * 2); c.fill() }
    c.strokeStyle = `rgba(160,200,255,${0.85 * a})`; c.lineWidth = S * 0.008; c.lineCap = 'round'
    for (let i = 0; i < 6; i++) { const f = (t * 1.6 + i * 0.37) % 1, x = nx + (i - 2.5) * S * 0.035; c.beginPath(); c.moveTo(x, ny + S * 0.06 + f * S * 0.12); c.lineTo(x - S * 0.004, ny + S * 0.075 + f * S * 0.12); c.stroke() }
  }
}

function dibujarClaude(ctx: CanvasRenderingContext2D, o: TextLayer, t: number) {
  if (o.type !== 'graphic') return
  const pr = o.props ?? {}, b = cajaEscena(o), S = Math.round(b.w * 1.5)
  const tt = t - o.start, dur = o.end - o.start, k = easeBack(tt / 0.75), ex = clamp01((tt - (dur - 0.45)) / 0.45), lado = pr.lado ?? 'der'
  const { c, x } = lienzo('claude', S, S); pintarClaude(x, S, tt, pr.humor ?? 'triste')
  const dir = lado === 'izq' ? -1 : 1
  const th = dir * ((1 - Math.min(k, 1.1)) * 1.4 + ex * 1.2) + Math.sin(tt * 1.6) * 0.07 + dir * -0.16
  const cx = b.x + b.w / 2 + dir * ex * W * 0.08, cy = b.y + b.h / 2 + Math.sin(tt * 2.3) * H * 0.006 + (1 - Math.min(k, 1)) * H * 0.04
  proyectar(ctx, c, cx, cy, b.w, b.h, th, clamp01(tt / 0.2) * (1 - ex), 0.45 + 0.55 * Math.min(k, 1.08))
}

// ---------------------------------------------------------------------------------------------------------------------------
// PERSONA TRABAJANDO EN UN MAC
// ---------------------------------------------------------------------------------------------------------------------------
function pintarPantalla(c: Ctx, w: number, h: number, t: number, tipo: string) {
  c.fillStyle = '#0d0f17'; c.fillRect(0, 0, w, h)
  const luces = ['#ff5f57', '#febc2e', '#28c840']; luces.forEach((col, i) => { c.fillStyle = col; c.beginPath(); c.arc(h * 0.05 + i * h * 0.05, h * 0.05, h * 0.016, 0, Math.PI * 2); c.fill() })
  if (tipo === 'codigo') {
    c.fillStyle = '#141826'; c.fillRect(0, h * 0.1, w * 0.18, h * 0.9)
    for (let i = 0; i < 9; i++) { c.fillStyle = i === 2 ? '#3b4a7a' : '#242a40'; c.fillRect(w * 0.02, h * 0.15 + i * h * 0.07, w * (0.06 + 0.06 * alea(i)), h * 0.025) }
    const cols = ['#ff9e64', '#7aa2f7', '#9ece6a', '#bb9af7', '#e0af68', '#c0caf5']
    const nl = 13, cps = 46, total = t * cps                         // caracteres por segundo
    let usado = 0
    for (let l = 0; l < nl; l++) {
      const ind = Math.floor(alea(l * 3.1) * 3) * 0.05, y = h * 0.14 + l * h * 0.062
      const segs = 2 + Math.floor(alea(l + 9) * 4); let x = w * (0.22 + ind)
      c.fillStyle = '#3a4160'; c.fillRect(w * 0.195, y, w * 0.012, h * 0.022)
      for (let s = 0; s < segs; s++) {
        const largo = 4 + Math.floor(alea(l * 7 + s) * 10), vis = clamp01((total - usado) / largo); usado += largo
        c.fillStyle = cols[Math.floor(alea(l * 5 + s * 2.3) * cols.length)]
        const ww = w * 0.0145 * largo * vis; if (ww > 0) { c.beginPath(); c.roundRect(x, y, ww, h * 0.024, 3); c.fill() }
        x += w * 0.0145 * largo + w * 0.012
      }
    }
    if (Math.floor(t * 2.2) % 2 === 0) { c.fillStyle = '#e8e8e8'; c.fillRect(w * 0.5 + Math.sin(t) * w * 0.02, h * 0.14 + Math.min(12, Math.floor(total / 40)) * h * 0.062, w * 0.008, h * 0.04) }
  } else {
    // editor de video en tiempo real: panel de medios, vista previa, ajustes y línea de tiempo con el cabezal en movimiento
    c.fillStyle = '#161a27'; c.fillRect(0, h * 0.1, w * 0.22, h * 0.52)
    for (let i = 0; i < 6; i++) { const cx = w * 0.015 + (i % 2) * w * 0.1, cy = h * 0.13 + Math.floor(i / 2) * h * 0.16; const g = c.createLinearGradient(cx, cy, cx + w * 0.09, cy + h * 0.13); g.addColorStop(0, ['#3b6ea5', '#a55a3b', '#4f9a6a'][i % 3]); g.addColorStop(1, '#1a1f30'); c.fillStyle = g; c.beginPath(); c.roundRect(cx, cy, w * 0.09, h * 0.13, 4); c.fill() }
    const px = w * 0.24, pw = w * 0.5, ph = h * 0.5
    const pg = c.createLinearGradient(px, h * 0.1, px + pw, h * 0.1 + ph); pg.addColorStop(0, '#2a2f55'); pg.addColorStop(1, '#8a4a2a'); c.fillStyle = pg; c.beginPath(); c.roundRect(px, h * 0.11, pw, ph, 6); c.fill()
    c.fillStyle = 'rgba(255,255,255,.85)'; c.beginPath(); c.arc(px + pw * (0.3 + 0.4 * ((t * 0.18) % 1)), h * 0.11 + ph * 0.55, ph * 0.11, 0, Math.PI * 2); c.fill()      // sujeto que se mueve
    c.fillStyle = '#161a27'; c.fillRect(w * 0.76, h * 0.1, w * 0.24, h * 0.52)
    for (let i = 0; i < 5; i++) { c.fillStyle = '#2a3048'; c.fillRect(w * 0.78, h * 0.15 + i * h * 0.09, w * 0.2, h * 0.012); c.fillStyle = '#ff7a00'; c.beginPath(); c.arc(w * (0.79 + 0.17 * (0.5 + 0.5 * Math.sin(t * (0.8 + i * 0.35) + i))), h * 0.156 + i * h * 0.09, h * 0.014, 0, Math.PI * 2); c.fill() }
    // línea de tiempo
    const ty = h * 0.66; c.fillStyle = '#10131e'; c.fillRect(0, ty, w, h - ty)
    const filas = [['#4f9a6a', 5], ['#3b6ea5', 7], ['#a55a3b', 4]] as const
    filas.forEach(([col, n], r) => {
      let x = w * 0.03
      for (let i = 0; i < n; i++) {
        const ancho = w * (0.07 + 0.09 * alea(r * 9 + i)), crec = clamp01((t * 0.9 - (r * 0.2 + i * 0.12)) / 0.35)
        c.fillStyle = col; c.globalAlpha = 0.9; c.beginPath(); c.roundRect(x, ty + h * 0.03 + r * h * 0.1, ancho * crec, h * 0.075, 3); c.fill(); c.globalAlpha = 1
        x += ancho + w * 0.012
      }
    })
    for (let i = 0; i < 60; i++) { c.fillStyle = '#3a4160'; c.fillRect(w * 0.03 + i * w * 0.0155, ty + h * 0.34 - (i % 4 === 0 ? h * 0.02 : h * 0.008) * 1, 1.5, h * 0.02) }
    const hx = w * (0.1 + 0.8 * ((t * 0.16) % 1)); c.fillStyle = '#fff'; c.fillRect(hx, ty, 2, h - ty); c.beginPath(); c.moveTo(hx - 6, ty); c.lineTo(hx + 8, ty); c.lineTo(hx + 1, ty + 9); c.fill()
  }
}

/** Escena completa dentro de un lienzo de w×h: cuarto oscuro, escritorio, Mac con pantalla animada y una persona tecleando. */
function pintarTrabajo(c: Ctx, w: number, h: number, t: number, pantalla: string) {
  const fondo = c.createLinearGradient(0, 0, 0, h); fondo.addColorStop(0, '#171a36'); fondo.addColorStop(0.7, '#241a30'); fondo.addColorStop(1, '#0f0c16'); c.fillStyle = fondo; c.fillRect(0, 0, w, h)
  const ventana = c.createRadialGradient(w * 0.12, h * 0.15, 0, w * 0.12, h * 0.15, w * 0.45); ventana.addColorStop(0, 'rgba(255,170,90,.22)'); ventana.addColorStop(1, 'rgba(255,170,90,0)'); c.fillStyle = ventana; c.fillRect(0, 0, w, h)
  // escritorio con perspectiva
  const mesa = c.createLinearGradient(0, h * 0.72, 0, h); mesa.addColorStop(0, '#3a2a22'); mesa.addColorStop(1, '#1d1410'); c.fillStyle = mesa
  c.beginPath(); c.moveTo(0, h * 0.8); c.lineTo(w, h * 0.74); c.lineTo(w, h); c.lineTo(0, h); c.fill()
  c.strokeStyle = 'rgba(255,255,255,.05)'; c.lineWidth = 2; for (let i = 0; i < 7; i++) { c.beginPath(); c.moveTo(w * (i / 6), h); c.lineTo(w * (0.4 + i * 0.03), h * 0.77); c.stroke() }
  const tecleo = (v: number) => Math.sin(t * 17 + v) * 0.5 + 0.5
  // pantalla del Mac (giro de ~30°): se dibuja en un lienzo aparte y se pega por tiras con altura distinta a izquierda y derecha
  const sw = 720, sh = 440; const { c: pc, x: px } = lienzo('pantalla', sw, sh); pintarPantalla(px, sw, sh, t, pantalla)
  const L = { x: w * 0.44, t: h * 0.27, b: h * 0.66 }, R = { x: w * 0.94, t: h * 0.17, b: h * 0.7 }
  // brillo de la pantalla sobre la escena
  const gl = c.createRadialGradient(w * 0.7, h * 0.45, 0, w * 0.7, h * 0.45, w * 0.55); gl.addColorStop(0, pantalla === 'codigo' ? 'rgba(120,150,255,.35)' : 'rgba(255,200,150,.30)'); gl.addColorStop(1, 'rgba(0,0,0,0)'); c.fillStyle = gl; c.fillRect(0, 0, w, h)
  // base y teclado
  c.fillStyle = '#9aa0ab'; c.beginPath(); c.moveTo(L.x - w * 0.01, L.b + h * 0.01); c.lineTo(R.x + w * 0.02, R.b + h * 0.01); c.lineTo(R.x + w * 0.05, R.b + h * 0.13); c.lineTo(L.x - w * 0.09, L.b + h * 0.14); c.closePath(); c.fill()
  c.fillStyle = '#1b1d24'; c.beginPath(); c.moveTo(L.x + w * 0.0, L.b + h * 0.03); c.lineTo(R.x, R.b + h * 0.03); c.lineTo(R.x + w * 0.03, R.b + h * 0.115); c.lineTo(L.x - w * 0.07, L.b + h * 0.125); c.closePath(); c.fill()
  for (let r = 0; r < 4; r++) for (let k = 0; k < 14; k++) {                                                          // teclas que parpadean al teclear
    const u = k / 13, v = r / 3, x0 = L.x - w * 0.06 + u * (R.x - L.x + w * 0.09) + v * -w * 0.0, yTop = (L.b + h * 0.04 + (R.b - L.b) * u) + v * (h * 0.075) - (1 - u) * 0
    const act = alea(k * 13 + r + Math.floor(t * 9)) > 0.82
    c.fillStyle = act ? 'rgba(255,190,120,.95)' : 'rgba(255,255,255,.14)'; c.fillRect(x0 - v * w * 0.03, yTop, w * 0.026, h * 0.016)
  }
  // la pantalla en sí
  const N = 48
  for (let i = 0; i < N; i++) {
    const u0 = i / N, u1 = (i + 1) / N, x0 = L.x + (R.x - L.x) * u0, x1 = L.x + (R.x - L.x) * u1
    const t0 = L.t + (R.t - L.t) * u0, b0 = L.b + (R.b - L.b) * u0, t1 = L.t + (R.t - L.t) * u1, b1 = L.b + (R.b - L.b) * u1
    c.drawImage(pc as unknown as CanvasImageSource, u0 * sw, 0, sw / N + 0.5, sh, x0, (t0 + t1) / 2, x1 - x0 + 0.8, ((b0 - t0) + (b1 - t1)) / 2)
  }
  c.strokeStyle = '#c7ccd6'; c.lineWidth = 5; c.beginPath(); c.moveTo(L.x, L.t); c.lineTo(R.x, R.t); c.lineTo(R.x, R.b); c.lineTo(L.x, L.b); c.closePath(); c.stroke()
  // persona (de espaldas, 3/4): torso, cabeza, cabello y brazos que teclean
  const px0 = w * 0.2, py0 = h * 0.42, respira = Math.sin(t * 2.4) * h * 0.004, mueve = Math.sin(t * 1.3) * w * 0.006
  const sombra = c.createLinearGradient(px0 - w * 0.2, 0, px0 + w * 0.25, 0); sombra.addColorStop(0, '#2a2d4a'); sombra.addColorStop(0.7, '#3d3f66'); sombra.addColorStop(1, '#6a6fa8')
  c.fillStyle = sombra; c.beginPath(); c.moveTo(px0 - w * 0.2, h * 0.95); c.quadraticCurveTo(px0 - w * 0.2, py0 + h * 0.17, px0 - w * 0.09, py0 + h * 0.12 + respira); c.lineTo(px0 + w * 0.09, py0 + h * 0.12 + respira)
  c.quadraticCurveTo(px0 + w * 0.2, py0 + h * 0.17, px0 + w * 0.2, h * 0.95); c.closePath(); c.fill()                                                // torso (sudadera)
  c.fillStyle = '#d6a07e'; c.fillRect(px0 - w * 0.025 + mueve, py0 + h * 0.06 + respira, w * 0.05, h * 0.08)                                              // cuello
  c.beginPath(); c.ellipse(px0 + mueve, py0 + respira, w * 0.075, h * 0.1, 0.12, 0, Math.PI * 2); c.fill()                                               // cabeza
  const pelo = c.createLinearGradient(px0 - w * 0.07, py0 - h * 0.1, px0 + w * 0.08, py0 + h * 0.05); pelo.addColorStop(0, '#1a1320'); pelo.addColorStop(1, '#4a3a58'); c.fillStyle = pelo
  c.beginPath(); c.ellipse(px0 + mueve - w * 0.004, py0 - h * 0.012 + respira, w * 0.08, h * 0.095, 0.1, Math.PI * 0.95, Math.PI * 2.15); c.fill()
  c.beginPath(); c.ellipse(px0 + mueve - w * 0.03, py0 + h * 0.03 + respira, w * 0.05, h * 0.075, 0.2, 0, Math.PI * 2); c.fill()
  c.fillStyle = 'rgba(160,190,255,.55)'; c.beginPath(); c.ellipse(px0 + mueve + w * 0.062, py0 + h * 0.005 + respira, w * 0.014, h * 0.075, 0.1, -1.2, 1.2); c.fill()  // luz de la pantalla en el borde
  const brazo = (lado: number) => {                                                                                                                       // hombro → codo → mano sobre el teclado
    const sx = px0 + lado * w * 0.12, sy = py0 + h * 0.15 + respira, mano = tecleo(lado * 2) * h * 0.02
    const hx = L.x + w * (0.05 + 0.12 * (lado > 0 ? 1 : 0)), hy = L.b + h * 0.1 - mano, ex = (sx + hx) / 2 + lado * w * 0.015, ey = Math.max(sy, hy) + h * 0.06
    c.strokeStyle = '#3a3c60'; c.lineCap = 'round'; c.lineWidth = h * 0.055; c.beginPath(); c.moveTo(sx, sy); c.lineTo(ex, ey); c.stroke()
    c.strokeStyle = '#4a4d78'; c.lineWidth = h * 0.045; c.beginPath(); c.moveTo(ex, ey); c.lineTo(hx, hy); c.stroke()
    c.fillStyle = '#d6a07e'; c.beginPath(); c.arc(hx, hy, h * 0.026, 0, Math.PI * 2); c.fill()
  }
  brazo(-1); brazo(1)
  // partículas de luz y viñeta
  for (let i = 0; i < 14; i++) { const f = (t * (0.05 + 0.04 * alea(i)) + alea(i + 3)) % 1; c.fillStyle = `rgba(255,220,180,${0.35 * Math.sin(Math.PI * f)})`; c.beginPath(); c.arc(w * alea(i + 7), h * (1 - f), 2 + 3 * alea(i + 11), 0, Math.PI * 2); c.fill() }
  const vg = c.createRadialGradient(w / 2, h / 2, h * 0.35, w / 2, h / 2, h * 0.9); vg.addColorStop(0, 'rgba(0,0,0,0)'); vg.addColorStop(1, 'rgba(0,0,0,.55)'); c.fillStyle = vg; c.fillRect(0, 0, w, h)
}

function dibujarTrabajo(ctx: CanvasRenderingContext2D, o: TextLayer, t: number) {
  if (o.type !== 'graphic') return
  const pr = o.props ?? {}, b = cajaEscena(o), cw = Math.round(b.w), ch = Math.round(b.h)
  const tt = t - o.start, dur = o.end - o.start, k = easeBack(tt / 0.7), ex = clamp01((tt - (dur - 0.4)) / 0.4)
  const { c, x } = lienzo('trabajo', cw, ch)
  const zoom = 1 + 0.07 * clamp01(tt / Math.max(dur, 0.1))                                    // empuje lento de cámara dentro de la escena
  x.save(); x.translate(cw / 2, ch / 2); x.scale(zoom, zoom); x.translate(-cw / 2, -ch / 2); pintarTrabajo(x, cw, ch, tt, pr.pantalla ?? 'editor'); x.restore()
  x.globalCompositeOperation = 'destination-in'; x.fillStyle = '#000'; x.beginPath(); x.roundRect(0, 0, cw, ch, cw * 0.035); x.fill(); x.globalCompositeOperation = 'source-over'
  x.strokeStyle = 'rgba(255,255,255,.45)'; x.lineWidth = 3; x.beginPath(); x.roundRect(1.5, 1.5, cw - 3, ch - 3, cw * 0.035); x.stroke()
  const th = (1 - Math.min(k, 1.1)) * -1.25 + ex * 1.1 + Math.sin(tt * 1.3) * 0.035 + 0.05
  const cx = b.x + b.w / 2, cy = b.y + b.h / 2 + Math.sin(tt * 1.9) * H * 0.004
  const rg = ctx.createRadialGradient(cx, cy, 0, cx, cy, b.w * 0.7); rg.addColorStop(0, 'rgba(255,140,60,.25)'); rg.addColorStop(1, 'rgba(255,140,60,0)')
  ctx.save(); ctx.globalAlpha = clamp01(tt / 0.2) * (1 - ex); ctx.fillStyle = rg; ctx.fillRect(cx - b.w, cy - b.h, b.w * 2, b.h * 2); ctx.restore()
  proyectar(ctx, c, cx, cy, b.w, b.h, th, clamp01(tt / 0.2) * (1 - ex), 0.8 + 0.2 * Math.min(k, 1.06))
}

/** Dibuja la escena `o` (graphic con template 'escena') en el instante `t`. */
export function dibujarEscena(ctx: CanvasRenderingContext2D, o: TextLayer, t: number) {
  if (o.type !== 'graphic') return
  if ((o.props?.tipo ?? 'claude') === 'trabajo') dibujarTrabajo(ctx, o, t); else dibujarClaude(ctx, o, t)
}
