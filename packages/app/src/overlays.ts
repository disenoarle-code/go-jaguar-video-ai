import { isTextLayer, type Project, type TextLayer } from '@gojaguar/core'
import { H, W } from './constants'

const ease = (x: number) => 1 - Math.pow(1 - Math.min(Math.max(x, 0), 1), 3)
const FONT = (o: TextLayer) => `700 ${o.size}px Figtree, "Segoe UI", system-ui, sans-serif`

export interface Rect { x: number; y: number; w: number; h: number }

// --- imágenes de los rótulos (logos): se cargan una vez y avisan para repintar ---
const imgCache = new Map<string, HTMLImageElement>()
let onImage: () => void = () => {}
export const setOverlayRedraw = (fn: () => void) => { onImage = fn }
function getImg(url?: string): HTMLImageElement | null {
  if (!url) return null
  let im = imgCache.get(url)
  if (!im) { im = new Image(); im.onload = () => onImage(); im.src = '/' + url; imgCache.set(url, im) }
  return im.complete && im.naturalWidth ? im : null
}
/** Espera a que carguen las imágenes de todos los rótulos (lo usa el render de la exportación). */
export async function preloadOverlayImages(p: Project) {
  const urls = p.layers.flatMap(l => (l.type === 'graphic' && l.props?.marca ? [l.props.marca] : []))
  await Promise.all(urls.map(u => new Promise<void>(res => { const im = new Image(); im.onload = im.onerror = () => res(); im.src = '/' + u; imgCache.set(u, im) })))
}

const clamp01 = (x: number) => Math.min(Math.max(x, 0), 1)
const easeOut3 = (x: number) => 1 - Math.pow(1 - clamp01(x), 3)
const easeBack = (x: number) => { const c1 = 1.70158, c3 = c1 + 1, v = clamp01(x); return 1 + c3 * Math.pow(v - 1, 3) + c1 * Math.pow(v - 1, 2) }
const FONT_BRAND = (px: number, w = 900) => `${w} ${px}px Figtree, "Segoe UI", system-ui, sans-serif`

/** Caja final (sin animación) de un overlay; sirve para dibujar y para hacer hit-test. */
export function boundsOf(ctx: CanvasRenderingContext2D, o: TextLayer): Rect {
  if (o.type === 'graphic' && o.template === 'lanzamiento') return { x: W * 0.08, y: H * 0.20, w: W * 0.84, h: H * 0.42 }
  if (o.type === 'graphic' && o.template === 'glass') { const lado = o.props?.lado ?? 'izq', w = W * 0.58; return { x: (lado === 'izq' ? 0.3 : lado === 'der' ? 0.7 : 0.5) * W - w / 2, y: H * 0.17 - w * 0.2, w, h: w * 0.4 } }
  if (o.type === 'graphic' && o.template === 'pildora') return { x: W * 0.1, y: H * 0.07, w: W * 0.8, h: H * 0.08 }
  if (o.type === 'subtitle' && o.template === 'karaoke') return { x: W * 0.05, y: H * 0.72, w: W * 0.9, h: H * 0.16 }
  ctx.save()
  ctx.font = FONT(o)
  const tw = ctx.measureText(o.text).width
  ctx.restore()
  const padX = o.type === 'graphic' ? o.size * 0.7 : o.size * 0.2
  const padY = o.type === 'graphic' ? o.size * 0.45 : o.size * 0.15
  const w = tw + padX * 2, h = o.size + padY * 2
  return { x: o.transform.x * W - w / 2, y: o.transform.y * H - h / 2, w, h }
}

export function visibleOverlays(p: Project, t: number) {
  return p.layers.filter(isTextLayer).filter(o => t >= o.start && t < o.end)
}

