import type { TextLayer } from '@gojaguar/core'
import { H, W } from './constants'

/**
 * Escenas animadas con seudo-3D dibujadas con código (sin texto legible). Todo sale solo del tiempo `t` (nada de azar entre fotogramas),
 * así la vista previa y el MP4 exportado coinciden. Capa gráfica con `template: 'escena'` y `props`:
 *  - tipo 'claude'  : el muñeco de Claude (naranja, 3D). `anim`: 'golpe' (vuela, te pega en la cabeza —el centro de su caja—, rebota, se marea y al final se cae) | 'baile' | 'quieto';
 *                     `humor` al quedarse: 'loco' | 'triste' | 'feliz' | 'asustado' | 'culpable' (encogido, mira de lado, una lágrima); `lado` desde donde entra: 'izq' | 'der' | 'centro'; `tam`: factor de tamaño; `y`: altura del golpe (fracción del alto, 0,2 = cabeza).
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
  const lado = pr.lado ?? 'der', w = W * 0.7 * (parseFloat(pr.tam ?? '1') || 1), cy = (parseFloat(pr.y ?? '') || 0.2) * H
  return { x: (lado === 'izq' ? 0.3 : lado === 'der' ? 0.7 : 0.5) * W - w / 2, y: cy - w / 2, w, h: w }
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
// MUÑECO DE CLAUDE (seudo-3D: extrusión con volumen, brillo y squash & stretch)
// ---------------------------------------------------------------------------------------------------------------------------
interface Pose {
  sx: number; sy: number                       // aplastado / estirado
  brazoI: number; brazoD: number               // ángulos de los brazos (rad, 0 = abajo)
  pata: number                                 // fase de las patitas
  ojos: 'normal' | 'espiral' | 'llorando' | 'feliz' | 'asustado' | 'x'
  boca: 'neutra' | 'o' | 'sonrisa' | 'triste' | 'grito'
  mareo: number                                // 0..1 estrellitas dando vueltas
  triste: number                               // 0..1 tinte azul y cejas caídas
  tiembla: number                              // 0..1 temblor
  sudor: number                                // 0..1 gotas de sudor
  mirada: number                              // -1..1 hacia dónde mira (evita tu mirada) y algo hacia abajo si ≠ 0
  lagrima: number                             // 0..1 una lágrima suelta
}
const poseBase = (): Pose => ({ sx: 1, sy: 1, brazoI: 0.45, brazoD: -0.45, pata: 0, ojos: 'normal', boca: 'neutra', mareo: 0, triste: 0, tiembla: 0, sudor: 0, mirada: 0, lagrima: 0 })

function pintarMuneco(c: Ctx, S: number, t: number, p: Pose) {
  const cx = S / 2 + (p.tiembla ? Math.sin(t * 60) * S * 0.008 * p.tiembla : 0), cy = S * 0.52
  const bw = S * 0.5, bh = S * 0.34, prof = S * 0.06
  const naranja = mezcla('#e0714a', '#6f86bd', p.triste), oscuro = mezcla('#8f3a1e', '#33436b', p.triste), medio = mezcla('#b9502d', '#4d6196', p.triste)
  c.save(); c.translate(cx, cy); c.scale(p.sx, p.sy); c.translate(-cx, -cy)
  // patitas (4) con vaivén
  const pata = (x: number, fase: number, col: string, dx: number, dy: number) => {
    const ang = Math.sin(p.pata + fase) * 0.45; c.save(); c.translate(x + dx, cy + bh / 2 - S * 0.02 + dy); c.rotate(ang); c.fillStyle = col; c.beginPath(); c.roundRect(-S * 0.03, 0, S * 0.06, S * 0.11, S * 0.02); c.fill(); c.restore()
  }
  for (let i = 0; i < 4; i++) { const x = cx - bw * 0.36 + i * bw * 0.24; pata(x, i * 1.7, oscuro, prof * 0.6, prof * 0.6); pata(x, i * 1.7, naranja, 0, 0) }
  // cuerpo con volumen: capas desplazadas hacia abajo-derecha (cara lateral) y cara frontal con brillo
  const cuerpo = (dx: number, dy: number, col: string) => { c.fillStyle = col; c.beginPath(); c.roundRect(cx - bw / 2 + dx, cy - bh / 2 + dy, bw, bh, S * 0.06); c.fill() }
  for (let k = 12; k >= 1; k--) cuerpo((k / 12) * prof, (k / 12) * prof, mezcla(oscuro, medio, 1 - k / 12))
  cuerpo(0, 0, naranja)
  const g = c.createLinearGradient(0, cy - bh / 2, 0, cy + bh / 2); g.addColorStop(0, 'rgba(255,255,255,.42)'); g.addColorStop(0.4, 'rgba(255,255,255,.05)'); g.addColorStop(1, 'rgba(60,10,0,.28)')
  c.fillStyle = g; c.beginPath(); c.roundRect(cx - bw / 2, cy - bh / 2, bw, bh, S * 0.06); c.fill()
  c.fillStyle = 'rgba(255,255,255,.55)'; c.beginPath(); c.roundRect(cx - bw / 2 + S * 0.03, cy - bh / 2 + S * 0.02, bw * 0.38, S * 0.022, S * 0.011); c.fill()      // brillo
  // brazos (cuadraditos con articulación)
  const brazo = (lado: number, ang: number) => {
    c.save(); c.translate(cx + lado * (bw / 2 - S * 0.005), cy - bh * 0.02); c.rotate(ang)
    c.fillStyle = oscuro; c.beginPath(); c.roundRect(lado > 0 ? 0 + prof * 0.4 : -S * 0.1 + prof * 0.4, -S * 0.025 + prof * 0.4, S * 0.1, S * 0.15, S * 0.03); c.fill()
    c.fillStyle = naranja; c.beginPath(); c.roundRect(lado > 0 ? 0 : -S * 0.1, -S * 0.025, S * 0.1, S * 0.15, S * 0.03); c.fill(); c.restore()
  }
  brazo(-1, p.brazoI * -1 + 0.0); brazo(1, p.brazoD * -1)
  // cara
  const ex = bw * 0.2, ey = cy - bh * 0.1
  c.lineCap = 'round'; c.strokeStyle = '#2a1410'; c.fillStyle = '#2a1410'; c.lineWidth = S * 0.014
  for (const l of [-1, 1]) {
    const x = cx + l * ex
    if (p.ojos === 'espiral') { c.beginPath(); for (let a = 0; a < 16; a += 0.4) { const r = S * 0.0045 * a; c.lineTo(x + Math.cos(a + t * 14 * l) * r, ey + Math.sin(a + t * 14 * l) * r) } c.stroke() }
    else if (p.ojos === 'x') { const d = S * 0.03; c.beginPath(); c.moveTo(x - d, ey - d); c.lineTo(x + d, ey + d); c.moveTo(x + d, ey - d); c.lineTo(x - d, ey + d); c.stroke() }
    else if (p.ojos === 'feliz') { c.beginPath(); c.arc(x, ey + S * 0.012, S * 0.03, Math.PI * 1.1, Math.PI * 1.9); c.stroke() }
    else {
      const gran = p.ojos === 'asustado' ? 1.3 : p.ojos === 'llorando' ? 1.15 : 1, blink = p.ojos === 'normal' && (t % 3.4) < 0.1 ? 0.15 : 1
      const mx = p.mirada * S * 0.016, my2 = p.mirada ? S * 0.012 : 0, hh = p.mirada ? 0.78 : 1          // si evita tu mirada: ojos hacia un lado y abajo, algo caídos
      c.fillStyle = '#2a1410'; c.beginPath(); c.roundRect(x - S * 0.024 * gran + mx, ey - S * 0.05 * gran * blink * hh + my2, S * 0.048 * gran, S * 0.1 * gran * blink * hh, S * 0.02); c.fill()
      c.fillStyle = '#fff'; c.beginPath(); c.arc(x - S * 0.006 + mx, ey - S * 0.02 * gran + my2, S * 0.009 * gran, 0, Math.PI * 2); c.fill()
    }
    if (p.triste > 0.05) { c.strokeStyle = '#2a1410'; c.lineWidth = S * 0.012; c.beginPath(); c.moveTo(x + l * S * 0.04, ey - S * 0.07 + p.triste * S * 0.012); c.lineTo(x - l * S * 0.04, ey - S * 0.07 - p.triste * S * 0.025); c.stroke() }
  }
  c.strokeStyle = '#2a1410'; c.fillStyle = '#2a1410'; c.lineWidth = S * 0.012
  const my = cy + bh * 0.12
  if (p.boca === 'o') { c.beginPath(); c.ellipse(cx, my + S * 0.015, S * 0.022, S * 0.03, 0, 0, Math.PI * 2); c.fill() }
  else if (p.boca === 'grito') { c.beginPath(); c.ellipse(cx, my + S * 0.02, S * 0.04, S * 0.05, 0, 0, Math.PI * 2); c.fill(); c.fillStyle = '#ff7a80'; c.beginPath(); c.ellipse(cx, my + S * 0.04, S * 0.025, S * 0.018, 0, 0, Math.PI * 2); c.fill() }
  else if (p.boca === 'sonrisa') { c.beginPath(); c.arc(cx, my - S * 0.01, S * 0.045, 0.1 * Math.PI, 0.9 * Math.PI); c.stroke() }
  else if (p.boca === 'triste') { c.beginPath(); c.arc(cx, my + S * 0.05, S * 0.04, Math.PI * 1.15, Math.PI * 1.85); c.stroke() }
  else { c.beginPath(); c.moveTo(cx - S * 0.025, my + S * 0.01); c.lineTo(cx + S * 0.025, my + S * 0.01); c.stroke() }
  if (p.ojos === 'llorando') {                                                                                         // lágrimas
    c.fillStyle = 'rgba(160,215,255,.95)'
    for (let i = 0; i < 8; i++) { const l = i % 2 ? 1 : -1, f = (t * 1.6 + i * 0.19) % 1; c.globalAlpha = 1 - f; c.beginPath(); c.ellipse(cx + l * (ex + S * 0.012), ey + S * 0.05 + f * S * 0.22, S * 0.012, S * 0.02, 0, 0, Math.PI * 2); c.fill() }
    c.globalAlpha = 1
  }
  if (p.lagrima > 0.05) { const f = (t * 0.7) % 1; c.fillStyle = 'rgba(160,215,255,.95)'; c.globalAlpha = p.lagrima * (1 - f * f); c.beginPath(); c.ellipse(cx + ex + S * 0.02, ey + S * 0.05 + f * S * 0.2, S * 0.013, S * 0.022, 0, 0, Math.PI * 2); c.fill(); c.globalAlpha = 1 }
  if (p.sudor > 0.05) { c.fillStyle = 'rgba(170,225,255,.95)'; for (let i = 0; i < 3; i++) { const f = (t * 2.2 + i * 0.33) % 1, x = cx + (i - 1) * bw * 0.32; c.globalAlpha = p.sudor * (1 - f); c.beginPath(); c.ellipse(x, cy - bh / 2 - S * 0.02 + f * S * 0.1, S * 0.012, S * 0.02, 0, 0, Math.PI * 2); c.fill() } c.globalAlpha = 1 }
  c.restore()
  if (p.mareo > 0.05) {                                                                                                // estrellitas dando vueltas sobre la cabeza
    for (let i = 0; i < 4; i++) { const a = t * 6 + (i * Math.PI) / 2; c.fillStyle = `rgba(255,224,102,${p.mareo})`; estrella(c, cx + Math.cos(a) * S * 0.2, cy - bh / 2 - S * 0.07 + Math.sin(a) * S * 0.04, S * 0.03, a * 2) }
  }
}

function estrella(c: Ctx, x: number, y: number, r: number, rot: number) {
  c.beginPath()
  for (let i = 0; i < 8; i++) { const a = rot + (i * Math.PI) / 4, rr = i % 2 === 0 ? r : r * 0.3; c.lineTo(x + rr * Math.cos(a), y + rr * Math.sin(a)) }
  c.closePath(); c.fill()
}

/** Ráfaga del golpe (estilo cómic, DETRÁS del muñeco): estrella dentada amarilla con borde naranja que se abre, más un anillo. */
function rafaga(ctx: CanvasRenderingContext2D, x: number, y: number, u: number, R: number) {
  if (u <= 0 || u >= 1) return
  const e = easeOut3(u), r = R * (0.25 + 0.75 * e), a = 1 - u * u
  ctx.save(); ctx.translate(x, y); ctx.rotate(0.25 * u)
  ctx.beginPath()
  for (let i = 0; i < 24; i++) { const ang = (i / 24) * Math.PI * 2, rr = i % 2 ? r * 0.62 : r * (0.9 + 0.25 * alea(i * 3.3)); ctx.lineTo(Math.cos(ang) * rr, Math.sin(ang) * rr) }
  ctx.closePath(); ctx.fillStyle = `rgba(255,224,90,${a})`; ctx.fill(); ctx.strokeStyle = `rgba(255,122,0,${a})`; ctx.lineWidth = R * 0.05; ctx.lineJoin = 'round'; ctx.stroke()
  ctx.beginPath(); ctx.arc(0, 0, r * 1.15, 0, Math.PI * 2); ctx.strokeStyle = `rgba(255,255,255,${0.8 * (1 - u)})`; ctx.lineWidth = R * 0.07 * (1 - u); ctx.stroke()
  ctx.restore()
}

