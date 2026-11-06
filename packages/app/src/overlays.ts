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