export function drawOverlays(ctx: CanvasRenderingContext2D, p: Project, t: number, selectedId: string | null) {
  for (const o of visibleOverlays(p, t)) {
    const b = boundsOf(ctx, o)
    if (o.type === 'subtitle' && o.template === 'karaoke') {
      drawKaraoke(ctx, o, t)
      if (o.id === selectedId) { ctx.save(); ctx.strokeStyle = '#e8b152'; ctx.lineWidth = 2; ctx.setLineDash([8, 6]); ctx.strokeRect(b.x, b.y, b.w, b.h); ctx.restore() }
      continue
    }
    if (o.type === 'graphic' && (o.template === 'glass' || o.template === 'pildora')) {
      o.template === 'glass' ? drawGlass(ctx, o, t) : drawPildora(ctx, o, t)
      if (o.id === selectedId) { ctx.save(); ctx.strokeStyle = '#e8b152'; ctx.lineWidth = 2; ctx.setLineDash([8, 6]); ctx.strokeRect(b.x, b.y, b.w, b.h); ctx.restore() }
      continue
    }
    if (o.type === 'graphic' && o.template === 'lanzamiento') {
      drawLanzamiento(ctx, o, t)
      if (o.id === selectedId) { ctx.save(); ctx.strokeStyle = '#e8b152'; ctx.lineWidth = 2; ctx.setLineDash([8, 6]); ctx.strokeRect(b.x, b.y, b.w, b.h); ctx.restore() }
      continue
    }
    ctx.save()
    ctx.font = FONT(o)
    ctx.textBaseline = 'middle'
    if (o.type === 'subtitle') {
      ctx.textAlign = 'center'
      ctx.lineJoin = 'round'
      ctx.lineWidth = o.size / 5
      ctx.strokeStyle = 'rgba(0,0,0,.9)'
      ctx.strokeText(o.text, o.transform.x * W, o.transform.y * H)
      ctx.fillStyle = o.color
      ctx.fillText(o.text, o.transform.x * W, o.transform.y * H)
    } else {
      // Gráfico animado: la barra entra deslizando y sale con fade.
      const a = ease((t - o.start) / 0.45)
      const out = Math.min(Math.max((o.end - t) / 0.3, 0), 1)
      const dx = (1 - a) * -(b.x + b.w + 20)
      ctx.globalAlpha = out
      ctx.translate(dx, 0)
      ctx.fillStyle = 'rgba(15,16,24,.88)'
      ctx.beginPath(); ctx.roundRect(b.x, b.y, b.w, b.h, 14); ctx.fill()
      ctx.fillStyle = o.color
      ctx.beginPath(); ctx.roundRect(b.x, b.y, 10, b.h, [14, 0, 0, 14]); ctx.fill()
      const pulse = 0.65 + 0.35 * Math.sin((t - o.start) * 6)
      ctx.globalAlpha = out * pulse
      ctx.beginPath(); ctx.arc(b.x + b.w - o.size * 0.5, b.y + b.h / 2, o.size * 0.14, 0, Math.PI * 2); ctx.fill()
      ctx.globalAlpha = out
      ctx.fillStyle = '#fff'
      ctx.textAlign = 'left'
      ctx.fillText(o.text, b.x + o.size * 0.7, b.y + b.h / 2 + 1)
    }
    ctx.restore()
    if (o.id === selectedId) {
      ctx.save()
      ctx.strokeStyle = '#e8b152'; ctx.lineWidth = 2; ctx.setLineDash([8, 6])
      ctx.strokeRect(b.x - 4, b.y - 4, b.w + 8, b.h + 8)
      ctx.restore()
    }
  }
}

export function hitOverlay(ctx: CanvasRenderingContext2D, p: Project, t: number, x: number, y: number): TextLayer | null {
  const vis = visibleOverlays(p, t)
  for (let i = vis.length - 1; i >= 0; i--) {
    const b = boundsOf(ctx, vis[i])
    if (x >= b.x - 6 && x <= b.x + b.w + 6 && y >= b.y - 6 && y <= b.y + b.h + 6) return vis[i]
  }
  return null
}