/**
 * Animación del muñeco. `anim`: 'golpe' (vuela desde un lado, te pega en la cabeza —el punto de la caja—, rebota, queda mareado y al final se cae),
 * 'baile' (entra de abajo y baila saltando) o 'quieto' (aparece con rebote). `humor` decide qué hace al quedarse: 'loco', 'triste', 'feliz', 'asustado'.
 */
function dibujarMuneco(ctx: CanvasRenderingContext2D, o: TextLayer, t: number) {
  if (o.type !== 'graphic') return
  const pr = o.props ?? {}, b = cajaEscena(o), S = Math.round(b.w * 1.25)
  const tt = t - o.start, dur = o.end - o.start, anim = pr.anim ?? 'golpe', humor = pr.humor ?? 'loco', lado = pr.lado ?? 'der'
  const dir = lado === 'izq' ? -1 : 1
  const P = { x: b.x + b.w / 2, y: b.y + b.h / 2 }
  const tV = anim === 'golpe' ? 0.7 : 0.45, tR = tV + 0.6, tS = Math.max(dur - 0.6, tR + 0.2), sal = clamp01((tt - tS) / 0.6)
  const p = poseBase(); let x = P.x, y = P.y, rot = 0, esc = 1, ghost = 0, impacto = -1
  const jug = (ojos: Pose['ojos'], boca: Pose['boca']) => { p.ojos = ojos; p.boca = boca }
  if (tt < tV) {                                                                                                  // vuelo (acelera hacia la cabeza)
    const u = tt / tV, e = Math.pow(u, 2.2)
    x = P.x + dir * W * 0.8 * (1 - e); y = P.y - H * 0.3 * (1 - e) - Math.sin(Math.PI * u) * H * 0.07
    rot = -dir * (1 - e) * 11; p.sx = 1 - 0.25 * u; p.sy = 1 + 0.35 * u; p.brazoI = 2.4; p.brazoD = -2.4; p.pata = tt * 30; jug('asustado', 'grito'); ghost = 1
    if (anim !== 'golpe') { x = P.x; y = P.y + H * 0.5 * (1 - easeOut3(u)); rot = 0; ghost = 0 }
  } else if (tt < tR) {                                                                                            // golpe + rebote
    const u = (tt - tV) / (tR - tV)
    impacto = (tt - tV) / 0.5
    const sq = u < 0.18 ? 1 - u / 0.18 : 0, alto = Math.sin(Math.PI * clamp01((u - 0.18) / 0.82))
    p.sx = 1 + 0.4 * sq - 0.08 * alto; p.sy = 1 - 0.45 * sq + 0.15 * alto; y = P.y - H * 0.1 * alto; rot = Math.sin(u * 14) * 0.12 * (1 - u); p.brazoI = 0.9 + 1.2 * (1 - u); p.brazoD = -0.9 - 1.2 * (1 - u); jug(u < 0.3 ? 'x' : 'espiral', 'o'); p.mareo = u
    if (anim !== 'golpe') { p.sx = 1 + 0.12 * Math.sin(u * 20) * (1 - u); p.sy = 2 - p.sx; jug('feliz', 'sonrisa') }
    if (humor === 'culpable') { p.sx = 1; p.sy = 1 - 0.1 * u; p.triste = u * 0.6; p.mirada = u; p.brazoI = 0.45 - 0.5 * u; p.brazoD = -0.45 + 0.5 * u; jug('normal', 'triste') }
  } else {                                                                                                         // ya instalado: según el humor
    const u = tt - tR
    if (humor === 'culpable') {                                                                                    // se siente culpable: encogido, mira de lado, manitas inquietas, una lágrima y sudor
      p.triste = 0.6 + 0.1 * Math.sin(u * 2); p.sy = 0.9 - 0.02 * Math.sin(u * 2.4); p.sx = 1.03; p.mirada = 1; p.sudor = 0.8; p.lagrima = easeOut3(u / 0.8); p.tiembla = 0.12
      p.brazoI = -0.15 + Math.sin(u * 7) * 0.1; p.brazoD = 0.15 - Math.sin(u * 7 + 1) * 0.1; jug('normal', 'triste'); rot = 0.07 + 0.03 * Math.sin(u * 1.7); y = P.y + S * 0.03 + Math.sin(u * 2.4) * S * 0.004; x = P.x + Math.sin(u * 1.1) * S * 0.006
    }
    else if (humor === 'triste') { p.triste = easeOut3(u / 0.5); p.sy = 0.94 - 0.03 * Math.sin(u * 3); p.sx = 1.04; p.brazoI = 0.05; p.brazoD = -0.05; jug('llorando', 'triste'); rot = 0.05 * Math.sin(u * 1.4) }
    else if (humor === 'feliz') { const s = Math.abs(Math.sin(u * 6.5)); y = P.y - s * H * 0.045; p.sy = 1 + 0.12 * (1 - s) * -1 + 0.1 * s; p.sx = 1 - 0.06 * s; p.brazoI = 2.4 - s * 0.6; p.brazoD = -2.4 + s * 0.6; p.pata = u * 12; jug('feliz', 'sonrisa'); rot = Math.sin(u * 6.5) * 0.08 }
    else if (humor === 'asustado') { p.tiembla = 1; p.sudor = 1; p.brazoI = 1.3 + Math.sin(u * 40) * 0.15; p.brazoD = -1.3 - Math.sin(u * 40) * 0.15; p.sy = 0.96; jug('asustado', 'o'); rot = Math.sin(u * 55) * 0.03 }
    else { p.mareo = clamp01(1 - u / 1.2); p.brazoI = 1.4 + Math.sin(u * 14) * 1.0; p.brazoD = -1.4 - Math.sin(u * 14 + 1) * 1.0; p.pata = u * 18; p.tiembla = 0.6; jug('espiral', 'grito'); y = P.y + Math.sin(u * 22) * H * 0.006; rot = Math.sin(u * 9) * 0.12 }
  }
  if (sal > 0) {                                                                                                   // salida
    if (anim === 'golpe') { const e = sal * sal; y += H * 0.85 * e; x += dir * W * 0.12 * e; rot += dir * 3.2 * e; p.brazoI = 2.4; p.brazoD = -2.4; p.ojos = 'asustado'; p.boca = 'grito' }
    else { esc = 1 - easeOut3(sal) * 0.9; y += H * 0.1 * sal }
  }
  const { c, x: cx } = lienzo('muneco', S, S); pintarMuneco(cx, S, tt, p)
  const w = b.w * 1.25
  const pintar = (px: number, py: number, a: number, r: number, k: number) => { ctx.save(); ctx.globalAlpha = a; ctx.translate(px, py); ctx.rotate(r); ctx.scale(k, k); ctx.drawImage(c as unknown as CanvasImageSource, -w / 2, -w / 2, w, w); ctx.restore() }
  // sombra en el aire y estela de movimiento
  const alfa = clamp01(tt / 0.06)
  if (ghost) for (let i = 3; i >= 1; i--) { const e2 = Math.pow(Math.max(0, tt / tV - i * 0.05), 2.2); pintar(P.x + dir * W * 0.8 * (1 - e2), P.y - H * 0.3 * (1 - e2) - Math.sin(Math.PI * Math.max(0, tt / tV - i * 0.05)) * H * 0.07, 0.16 * (4 - i) * alfa, rot - dir * i * 0.2, esc) }
  if (impacto >= 0) rafaga(ctx, P.x, P.y - H * 0.01, impacto, b.w * 0.62)
  pintar(x, y, alfa, rot, esc)
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
  if ((o.props?.tipo ?? 'claude') === 'pantalla') dibujarPantalla(ctx, o, t); else dibujarMuneco(ctx, o, t)
}
