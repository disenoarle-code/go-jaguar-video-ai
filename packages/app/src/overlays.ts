import { isTextLayer, type Project, type TextLayer } from '@gojaguar/core'
import { H, W } from './constants'

const ease = (x: number) => 1 - Math.pow(1 - Math.min(Math.max(x, 0), 1), 3)
const FONT = (o: TextLayer) => `700 ${o.size}px Figtree, "Segoe UI", system-ui, sans-serif`

export interface Rect { x: number; y: number; w: number; h: number }

/** Caja final (sin animación) de un overlay; sirve para dibujar y para hacer hit-test. */
export function boundsOf(ctx: CanvasRenderingContext2D, o: TextLayer): Rect {
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