/**
 * Rótulo animado de lanzamiento: velo oscuro, "NUEVO" letra por letra, "LANZAMIENTO" con barra, logo que salta con un brillo de color,
 * y la pastilla con el modelo; sale con un zoom suave. Todo en proporciones del lienzo (sirve a cualquier resolución).
 */
function drawLanzamiento(ctx: CanvasRenderingContext2D, o: TextLayer, t: number) {
  if (o.type !== 'graphic') return
  const pr = o.props ?? {}, l1 = pr.linea1 ?? 'NUEVO', l2 = pr.linea2 ?? 'LANZAMIENTO', modelo = pr.modelo ?? '', acc = pr.acento ?? '#d71920'
  const tt = t - o.start, dur = o.end - o.start
  const exit = clamp01((tt - (dur - 0.28)) / 0.28)
  const cx = W / 2, cy = H * 0.4
  ctx.save()
  ctx.globalAlpha = 1 - exit
  ctx.translate(cx, cy); const zo = 1 + 0.14 * easeOut3(exit); ctx.scale(zo, zo); ctx.translate(-cx, -cy)

  // 1) velo oscuro: el texto blanco se lee aunque el video sea claro
  const vA = easeOut3(tt / 0.35) * 0.62
  const g = ctx.createLinearGradient(0, cy - H * 0.3, 0, cy + H * 0.3)
  g.addColorStop(0, 'rgba(8,8,10,0)'); g.addColorStop(0.3, `rgba(8,8,10,${vA})`); g.addColorStop(0.7, `rgba(8,8,10,${vA})`); g.addColorStop(1, 'rgba(8,8,10,0)')
  ctx.fillStyle = g; ctx.fillRect(0, cy - H * 0.3, W, H * 0.6)

  ctx.shadowColor = 'rgba(0,0,0,.55)'; ctx.shadowBlur = W * 0.03
  ctx.textBaseline = 'alphabetic'; ctx.fillStyle = '#fff'

  // 2) NUEVO: cada letra cae con rebote
  const f1 = W * 0.235; ctx.font = FONT_BRAND(f1); ctx.letterSpacing = `${W * 0.008}px`
  const widths = [...l1].map(ch => ctx.measureText(ch).width), total1 = widths.reduce((a, b) => a + b, 0)
  let x = cx - total1 / 2; const y1 = cy - H * 0.05
  ;[...l1].forEach((ch, i) => {
    const lt = (tt - 0.12 - i * 0.07) / 0.38
    if (lt > 0) {
      const k = easeBack(lt), a = clamp01(lt * 2.2), w = widths[i]
      ctx.save(); ctx.globalAlpha *= a
      ctx.translate(x + w / 2, y1 - f1 * 0.35); ctx.translate(0, -(1 - easeOut3(lt)) * H * 0.13); const s = 1.7 - 0.7 * k; ctx.scale(s, s)
      ctx.fillText(ch, -w / 2, f1 * 0.35); ctx.restore()
    }
    x += widths[i]
  })

  // 3) LANZAMIENTO: se destapa de izquierda a derecha, con una barra del color de la marca
  const f2 = W * 0.083; ctx.font = FONT_BRAND(f2, 800); ctx.letterSpacing = `${W * 0.022}px`
  const w2 = ctx.measureText(l2).width, y2 = cy + H * 0.028, wipe = easeOut3((tt - 0.5) / 0.5)
  if (wipe > 0) {
    ctx.save(); ctx.beginPath(); ctx.rect(cx - w2 / 2 - 10, y2 - f2 * 1.1, (w2 + 20) * wipe, f2 * 1.6); ctx.clip()
    ctx.fillText(l2, cx - w2 / 2 + W * 0.011, y2); ctx.restore()
    ctx.shadowColor = 'transparent'; ctx.fillStyle = acc
    ctx.fillRect(cx - w2 / 2, y2 + f2 * 0.28, w2 * wipe, Math.max(3, H * 0.0045))
    ctx.fillStyle = '#fff'
  }
  ctx.letterSpacing = '0px'

  // 4) logo con brillo de color que lo recorre
  const logo = getImg(pr.marca), lt4 = (tt - 1.0) / 0.55
  if (logo && lt4 > 0) {
    const lw = W * 0.62, lh = lw * (logo.naturalHeight / logo.naturalWidth), s = 0.55 + 0.45 * easeBack(lt4)
    ctx.save(); ctx.globalAlpha *= clamp01(lt4 * 2); ctx.translate(cx, cy + H * 0.135); ctx.scale(s, s)
    ctx.shadowColor = 'rgba(0,0,0,.5)'; ctx.shadowBlur = W * 0.025
    const tmp = new OffscreenCanvas(Math.ceil(lw), Math.ceil(lh)), tc = tmp.getContext('2d')!
    tc.drawImage(logo, 0, 0, lw, lh)
    const sw = clamp01((tt - 1.45) / 0.8)
    if (sw > 0 && sw < 1) {
      const gx = -lw * 0.4 + (lw * 1.8) * sw, gr = tc.createLinearGradient(gx - lw * 0.16, 0, gx + lw * 0.16, lh * 0.35)
      gr.addColorStop(0, 'rgba(255,255,255,0)'); gr.addColorStop(0.5, acc); gr.addColorStop(1, 'rgba(255,255,255,0)')
      tc.globalCompositeOperation = 'source-atop'; tc.fillStyle = gr; tc.fillRect(0, 0, lw, lh)
    }
    ctx.drawImage(tmp as unknown as CanvasImageSource, -lw / 2, -lh / 2); ctx.restore()
  }

  // 5) pastilla con el modelo
  const mt = (tt - 1.75) / 0.4
  if (modelo && mt > 0) {
    const f3 = W * 0.058; ctx.font = FONT_BRAND(f3, 700); ctx.letterSpacing = `${W * 0.004}px`
    const w3 = ctx.measureText(modelo).width, ph = f3 * 1.9, pw = w3 + f3 * 1.8, py = cy + H * 0.235 + (1 - easeOut3(mt)) * H * 0.03
    ctx.save(); ctx.globalAlpha *= clamp01(mt * 1.6); ctx.shadowColor = 'rgba(0,0,0,.4)'; ctx.shadowBlur = W * 0.02
    ctx.fillStyle = acc; ctx.beginPath(); ctx.roundRect(cx - pw / 2, py - ph / 2, pw, ph, ph / 2); ctx.fill()
    ctx.shadowColor = 'transparent'; ctx.fillStyle = '#fff'; ctx.textBaseline = 'middle'; ctx.fillText(modelo, cx - w3 / 2, py + 1); ctx.restore()
  }
  ctx.restore()
}


// ======================== Estilo "glass" (cristal) y subtítulos karaoke ========================

const VIOLETA = '#8b5cf6', LAVANDA = '#c4b5fd'

/** Subtítulos karaoke: las palabras del grupo se ven juntas; la que se dice se agranda y se pinta de lavanda con brillo, las dichas en blanco y las que faltan atenuadas. */
function drawKaraoke(ctx: CanvasRenderingContext2D, o: TextLayer, t: number) {
  if (o.type !== 'subtitle') return
  let palabras: [string, number, number][] = []
  try { palabras = JSON.parse(o.props?.palabras ?? '[]') } catch { return }
  if (!palabras.length) return
  const size = W * 0.092, tt = t - o.start, ent = easeOut3(tt / 0.14)
  ctx.save()
  ctx.font = FONT_BRAND(size, 800); ctx.textBaseline = 'middle'; ctx.letterSpacing = `${size * 0.01}px`
  const space = ctx.measureText(' ').width + size * 0.24, ws = palabras.map(p => ctx.measureText(p[0]).width)   // + holgura: el borde grueso se comería el espacio
  // si no caben en una línea, se parten en dos
  const total = ws.reduce((a, b) => a + b, 0) + space * (palabras.length - 1)
  const lines: number[][] = total > W * 0.88 ? [palabras.map((_, i) => i).slice(0, Math.ceil(palabras.length / 2)), palabras.map((_, i) => i).slice(Math.ceil(palabras.length / 2))] : [palabras.map((_, i) => i)]
  const lh = size * 1.18, y0 = H * 0.8 - ((lines.length - 1) * lh) / 2 + (1 - ent) * size * 0.35
  ctx.globalAlpha = ent
  lines.forEach((idxs, li) => {
    const lw = idxs.reduce((a, i) => a + ws[i], 0) + space * (idxs.length - 1)
    let x = W / 2 - lw / 2; const y = y0 + li * lh
    for (const i of idxs) {
      const [w, a, b] = palabras[i], activa = t >= a && t < b, dicha = t >= b
      const k = activa ? 1 + 0.12 * Math.sin(Math.PI * Math.min((t - a) / Math.max(b - a, 0.05), 1)) + 0.04 : 1
      ctx.save(); ctx.translate(x + ws[i] / 2, y); ctx.scale(k, k)
      ctx.lineJoin = 'round'; ctx.lineWidth = size / 5; ctx.strokeStyle = 'rgba(14,6,36,.92)'; ctx.strokeText(w, -ws[i] / 2, 0)
      if (activa) { ctx.shadowColor = VIOLETA; ctx.shadowBlur = size * 0.5 }
      ctx.fillStyle = activa ? LAVANDA : '#fff'; ctx.globalAlpha = ent * (dicha || activa ? 1 : 0.55)
      ctx.fillText(w, -ws[i] / 2, 0); ctx.restore()
      x += ws[i] + space
    }
  })
  ctx.restore()
}

/** Píldora de título: texto grande en mayúsculas sobre un degradado violeta, entra con rebote y se inclina un poco. */
function drawPildora(ctx: CanvasRenderingContext2D, o: TextLayer, t: number) {
  if (o.type !== 'graphic') return
  const texto = (o.props?.texto ?? o.text).toUpperCase(), acc = o.props?.acento ?? VIOLETA
  const tt = t - o.start, dur = o.end - o.start, ent = easeBack(tt / 0.5), ex = clamp01((tt - (dur - 0.3)) / 0.3)
  const size = W * 0.074; ctx.save()
  ctx.font = FONT_BRAND(size, 900); ctx.letterSpacing = `${size * 0.03}px`; ctx.textBaseline = 'middle'
  const tw = ctx.measureText(texto).width, pw = tw + size * 1.6, ph = size * 1.75, cx = W / 2, cy = H * 0.105
  ctx.translate(cx, cy); const s = (0.55 + 0.45 * ent) * (1 - 0.1 * ex); ctx.scale(s, s); ctx.rotate((1 - Math.min(ent, 1)) * -0.12)
  ctx.globalAlpha = clamp01(tt / 0.2) * (1 - ex)
  const g = ctx.createLinearGradient(-pw / 2, 0, pw / 2, 0); g.addColorStop(0, acc); g.addColorStop(1, '#5b21b6')
  ctx.shadowColor = acc; ctx.shadowBlur = size * 0.9
  ctx.fillStyle = g; ctx.beginPath(); ctx.roundRect(-pw / 2, -ph / 2, pw, ph, ph * 0.3); ctx.fill()
  ctx.shadowColor = 'transparent'; ctx.strokeStyle = 'rgba(255,255,255,.55)'; ctx.lineWidth = Math.max(1.5, size * 0.04); ctx.stroke()
  ctx.fillStyle = '#fff'; ctx.fillText(texto, -tw / 2, size * 0.03)
  ctx.restore()
}

/** Iconos vectoriales simples para las tarjetas (sin imágenes). */
function dibujarIcono(c: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D, nombre: string, cx: number, cy: number, r: number) {
  c.save(); c.translate(cx, cy); c.strokeStyle = '#fff'; c.fillStyle = '#fff'; c.lineWidth = r * 0.16; c.lineCap = 'round'; c.lineJoin = 'round'
  if (nombre === 'rayo') { c.beginPath(); c.moveTo(r * 0.15, -r); c.lineTo(-r * 0.55, r * 0.1); c.lineTo(-r * 0.05, r * 0.1); c.lineTo(-r * 0.2, r); c.lineTo(r * 0.55, -r * 0.2); c.lineTo(r * 0.05, -r * 0.2); c.closePath(); c.fill() }
  else if (nombre === 'reloj') { c.beginPath(); c.arc(0, 0, r * 0.85, 0, Math.PI * 2); c.stroke(); c.beginPath(); c.moveTo(0, -r * 0.5); c.lineTo(0, 0); c.lineTo(r * 0.38, r * 0.25); c.stroke() }
  else if (nombre === 'alerta') { c.beginPath(); c.moveTo(0, -r * 0.95); c.lineTo(r * 0.95, r * 0.7); c.lineTo(-r * 0.95, r * 0.7); c.closePath(); c.stroke(); c.beginPath(); c.moveTo(0, -r * 0.3); c.lineTo(0, r * 0.2); c.stroke(); c.beginPath(); c.arc(0, r * 0.48, r * 0.07, 0, Math.PI * 2); c.fill() }
  else { c.beginPath(); for (let a = 0; a < 8; a++) { const rr = a % 2 === 0 ? r : r * 0.28, ang = (a * Math.PI) / 4 - Math.PI / 2; c.lineTo(rr * Math.cos(ang), rr * Math.sin(ang)) } c.closePath(); c.fill() }   // chispa
  c.restore()
}

/**
 * Tarjeta de cristal que entra con perspectiva 3D: el contenido (vidrio translúcido con borde brillante, icono, título y subtítulo) se dibuja
 * en un lienzo aparte y se proyecta por franjas verticales girándolo sobre su eje; entra girada y se asienta, flota un poco y sale girando.
 */
function drawGlass(ctx: CanvasRenderingContext2D, o: TextLayer, t: number) {
  if (o.type !== 'graphic') return
  const pr = o.props ?? {}, titulo = pr.titulo ?? o.text, sub = pr.sub ?? '', acc = pr.acento ?? VIOLETA, lado = pr.lado ?? 'izq', icono = pr.icono ?? 'chispa'
  const tt = t - o.start, dur = o.end - o.start, k = easeBack(tt / 0.7), ex = clamp01((tt - (dur - 0.4)) / 0.4)
  const dir = lado === 'der' ? -1 : 1
  const w = W * 0.58, h = w * 0.4, cw = Math.ceil(w * 2), chh = Math.ceil(h * 2)
  // 1) contenido a doble resolución
  const cv = new OffscreenCanvas(cw, chh), c = cv.getContext('2d')!
  c.scale(2, 2)
  const g = c.createLinearGradient(0, 0, w, h); g.addColorStop(0, 'rgba(255,255,255,.30)'); g.addColorStop(0.5, 'rgba(210,190,255,.14)'); g.addColorStop(1, 'rgba(255,255,255,.07)')
  c.fillStyle = g; c.beginPath(); c.roundRect(1, 1, w - 2, h - 2, h * 0.16); c.fill()
  const bg = c.createLinearGradient(0, 0, w, h); bg.addColorStop(0, 'rgba(255,255,255,.85)'); bg.addColorStop(0.45, 'rgba(255,255,255,.18)'); bg.addColorStop(1, 'rgba(196,181,253,.55)')
  c.strokeStyle = bg; c.lineWidth = 1.6; c.stroke()
  const brillo = c.createLinearGradient(0, 0, 0, h * 0.5); brillo.addColorStop(0, 'rgba(255,255,255,.22)'); brillo.addColorStop(1, 'rgba(255,255,255,0)')
  c.fillStyle = brillo; c.beginPath(); c.roundRect(3, 3, w - 6, h * 0.46, [h * 0.14, h * 0.14, h * 0.3, h * 0.3]); c.fill()
  const ir = h * 0.2, ix = h * 0.3 + ir * 0.15, iy = h / 2
  const ig = c.createLinearGradient(ix - ir, iy - ir, ix + ir, iy + ir); ig.addColorStop(0, acc); ig.addColorStop(1, '#5b21b6')
  c.shadowColor = acc; c.shadowBlur = ir * 0.9; c.fillStyle = ig; c.beginPath(); c.arc(ix, iy, ir * 1.28, 0, Math.PI * 2); c.fill(); c.shadowBlur = 0
  dibujarIcono(c, icono, ix, iy, ir * 0.72)
  c.fillStyle = '#fff'; c.textBaseline = 'middle'; const tx = ix + ir * 1.28 + h * 0.14
  const disp = w - tx - h * 0.1
  let fs = h * (sub ? 0.25 : 0.3); c.font = FONT_BRAND(fs, 900)
  while (c.measureText(titulo).width > disp && fs > h * 0.1) { fs *= 0.95; c.font = FONT_BRAND(fs, 900) }     // el título se achica para caber (nunca se deforma)
  c.save(); c.shadowColor = 'rgba(20,8,50,.55)'; c.shadowBlur = fs * 0.3; c.fillText(titulo, tx, sub ? h * 0.38 : h * 0.5)
  if (sub) { let fs2 = fs * 0.62; c.font = FONT_BRAND(fs2, 600); while (c.measureText(sub).width > disp && fs2 > h * 0.08) { fs2 *= 0.95; c.font = FONT_BRAND(fs2, 600) } c.fillStyle = 'rgba(235,228,255,.92)'; c.fillText(sub, tx, h * 0.68) }
  c.restore()
  // 2) proyección con perspectiva (franjas verticales)
  const rest = dir * 12 * Math.PI / 180, enter = dir * (1 - Math.min(k, 1.15)) * -62 * Math.PI / 180, salir = dir * ex * -55 * Math.PI / 180
  const th = rest + enter + salir + Math.sin(tt * 1.7) * 0.03
  const cx = (lado === 'izq' ? 0.3 : lado === 'der' ? 0.7 : 0.5) * W + dir * -(1 - Math.min(k, 1)) * W * 0.28, cy = H * 0.17 + Math.sin(tt * 2.1) * H * 0.004
  const D = w * 2.4, N = 56, alfa = clamp01(tt / 0.22) * (1 - ex)
  ctx.save(); ctx.globalAlpha = alfa
  // resplandor de color detrás
  const rg = ctx.createRadialGradient(cx, cy, 0, cx, cy, w * 0.62); rg.addColorStop(0, `${acc}55`); rg.addColorStop(1, `${acc}00`); ctx.fillStyle = rg; ctx.fillRect(cx - w, cy - w * 0.6, w * 2, w * 1.2)
  const proj = (x: number) => { const X = x * Math.cos(th), Z = x * Math.sin(th), s = D / (D + Z); return { px: cx + X * s, s } }
  for (let i = 0; i < N; i++) {
    const a = proj((i / N - 0.5) * w), b = proj(((i + 1) / N - 0.5) * w), s = (a.s + b.s) / 2, dh = h * s
    ctx.drawImage(cv as unknown as CanvasImageSource, (i / N) * cw, 0, cw / N + 0.5, chh, a.px, cy - dh / 2, b.px - a.px + 0.7, dh)
  }
  ctx.restore()
}
